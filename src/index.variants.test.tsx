import * as React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spring } from 'framer-motion'
import { animate, frameTime, useReducedMotion } from './motion'
import { RotatingText } from '.'

// Remember what each element was given to do on hover, so tests can start a
// hover directly and see whether it scales
const { propsOf } = vi.hoisted(() => {
  const props = new WeakMap<Element, Record<string, any>>()
  return { propsOf: props }
})

vi.mock('./motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./motion')>()
  return {
    ...actual,
    useHover: (
      ref: React.RefObject<HTMLElement>,
      onHoverStart: () => void,
      scale?: number
    ) =>
      actual.useIsomorphicLayoutEffect(() => {
        propsOf.set(ref.current!, { onHoverStart, scale })
      }),
    useReducedMotion: vi.fn(() => false),
    // The frame the flaps' animations are on, which tests move on by hand
    frameTime: vi.fn(),
    // Records every call. A rolling letter's turn (on its angle) runs; a
    // flap's (from a plain number) is held, so tests step it by calling its
    // onUpdate and onComplete
    animate: vi.fn((...args: Parameters<typeof actual.animate>) =>
      typeof args[0] === 'number' ? { stop: vi.fn() } : actual.animate(...args)
    )
  }
})

afterEach(() => {
  cleanup()
  vi.mocked(useReducedMotion).mockReturnValue(false)
  nextFrame()
  vi.mocked(animate).mockClear()
  vi.restoreAllMocks()
})

// jsdom does no layout, so the roll's rows of letters and its placeholder are
// given 10px a letter, or the placeholder the width it is being held at
const letterWidths = () => {
  const real = window.getComputedStyle
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
    const style = real.call(window, el, pseudo)
    const kind = String(el.getAttribute('class'))
    const row = /front|back/.test(kind)
    if (!row && !kind.includes('placeholder')) return style
    const natural = `${el.textContent!.length * 10}px`
    const width = row ? natural : (el as HTMLElement).style.width || natural
    return new Proxy(style, {
      get: (target, key) => (key === 'width' ? width : (target as any)[key])
    })
  })
}
const placeholder = (container: HTMLElement) =>
  root(container).lastElementChild as HTMLElement

const root = (container: HTMLElement) => container.firstElementChild!
const letters = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('span'))
const hover = (container: HTMLElement) =>
  act(() => propsOf.get(root(container))!.onHoverStart())
// Moves the flaps' animations on to a frame no test has used, which comes with
// its own few reveals
let frameCount = 0
const nextFrame = () => vi.mocked(frameTime).mockReturnValue(++frameCount)
nextFrame()
// Each flap's animate() call as [from, to, options]
const flips = () => vi.mocked(animate).mock.calls as any[]
const sizers = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[class*="sizer"]'))
// The letters on a tile: static top, static bottom, flap front, flap back
const faces = (tile: Element) =>
  Array.from(tile.querySelectorAll('span'))
    .filter((el) => el.className.includes('half'))
    .map((el) => el.textContent)

// The turn each rolling letter was given on hover, in letter order
const turns = () =>
  vi.mocked(animate).mock.calls.map(([, target, transition]) => ({
    target,
    ...(transition as Record<string, any>)
  }))

// The width easings, as opposed to the letters' turns
const eases = () =>
  vi.mocked(animate).mock.calls.filter(([, target]) => target !== -90)

// Runs a letter's turn through framer-motion's own spring, which ./motion
// reproduces, so the angles and the moment it counts as settled are the
// ones the component gets
const simulate = ({ type, delay, onComplete, onStop, ...turn }: any) => {
  const generator = spring({ ...turn, keyframes: [0, -90] })
  const angles: number[] = []
  for (let ms = 0; ms < 5000; ms++) {
    const { value, done } = generator.next(ms)
    angles.push(value)
    if (done) return { angles, settled: ms / 1000 }
  }
  throw new Error('The turn never settled')
}

describe('RotatingText', () => {
  it('turns each letter a quarter turn on a spring that settles within its timing', () => {
    const { container } = render(
      <RotatingText text='abc' timing={[0.2, 0.4, 0.8]} />
    )
    hover(container)

    const [a, b, c] = turns()
    expect(turns().map((turn) => turn.target)).toEqual([-90, -90, -90])
    for (const [turn, timing] of [
      [a, 0.2],
      [b, 0.4],
      [c, 0.8]
    ] as const) {
      expect(turn.type).toBe('spring')
      const { angles, settled } = simulate(turn)
      // Settles inside its timing, and uses most of it
      expect(settled).toBeLessThanOrEqual(timing)
      expect(settled).toBeGreaterThan(timing * 0.75)
      // Swings a few degrees past the next face before settling
      expect(Math.min(...angles)).toBeLessThan(-95)
      expect(Math.min(...angles)).toBeGreaterThan(-100)
    }
  })

  it('turns the letters added to longer text in from blank', () => {
    const { container, rerender } = render(
      <RotatingText text='ab' timing={0.4} stagger={0.25} />
    )
    rerender(<RotatingText text='abcd' timing={0.4} stagger={0.25} />)

    expect(letters(container)).toHaveLength(8)
    const [, front, back] = Array.from(root(container).children)
    expect(Array.from(front.children, (el) => el.textContent)).toEqual([
      'a',
      'b',
      '',
      ''
    ])
    expect(back.textContent).toBe('abcd')
    const added = turns().filter((turn) => turn.target === -90)
    expect(added.map((turn) => turn.delay)).toEqual([0.5, 0.75])
    expect(new Set(added.map((turn) => turn.stiffness)).size).toBe(1)
  })

  it('reuses the last timing entry for letters past the end of the array', () => {
    const { container } = render(
      <RotatingText text='abcd' timing={[0.1, 0.2]} />
    )
    hover(container)

    const stiffness = turns().map((turn) => turn.stiffness)
    expect(stiffness[0]).toBeGreaterThan(stiffness[1])
    expect(stiffness.slice(1)).toEqual([
      stiffness[1],
      stiffness[1],
      stiffness[1]
    ])
  })

  it('turns a letter with no timing at once, still on its stagger', () => {
    const { container } = render(
      <RotatingText text='ab' timing={0} stagger={0.3} />
    )
    hover(container)
    expect(simulate(turns()[0]).settled).toBeLessThan(0.02)
    expect(turns().map((turn) => turn.delay)).toEqual([0, 0.3])
  })

  it('starts each letter one stagger after the previous one', () => {
    const { container } = render(<RotatingText text='abc' stagger={0.2} />)
    hover(container)
    expect(turns().map((turn) => turn.delay)).toEqual([0, 0.2, 0.4])
  })

  it('turns each changed letter from the old letter to the new one', () => {
    const { container, rerender } = render(
      <RotatingText text='abc' stagger={0.2} timing={[0.3, 0.5]} />
    )
    rerender(<RotatingText text='xbz' stagger={0.2} timing={[0.3, 0.5]} />)
    // The old letters stay on the front faces and the new ones are on the
    // copies, which the turn brings round
    const [, front, back] = Array.from(root(container).children)
    expect(front.textContent).toBe('abc')
    expect(back.textContent).toBe('xbz')
    // Only the changed letters turn, each in its place in the stagger and
    // with its own timing
    const changed = turns().filter((turn) => turn.target === -90)
    expect(changed.map((turn) => turn.delay)).toEqual([0, 0.4])
    const a = simulate(changed[0])
    const c = simulate(changed[1])
    expect(a.settled).toBeLessThanOrEqual(0.3)
    expect(c.settled).toBeLessThanOrEqual(0.5)
    expect(c.settled).toBeGreaterThan(0.3)
  })

  it('does not turn the letters when the text changes with reduced motion', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)
    const { container, rerender } = render(<RotatingText text='ab' />)
    rerender(<RotatingText text='cde' />)
    const [, front, back] = Array.from(root(container).children)
    expect(front.textContent).toBe('cde')
    expect(back.textContent).toBe('cde')
    expect(animate).not.toHaveBeenCalled()
  })

  it('eases the width on a spring that has all but arrived by the end of the first timing, without overshooting', () => {
    letterWidths()
    const { rerender } = render(<RotatingText text='ab' timing={[0.4, 0.1]} />)
    rerender(<RotatingText text='abcde' timing={[0.4, 0.1]} />)

    const [target, transition] = eases()[0].slice(1) as any
    expect(target).toBe(50)
    const { type, onUpdate, onComplete, ...physics } = transition
    expect(type).toBe('spring')
    const generator = spring({ ...physics, keyframes: [20, 50] })
    const widths: number[] = []
    for (let ms = 0; ms < 5000; ms++) {
      const { value, done } = generator.next(ms)
      widths.push(value)
      if (done) break
    }
    // Under 0.5% of the way left at the end of the timing, and let go a
    // little after that, about a tenth of a pixel short
    expect(50 - widths[400]).toBeLessThan(30 * 0.005)
    expect(widths.length / 1000).toBeLessThan(0.4 * 1.2)
    expect(50 - widths[widths.length - 2]).toBeLessThan(0.15)
    widths.forEach((width, i) => {
      expect(width).toBeGreaterThanOrEqual(i ? widths[i - 1] : 20)
      expect(width).toBeLessThanOrEqual(50)
    })
  })

  it('eases the width in from nothing after the text was empty', () => {
    letterWidths()
    const { rerender } = render(<RotatingText text='' />)
    rerender(<RotatingText text='abc' />)
    expect(eases()[0][1]).toBe(30)
  })

  it('jumps to the new width when reduced motion is preferred', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)
    letterWidths()
    const { container, rerender } = render(<RotatingText text='ab' />)
    rerender(<RotatingText text='abcde' />)

    expect(animate).not.toHaveBeenCalled()
    expect(placeholder(container).style.width).toBe('')
    expect(placeholder(container).textContent).toBe('abcde')
  })

  it('jumps to the new width when the first letter has no timing', () => {
    letterWidths()
    const { container, rerender } = render(
      <RotatingText text='ab' timing={0} />
    )
    rerender(<RotatingText text='abcde' timing={0} />)

    expect(eases()).toHaveLength(0)
    expect(placeholder(container).style.width).toBe('')
  })

  it('does not ease the width when the text changes to one as wide', () => {
    letterWidths()
    const { container, rerender } = render(<RotatingText text='ab' />)
    rerender(<RotatingText text='cd' />)

    expect(eases()).toHaveLength(0)
    expect(placeholder(container).style.width).toBe('')
  })

  it('lets rolling letters settle before another hover can start a flip', () => {
    const { container } = render(<RotatingText text='abc' />)

    hover(container)
    hover(container)
    expect(turns()).toHaveLength(3)
  })

  it('gives each flap the per-letter timing and stagger', () => {
    const { container } = render(
      <RotatingText
        text='abc'
        variant='flap'
        timing={[0.3, 0.6]}
        stagger={0.05}
      />
    )
    hover(container)

    const falls = flips()
    expect(falls).toHaveLength(3)
    expect(falls.map(([from, to]) => [from, to])).toEqual([
      [0, -180],
      [0, -180],
      [0, -180]
    ])
    expect(falls.map(([, , options]) => options.delay)).toEqual([0, 0.05, 0.1])

    // Each flap lands, then settles; together they take the letter's timing
    act(() => falls.forEach(([, , options]) => options.onComplete()))
    const settles = flips().slice(3)
    expect(settles).toHaveLength(3)
    const totals = settles.map(
      ([, , settle], i) => settle.duration + falls[i][2].duration
    )
    expect(totals.map((t) => t.toFixed(6))).toEqual(
      [0.3, 0.6, 0.6].map((t) => t.toFixed(6))
    )
  })

  it('falls with growing speed, then bounces lower each time until it rests', () => {
    const { container } = render(<RotatingText text='a' variant='flap' />)
    hover(container)
    const fall = flips()[0][2].ease
    act(() => flips()[0][2].onComplete())
    const [from, to, { ease: settle }] = flips()[1]

    expect(fall(0)).toBe(0)
    expect(fall(1)).toBeCloseTo(1)
    // Accelerates: each tenth of the time covers more ground than the last
    const steps = Array.from(
      { length: 10 },
      (_, i) => fall((i + 1) / 10) - fall(i / 10)
    )
    steps.slice(1).forEach((step, i) => expect(step).toBeGreaterThan(steps[i]))

    // Settles from the stop, up by at most its first bounce, and back
    expect(from).toBe(-180)
    expect(to).toBeGreaterThan(-180)
    const heights = Array.from({ length: 201 }, (_, i) => settle(i / 200))
    expect(settle(0)).toBe(0)
    expect(settle(1)).toBeCloseTo(0)
    expect(Math.max(...heights)).toBeCloseTo(1, 2)
    // Two bounces: the height comes back to the stop once in between
    const touches = heights.filter(
      (h, i) => i > 0 && i < 200 && h < heights[i - 1] && h <= heights[i + 1]
    )
    expect(touches).toHaveLength(1)
  })

  it('flips a tile from its old letter to its new one when the text changes', () => {
    const { container, rerender } = render(
      <RotatingText text='ab' variant='flap' stagger={0.1} />
    )
    rerender(<RotatingText text='ac' variant='flap' stagger={0.1} />)
    const [first, second] = Array.from(root(container).children)

    // Only the changed tile moves, after its place in the stagger
    expect(flips()).toHaveLength(1)
    expect(flips()[0][2].delay).toBe(0.1)
    expect(faces(first)).toEqual(['a', 'a', 'a', 'a'])
    // New top waits behind the flap, which carries the old top down
    expect(faces(second)).toEqual(['c', 'b', 'b', 'c'])

    act(() => flips()[0][2].onComplete())
    expect(faces(second)).toEqual(['c', 'c', 'c', 'c'])
  })

  it('brings the newest letter if the text changes before the flap falls', () => {
    const { container, rerender } = render(
      <RotatingText text='a' variant='flap' />
    )
    rerender(<RotatingText text='b' variant='flap' />)
    rerender(<RotatingText text='c' variant='flap' />)
    const tile = root(container).children[0]

    expect(flips()).toHaveLength(1)
    expect(faces(tile)).toEqual(['c', 'a', 'a', 'c'])

    // Back to the letter it shows: the waiting flip is called off
    rerender(<RotatingText text='a' variant='flap' />)
    expect(faces(tile)).toEqual(['a', 'a', 'a', 'a'])
    expect(flips()).toHaveLength(1)
  })

  it('flips on to the newest text once a falling flap lands', () => {
    const { container, rerender } = render(
      <RotatingText text='a' variant='flap' />
    )
    rerender(<RotatingText text='b' variant='flap' />)
    const [, , fall] = flips()[0]
    act(() => fall.onUpdate(-10))
    rerender(<RotatingText text='c' variant='flap' />)
    rerender(<RotatingText text='d' variant='flap' />)
    const tile = root(container).children[0]

    // The falling flap runs on; the letters in between are skipped
    expect(flips()).toHaveLength(1)
    expect(faces(tile)).toEqual(['b', 'a', 'a', 'b'])

    // Landing drops the next flap at once, without the settle
    act(() => fall.onComplete())
    expect(flips()).toHaveLength(2)
    expect(flips()[1].slice(0, 2)).toEqual([0, -180])
    expect(flips()[1][2].delay).toBe(0)
    expect(faces(tile)).toEqual(['d', 'b', 'b', 'd'])
  })

  it('does not render a tile again while a hover flips its letter over itself', () => {
    const onRender = vi.fn()
    const { container } = render(
      <React.Profiler id='rt' onRender={onRender}>
        <RotatingText text='ab' variant='flap' />
      </React.Profiler>
    )
    hover(container)
    const commits = onRender.mock.calls.length

    // Nothing to make room for as the flaps fall, nor to swap as they land
    const falls = flips()
    act(() => falls.forEach(([, , fall]) => fall.onUpdate(-10)))
    act(() => falls.forEach(([, , fall]) => fall.onComplete()))
    expect(onRender).toHaveBeenCalledTimes(commits)
    expect(sizers(container).map((el) => el.getAttribute('data-was'))).toEqual([
      null,
      null
    ])
  })

  it('makes room for both letters when the text changes before a hover flap falls', () => {
    const { container, rerender } = render(
      <RotatingText text='ab' variant='flap' stagger={0.1} />
    )
    hover(container)
    rerender(<RotatingText text='aW' variant='flap' stagger={0.1} />)
    const [, second] = Array.from(root(container).children)
    const [, , fall] = flips()[1]

    act(() => fall.onUpdate(-10))
    expect(sizers(container)[1].getAttribute('data-was')).toBe('b')
    expect(sizers(container)[1].textContent).toBe('W')
    expect(faces(second)).toEqual(['W', 'b', 'b', 'W'])

    act(() => fall.onComplete())
    expect(faces(second)).toEqual(['W', 'W', 'W', 'W'])
  })

  it('sizes a tile by the letter it shows until a hover flap falls, after an earlier flip', () => {
    const { container, rerender } = render(
      <RotatingText text='a' variant='flap' />
    )
    rerender(<RotatingText text='b' variant='flap' />)
    const [, , fall] = flips()[0]
    act(() => fall.onUpdate(-10))
    act(() => fall.onComplete())
    act(() => flips()[1][2].onComplete())

    // At rest on b, flipped over itself, with new text before it falls
    hover(container)
    rerender(<RotatingText text='W' variant='flap' />)
    expect(sizers(container)[0].textContent).toBe('b')
    expect(sizers(container)[0].getAttribute('data-was')).toBe(null)
  })

  it('flips a tile added to longer text in from blank under StrictMode', () => {
    const { rerender } = render(
      <React.StrictMode>
        <RotatingText text='a' variant='flap' />
      </React.StrictMode>
    )
    rerender(
      <React.StrictMode>
        <RotatingText text='ab' variant='flap' />
      </React.StrictMode>
    )
    // StrictMode stops the first flip as it mounts the tile again; the tile
    // starts it again rather than staying down
    const calls = vi.mocked(animate).mock
    const last = calls.results[calls.results.length - 1].value
    expect(calls.calls[calls.calls.length - 1].slice(0, 2)).toEqual([0, -180])
    expect(last.stop).not.toHaveBeenCalled()
  })

  it('starts one flip for each hover, even when the board is shown again after suspending', () => {
    let wait: Promise<void> | undefined
    let resume = () => {}
    const Pause = () => {
      if (wait) throw wait
      return null
    }
    const Page = ({ paused }: { paused: boolean }) => (
      <React.Suspense fallback={null}>
        <RotatingText text='ab' variant='flap' />
        {paused && <Pause />}
      </React.Suspense>
    )
    const { container, rerender } = render(<Page paused={false} />)
    hover(container)
    const falls = flips()
    expect(falls).toHaveLength(2)
    act(() => falls.forEach(([, , f]) => f.onComplete()))
    act(() =>
      flips()
        .slice(2)
        .forEach(([, , f]) => f.onComplete())
    )
    const settled = flips().length

    wait = new Promise((resolve) => (resume = () => resolve()))
    rerender(<Page paused />)
    wait = undefined
    rerender(<Page paused={false} />)
    resume()
    expect(flips()).toHaveLength(settled)
  })

  it('dims the flap faces while they turn and clears them at rest', () => {
    const { container, rerender } = render(
      <RotatingText text='a' variant='flap' />
    )
    rerender(<RotatingText text='b' variant='flap' />)
    const tile = root(container).children[0]
    const [front, back] = Array.from(tile.querySelectorAll('span')).filter(
      (el) => el.className.includes('leaf')
    )
    const brightness = (el: HTMLElement) =>
      Number(el.style.filter.match(/brightness\((.*)\)/)?.[1] ?? 1)
    expect([front.style.filter, back.style.filter]).toEqual(['', ''])

    // Still facing the light: the front is lit, the back faces away
    const [, , fall] = flips()[0]
    act(() => fall.onUpdate(-10))
    expect(front.style.filter).toBe('')
    expect(brightness(back)).toBeLessThan(1)

    // Turned away from the light, the front darkens and the back brightens
    act(() => fall.onUpdate(-120))
    expect(brightness(front)).toBeLessThan(1)
    act(() => fall.onUpdate(-170))
    expect(brightness(back)).toBeGreaterThan(brightness(front))

    act(() => fall.onComplete())
    act(() => flips()[1][2].onComplete())
    expect([front.style.filter, back.style.filter]).toEqual(['', ''])
  })

  it('ignores a hover while a tile is already flipping', () => {
    const { container, rerender } = render(
      <RotatingText text='a' variant='flap' />
    )
    rerender(<RotatingText text='b' variant='flap' />)
    hover(container)
    expect(flips()).toHaveLength(1)
  })

  it('flips tiles past the end of shorter text to blank, then removes them', () => {
    const { container, rerender } = render(
      <RotatingText text='abc' variant='flap' />
    )
    rerender(<RotatingText text='a' variant='flap' />)
    const tiles = () => root(container).children

    // Tile 2 flips last, so blank goes on its faces a frame into its wait
    const [one, two] = flips()
    expect(tiles()).toHaveLength(3)
    act(() => two[2].onUpdate(0, -190))
    expect(faces(tiles()[2])).toEqual([' ', 'c', 'c', ' '])

    // Tile 1 comes to rest first, but the tile after it is still turning
    act(() => one[2].onComplete())
    act(() => flips()[2][2].onComplete())
    expect(tiles()).toHaveLength(3)

    act(() => two[2].onComplete())
    act(() => flips()[3][2].onComplete())
    expect(tiles()).toHaveLength(1)
  })

  it("keeps a waiting flap's new letter off the faces it hides until it nears its fall", () => {
    const { container, rerender } = render(
      <RotatingText text='abcdefg' variant='flap' stagger={1} />
    )
    rerender(<RotatingText text='ABCDEFG' variant='flap' stagger={1} />)
    const tiles = root(container).children

    // Only the first flap falls at once. The others keep showing their old
    // letter on every face, which is all the flap lets be seen.
    expect(faces(tiles[0])).toEqual(['A', 'a', 'a', 'A'])
    expect(faces(tiles[6])).toEqual(['g', 'g', 'g', 'g'])

    // Once the frame's few reveals are taken, only a flap close to its fall
    // takes its letter
    const falls = flips().map(([, , fall]) => fall)
    nextFrame()
    act(() => {
      for (let i = 1; i <= 4; i++) falls[i].onUpdate(0, -5000)
      falls[5].onUpdate(0, -5000)
      falls[6].onUpdate(0, -100)
    })
    expect(faces(tiles[4])).toEqual(['E', 'e', 'e', 'E'])
    expect(faces(tiles[5])).toEqual(['f', 'f', 'f', 'f'])
    expect(faces(tiles[6])).toEqual(['G', 'g', 'g', 'G'])
  })

  it('puts new letters on the faces of a few waiting tiles a frame', () => {
    const { container, rerender } = render(
      <RotatingText text='abcdefghij' variant='flap' stagger={1} />
    )
    rerender(<RotatingText text='ABCDEFGHIJ' variant='flap' stagger={1} />)
    const shown = () =>
      Array.from(root(container).children, (tile) => faces(tile)[0]).join('')
    const frame = () => {
      nextFrame()
      act(() => flips().forEach(([, , fall]) => fall.onUpdate(0, -5000)))
    }
    expect(shown()).toBe('Abcdefghij')
    frame()
    expect(shown()).toBe('ABCDEfghij')
    frame()
    expect(shown()).toBe('ABCDEFGHIj')
    frame()
    expect(shown()).toBe('ABCDEFGHIJ')
  })

  it('keeps the newest letter back on a waiting flap whose letter changes', () => {
    const { container, rerender } = render(
      <RotatingText text='ab' variant='flap' stagger={1} />
    )
    rerender(<RotatingText text='xy' variant='flap' stagger={1} />)
    rerender(<RotatingText text='xz' variant='flap' stagger={1} />)
    const tile = root(container).children[1]
    expect(faces(tile)).toEqual(['b', 'b', 'b', 'b'])
    expect(flips()).toHaveLength(2)

    act(() => flips()[1][2].onUpdate(0, -100))
    expect(faces(tile)).toEqual(['z', 'b', 'b', 'z'])
  })

  it("puts the new letter on a waiting flap's faces as it starts to fall", () => {
    const { container, rerender } = render(
      <RotatingText text='ab' variant='flap' stagger={1} />
    )
    rerender(<RotatingText text='xy' variant='flap' stagger={1} />)
    const tile = root(container).children[1]
    expect(faces(tile)).toEqual(['b', 'b', 'b', 'b'])

    // No frame came round to it in time, as when the page is held up
    act(() => flips()[1][2].onUpdate(-10, 10))
    expect(faces(tile)).toEqual(['y', 'b', 'b', 'y'])
  })

  it('flips tiles added to longer text in from blank', () => {
    const { container, rerender } = render(
      <RotatingText text='a' variant='flap' />
    )
    rerender(<RotatingText text='ab' variant='flap' />)
    const added = root(container).children[1]

    expect(faces(added)).toEqual(['b', ' ', ' ', 'b'])
    expect(flips()).toHaveLength(1)
  })

  it('does not flip the tiles on hover when reduced motion is preferred', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)
    const { container } = render(<RotatingText text='abc' variant='flap' />)
    hover(container)
    expect(flips()).toHaveLength(0)
  })

  it('treats an empty timing array as the default timing', () => {
    const { container } = render(
      <RotatingText text='a' variant='flap' timing={[]} />
    )
    hover(container)
    const [, , fall] = flips()[0]
    act(() => fall.onComplete())
    const [, , settle] = flips()[1]
    expect(fall.duration + settle.duration).toBeCloseTo(0.5)
  })

  it('swaps letters without flipping when reduced motion is preferred', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)
    const { container, rerender } = render(
      <RotatingText text='abc' variant='flap' />
    )
    rerender(<RotatingText text='x' variant='flap' />)

    expect(flips()).toHaveLength(0)
    expect(root(container).children).toHaveLength(1)
    expect(faces(root(container).children[0])).toEqual(['x', 'x', 'x', 'x'])
  })

  it('leaves the flap tiles still when reduced motion is preferred', () => {
    const moving = render(<RotatingText text='abc' variant='flap' />)
    const markup = moving.container.innerHTML
    moving.unmount()

    vi.mocked(useReducedMotion).mockReturnValue(true)
    const { container } = render(<RotatingText text='abc' variant='flap' />)

    // Same markup either way, so server and client renders always match
    expect(container.innerHTML).toBe(markup)
    expect(propsOf.get(root(container))!.scale).toBe(1.05)
  })

  it('does not start a flip on hover when reduced motion is preferred', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)
    const { container } = render(<RotatingText text='abc' />)

    hover(container)
    expect(animate).not.toHaveBeenCalled()
  })

  it('scales on hover instead of turning when reduced motion is preferred', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)
    const { container } = render(<RotatingText text='abc' />)

    hover(container)
    expect(animate).not.toHaveBeenCalled()
    expect(propsOf.get(root(container))!.scale).toBe(1.05)
  })

  it('turns letters and has no hover scale when reduced motion is not preferred', () => {
    const { container } = render(<RotatingText text='abc' />)

    hover(container)
    expect(turns()).toHaveLength(3)
    expect(propsOf.get(root(container))!.scale).toBeUndefined()
  })

  it('applies className only when provided', () => {
    const { container, rerender } = render(<RotatingText text='abc' />)
    const baseClass = root(container).className
    expect(baseClass).not.toContain('undefined')

    rerender(<RotatingText text='abc' className='custom' />)
    expect(root(container).classList).toContain('custom')
    expect(root(container).className).toBe(`${baseClass} custom`)
  })

  it('passes style through to the root element', () => {
    const { container } = render(
      <RotatingText text='abc' style={{ color: 'red' }} />
    )
    expect((root(container) as HTMLElement).style.color).toBe('red')
  })
})
