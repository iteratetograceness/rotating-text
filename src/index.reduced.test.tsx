import * as React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor
} from '@testing-library/react'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import styles from './index.module.css'

// The reader's reduced-motion setting, which a test turns on and off while
// the page is open. The component starts listening to it the first time one
// renders, so it is loaded afresh once this is in place.
const setting = { matches: false, listeners: [] as (() => void)[] }
vi.stubGlobal('matchMedia', (query: string) => ({
  media: query,
  get matches() {
    return setting.matches
  },
  addEventListener: (type: string, listener: () => void) => {
    if (type === 'change') setting.listeners.push(listener)
  }
}))
vi.resetModules()
const { RotatingText } = await import('.')
afterAll(() => {
  vi.unstubAllGlobals()
})

const reduceMotion = (on: boolean) =>
  act(() => {
    setting.matches = on
    setting.listeners.forEach((listener) => listener())
  })

afterEach(() => {
  cleanup()
  reduceMotion(false)
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 300))

// jsdom has no PointerEvent, so a mouse's is made from a MouseEvent
const pointer = (type: string) => {
  const event = new MouseEvent(type)
  Object.defineProperties(event, {
    pointerType: { value: 'mouse' },
    button: { value: 0 }
  })
  return event
}
const hover = (el: Element) => fireEvent(el, pointer('pointerenter'))
const leave = (el: Element) => fireEvent(el, pointer('pointerleave'))

// A roll letter's angle, read from whichever face of its slot is drawn
const rollAngles = (root: Element) => {
  const [, front, back] = Array.from(root.children)
  return Array.from(front.children, (el, i) => {
    const face = el as HTMLElement
    const turned = /rotateX\(([-\d.e]+)deg\)/.exec(face.style.transform)
    if (turned) return Number(turned[1])
    if (face.style.transform === 'perspective(4em)') return 0
    const copy = back.children[i] as HTMLElement
    const other = /rotateX\(([-\d.e]+)deg\)/.exec(copy.style.transform)
    return other ? Number(other[1]) - 90 : NaN
  })
}
// At rest: every front facing the viewer, every copy folded away
const rollAtRest = (root: Element) => {
  const [, front, back] = Array.from(root.children)
  for (const el of Array.from(front.children) as HTMLElement[]) {
    expect(el.style.transform).toBe('perspective(4em)')
    expect(el.style.opacity).toBe('1')
  }
  for (const el of Array.from(back.children) as HTMLElement[]) {
    expect(el.style.transform).toBe('scaleY(0)')
    expect(el.style.opacity).toBe('0')
  }
}
const rows = (root: Element) =>
  Array.from(root.children)
    .slice(1, 3)
    .map((row) => row.textContent)

const flapAngles = (board: Element) =>
  Array.from(board.children, (tile) => {
    const flap = tile.lastElementChild as HTMLElement
    return Number(/rotateX\((-?[\d.e-]+)deg\)/.exec(flap.style.transform)?.[1])
  })
// Sizer, static top, static bottom, then the flap's two faces
const tiles = (board: Element) =>
  Array.from(board.children, (tile) =>
    Array.from(tile.children, (half) => half.textContent).join('|')
  )
// A tile at rest: flap up, drawn flat, every face unshaded, no shadow. A
// tile that has never flipped carries none of these styles yet.
const flapAtRest = (board: Element) => {
  for (const tile of Array.from(board.children)) {
    expect(tile.hasAttribute('data-turning')).toBe(false)
    const flap = tile.lastElementChild as HTMLElement
    expect(['', 'rotateX(0deg)']).toContain(flap.style.transform)
    for (const leaf of Array.from(flap.children) as HTMLElement[]) {
      expect(leaf.style.filter).toBe('')
    }
    const shadow = tile.querySelector(`.${styles.shadow}`) as HTMLElement
    expect(['', 'scaleY(0)']).toContain(shadow.style.transform)
  }
}

describe('reduced motion turned on or off while the page is open', () => {
  it('stops a roll mid-turn on the current text and scales on hover after', async () => {
    const props = { timing: 0.3, stagger: 0.03 }
    const { container, rerender } = render(
      <RotatingText text='Hello' {...props} />
    )
    const root = container.firstElementChild!
    rerender(<RotatingText text='World' {...props} />)
    await waitFor(() => expect(rollAngles(root)[0]).toBeLessThan(-30))
    // Part way round, with later letters still waiting their turn
    expect(rollAngles(root).some((a) => a === 0)).toBe(true)

    reduceMotion(true)
    // Not remounted: the same element, now at rest on the new text
    expect(container.firstElementChild).toBe(root)
    rollAtRest(root)
    expect(rows(root)).toEqual(['World', 'World'])
    const placeholder = root.lastElementChild as HTMLElement
    expect(placeholder.style.width).toBe('')

    // Nothing moves on afterwards
    await settle()
    rollAtRest(root)
    expect(rows(root)).toEqual(['World', 'World'])

    // A hover scales the text rather than turning it, and a text change
    // just swaps the letters
    hover(root)
    await waitFor(() =>
      expect((root as HTMLElement).style.transform).toMatch(/scale\(1\.05\)/)
    )
    rollAtRest(root)
    rerender(<RotatingText text='Wave' {...props} />)
    rollAtRest(root)
    expect(rows(root)).toEqual(['Wave', 'Wave'])
  })

  it('brings the roll back when it is turned off, putting a hover scale back down', async () => {
    const props = { timing: 0.3, stagger: 0.03 }
    reduceMotion(true)
    const { container, rerender } = render(
      <RotatingText text='Hi' {...props} />
    )
    const root = container.firstElementChild as HTMLElement
    hover(root)
    await waitFor(() => expect(root.style.transform).toMatch(/scale\(1\.05\)/))

    reduceMotion(false)
    expect(container.firstElementChild).toBe(root)
    // It goes back to its size with the pointer still over it
    await waitFor(() => expect(root.style.transform).toBe('none'))

    // The next hover turns the letters, and there is no scale left to undo
    leave(root)
    hover(root)
    await waitFor(() => expect(rollAngles(root)[0]).toBeLessThan(-30))
    expect(root.style.transform).toBe('none')
    await waitFor(() => rollAtRest(root))

    // And so does a text change
    rerender(<RotatingText text='Yo' {...props} />)
    await waitFor(() => expect(rollAngles(root)[0]).toBeLessThan(-30))
    await waitFor(() => {
      rollAtRest(root)
      expect(rows(root)).toEqual(['Yo', 'Yo'])
    })
  })

  it('stops the flap mid-flip on the current text, without the extra tiles', async () => {
    const props = { variant: 'flap', timing: 0.3, stagger: 0.03 } as const
    const { container, rerender } = render(
      <RotatingText text='abcd' {...props} />
    )
    const board = container.firstElementChild!
    rerender(<RotatingText text='xy' {...props} />)
    await waitFor(() => expect(flapAngles(board)[0]).toBeLessThan(-30))
    // The tiles past the new text's end are still flipping to blank
    expect(board.children).toHaveLength(4)

    reduceMotion(true)
    expect(container.firstElementChild).toBe(board)
    expect(board.children).toHaveLength(2)
    flapAtRest(board)
    expect(tiles(board)).toEqual(['x|x|x|xx', 'y|y|y|yy'])

    await settle()
    flapAtRest(board)
    expect(tiles(board)).toEqual(['x|x|x|xx', 'y|y|y|yy'])

    // A hover doesn't flip, and a text change swaps the letters in place
    hover(board)
    rerender(<RotatingText text='xyz' {...props} />)
    flapAtRest(board)
    expect(tiles(board)).toEqual(['x|x|x|xx', 'y|y|y|yy', 'z|z|z|zz'])
  })

  it('stops a hover flip part way over and flips again once it is turned off', async () => {
    const props = { variant: 'flap', timing: 0.3, stagger: 0.03 } as const
    const { container } = render(<RotatingText text='ok' {...props} />)
    const board = container.firstElementChild!
    hover(board)
    // Caught while the first flap is falling
    await waitFor(() => expect(flapAngles(board)[0]).toBeLessThan(-30))
    reduceMotion(true)
    flapAtRest(board)
    expect(tiles(board)).toEqual(['o|o|o|oo', 'k|k|k|kk'])
    await settle()
    flapAtRest(board)

    reduceMotion(false)
    expect(container.firstElementChild).toBe(board)
    leave(board)
    hover(board)
    await waitFor(() => expect(flapAngles(board)[0]).toBeLessThan(-30))
    await waitFor(() => {
      flapAtRest(board)
      expect(tiles(board)).toEqual(['o|o|o|oo', 'k|k|k|kk'])
    })
  })

  it('flips the new letters in once it is turned off after a still change', async () => {
    const props = { variant: 'flap', timing: 0.2, stagger: 0.02 } as const
    reduceMotion(true)
    const { container, rerender } = render(<RotatingText text='a' {...props} />)
    const board = container.firstElementChild!
    rerender(<RotatingText text='bc' {...props} />)
    expect(tiles(board)).toEqual(['b|b|b|bb', 'c|c|c|cc'])

    reduceMotion(false)
    // Turned off, the board is left as it is until the text changes
    flapAtRest(board)
    const seen: number[] = []
    const flap = board.firstElementChild!.lastElementChild as HTMLElement
    const observer = new MutationObserver(() => seen.push(flapAngles(board)[0]))
    observer.observe(flap, { attributes: true })
    rerender(<RotatingText text='de' {...props} />)
    await waitFor(() => {
      flapAtRest(board)
      expect(tiles(board)).toEqual(['d|d|d|dd', 'e|e|e|ee'])
    })
    observer.disconnect()
    expect(Math.min(...seen)).toBeLessThan(-170)
  })

  it('catches a change made between its first render and its effects', async () => {
    // Turned on by a layout effect, which runs after the text's first render
    // but before it starts listening for changes
    const Switch = () => {
      React.useLayoutEffect(() => {
        setting.matches = true
        setting.listeners.forEach((listener) => listener())
      }, [])
      return null
    }
    const { container } = render(
      <React.Fragment>
        <RotatingText text='Hi' />
        <Switch />
      </React.Fragment>
    )
    const root = container.firstElementChild as HTMLElement
    hover(root)
    await waitFor(() => expect(root.style.transform).toMatch(/scale\(1\.05\)/))
    rollAtRest(root)
  })

  it('scales up at once when it is turned on with the pointer over the text', async () => {
    const { container } = render(<RotatingText text='Hi' timing={0.3} />)
    const root = container.firstElementChild as HTMLElement
    hover(root)
    await waitFor(() => expect(rollAngles(root)[0]).toBeLessThan(-30))
    reduceMotion(true)
    rollAtRest(root)
    await waitFor(() => expect(root.style.transform).toMatch(/scale\(1\.05\)/))
    leave(root)
    await waitFor(() => expect(root.style.transform).toBe('none'))
  })

  it('does not ease the width when it is turned off after a still change', async () => {
    // jsdom does no layout and has no ResizeObserver, so each letter is
    // given 10px, and the placeholder the width it is held at
    const real = window.getComputedStyle
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
      const style = real.call(window, el, pseudo)
      const kind = String(el.getAttribute('class'))
      if (!/face|front|back|placeholder/.test(kind)) return style
      const held =
        kind.includes('placeholder') && (el as HTMLElement).style.width
      const width = held || `${el.textContent!.length * 10}px`
      return new Proxy(style, {
        get: (target, key) => (key === 'width' ? width : (target as any)[key])
      })
    })
    const props = { timing: 0.3, stagger: 0.03 }
    const { container, rerender } = render(
      <RotatingText text='Hello' {...props} />
    )
    const root = container.firstElementChild!
    const placeholder = root.lastElementChild as HTMLElement
    rerender(<RotatingText text='Hello!' {...props} />)
    expect(placeholder.style.width).toBe('50px')
    await waitFor(() => expect(placeholder.style.width).toBe(''))

    reduceMotion(true)
    rerender(<RotatingText text='Hi' {...props} />)
    reduceMotion(false)
    // The text hasn't changed since, so its width stays as it is
    expect(placeholder.style.width).toBe('')
    await settle()
    expect(placeholder.style.width).toBe('')
    vi.restoreAllMocks()
  })

  it('switches every instance on the page, and none taken down', async () => {
    const props = { timing: 0.3, stagger: 0.03 }
    const Page = ({ both }: { both: boolean }) => (
      <React.Fragment>
        <RotatingText text='one' {...props} />
        {both && <RotatingText text='two' variant='flap' {...props} />}
      </React.Fragment>
    )
    const { container, rerender } = render(<Page both />)
    const [roll, board] = Array.from(container.children)
    hover(roll)
    hover(board)
    await waitFor(() => {
      expect(rollAngles(roll)[0]).toBeLessThan(-30)
      expect(flapAngles(board)[0]).toBeLessThan(-30)
    })
    reduceMotion(true)
    rollAtRest(roll)
    flapAtRest(board)

    rerender(<Page both={false} />)
    reduceMotion(false)
    hover(roll)
    await waitFor(() => expect(rollAngles(roll)[0]).toBeLessThan(-30))
  })
})
