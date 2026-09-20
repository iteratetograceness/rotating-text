import * as React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAnimationControls, useReducedMotion } from 'framer-motion'
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
      ...rest
    }: Record<string, any>) {
      const motionProps = { variants, custom, whileHover, onHoverStart }
      return (
        <Tag
          {...rest}
          ref={(el: Element | null) => el && propsOf.set(el, motionProps)}
        />
      )
    }
  return {
    ...actual,
    motion: { div: stub('div'), span: stub('span') },
    useAnimationControls: vi.fn(() => ({ start: vi.fn() })),
    useReducedMotion: vi.fn(() => false)
  }
})

afterEach(() => {
  cleanup()
  vi.mocked(useReducedMotion).mockReturnValue(false)
})

const root = (container: HTMLElement) => container.firstElementChild!
const letters = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('span'))
const rotation = (span: Element) => {
  const { variants, custom } = propsOf.get(span)!
  return variants?.rotate(custom)
}

describe('RotatingText', () => {
  it('gives each letter a rotate variant using the per-letter timing', () => {
    const { container } = render(
      <RotatingText text='abc' timing={[0.1, 0.2, 0.3]} />
    )
    const durations = letters(container).map(
      (s) => rotation(s).transition.duration
    )
    // front face, then back face
    expect(durations).toEqual([0.1, 0.2, 0.3, 0.1, 0.2, 0.3])
  })

  it('computes one duration per letter after the text prop changes', () => {
    const { container, rerender } = render(
      <RotatingText text='ab' timing={0.4} />
    )
    rerender(<RotatingText text='abcd' timing={0.4} />)

    const spans = letters(container)
    expect(spans).toHaveLength(8)
    for (const span of spans) {
      expect(rotation(span).transition.duration).toBe(0.4)
    }
  })

  it('reuses the last timing entry for letters past the end of the array', () => {
    const { container } = render(
      <RotatingText text='abcd' timing={[0.1, 0.2]} />
    )
    const durations = letters(container)
      .slice(0, 4)
      .map((s) => rotation(s).transition.duration)
    expect(durations).toEqual([0.1, 0.2, 0.2, 0.2])
  })

  it('starts the rotate animation on hover', () => {
    const { container } = render(<RotatingText text='abc' />)
    const controls = vi.mocked(useAnimationControls).mock.results.at(-1)!.value

    propsOf.get(root(container))!.onHoverStart()
    expect(controls.start).toHaveBeenCalledWith('rotate')
  })

  it('drops the letter rotation and scales on hover when reduced motion is preferred', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)
    const { container } = render(<RotatingText text='abc' />)

    for (const span of letters(container)) {
      expect(propsOf.get(span)!.variants).toBeUndefined()
    }
    expect(propsOf.get(root(container))!.whileHover).toEqual({ scale: 1.05 })
  })

  it('rotates letters and has no hover scale when reduced motion is not preferred', () => {
    const { container } = render(<RotatingText text='abc' />)

    for (const span of letters(container)) {
      expect(rotation(span)).toHaveProperty('rotateX')
    }
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
