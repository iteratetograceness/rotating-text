import * as React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { animate, spring, useReducedMotion } from 'framer-motion'
import { RotatingText } from '.'

// Replace motion.div/motion.span with plain elements that remember the
// motion props they were given, so tests can inspect variants directly.
const { propsOf } = vi.hoisted(() => {
  const props = new WeakMap<Element, Record<string, any>>()
  return { propsOf: props }
})

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>()
  const stub = (Tag: 'div' | 'span') =>
    function MotionStub({
      variants,
      custom,
      animate,
      initial,
      whileHover,
      onHoverStart,
      transformTemplate,
      style,
      ...rest
    }: Record<string, any>) {
      const motionProps = { variants, custom, whileHover, onHoverStart }
      // Motion values can't be rendered by a plain element, so drop them
      const plainStyle =
        style &&
        Object.fromEntries(
          Object.entries(style).filter(([, value]) => typeof value !== 'object')
        )
      return (
        <Tag
          {...rest}
          style={plainStyle}
          ref={(el: Element | null) => el && propsOf.set(el, motionProps)}
        />
      )
    }
  return {
    ...actual,
    motion: { div: stub('div'), span: stub('span') },
    useReducedMotion: vi.fn(() => false),
    // Records every call. A rolling letter's turn (on its angle) runs; a
    // flap's (from a plain number) is held, so tests step it by calling its
    // onUpdate and onComplete
    animate: vi.fn((...args: Parameters<typeof actual.animate>) =>
      typeof args[0] === 'number'
        ? { stop: vi.fn(), isAnimating: () => false }
        : actual.animate(...args)
    )
  }
})

afterEach(() => {
  cleanup()
  vi.mocked(useReducedMotion).mockReturnValue(false)
  vi.mocked(animate).mockClear()
})

const root = (container: HTMLElement) => container.firstElementChild!
const letters = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('span'))
const rotation = (span: Element) => {
  const { variants, custom } = propsOf.get(span)!
  return typeof variants?.rotate === 'function'
    ? variants.rotate(custom)
    : variants?.rotate
}
// Elements that animate when the component flips
const movers = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('span')).filter(
    (el) => propsOf.get(el)?.variants
  )
const hover = (container: HTMLElement) =>
  act(() => propsOf.get(root(container))!.onHoverStart())
// Each flap's animate() call as [from, to, options]
const flips = () => vi.mocked(animate).mock.calls as any[]
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

// Runs a letter's turn through framer-motion's own spring, so the angles
// and the moment it counts as settled are the ones the component gets
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

  it('gives every letter its own turn after the text prop changes', () => {
    const { container, rerender } = render(
      <RotatingText text='ab' timing={0.4} />
    )
    rerender(<RotatingText text='abcd' timing={0.4} />)
    hover(container)

    expect(letters(container)).toHaveLength(8)
    expect(turns()).toHaveLength(4)
    expect(new Set(turns().map((turn) => turn.stiffness)).size).toBe(1)
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

  it('shows a text change at once when no flip is running', () => {
    const { container, rerender } = render(<RotatingText text='ab' />)
    rerender(<RotatingText text='cd' />)
    const [front, back] = Array.from(root(container).children)
    expect(front.textContent).toBe('cd')
    expect(back.textContent).toBe('cd')
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

    expect(tiles()).toHaveLength(3)
    expect(faces(tiles()[2])).toEqual([' ', 'c', 'c', ' '])

    // Tile 1 comes to rest first, but the tile after it is still turning
    const [one, two] = flips()
    act(() => one[2].onComplete())
    act(() => flips()[2][2].onComplete())
    expect(tiles()).toHaveLength(3)

    act(() => two[2].onComplete())
    act(() => flips()[3][2].onComplete())
    expect(tiles()).toHaveLength(1)
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

    expect(movers(container)).toHaveLength(0)
    // Same markup either way, so server and client renders always match
    expect(container.innerHTML).toBe(markup)
    expect(propsOf.get(root(container))!.whileHover).toEqual({ scale: 1.05 })
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
    expect(propsOf.get(root(container))!.whileHover).toEqual({ scale: 1.05 })
  })

  it('turns letters and has no hover scale when reduced motion is not preferred', () => {
    const { container } = render(<RotatingText text='abc' />)

    hover(container)
    expect(turns()).toHaveLength(3)
    expect(propsOf.get(root(container))!.whileHover).toBeUndefined()
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
