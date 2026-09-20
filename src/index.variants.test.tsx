import * as React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  animate,
  spring,
  useAnimationControls,
  useReducedMotion
} from 'framer-motion'
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
    useAnimationControls: vi.fn(() => ({
      start: vi.fn(() => Promise.resolve())
    })),
    useReducedMotion: vi.fn(() => false),
    // Records each letter's turn and runs it
    animate: vi.fn(actual.animate)
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
const lastControls = () =>
  vi.mocked(useAnimationControls).mock.results.at(-1)!.value
const hover = (container: HTMLElement) =>
  propsOf.get(root(container))!.onHoverStart()

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

  it('starts the flap animation on hover', () => {
    const { container } = render(<RotatingText text='abc' variant='flap' />)

    hover(container)
    expect(lastControls().start).toHaveBeenCalledWith('rotate')
  })

  it('lets rolling letters settle before another hover can start a flip', () => {
    const { container } = render(<RotatingText text='abc' />)

    hover(container)
    hover(container)
    expect(turns()).toHaveLength(3)
  })

  it('lets a flap flip finish before another hover can start one', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
    // Last flap starts at 0.2s and runs 0.5s, so the flip ends at 1700ms
    const { container } = render(
      <RotatingText text='abc' variant='flap' stagger={0.1} timing={0.5} />
    )
    const { onHoverStart } = propsOf.get(root(container))!
    const controls = lastControls()

    try {
      onHoverStart()
      now.mockReturnValue(1650)
      onHoverStart()
      expect(controls.start).toHaveBeenCalledTimes(1)

      now.mockReturnValue(1700)
      onHoverStart()
      expect(controls.start).toHaveBeenCalledTimes(2)
    } finally {
      now.mockRestore()
    }
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
    const flaps = movers(container)
    expect(flaps).toHaveLength(3)
    expect(flaps.map((f) => rotation(f).transition.duration)).toEqual([
      0.3, 0.6, 0.6
    ])
    expect(flaps.map((f) => rotation(f).transition.delay)).toEqual([
      0, 0.05, 0.1
    ])
    for (const flap of flaps) {
      expect(rotation(flap).rotateX.at(-1)).toBe(-180)
    }
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
    expect(lastControls().start).not.toHaveBeenCalled()
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
