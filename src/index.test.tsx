import * as React from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RotatingText } from '.'

afterEach(cleanup)

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

  it('rolls the front letters away and the copies into place on hover', async () => {
    const { container } = render(<RotatingText text='hi' timing={0.05} />)
    const [front, back] = Array.from(container.firstElementChild!.children)
    const frontLetter = front.querySelector('span')!
    const backLetter = back.querySelector('span')!

    fireEvent.pointerEnter(container.firstElementChild!)
    await waitFor(() => {
      expect(frontLetter.style.transform).toContain('rotateX(-90deg)')
      expect(backLetter.style.transform).toContain('rotateX(0deg)')
    })
    expect(frontLetter.style.opacity).toBe('0')
    expect(backLetter.style.opacity).toBe('1')
  })

  it('flips again after the text changes in the middle of a flip', async () => {
    const { container, rerender } = render(
      <RotatingText text='hi' timing={0.2} stagger={0.01} />
    )
    fireEvent.pointerEnter(container.firstElementChild!)
    await new Promise((resolve) => setTimeout(resolve, 50))
    rerender(<RotatingText text='yo' timing={0.05} stagger={0.01} />)
    fireEvent.pointerLeave(container.firstElementChild!)
    await new Promise((resolve) => setTimeout(resolve, 300))

    const frontLetter = container.querySelector('span')!
    expect(frontLetter.style.transform).toContain('rotateX(0deg)')
    fireEvent.pointerEnter(container.firstElementChild!)
    await waitFor(() =>
      expect(frontLetter.style.transform).toContain('rotateX(-90deg)')
    )
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
