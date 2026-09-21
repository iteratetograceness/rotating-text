import * as React from 'react'
import { renderToString } from 'react-dom/server'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RotatingText } from '.'

// Observers still watching when a test ends are stopped, pass or fail
const observers: MutationObserver[] = []
afterEach(() => {
  observers.splice(0).forEach((observer) => observer.disconnect())
  cleanup()
  vi.restoreAllMocks()
})

// Calls `record` every time the element's style changes
const watch = (el: Element, record: () => void) => {
  const observer = new MutationObserver(record)
  observer.observe(el, { attributes: true })
  observers.push(observer)
}

// jsdom does no layout, so letters are given 10px each, and a W 20px. The
// roll's rows and placeholder are as wide as their letters, or the
// placeholder the width it is being held at.
const letterWidths = () => {
  const real = window.getComputedStyle
  const across = (text: string) =>
    Array.from(text).reduce((sum, char) => sum + (char === 'W' ? 20 : 10), 0)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
    const style = real.call(window, el, pseudo)
    const kind = String(el.getAttribute('class'))
    if (!/face|front|back|placeholder/.test(kind)) return style
    const natural = `${across(el.textContent!)}px`
    const held = kind.includes('placeholder') && (el as HTMLElement).style.width
    const width = held || natural
    return new Proxy(style, {
      get: (target, key) => (key === 'width' ? width : (target as any)[key])
    })
  })
}

const px = (value: string) => parseFloat(value)

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

  it('draws the letters at rest in server-rendered markup', () => {
    const host = document.createElement('div')
    host.innerHTML = renderToString(<RotatingText text='hi' />)
    const [front, back] = Array.from(host.firstElementChild!.children)
    for (const letter of Array.from(front.querySelectorAll('span'))) {
      expect(angle(letter)).toBe(0)
      expect(letter.style.opacity).toBe('1')
    }
    for (const letter of Array.from(back.querySelectorAll('span'))) {
      expect(angle(letter)).toBe(90)
      expect(letter.style.opacity).toBe('0')
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

  it('eases its width from the old text to the new one', async () => {
    letterWidths()
    const { container, rerender } = render(
      <RotatingText text='hi' timing={0.2} />
    )
    const [front, back, placeholder] = Array.from(
      container.firstElementChild!.children
    ) as HTMLElement[]
    expect(placeholder.style.width).toBe('')

    const seen: number[] = []
    watch(placeholder, () => {
      if (placeholder.style.width) seen.push(px(placeholder.style.width))
    })
    rerender(<RotatingText text='hello' timing={0.2} />)

    // Held at the old width, with the new letters cut off at its edge rather
    // than drawn over whatever comes after, and the old ones, which fit,
    // left whole
    expect(placeholder.style.width).toBe('20px')
    expect(placeholder.style.whiteSpace).toBe('nowrap')
    expect(back.style.clipPath).toBe('inset(-1000px 30px -1000px -1000px)')
    expect(front.style.clipPath).toBe('inset(-1000px 0px -1000px -1000px)')
    expect(front.textContent).toBe('hi')
    expect(back.textContent).toBe('hello')

    // Widens steadily without passing the new width, then lets go, so at
    // rest the roll is laid out as before
    await waitFor(() => expect(placeholder.style.width).toBe(''))
    expect(seen.length).toBeGreaterThan(3)
    seen.forEach((width, i) => {
      expect(width).toBeGreaterThanOrEqual(i ? seen[i - 1] : 20)
      expect(width).toBeLessThanOrEqual(50)
    })
    expect(Math.max(...seen)).toBeGreaterThan(49)
    expect(placeholder.style.whiteSpace).toBe('')
    expect(front.style.clipPath).toBe('')
    expect(back.style.clipPath).toBe('')
    await waitFor(() => expect(front.textContent).toBe('hello'))
  })

  it('holds the width of longer old text until its letters have turned away', async () => {
    letterWidths()
    const { container, rerender } = render(
      <RotatingText text='hello' timing={0.1} stagger={0.02} />
    )
    const [front, back, placeholder] = Array.from(
      container.firstElementChild!.children
    ) as HTMLElement[]
    const seen: [number, string][] = []
    watch(placeholder, () =>
      seen.push([px(placeholder.style.width), front.textContent!])
    )
    rerender(<RotatingText text='hi' timing={0.1} stagger={0.02} />)

    // The letters past the end turn to blank, and the old word keeps its room
    expect(front.textContent).toBe('hello')
    expect(back.textContent).toBe('hi')
    expect(back.querySelectorAll('span')).toHaveLength(5)
    expect(placeholder.style.width).toBe('50px')

    // Once they have, the blank slots go and the width eases in
    await waitFor(() => expect(front.querySelectorAll('span')).toHaveLength(2))
    expect(front.textContent).toBe('hi')
    await waitFor(() => expect(placeholder.style.width).toBe(''))
    const narrowed = seen.filter(([width]) => width < 50)
    expect(narrowed.length).toBeGreaterThan(3)
    // Only once the new word was on the front faces
    for (const [width, text] of narrowed) {
      expect(text).toBe('hi')
      expect(width).toBeGreaterThanOrEqual(20)
    }
  })

  it('turns a letter from its old face to its new one when the text changes', async () => {
    const { container, rerender } = render(
      <RotatingText text='ab' timing={0.2} stagger={0.05} />
    )
    const [front, back] = Array.from(container.firstElementChild!.children)
    const [frontA, frontB] = Array.from(front.querySelectorAll('span'))
    const [backA] = Array.from(back.querySelectorAll('span'))
    // Each time the first letter moves: its angle and both faces' letters
    const seen: [number, string, string][] = []
    watch(frontA, () =>
      seen.push([angle(frontA), frontA.textContent!, backA.textContent!])
    )
    rerender(<RotatingText text='cd' timing={0.2} stagger={0.05} />)

    await waitFor(() => {
      expect(front.textContent).toBe('cd')
      expect(angle(frontA)).toBe(0)
      expect(angle(frontB)).toBe(0)
    })
    // The old letter rolled away with the new one on the copy behind it,
    // and the front face took the new letter only once it was back at rest
    const turning = seen.filter(([a]) => a !== 0)
    expect(turning.length).toBeGreaterThan(3)
    expect(Math.min(...turning.map(([a]) => a))).toBeLessThan(-85)
    for (const [, was, coming] of turning) {
      expect(was).toBe('a')
      expect(coming).toBe('c')
    }
    expect(backA.style.opacity).toBe('0')
    // Still the same elements
    expect(front.querySelector('span')).toBe(frontA)
  })

  it('turns the letters a wider one pushes along, and only those', async () => {
    letterWidths()
    const props = { timing: 0.1, stagger: 0.05 }
    const { container, rerender } = render(
      <RotatingText text='aHib' {...props} />
    )
    const [front] = Array.from(container.firstElementChild!.children)
    const letters = Array.from(front.querySelectorAll('span'))
    const lowest = letters.map(() => 0)
    letters.forEach((letter, i) =>
      watch(letter, () => {
        lowest[i] = Math.min(lowest[i], angle(letter))
      })
    )
    // The W is wider than the H, so the letters after it move along
    rerender(<RotatingText text='aWib' {...props} />)
    await waitFor(() => expect(front.textContent).toBe('aWib'))
    expect(lowest.map((deg) => deg < -85)).toEqual([false, true, true, true])
    for (const letter of letters) expect(angle(letter)).toBe(0)
  })

  it('leaves a copy on screen where it is when a letter before it changes', async () => {
    letterWidths()
    const props = { timing: 0.2, stagger: 0.05 }
    const { container, rerender } = render(
      <RotatingText text='abc' {...props} />
    )
    const [front, back] = Array.from(container.firstElementChild!.children)
    const third = front.querySelectorAll('span')[2]
    rerender(<RotatingText text='abx' {...props} />)
    await waitFor(() => expect(angle(third)).toBeLessThan(-30))
    // A W in front of the turning x would push its copy along mid-turn, so
    // the W waits until the x has landed
    rerender(<RotatingText text='Wbx' {...props} />)
    expect(back.textContent).toBe('abx')
    await waitFor(() => {
      expect(front.textContent).toBe('Wbx')
      for (const letter of Array.from(front.querySelectorAll('span')))
        expect(angle(letter)).toBe(0)
    })
  })

  it('keeps a hovered letter on its copy when a wider letter before it pushes it along', async () => {
    letterWidths()
    const props = { timing: 0.1, stagger: 0.1 }
    const { container, rerender } = render(
      <RotatingText text='abc' {...props} />
    )
    const [front] = Array.from(container.firstElementChild!.children)
    const third = front.querySelectorAll('span')[2]
    // The text each time the third letter comes back to its front face
    const back: string[] = []
    let turned = false
    watch(third, () => {
      if (angle(third) < -85) turned = true
      else if (turned && angle(third) === 0) back.push(front.textContent!)
    })
    fireEvent.pointerEnter(container.firstElementChild!)
    await new Promise((resolve) => setTimeout(resolve, 30))
    rerender(<RotatingText text='aWc' {...props} />)
    await waitFor(() => {
      expect(front.textContent).toBe('aWc')
      expect(angle(third)).toBe(0)
    })
    // Never back on its front face at its old place
    expect(back.length).toBeGreaterThan(0)
    expect(back.every((text) => text === 'aWc')).toBe(true)
  })

  it('keeps the old letters in front while a letter waiting its turn is dropped', async () => {
    const props = { timing: 0.2, stagger: 0.5 }
    for (const between of ['ay', 'abc']) {
      const { container, rerender, unmount } = render(
        <RotatingText text='ab' {...props} />
      )
      const [front, back] = Array.from(container.firstElementChild!.children)
      rerender(<RotatingText text={between} {...props} />)
      rerender(<RotatingText text='xb' {...props} />)
      await new Promise((resolve) => setTimeout(resolve, 20))

      // The second letter had nothing left to turn to, but the first still
      // turns from 'a' to 'x' rather than showing it at once
      expect(front.textContent).toBe('ab')
      expect(back.textContent).toBe('xb')
      await waitFor(() => expect(front.textContent).toBe('xb'))
      unmount()
    }
  })

  it('keeps a hover flip waiting its turn when the text changes and changes back', async () => {
    const props = { timing: 0.1, stagger: 0.2 }
    const { container, rerender } = render(
      <RotatingText text='ab' {...props} />
    )
    const second = container.querySelectorAll('span')[1]
    const seen: number[] = []
    watch(second, () => seen.push(angle(second)))
    fireEvent.pointerEnter(container.firstElementChild!)
    rerender(<RotatingText text='ad' {...props} />)
    rerender(<RotatingText text='ab' {...props} />)
    await waitFor(() => expect(Math.min(...seen)).toBeLessThan(-85))
    await waitFor(() => expect(angle(second)).toBe(0))
  })

  it('turns every letter on hover once letters added to the text have come in', async () => {
    const props = { timing: 0.05, stagger: 0.01 }
    const { container, rerender } = render(
      <RotatingText text='ab' {...props} />
    )
    const [front] = Array.from(container.firstElementChild!.children)
    rerender(<RotatingText text='abcd' {...props} />)
    await waitFor(() => expect(front.textContent).toBe('abcd'))

    const letters = Array.from(front.querySelectorAll('span'))
    const lowest = letters.map(() => 0)
    letters.forEach((letter, i) =>
      watch(letter, () => {
        lowest[i] = Math.min(lowest[i], angle(letter))
      })
    )
    fireEvent.pointerEnter(container.firstElementChild!)
    await waitFor(() => expect(Math.max(...lowest)).toBeLessThan(-85))
  })

  it('turns on to the newest text when it changes while letters turn to new text', async () => {
    const props = { timing: 0.2, stagger: 0.15 }
    const { container, rerender } = render(
      <RotatingText text='ab' {...props} />
    )
    const [front, back] = Array.from(container.firstElementChild!.children)
    const frontA = front.querySelector('span')!
    rerender(<RotatingText text='cd' {...props} />)
    await waitFor(() => expect(angle(frontA)).toBeLessThan(-30))
    rerender(<RotatingText text='efg' {...props} />)

    // The turning letter keeps its new letter; the rest take the newest
    expect(back.textContent).toBe('cfg')
    await waitFor(() => {
      expect(front.textContent).toBe('efg')
      expect(back.textContent).toBe('efg')
      for (const letter of Array.from(front.querySelectorAll('span'))) {
        expect(angle(letter)).toBe(0)
      }
    })
  })

  it('carries on from the width it has reached when the text changes again', async () => {
    letterWidths()
    const { container, rerender } = render(
      <RotatingText text='hi' timing={0.3} />
    )
    const placeholder = container.firstElementChild!.lastElementChild!
    const width = () => px((placeholder as HTMLElement).style.width)
    rerender(<RotatingText text='hello' timing={0.3} />)
    await waitFor(() => expect(width()).toBeGreaterThan(30))

    const reached = width()
    const seen: number[] = []
    watch(placeholder, () => seen.push(width()))
    rerender(<RotatingText text='h' timing={0.3} />)
    expect(width()).toBe(reached)

    await waitFor(() =>
      expect((placeholder as HTMLElement).style.width).toBe('')
    )
    const eased = seen.filter((w) => !Number.isNaN(w))
    // No jump back to either word's width, and no swing past the new one
    expect(eased.length).toBeGreaterThan(3)
    expect(Math.max(...eased)).toBeLessThan(50)
    expect(Math.min(...eased)).toBeGreaterThanOrEqual(10)
    for (let i = 1; i < eased.length; i++)
      expect(Math.abs(eased[i] - eased[i - 1])).toBeLessThan(15)
  })

  it('does not carry the width past a new word it was already heading for', async () => {
    letterWidths()
    const { container, rerender } = render(
      <RotatingText text='hi' timing={0.3} />
    )
    const placeholder = container.firstElementChild!
      .lastElementChild as HTMLElement
    const width = () => px(placeholder.style.width)
    rerender(<RotatingText text='hello world!' timing={0.3} />)
    // Moving fast, and short of the width of the word it changes to next
    await waitFor(() => expect(width()).toBeGreaterThan(30))
    expect(width()).toBeLessThan(50)

    const seen: number[] = []
    watch(placeholder, () => seen.push(width()))
    rerender(<RotatingText text='hello' timing={0.3} />)
    await waitFor(() => expect(placeholder.style.width).toBe(''))
    const eased = seen.filter((w) => !Number.isNaN(w))
    expect(eased.length).toBeGreaterThan(3)
    expect(Math.max(...eased)).toBeLessThanOrEqual(50)
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
    const angle = () =>
      Number(/rotateX\((-?[\d.e-]+)deg\)/.exec(flap.style.transform)?.[1])
    await waitFor(() => expect(angle()).toBeLessThan(-90), { interval: 5 })
    // Once it settles, it goes back up with the letter on both faces
    await waitFor(() => expect(flap.style.transform).toBe('rotateX(0deg)'))
  })

  it('marks a tile as turning only while its flap is down', async () => {
    const { container } = render(
      <RotatingText text='hi' variant='flap' timing={0.3} stagger={0.01} />
    )
    const board = container.firstElementChild!
    const tiles = Array.from(board.children) as HTMLElement[]
    expect(tiles.some((tile) => tile.hasAttribute('data-turning'))).toBe(false)

    // Each time a flap moves, whether its tile was marked in the same frame
    const seen: [number, boolean][] = []
    tiles.forEach((tile) => {
      const flap = tile.lastElementChild as HTMLElement
      watch(flap, () =>
        seen.push([angle(flap), tile.hasAttribute('data-turning')])
      )
    })
    fireEvent.pointerEnter(board)
    await waitFor(() => {
      expect(seen.some(([deg]) => deg < -90)).toBe(true)
      expect(
        tiles.map(
          (tile) => (tile.lastElementChild as HTMLElement).style.transform
        )
      ).toEqual(['rotateX(0deg)', 'rotateX(0deg)'])
    })
    for (const [deg, turning] of seen) expect(turning).toBe(deg !== 0)
    expect(tiles.some((tile) => tile.hasAttribute('data-turning'))).toBe(false)
  })

  it('lands every flap on the newest text when it changes mid-flip', async () => {
    const props = { variant: 'flap', timing: 0.1, stagger: 0.01 } as const
    const { container, rerender } = render(
      <RotatingText text='ab' {...props} />
    )
    const board = container.firstElementChild!
    fireEvent.pointerEnter(board)
    await new Promise((resolve) => setTimeout(resolve, 30))
    rerender(<RotatingText text='xyz' {...props} />)
    rerender(<RotatingText text='no' {...props} />)

    const letters = () =>
      Array.from(board.children, (tile) =>
        Array.from(tile.children).map((half) => half.textContent)
      )
    const flaps = () =>
      Array.from(
        board.children,
        (tile) => (tile.lastElementChild as HTMLElement).style.transform
      )
    // Settled, and back up with the letter on both faces
    await waitFor(() => {
      expect(flaps()).toEqual(['rotateX(0deg)', 'rotateX(0deg)'])
      // sizer, static top, static bottom, then the flap's two faces
      expect(letters()).toEqual([
        ['n', 'n', 'n', 'nn'],
        ['o', 'o', 'o', 'oo']
      ])
    })
  })
})
