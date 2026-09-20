import * as React from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RotatingText } from '.'

// Observers still watching when a test ends are stopped, pass or fail
const observers: MutationObserver[] = []
afterEach(() => {
  observers.splice(0).forEach((observer) => observer.disconnect())
  cleanup()
})

// Calls `record` every time the element's style changes
const watch = (el: Element, record: () => void) => {
  const observer = new MutationObserver(record)
  observer.observe(el, { attributes: true })
  observers.push(observer)
}

const angle = (el: HTMLElement) =>
  Number(/rotateX\(([-\d.e]+)deg\)/.exec(el.style.transform)![1])

// Smoke tests against the real framer-motion. The prop-level behavior is
// covered in index.variants.test.tsx, which stubs out motion components.
describe('RotatingText', () => {
  it('renders each letter of the text on the front and back faces', () => {
    const { container } = render(<RotatingText text='hello' />)
    const faces = container.firstElementChild!.children

    for (const face of [faces[0], faces[1]]) {
      const letters = Array.from(
        face.querySelectorAll('span'),
        (span) => span.textContent
      )
      expect(letters).toEqual(['h', 'e', 'l', 'l', 'o'])
    }
  })

  it('renders the full text as a placeholder for sizing', () => {
    const { container } = render(<RotatingText text='hello' />)
    expect(container.firstElementChild!.lastElementChild!.textContent).toBe(
      'hello'
    )
  })

  it('rolls each letter a quarter turn on hover and comes to rest facing front', async () => {
    const { container } = render(
      <RotatingText text='hi' timing={0.3} stagger={0.02} />
    )
    const [front, back] = Array.from(container.firstElementChild!.children)
    const frontLetter = front.querySelector('span')!
    const backLetter = back.querySelector('span')!

    // Record the pair of angles every time the front letter moves
    const seen: [number, number][] = []
    watch(frontLetter, () => seen.push([angle(frontLetter), angle(backLetter)]))

    fireEvent.pointerEnter(container.firstElementChild!)
    await waitFor(() => expect(seen.some(([f]) => f < -85)).toBe(true))
    await waitFor(() => {
      expect(frontLetter.style.transform).toContain('rotateX(0deg)')
      expect(frontLetter.style.opacity).toBe('1')
    })

    // The copy stays joined to the front face a quarter turn behind it
    for (const [f, b] of seen) expect(b - f).toBeCloseTo(90)
    // It swings past the next face before it settles
    expect(Math.min(...seen.map(([f]) => f))).toBeLessThan(-92)
    expect(backLetter.style.transform).toContain('rotateX(90deg)')
    expect(backLetter.style.opacity).toBe('0')
  })

  it('carries on to the next face through a second hover', async () => {
    const { container } = render(
      <RotatingText text='hi' timing={0.3} stagger={0.01} />
    )
    const root = container.firstElementChild!
    const frontLetter = container.querySelector('span')!
    fireEvent.pointerEnter(root)
    await waitFor(() => expect(angle(frontLetter)).toBeLessThan(-30))

    const seen: number[] = []
    watch(frontLetter, () => seen.push(angle(frontLetter)))
    fireEvent.pointerLeave(root)
    fireEvent.pointerEnter(root)
    await waitFor(() => expect(angle(frontLetter)).toBe(0))

    // It carried on to the next face and only then went back to rest,
    // rather than starting over from the beginning
    const back = seen.findIndex((a) => a > -1)
    expect(back).toBeGreaterThan(0)
    expect(Math.max(...seen.slice(0, back))).toBeLessThan(-30)
    expect(Math.min(...seen.slice(0, back))).toBeLessThan(-92)
    expect(seen.slice(back).every((a) => a === 0)).toBe(true)
  })

  it('keeps a letter turning when the text changes mid-flip', async () => {
    const { container, rerender } = render(
      <RotatingText text='hi' timing={0.3} stagger={0.01} />
    )
    const frontLetter = container.querySelector('span')!
    fireEvent.pointerEnter(container.firstElementChild!)
    await waitFor(() =>
      expect(frontLetter.style.transform).not.toContain('rotateX(0deg)')
    )
    rerender(<RotatingText text='yo' timing={0.3} stagger={0.01} />)

    // Same element, still part way through its turn
    expect(container.querySelector('span')).toBe(frontLetter)
    expect(frontLetter.style.transform).not.toContain('rotateX(0deg)')
    await waitFor(() => expect(frontLetter.textContent).toBe('y'))
  })

  it('flips again after the text changes in the middle of a flip', async () => {
    const { container, rerender } = render(
      <RotatingText text='hi' timing={0.2} stagger={0.01} />
    )
    fireEvent.pointerEnter(container.firstElementChild!)
    await new Promise((resolve) => setTimeout(resolve, 50))
    rerender(<RotatingText text='yo' timing={0.05} stagger={0.01} />)
    fireEvent.pointerLeave(container.firstElementChild!)
    const [frontLetter, secondLetter] = Array.from(
      container.querySelectorAll('span')
    )
    await waitFor(() => {
      expect(frontLetter.style.transform).toContain('rotateX(0deg)')
      expect(secondLetter.style.transform).toContain('rotateX(0deg)')
    })
    const seen: number[] = []
    watch(frontLetter, () => seen.push(angle(frontLetter)))
    fireEvent.pointerEnter(container.firstElementChild!)
    await waitFor(() => expect(Math.min(...seen)).toBeLessThan(-85))
  })

  it('comes to rest showing the new text when it gets shorter mid-flip', async () => {
    const { container, rerender } = render(
      <RotatingText text='abcd' timing={0.3} stagger={0.1} />
    )
    const [front] = Array.from(container.firstElementChild!.children)
    fireEvent.pointerEnter(container.firstElementChild!)
    await new Promise((resolve) => setTimeout(resolve, 60))
    rerender(<RotatingText text='xy' timing={0.3} stagger={0.1} />)

    await waitFor(() => {
      expect(front.textContent).toBe('xy')
      for (const letter of Array.from(front.querySelectorAll('span'))) {
        expect(letter.style.transform).toContain('rotateX(0deg)')
      }
    })
  })

  it('brings letters back at rest after the text empties mid-flip', async () => {
    const { container, rerender } = render(
      <RotatingText text='hi' timing={0.4} stagger={0.01} />
    )
    fireEvent.pointerEnter(container.firstElementChild!)
    await new Promise((resolve) => setTimeout(resolve, 60))
    rerender(<RotatingText text='' timing={0.4} stagger={0.01} />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    rerender(<RotatingText text='yo' timing={0.4} stagger={0.01} />)

    const [front, back] = Array.from(container.firstElementChild!.children)
    await waitFor(() => {
      expect(front.textContent).toBe('yo')
      for (const letter of Array.from(front.querySelectorAll('span'))) {
        expect(letter.style.transform).toContain('rotateX(0deg)')
        expect(letter.style.opacity).toBe('1')
      }
      for (const letter of Array.from(back.querySelectorAll('span'))) {
        expect(letter.style.opacity).toBe('0')
      }
    })
    // and they stay there rather than finishing an old turn
    await new Promise((resolve) => setTimeout(resolve, 100))
    for (const letter of Array.from(front.querySelectorAll('span'))) {
      expect(letter.style.transform).toContain('rotateX(0deg)')
    }
  })

  it('keeps an accented letter or emoji on one tile', () => {
    const { container } = render(
      <RotatingText text={'Cafe\u0301👍🏽'} variant='flap' />
    )
    const tiles = container.firstElementChild!.children
    expect(
      Array.from(tiles, (tile) => tile.firstElementChild!.textContent)
    ).toEqual(['C', 'a', 'f', 'e\u0301', '👍🏽'])
  })

  it('renders one tile per letter in the flap variant', () => {
    const { container } = render(<RotatingText text='abc' variant='flap' />)
    const tiles = container.firstElementChild!.children
    expect(
      Array.from(tiles, (tile) => tile.firstElementChild!.textContent)
    ).toEqual(['a', 'b', 'c'])
  })

  it('drops each flap over its hinge on hover', async () => {
    const { container } = render(
      <RotatingText text='hi' variant='flap' timing={0.05} stagger={0.01} />
    )
    const flap = container.firstElementChild!.firstElementChild!
      .lastElementChild as HTMLElement

    fireEvent.pointerEnter(container.firstElementChild!)
    await waitFor(() =>
      expect(flap.style.transform).toContain('rotateX(-180deg)')
    )
  })
})
