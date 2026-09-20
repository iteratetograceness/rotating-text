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

  it('rotates the front letters away on hover', async () => {
    const { container } = render(<RotatingText text='hi' timing={0.05} />)
    const frontLetter = container.querySelector('span')!

    fireEvent.pointerEnter(container.firstElementChild!)
    await waitFor(() =>
      expect(frontLetter.style.transform).toContain('rotateX(90deg)')
    )
  })
})
