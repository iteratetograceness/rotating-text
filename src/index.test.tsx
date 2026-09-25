import * as React from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { renderToString } from 'react-dom/server'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RotatingText } from '.'
import styles from './index.module.css'

// Observers still watching when a test ends are stopped, pass or fail
const observers: MutationObserver[] = []
afterEach(() => {
  observers.splice(0).forEach((observer) => observer.disconnect())
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// jsdom's pointer events are not primary unless they say what they are, and
// the component only follows a primary pointer
const mouse = { pointerType: 'mouse' }

// Calls `record` every time the element's style changes
const watch = (el: Element, record: () => void) => {
  const observer = new MutationObserver(record)
  observer.observe(el, { attributes: true })
  observers.push(observer)
}

// A computed style with some values swapped. jsdom checks that its methods
// are called on the real declaration, so they are bound to it.
const readStyle = (style: CSSStyleDeclaration, key: string | symbol) => {
  const value = (style as any)[key]
  return typeof value === 'function' ? value.bind(style) : value
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
      get: (target, key) => (key === 'width' ? width : readStyle(target, key))
    })
  })
}

const px = (value: string) => parseFloat(value)

// A roll letter's angle. A face facing the viewer is flat, with no rotateX.
// A face faded out is folded to nothing, so its angle is read from the other
// face of its slot, a quarter turn from it.
const faceAngle = (el: HTMLElement) => {
  const turned = /rotateX\(([-\d.e]+)deg\)/.exec(el.style.transform)
  if (turned) return Number(turned[1])
  if (el.style.transform === 'perspective(4em)') return 0
  expect(el.style.transform).toBe('scaleY(0)')
  expect(el.style.opacity).toBe('0')
  return NaN
}
const angle = (el: HTMLElement): number => {
  const own = faceAngle(el)
  if (!Number.isNaN(own)) return own
  const row = el.parentElement!
  const rows = Array.from(row.parentElement!.children)
  const copy = row.classList.contains(styles.back)
  const other = rows[rows.indexOf(row) + (copy ? -1 : 1)]
  const partner = other.children[Array.from(row.children).indexOf(el)]
  const turned = faceAngle(partner as HTMLElement)
  expect(turned).not.toBeNaN()
  return copy ? turned + 90 : turned - 90
}

// jsdom applies no stylesheet, so tests that depend on it read the rules
const css = readFileSync(join(__dirname, 'index.module.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  ''
)

// Everything the stylesheet gives an element through rules that name one of
// its classes alone
const declared = (el: Element) => {
  let found = ''
  for (const [, selectors, body] of Array.from(
    css.matchAll(/([^{}]+)\{([^}]*)\}/g)
  )) {
    for (const selector of selectors.split(',')) {
      const name = /^\s*\.([\w-]+)\s*$/.exec(selector)
      if (name && el.classList.contains((styles as any)[name[1]])) {
        found += body
      }
    }
  }
  return found
}

// The text inside `root`, leaving out any element `skip` rules out
const textOf = (root: Element, skip: (el: Element) => boolean): string =>
  Array.from(root.childNodes, (node) =>
    node instanceof Element
      ? skip(node)
        ? ''
        : textOf(node, skip)
      : node.textContent
  ).join('')

const unseen = (el: Element) =>
  /(^|[^-])(visibility: hidden|display: none);/.test(declared(el))

// What a screen reader reads out, and what selecting all of it copies
const readOut = (root: Element) =>
  textOf(root, (el) => el.getAttribute('aria-hidden') === 'true' || unseen(el))
const selectable = (root: Element) =>
  textOf(root, (el) => /user-select: none;/.test(declared(el)) || unseen(el))

// Smoke tests against the real animations in ./motion. The prop-level
// behavior is covered in index.variants.test.tsx, which stubs them out.
describe('RotatingText', () => {
  it('renders each letter of the text on the front and back faces', () => {
    const { container } = render(<RotatingText text='hello' />)
    const faces = container.firstElementChild!.children

    for (const face of [faces[1], faces[2]]) {
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
    const [, front, back] = Array.from(host.firstElementChild!.children)
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

  it('reads out and selects the new text from the moment it changes', async () => {
    const { container, rerender } = render(
      <RotatingText text='Hello' timing={0.1} stagger={0.02} />
    )
    const root = container.firstElementChild!
    const [text, front] = Array.from(root.children)
    expect(readOut(root)).toBe('Hello')
    expect(selectable(root)).toBe('Hello')

    rerender(<RotatingText text='World' timing={0.1} stagger={0.02} />)
    // The letters have yet to turn and still show the old text
    expect(front.textContent).toBe('Hello')
    expect(readOut(root)).toBe('World')
    expect(selectable(root)).toBe('World')

    // And so on while they turn, and when the text changes again mid-turn
    const letter = front.querySelector('span')!
    await waitFor(() => expect(angle(letter)).toBeLessThan(-30))
    expect(readOut(root)).toBe('World')
    rerender(<RotatingText text='Wave' timing={0.1} stagger={0.02} />)
    expect(readOut(root)).toBe('Wave')
    expect(selectable(root)).toBe('Wave')

    await waitFor(() => expect(front.textContent).toBe('Wave'))
    expect(readOut(root)).toBe('Wave')
    expect(selectable(root)).toBe('Wave')

    // It lies out of flow under the letters, which let a drag through to it,
    // and is never drawn, selected or not
    expect(text.textContent).toBe('Wave')
    expect(declared(text)).toMatch(/position: absolute;/)
    expect(declared(text)).toMatch(/(^|[^-])color: transparent !important;/)
    const selected = css.match(/\.text::selection \{([^}]*)\}/)
    expect(selected?.[1]).toMatch(/(^|[^-])color: transparent !important;/)
    for (const row of Array.from(root.children).slice(1, 3)) {
      expect(declared(row)).toMatch(/pointer-events: none;/)
    }
  })

  // jsdom applies no stylesheet, so this reads the rules themselves: a space
  // alone in a letter's box, or doubled in the placeholder, collapses to
  // nothing unless white space is kept
  it('keeps the spaces between words in the roll', () => {
    for (const selector of ['.face', '.placeholder']) {
      const rule = css.match(new RegExp(`\\${selector} \\{([^}]*)\\}`))
      expect(rule?.[1]).toMatch(/white-space: pre;/)
    }
    // and the placeholder is laid out like the letters, each in its own box,
    // so pairs that would kern closer don't make it narrower than they are
    const placeholderRule = css.match(/\.placeholder \{([^}]*)\}/)![1]
    expect(placeholderRule).toMatch(/font-kerning: none;/)
    expect(placeholderRule).toMatch(/font-variant-ligatures: none;/)
    const { container } = render(<RotatingText text='a  b c' />)
    const [, front, back, placeholder] = Array.from(
      container.firstElementChild!.children
    )
    expect(front.children).toHaveLength(6)
    expect(back.children).toHaveLength(6)
    expect(placeholder.textContent).toBe('a  b c')
  })

  it('rolls each letter a quarter turn on hover and comes to rest facing front', async () => {
    const { container } = render(
      <RotatingText text='hi' timing={0.3} stagger={0.02} />
    )
    const [, front, back] = Array.from(container.firstElementChild!.children)
    const frontLetter = front.querySelector('span')!
    const backLetter = back.querySelector('span')!

    // Record the pair of angles every time either face moves. (A face that
    // has faded out is folded away and stays still, and reads as NaN here.)
    const seen: [number, number][] = []
    const record = () =>
      seen.push([faceAngle(frontLetter), faceAngle(backLetter)])
    watch(frontLetter, record)
    watch(backLetter, record)

    fireEvent.pointerEnter(container.firstElementChild!, mouse)
    await waitFor(() => expect(seen.some(([, b]) => b < 0)).toBe(true))
    await waitFor(() => {
      expect(angle(frontLetter)).toBe(0)
      expect(frontLetter.style.opacity).toBe('1')
    })

    // While both faces show, the copy stays joined to the front face a
    // quarter turn behind it
    const both = seen.filter(([f, b]) => !Number.isNaN(f + b))
    expect(both.length).toBeGreaterThan(2)
    for (const [f, b] of both) expect(b - f).toBeCloseTo(90)
    // The copy swings past facing front before it settles
    const copy = seen.map(([, b]) => b).filter((b) => !Number.isNaN(b))
    expect(Math.min(...copy)).toBeLessThan(-2)
    expect(angle(backLetter)).toBe(90)
    expect(backLetter.style.opacity).toBe('0')
  })

  // A 3D transform or a hidden backface puts a letter on a layer of its own,
  // so only a letter that is moving has either
  it('turns a letter in 3D only while it moves', async () => {
    expect(css.match(/\.face \{([^}]*)\}/)?.[1]).not.toMatch(/backface/)
    const { container } = render(
      <RotatingText text='hi' timing={0.3} stagger={0.2} />
    )
    const [, front, back] = Array.from(container.firstElementChild!.children)
    const [h, i] = Array.from(front.children) as HTMLElement[]
    const [hCopy, iCopy] = Array.from(back.children) as HTMLElement[]
    fireEvent.pointerEnter(container.firstElementChild!, mouse)
    await waitFor(() => expect(angle(h)).toBeLessThan(-10))
    for (const face of [h, hCopy])
      expect(face.style.transform).toMatch(/translateZ/)
    // Still waiting its turn in the stagger
    expect(i.style.transform).toBe('perspective(4em)')
    expect(iCopy.style.transform).toBe('scaleY(0)')
    await waitFor(() => expect(angle(i)).toBeLessThan(-10))
    await waitFor(() => {
      for (const face of [h, i])
        expect(face.style.transform).toBe('perspective(4em)')
      for (const face of [hCopy, iCopy])
        expect(face.style.transform).toBe('scaleY(0)')
    })
  })

  // Nor does one that has turned while the rest of the row turns after it:
  // it waits flat on its copy, its front folded away, until the row lands
  it('keeps a letter that has turned flat until the row lands', async () => {
    const props = { timing: 0.1, stagger: 0.3 }
    const { container, rerender } = render(
      <RotatingText text='ab' {...props} />
    )
    const [, front, back] = Array.from(container.firstElementChild!.children)
    const [a, b] = Array.from(front.children) as HTMLElement[]
    const [aCopy, bCopy] = Array.from(back.children) as HTMLElement[]
    rerender(<RotatingText text='cd' {...props} />)

    await waitFor(() => expect(aCopy.style.transform).toBe('perspective(4em)'))
    expect(aCopy.style.opacity).toBe('1')
    expect(a.style.transform).toBe('scaleY(0)')
    expect(angle(a)).toBe(-90)
    // The second letter is still waiting its turn
    expect(front.textContent).toBe('ab')
    expect(b.style.transform).toBe('perspective(4em)')
    expect(bCopy.style.transform).toBe('scaleY(0)')

    await waitFor(() => expect(front.textContent).toBe('cd'))
    for (const face of [a, b])
      expect(face.style.transform).toBe('perspective(4em)')
    for (const face of [aCopy, bCopy])
      expect(face.style.transform).toBe('scaleY(0)')
  })

  // The depth is written into the transform as the stylesheet gives it,
  // which the browser restyles faster than var(). One a transform can't
  // take is left to the browser as var().
  it('turns about the depth the stylesheet gives the letters', async () => {
    const real = window.getComputedStyle
    let depth = '0.5lh'
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
      const style = real.call(window, el, pseudo)
      if (!String(el.getAttribute('class')).includes('face')) return style
      return new Proxy(style, {
        get: (target, key) =>
          key === 'getPropertyValue'
            ? (name: string) =>
                name === '--rt-depth'
                  ? ` ${depth}`
                  : target.getPropertyValue(name)
            : readStyle(target, key)
      })
    })
    vi.stubGlobal('CSS', { supports: (_: string, v: string) => !/%/.test(v) })
    const { container } = render(
      <RotatingText text='h' timing={0.3} stagger={0} />
    )
    const roll = container.firstElementChild!
    const [, front] = Array.from(roll.children)
    const h = front.firstElementChild as HTMLElement
    const turning = () => /rotateX/.test(h.style.transform)
    const settled = () => h.style.transform === 'perspective(4em)'

    fireEvent.pointerEnter(roll, mouse)
    await waitFor(() => expect(turning()).toBe(true))
    expect(h.style.transform).toMatch(
      /^perspective\(4em\) translateZ\(calc\(-1 \* 0\.5lh\)\) rotateX\([-\d.e]+deg\) translateZ\(0\.5lh\)$/
    )
    await waitFor(() => expect(settled()).toBe(true))

    depth = '50%'
    fireEvent.pointerLeave(roll, mouse)
    fireEvent.pointerEnter(roll, mouse)
    await waitFor(() => expect(turning()).toBe(true))
    expect(h.style.transform).toMatch(/translateZ\(var\(--rt-depth\)\)$/)
  })

  it('carries on to the next face through a second hover', async () => {
    const { container } = render(
      <RotatingText text='hi' timing={0.3} stagger={0.01} />
    )
    const root = container.firstElementChild!
    const [, front, copies] = Array.from(root.children)
    const frontLetter = front.querySelector('span')!
    fireEvent.pointerEnter(root, mouse)
    await waitFor(() => expect(angle(frontLetter)).toBeLessThan(-30))

    const seen: number[] = []
    const record = () => seen.push(angle(frontLetter))
    watch(frontLetter, record)
    watch(copies.querySelector('span')!, record)
    fireEvent.pointerLeave(root, mouse)
    fireEvent.pointerEnter(root, mouse)
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
    fireEvent.pointerEnter(container.firstElementChild!, mouse)
    await waitFor(() => expect(angle(frontLetter)).not.toBe(0))
    rerender(<RotatingText text='yo' timing={0.3} stagger={0.01} />)

    // Same element, still part way through its turn
    expect(container.querySelector('span')).toBe(frontLetter)
    expect(angle(frontLetter)).not.toBe(0)
    await waitFor(() => expect(frontLetter.textContent).toBe('y'))
  })

  it('flips again after the text changes in the middle of a flip', async () => {
    const { container, rerender } = render(
      <RotatingText text='hi' timing={0.2} stagger={0.01} />
    )
    fireEvent.pointerEnter(container.firstElementChild!, mouse)
    await new Promise((resolve) => setTimeout(resolve, 50))
    rerender(<RotatingText text='yo' timing={0.05} stagger={0.01} />)
    fireEvent.pointerLeave(container.firstElementChild!, mouse)
    const [frontLetter, secondLetter] = Array.from(
      container.querySelectorAll('span')
    )
    await waitFor(() => {
      expect(angle(frontLetter)).toBe(0)
      expect(angle(secondLetter)).toBe(0)
    })
    const seen: number[] = []
    watch(frontLetter, () => seen.push(angle(frontLetter)))
    fireEvent.pointerEnter(container.firstElementChild!, mouse)
    await waitFor(() => expect(Math.min(...seen)).toBeLessThan(-85))
  })

  it('comes to rest showing the new text when it gets shorter mid-flip', async () => {
    const { container, rerender } = render(
      <RotatingText text='abcd' timing={0.3} stagger={0.1} />
    )
    const [, front] = Array.from(container.firstElementChild!.children)
    fireEvent.pointerEnter(container.firstElementChild!, mouse)
    await new Promise((resolve) => setTimeout(resolve, 60))
    rerender(<RotatingText text='xy' timing={0.3} stagger={0.1} />)

    await waitFor(() => {
      expect(front.textContent).toBe('xy')
      for (const letter of Array.from(front.querySelectorAll('span'))) {
        expect(angle(letter)).toBe(0)
      }
    })
  })

  it('brings letters back at rest after the text empties mid-flip', async () => {
    const { container, rerender } = render(
      <RotatingText text='hi' timing={0.4} stagger={0.01} />
    )
    fireEvent.pointerEnter(container.firstElementChild!, mouse)
    await new Promise((resolve) => setTimeout(resolve, 60))
    rerender(<RotatingText text='' timing={0.4} stagger={0.01} />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    rerender(<RotatingText text='yo' timing={0.4} stagger={0.01} />)

    const [, front, back] = Array.from(container.firstElementChild!.children)
    await waitFor(() => {
      expect(front.textContent).toBe('yo')
      for (const letter of Array.from(front.querySelectorAll('span'))) {
        expect(angle(letter)).toBe(0)
        expect(letter.style.opacity).toBe('1')
      }
      for (const letter of Array.from(back.querySelectorAll('span'))) {
        expect(letter.style.opacity).toBe('0')
      }
    })
    // and they stay there rather than finishing an old turn
    await new Promise((resolve) => setTimeout(resolve, 100))
    for (const letter of Array.from(front.querySelectorAll('span'))) {
      expect(angle(letter)).toBe(0)
    }
  })

  it('eases its width from the old text to the new one', async () => {
    letterWidths()
    const { container, rerender } = render(
      <RotatingText text='hi' timing={0.2} />
    )
    const [, front, back, placeholder] = Array.from(
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
    // left whole, with a quarter em (of jsdom's 16px) to spare
    expect(placeholder.style.width).toBe('20px')
    expect(back.style.clipPath).toBe('inset(-1000px 30px -1000px -1000px)')
    expect(front.style.clipPath).toBe('inset(-1000px -4px -1000px -1000px)')
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
    expect(front.style.clipPath).toBe('')
    expect(back.style.clipPath).toBe('')
    await waitFor(() => expect(front.textContent).toBe('hello'))
  })

  it('holds the width of longer old text until its letters have turned away', async () => {
    letterWidths()
    const { container, rerender } = render(
      <RotatingText text='hello' timing={0.1} stagger={0.02} />
    )
    const [, front, back, placeholder] = Array.from(
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
    const [, front, back] = Array.from(container.firstElementChild!.children)
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
    const [, front] = Array.from(container.firstElementChild!.children)
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
    const [, front, back] = Array.from(container.firstElementChild!.children)
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
    const [, front] = Array.from(container.firstElementChild!.children)
    const third = front.querySelectorAll('span')[2]
    // The text each time the third letter comes back to its front face
    const back: string[] = []
    let turned = false
    watch(third, () => {
      if (angle(third) < -85) turned = true
      else if (turned && angle(third) === 0) back.push(front.textContent!)
    })
    fireEvent.pointerEnter(container.firstElementChild!, mouse)
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
      const [, front, back] = Array.from(container.firstElementChild!.children)
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
    fireEvent.pointerEnter(container.firstElementChild!, mouse)
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
    const [, front] = Array.from(container.firstElementChild!.children)
    rerender(<RotatingText text='abcd' {...props} />)
    await waitFor(() => expect(front.textContent).toBe('abcd'))

    const letters = Array.from(front.querySelectorAll('span'))
    const lowest = letters.map(() => 0)
    letters.forEach((letter, i) =>
      watch(letter, () => {
        lowest[i] = Math.min(lowest[i], angle(letter))
      })
    )
    fireEvent.pointerEnter(container.firstElementChild!, mouse)
    await waitFor(() => expect(Math.max(...lowest)).toBeLessThan(-85))
  })

  it('turns on to the newest text when it changes while letters turn to new text', async () => {
    const props = { timing: 0.2, stagger: 0.15 }
    const { container, rerender } = render(
      <RotatingText text='ab' {...props} />
    )
    const [, front, back] = Array.from(container.firstElementChild!.children)
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

  // A text change in a transition is rendered a slice at a time, and the
  // letters go on turning between the slices. Here the render is held open,
  // behind components that take their time, until `ready` says so, and then
  // it is committed at once. Changes are made outside act, so React yields
  // between the slices as it does in a browser.
  const heldTransition = (text: string, props: object) => {
    let change!: (text: string) => void
    let ready = () => true
    const Slow = () => {
      if (!ready()) {
        const until = performance.now() + 6
        while (performance.now() < until);
      }
      return null
    }
    const App = () => {
      const [shown, setShown] = React.useState(text)
      change = setShown
      return (
        <React.Fragment>
          <RotatingText text={shown} {...props} />
          {shown !== text &&
            Array.from({ length: 400 }, (_, i) => <Slow key={i} />)}
        </React.Fragment>
      )
    }
    const view = render(<App />)
    const [, front, back] = Array.from(
      view.container.firstElementChild!.children
    )
    const changeLater = (to: string, until: () => boolean) => {
      ready = until
      React.startTransition(() => change(to))
    }
    return { ...view, front, back, change, changeLater }
  }

  // Records a copy's angle and letter as they are at the end of each task,
  // which is what the browser paints
  const watchCopy = (row: Element, i: number) => {
    const copy = () => row.children[i] as HTMLElement
    const state = (): [number, string] => [angle(copy()), copy().textContent!]
    const seen = [state()]
    // Letters the copy held only part way through a task, never painted
    const unpainted: string[] = []
    const observer = new MutationObserver((records) => {
      const held = records
        .filter((r) => r.type === 'characterData' && copy().contains(r.target))
        .map((r) => r.oldValue!)
      unpainted.push(...held.slice(1))
      seen.push(state())
    })
    observer.observe(row, {
      attributes: true,
      characterData: true,
      characterDataOldValue: true,
      childList: true,
      subtree: true
    })
    observers.push(observer)
    // Frames where the copy showed another letter than in the frame before,
    // while it could be seen in both
    const swaps = () =>
      seen.filter(
        ([deg, char], k) =>
          k > 0 &&
          char !== seen[k - 1][1] &&
          deg !== 90 &&
          seen[k - 1][0] !== 90
      )
    return { copy, seen, swaps, unpainted }
  }

  it('never swaps the letter on a copy that begins turning while a transition waits to commit', async () => {
    const props = { timing: 0.5, stagger: 0.3 }
    const { front, back, change, changeLater } = heldTransition('ab', props)
    change('cd')
    await waitFor(() => expect(back.textContent).toBe('cd'))
    const { copy, swaps, unpainted } = watchCopy(back, 1)

    // Rendered while the second letter waits its turn, and committed once
    // its copy, still showing 'd', has turned into view
    let late = false
    changeLater('ce', () => late || (late = angle(copy()) < 60))
    await waitFor(() => expect(late).toBe(true), { timeout: 2000 })

    await waitFor(
      () => {
        expect(front.textContent).toBe('ce')
        for (const letter of Array.from(front.children))
          expect(angle(letter as HTMLElement)).toBe(0)
      },
      { timeout: 3000 }
    )
    expect(swaps()).toEqual([])
    // The late commit did bring the 'e', and it was taken back unseen
    expect(unpainted).toContain('e')
  })

  it('never swaps the letter on a copy that a hover turns while a transition waits to commit', async () => {
    const props = { timing: 0.4, stagger: 0.1 }
    const { container, front, back, changeLater } = heldTransition('ab', props)
    const { copy, seen, swaps, unpainted } = watchCopy(back, 0)

    // Rendered at rest, and committed once a hover has turned the first
    // copy, still showing 'a', into view
    let late = false
    changeLater('cd', () => late || (late = angle(copy()) < 60))
    setTimeout(() =>
      fireEvent.pointerEnter(container.firstElementChild!, mouse)
    )
    await waitFor(() => expect(late).toBe(true), { timeout: 2000 })

    await waitFor(
      () => {
        expect(front.textContent).toBe('cd')
        for (const letter of Array.from(front.children))
          expect(angle(letter as HTMLElement)).toBe(0)
      },
      { timeout: 3000 }
    )
    expect(swaps()).toEqual([])
    // The late commit may bring the 'c' and have it taken back unseen, or,
    // as often happens under React 19, leave the turning copy on its 'a'.
    // Either way the copy first shows the 'c' edge-on, once its turn is over.
    const firstC = seen.find(([, char]) => char === 'c')
    expect(unpainted.includes('c') || firstC?.[0] === 90).toBe(true)
  })

  it('holds room for the letters the copies are still turning to', async () => {
    letterWidths()
    const props = { timing: 0.4, stagger: 0.1 }
    const { container, rerender } = render(
      <RotatingText text='hi' {...props} />
    )
    const [, front, back, placeholder] = Array.from(
      container.firstElementChild!.children
    ) as HTMLElement[]
    rerender(<RotatingText text='WWWW' {...props} />)
    await waitFor(() =>
      expect(angle(front.querySelector('span')!)).toBeLessThan(-30)
    )
    const seen: number[] = []
    watch(placeholder, () => {
      if (front.textContent === 'hi') seen.push(px(placeholder.style.width))
    })
    rerender(<RotatingText text='a' {...props} />)

    // The first slot is still turning to its W, so the roll keeps the W's
    // room rather than easing to the new word's while it is on screen
    expect(back.textContent).toBe('W')
    await waitFor(() => expect(front.textContent).not.toBe('hi'))
    expect(seen.length).toBeGreaterThan(3)
    for (const width of seen) expect(width).toBeGreaterThanOrEqual(20)
    await waitFor(() => expect(front.textContent).toBe('a'))
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

    fireEvent.pointerEnter(container.firstElementChild!, mouse)
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
    fireEvent.pointerEnter(board, mouse)
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

  // A plain rectangle clips the shadow's own layer to whole pixels, so on a
  // tile whose side falls between pixels the shadow darkens the page beside
  // it. The shadow sits in a clip along the bottom half's own lines, drawn
  // as an anti-aliased mask, and overhangs it so the clip's edge is the one
  // that shows.
  it("clips the flap's shadow along the bottom half's edges", () => {
    const css = readFileSync(join(__dirname, 'index.module.css'), 'utf8')
    const rule = (selector: string) =>
      css
        .match(new RegExp(`\\n\\${selector} \\{([^}]*)\\}`))?.[1]
        .replace(/\s+/g, ' ')
    const inset = (clip: string) => clip.match(/inset\( ?(.*?) 0 0 0/)?.[1]
    const bottom = rule('.bottom')!.match(/clip-path: ([^;]*);/)![1]
    const shade = rule('.shade')!.match(/clip-path: ([^;]*);/)![1]
    expect(inset(shade)).toBe(inset(bottom))
    expect(shade).toMatch(/ round /)
    expect(rule('.shadow')).toMatch(/inset: 0 -1px;/)

    const { container } = render(<RotatingText text='hi' variant='flap' />)
    const tiles = Array.from(container.firstElementChild!.children)
    for (const tile of tiles) {
      const shadow = tile.querySelector('[class*=shadow]')!
      expect(shadow.parentElement!.className).toMatch(/shade/)
      expect(shadow.parentElement!.parentElement!.className).toMatch(/bottom/)
    }
  })

  it('lands every flap on the newest text when it changes mid-flip', async () => {
    const props = { variant: 'flap', timing: 0.1, stagger: 0.01 } as const
    const { container, rerender } = render(
      <RotatingText text='ab' {...props} />
    )
    const board = container.firstElementChild!
    fireEvent.pointerEnter(board, mouse)
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

  it('takes away a resting space when the text now ends before it', async () => {
    const props = { variant: 'flap', timing: 0.1, stagger: 0.01 } as const
    const { container, rerender } = render(
      <RotatingText text='ab ' {...props} />
    )
    const board = container.firstElementChild!
    expect(board.children).toHaveLength(3)
    rerender(<RotatingText text='ab' {...props} />)
    await waitFor(() => expect(board.children).toHaveLength(2))

    // Several of them, and a space after a letter that flips to blank first
    rerender(<RotatingText text='ab  ' {...props} />)
    await waitFor(() => expect(board.children).toHaveLength(4))
    rerender(<RotatingText text='ab' {...props} />)
    await waitFor(() => expect(board.children).toHaveLength(2))
    rerender(<RotatingText text='abc ' {...props} />)
    await waitFor(() => expect(board.children).toHaveLength(4))
    rerender(<RotatingText text='ab' {...props} />)
    await waitFor(() => expect(board.children).toHaveLength(2))
    expect(board.textContent).toBe('aaaaabbbbb')
  })

  it('drops a waiting flip over a space when the text ends before it in the same render', async () => {
    const props = { variant: 'flap', timing: 0.1, stagger: 0.01 } as const
    // A page that shortens its text when hovered. Its update lands in the
    // same render as the hover's flip, so the space's tile is told it is past
    // the end before its first flap has started.
    const Page = () => {
      const [hovers, setHovers] = React.useState(0)
      const [text, setText] = React.useState('a ')
      React.useEffect(() => {
        const hovered = () => setHovers((n) => n + 1)
        document.addEventListener('pointerenter', hovered, true)
        return () => document.removeEventListener('pointerenter', hovered, true)
      }, [])
      React.useEffect(() => {
        if (hovers) setText('a')
      }, [hovers])
      return <RotatingText text={text} {...props} />
    }
    const { container } = render(<Page />)
    const board = container.firstElementChild!
    expect(board.children).toHaveLength(2)
    const flaps = Array.from(
      board.children,
      (tile) => tile.lastElementChild as HTMLElement
    )
    const moves = flaps.map((flap) => {
      const seen: number[] = []
      watch(flap, () =>
        seen.push(
          Number(/rotateX\((-?[\d.e-]+)deg\)/.exec(flap.style.transform)?.[1])
        )
      )
      return seen
    })
    fireEvent.pointerEnter(board, mouse)
    expect(board.children).toHaveLength(1)

    // The 'a' flips over itself and comes back to rest
    await waitFor(() => {
      expect(Math.min(...moves[0])).toBeLessThan(-170)
      expect(moves[0][moves[0].length - 1]).toBe(0)
    })
    const tile = board.firstElementChild!
    expect(Array.from(tile.children, (half) => half.textContent)).toEqual([
      'a',
      'a',
      'a',
      'aa'
    ])
    // The space's flip was called off before its flap moved
    expect(moves[1].filter((angle) => angle !== 0)).toEqual([])
  })
})
