import * as React from 'react'
import {
  animate as animateValue,
  clamp,
  frameTime,
  MAX_ELAPSED,
  transform as interpolate,
  motionValue,
  useHover,
  useIsomorphicLayoutEffect,
  useReducedMotion
} from './motion'
import styles from './index.module.css'

interface Props {
  text: string
  stagger?: number // Time between each letter
  timing?: number | number[] // Duration of each letter
  variant?: 'roll' | 'flap' // Rolling letters, or split-flap tiles
  className?: string // Pass custom class
  style?: React.CSSProperties // Pass custom style
}

// Roll: the letter turns like a face of a cube, driven by a damped spring. It
// leaves at once, overshoots about 6 degrees as if past a detent, and comes
// to rest at the end of its timing. The copy on the next face is joined to it
// at a fixed 90 degrees, so the two can never drift apart.
const ROLL_DAMPING = 0.65
// Degrees from rest, and the matching speed, at which a letter is settled
const ROLL_REST = 0.5
const rollSpring = (seconds: number) => {
  // A letter given no time still turns, too fast to see
  const time = seconds > 0 ? seconds : 0.01
  // How fast the swing dies away so it is inside ROLL_REST after `time`
  const decay =
    Math.log(90 / ROLL_REST / Math.sqrt(1 - ROLL_DAMPING ** 2)) / time
  const frequency = decay / ROLL_DAMPING
  return {
    type: 'spring' as const,
    stiffness: frequency ** 2,
    damping: 2 * decay,
    mass: 1,
    // Each turn starts from rest
    velocity: 0,
    restDelta: ROLL_REST,
    restSpeed: frequency * ROLL_REST
  }
}
// The turn is about an axis set back behind the letter by --rt-depth. The
// perspective sits outside that offset, so a letter at rest is drawn at its
// true size rather than magnified. `depth` is the stylesheet's --rt-depth
// written out (see readDepth), which is cheaper for the browser to restyle
// every frame than var() is.
const rollTransform = (rotateX: number, depth: string) =>
  `perspective(4em) translateZ(calc(-1 * ${depth})) rotateX(${rotateX}deg) translateZ(${depth})`
const ROLL_SHADE_ANGLES = [-85, -60, 0, 60, 85]
const ROLL_SHADE = [0, 0.75, 1, 0.75, 0]
// A face is dimmed as it turns away from the viewer, as if lit from the
// front, and is gone by the time it is edge on.
const rollShade = interpolate(ROLL_SHADE_ANGLES, ROLL_SHADE)
// A face is only drawn in 3D while it is turned and can be seen. Facing the
// viewer it keeps the same matrix with the turn left out, which draws its
// text exactly as the turn does at 0 degrees, but with no 3D step in it the
// browser doesn't give each letter a layer of its own. (A flat transform such
// as translate(0) moves the text's anti-aliasing, and none would cost a
// layout per letter each time a turn starts.) Faded out, it is folded to
// nothing, as it would be edge on. So a letter that has turned and waits for
// the rest of the row faces the viewer on its copy, off a layer too.
const rollPose = (turned: number, shade: number, depth: string) =>
  turned === 0
    ? 'perspective(4em)'
    : shade
    ? rollTransform(turned, depth)
    : 'scaleY(0)'

// The letters turn about the depth the stylesheet gives them, read once for
// a batch of turns. A page can't restyle it on the fly, as the letters set it
// themselves. Anything a transform can't take is left to the browser as var()
// instead, as it always was.
const DEPTH = 'var(--rt-depth)'
const readDepth = (row: HTMLElement | null) => {
  const face = row && row.firstElementChild
  const depth = face && getComputedStyle(face).getPropertyValue('--rt-depth')
  const literal = depth && depth.trim()
  return literal &&
    typeof CSS !== 'undefined' &&
    CSS.supports('transform', rollTransform(0, literal))
    ? literal
    : DEPTH
}

// When the text changes, the roll's width eases from the old word's to the
// new one's, so text beside it glides along rather than jumping. The spring
// is critically damped, so the width comes to rest without overshooting and
// pushing its neighbours back and forth. By the end of the first letter's
// timing it has (1 + 7.5) * e^-7.5 of the way left to go, just under 0.5%,
// and it lets go within a tenth of a pixel of the new width, so the last
// step can't be seen. A critically damped spring is settled by distance
// alone; the spring ignores a rest speed for it.
const WIDTH_REST = 0.1 // pixels
// Eased over this many seconds a pixel, the spring's fastest frame, at 60
// frames a second, moves it a pixel: it peaks at 7.5 / seconds / e of the
// distance a second
const WIDTH_PACE = 7.5 / Math.E / 60
const widthSpring = (seconds: number, distance: number, velocity: number) => {
  const frequency = 7.5 / seconds
  const stiffness = frequency ** 2
  // A change while the width is still easing carries on at the speed it is
  // going, unless it is heading toward the new width fast enough to pass it
  const fastest = frequency * Math.abs(distance)
  const toward = velocity * Math.sign(distance)
  return {
    type: 'spring' as const,
    stiffness,
    // Written this way so the spring takes the critically damped branch exactly
    damping: 2 * Math.sqrt(stiffness),
    mass: 1,
    velocity: toward > fastest ? fastest * Math.sign(distance) : velocity,
    restDelta: WIDTH_REST
  }
}

// Flap: the top half is let go with a small push and falls over the centre
// hinge, speeding up at a constant rate like anything under gravity. It hits
// the stop and rebounds, each time with a fraction of the speed it landed
// with, so every bounce is lower and quicker than the last. Distances are in
// units of the full fall and times in units of the time the fall takes.
const PUSH = 0.25 // speed on release
const GRAVITY = 2 * (1 - PUSH) // lands at t = 1
const IMPACT = PUSH + GRAVITY // speed on landing
const RESTITUTION = 0.27
const BOUNCES = [1, 2].map((n) => {
  const speed = IMPACT * RESTITUTION ** n
  return { speed, time: (2 * speed) / GRAVITY }
})
const SETTLE_TIME = BOUNCES.reduce((sum, bounce) => sum + bounce.time, 0)
const FALL_SHARE = 1 / (1 + SETTLE_TIME) // of the letter's whole timing
const BOUNCE_HEIGHT = BOUNCES[0].speed ** 2 / (2 * GRAVITY)

const fallEase = (t: number) => PUSH * t + (GRAVITY / 2) * t * t
// Height above the stop through both bounces, as a share of the first one
const settleEase = (t: number) => {
  let s = t * SETTLE_TIME
  for (const { speed, time } of BOUNCES) {
    if (s <= time) return (speed * s - (GRAVITY / 2) * s * s) / BOUNCE_HEIGHT
    s -= time
  }
  return 0
}

// Light comes from a little above the viewer. Each face is shaded by how
// squarely it faces the light, relative to a tile at rest, and a flap
// passing under the light casts a shadow down the bottom half.
const LIGHT = (20 * Math.PI) / 180
const AMBIENT = 0.4
const SHADOW = 0.5
const lit = (facing: number) => AMBIENT + (1 - AMBIENT) * Math.max(0, facing)
const shade = (facing: number) =>
  Math.max(0, 1 - lit(facing) / lit(Math.cos(LIGHT)))

// A tile waiting its turn in the stagger keeps its new letter off the faces
// the flap hides, until its flap is this close to falling (three frames at
// the longest a frame can count for) or until one of the few reveals the
// page has each frame comes to it, whichever is first. So a long board's new
// text reaches the page a few tiles a frame rather than all in one.
const LEAD = 3 * MAX_ELAPSED // ms
const REVEALS = 4 // tiles a frame
// How many reveals are left in the frame being run
const reveals = { at: -1, left: 0 }
const reveal = () => {
  const now = frameTime()
  if (reveals.at !== now) {
    reveals.at = now
    reveals.left = REVEALS
  }
  if (!reveals.left) return false
  reveals.left--
  return true
}

export const RotatingText = ({
  text,
  timing = 0.5,
  stagger = 0.1,
  variant = 'roll',
  className,
  style
}: Props) => {
  const prefersReducedMotion = useReducedMotion()
  const still = !!prefersReducedMotion
  // Set by the letters or tiles on screen to start a hover's flip. They
  // start themselves, so a hover renders none of them.
  const startRoll = React.useRef<() => void>()
  const startFlap = React.useRef<() => void>()

  // Letters past the end of a timing array reuse its last entry
  const duration = (i: number) =>
    Array.isArray(timing) ? timing[Math.min(i, timing.length - 1)] : timing

  // The same array while the text stays the same, so a render with the same
  // text has no new letters for the board to take in
  const letters = React.useMemo(() => splitLetters(text), [text])

  // A second hover while letters are still moving is ignored, so a flip
  // always runs to the end instead of snapping back to the start. Rolling
  // letters know when they have settled, so roll asks them; flap tiles each
  // ignore a hover while they are turning.
  const flip = () => {
    if (still) return
    const start = variant === 'flap' ? startFlap.current : startRoll.current
    if (start) start()
  }

  // With reduced motion, a hover scales the text up a little instead
  const root = React.useRef<HTMLDivElement>(null)
  useHover(root, flip, still ? 1.05 : undefined)

  const rootClass = [
    styles.container,
    variant === 'flap' ? styles.board : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rootClass} ref={root} style={style}>
      {variant === 'flap' ? (
        <FlapBoard
          letters={letters}
          duration={duration}
          stagger={stagger}
          still={still}
          startRef={startFlap}
        />
      ) : (
        <RollFaces
          letters={letters}
          duration={duration}
          stagger={stagger}
          still={still}
          startRef={startRoll}
        />
      )}
    </div>
  )
}

// React 18's, which these React types are older than
const useDeferredValue: <T>(value: T) => T = (React as any).useDeferredValue

// Split into the characters a reader sees, so an accented letter or an emoji
// with a skin tone stays in one piece.
const splitLetters = (text: string): string[] => {
  const Segmenter = (Intl as any).Segmenter
  return Segmenter
    ? Array.from(
        new Segmenter().segment(text),
        (part: { segment: string }) => part.segment
      )
    : Array.from(text)
}

// Named through a helper because this TypeScript can't import a type alone
// without lint calling it unused
const createAngle = () => motionValue(0)
type Angle = ReturnType<typeof createAngle>

interface RollProps {
  letters: string[]
  duration: (i: number) => number
  stagger: number
  still: boolean
  startRef: React.MutableRefObject<(() => void) | undefined>
}

// The front letter rolls down and away while its copy rolls in from above.
// When the text changes, each slot whose letter changed turns the same way,
// with the old letter on its front face and the new one on the copy.
const RollFaces = ({
  letters,
  duration,
  stagger,
  still,
  startRef
}: RollProps) => {
  // One angle per slot, the front face's. They outlive text changes, so a
  // letter that is turning keeps turning when the text changes under it.
  const angles = React.useRef<Angle[]>([]).current
  // Angles that are turning, or waiting for their turn in the stagger
  const [turning] = React.useState(() => new Set<Angle>())
  // Of those, the ones a hover is turning over themselves
  const [hovered] = React.useState(() => new Set<Angle>())
  // Slots whose copy sits beside their front face rather than on it, because
  // letters before them changed width. They turn too, and come back to their
  // front face only once the fronts take the new text.
  const [moved] = React.useState(() => new Set<Angle>())
  // What each slot's front face and copy show, as of the last commit
  const faces = React.useRef<Faces>({ front: letters, back: letters }).current
  // Set once every slot has turned, until the fronts take the new letters
  const landing = React.useRef(false)
  // Set while the effect below brings the slots up to date
  const syncing = React.useRef(false)
  // The text as of the last commit
  const latest = React.useRef(letters)
  // The depth the letters turn about, read before each batch of turns
  const depth = React.useRef(DEPTH)
  const [, rerender] = React.useReducer((n: number) => n + 1, 0)
  // Renders again once the angle has let go of the turn that just ended, so a
  // turn that render starts on the same angle is its own
  const update = () => Promise.resolve().then(rerender)

  const next = still
    ? { front: letters, back: letters }
    : plan(faces, letters, angles, landing.current)
  while (angles.length < next.front.length) angles.push(createAngle())
  const word = letters.join('')
  const was = next.front.join('')
  const coming = next.back.join('')
  const width = useEasedWidth(
    [word, was, coming].join('\n'),
    was !== word || coming !== word,
    duration(0),
    // How long until the last slot starts to turn
    Math.max(0, (next.back.length - 1) * stagger),
    still
  )

  // Once no slot is turning, the ones that turned to a new letter or place
  // show it on their copy. The next render puts it on their front face too.
  const finish = () => {
    if (landing.current || syncing.current || turning.size) return
    if (!moved.size && faces.front.every((char, i) => char === faces.back[i]))
      return
    landing.current = true
    update()
  }

  const rested = (angle: Angle) => {
    turning.delete(angle)
    hovered.delete(angle)
    const i = angles.indexOf(angle)
    if (i >= 0 && faces.front[i] === faces.back[i] && !moved.has(angle)) {
      // It turned over itself, as on a hover. Put its front face back, which
      // looks the same, so the next flip starts from there.
      if (angle.get() !== 0) angle.jump(0)
    }
    // If the text changed while letters turned, the ones now free of it turn
    // on to the new letters
    const text = latest.current
    const count = Math.max(text.length, faces.back.length)
    for (let j = 0; j < count; j++) {
      if ((faces.back[j] || '') !== (text[j] || '')) {
        update()
        break
      }
    }
    finish()
  }

  const turn = (angle: Angle, i: number, delay: number) => {
    turning.add(angle)
    // A turn can be reported stopped after it has completed
    let over = false
    animateValue(angle, -90, {
      ...rollSpring(duration(i)),
      delay,
      onComplete: () => {
        over = true
        rested(angle)
      },
      // A turn cut short, say because the letter was hidden, goes back to
      // rest rather than staying frozen part way round
      onStop: () => {
        if (over) return
        over = true
        angle.set(0)
        rested(angle)
      }
    })
  }

  // Brings the slots up to date with this render
  const sync = () => {
    // The fronts now carry the letters their copies turned to, so the slots
    // go back to rest, in the same frame and looking the same
    const landed = landing.current
    landing.current = false
    const changed = word !== latest.current.join('')
    latest.current = letters
    const bringing = faces.back
    faces.front = next.front
    faces.back = next.back
    if (landed || still) moved.clear()

    // Slots that are gone stop turning and their angles are dropped, so a
    // slot that comes back later starts at rest
    angles.splice(next.front.length).forEach((a) => {
      moved.delete(a)
      a.stop()
    })
    if (landed || still) {
      angles.forEach((angle) => {
        angle.stop()
        if (angle.get() !== 0) angle.jump(0)
      })
    }
    if (still) return

    // Where each slot starts along its row, on the front faces and on the
    // copies. Measured when either row has changed and they differ, since a
    // letter of another width pushes along the ones after it.
    const reflowed =
      landed ||
      bringing.length !== next.back.length ||
      next.back.some((char, i) => char !== bringing[i])
    const starts =
      reflowed &&
      next.front.some((char, i) => char !== next.back[i]) &&
      [width.front.current!, width.back.current!].map(offsets)

    // Slots whose letter changed turn to it, in the usual stagger, and so do
    // letters pushed along by them. Ones that were still turning when the
    // text changed follow on once they can, staggered from the first of them.
    let first = -1
    next.front.forEach((char, i) => {
      const angle = angles[i]
      // Its copy is on screen, so nothing about it can change now
      if (angle.get() !== 0) return
      if (reflowed) {
        if (starts && Math.abs(starts[0][i] - starts[1][i]) > 0.5)
          moved.add(angle)
        else moved.delete(angle)
      }
      const needed = char !== next.back[i] || moved.has(angle)
      if (turning.has(angle)) {
        // Waiting its turn, with nothing left to turn to
        if (!needed && !hovered.has(angle)) angle.stop()
      } else if (needed) {
        if (first < 0) {
          first = changed ? 0 : i
          depth.current = readDepth(width.front.current)
        }
        turn(angle, i, (i - first) * stagger)
      }
    })
  }

  useIsomorphicLayoutEffect(() => {
    // A render in a transition can be committed well after it ran, while the
    // letters went on turning, and a copy that has turned into view since
    // would take its new letter in plain sight. If the letters have moved on,
    // the roll renders again at once from where they are now, and that render
    // replaces this one before it is painted.
    if (
      !still &&
      !sameFaces(next, plan(faces, letters, angles, landing.current))
    ) {
      rerender()
      return
    }

    syncing.current = true
    try {
      sync()
    } finally {
      syncing.current = false
    }
    finish()

    // Only the slots on screen turn, not any a render in progress added
    const slots = angles.slice()
    startRef.current = () => {
      // Letters still turning finish first
      if (turning.size || landing.current) return
      depth.current = readDepth(width.front.current)
      slots.forEach((angle, i) => {
        hovered.add(angle)
        turn(angle, i, i * stagger)
      })
    }
  })

  React.useEffect(
    () => () => {
      startRef.current = undefined
      angles.forEach((a) => a.stop())
    },
    []
  )

  return (
    <React.Fragment>
      <div className={styles.text} ref={width.text}>
        {word}
      </div>
      <div className={styles.front} aria-hidden='true' ref={width.front}>
        {next.front.map((char, i) => (
          <RollLetter
            key={i}
            char={char}
            angle={angles[i]}
            offset={0}
            depth={depth}
          />
        ))}
      </div>
      <div className={styles.back} aria-hidden='true' ref={width.back}>
        {next.back.map((char, i) => (
          <RollLetter
            key={i}
            char={char}
            angle={angles[i]}
            offset={90}
            depth={depth}
          />
        ))}
      </div>
      <div className={styles.placeholder} ref={width.placeholder}>
        {word}
      </div>
    </React.Fragment>
  )
}

interface Faces {
  front: string[]
  back: string[]
}

// What each slot shows once the text is `letters`; a slot past its end is
// blank. A slot takes the new letter on its copy, and turns to it, while its
// copy is out of sight and so are those of the slots after it, which a
// letter of another width would push along. That is, at rest or waiting for
// its turn in the stagger, after every slot that is turning or has turned.
// The others keep the letters they are bringing, and take the newest once
// every slot has landed. Blank slots at the end go once they have come to
// rest.
const plan = (
  faces: Faces,
  letters: string[],
  angles: Angle[],
  landing: boolean
): Faces => {
  const front: string[] = []
  const back: string[] = []
  const count = Math.max(letters.length, faces.front.length)
  // The last slot whose copy is on screen
  let shown = -1
  for (let i = 0; i < faces.front.length && i < angles.length; i++) {
    if (angles[i].get() !== 0) shown = i
  }
  for (let i = 0; i < count; i++) {
    const bringing = i < faces.back.length ? faces.back[i] : ''
    const free = landing || i > shown
    front.push(
      landing ? bringing : i < faces.front.length ? faces.front[i] : ''
    )
    back.push(free ? (i < letters.length ? letters[i] : '') : bringing)
  }
  while (
    front.length > letters.length &&
    !front[front.length - 1] &&
    !back[back.length - 1]
  ) {
    front.pop()
    back.pop()
  }
  return { front, back }
}

const sameFaces = (a: Faces, b: Faces) =>
  a.front.length === b.front.length &&
  a.front.every((char, i) => char === b.front[i] && a.back[i] === b.back[i])

// How far along its row each letter starts, from the row's start edge. The
// rows of front faces and copies start at the same place.
const offsets = (row: HTMLElement) => {
  let along = 0
  return Array.from(row.children, (letter) => {
    const start = along
    along += parseFloat(getComputedStyle(letter).width) || 0
    return start
  })
}

// The in-flow placeholder sizes the roll. When the word changes it is held at
// the old word's width and eased to the new one's. While letters turn to new
// text (`holding`), it is held as wide as the wider of the words on their
// faces, so a shorter word keeps the old one's room until its letters have
// turned away. At rest none of this is set, so the roll lays out exactly as it
// always has. Written straight to the DOM, so the easing costs no renders.
const useEasedWidth = (
  size: string,
  holding: boolean,
  seconds: number,
  span: number,
  still: boolean
) => {
  const placeholder = React.useRef<HTMLDivElement>(null)
  const front = React.useRef<HTMLDivElement>(null)
  const back = React.useRef<HTMLDivElement>(null)
  const text = React.useRef<HTMLDivElement>(null)
  const [eased] = React.useState(() => motionValue(0))
  // The placeholder's width, kept current as fonts load or the page
  // restyles, so a change eases from the width that was really on screen
  const natural = React.useRef(NaN)
  // How wide the rows of letters are at rest (the fronts can still carry the
  // old word), whether they run right to left, and a quarter of an em in
  // pixels
  const heading = React.useRef({ rows: [0, 0], rtl: false, reach: 0 })

  const paint = (px: number) => {
    if (!placeholder.current || !front.current || !back.current) return
    placeholder.current.style.width = `${px}px`
    // Letters past the box's edge are cut off, so a longer word is uncovered
    // as the box widens instead of being drawn over the text beside it. The
    // cut is measured back from where each row's letters end at rest. Over
    // the last quarter of an em it moves out past them by that much again, so
    // a glyph that reaches past its letter isn't still cut off when the width
    // lets go, and can't pop into view.
    const { rows, rtl, reach } = heading.current
    ;[front.current, back.current].forEach((row, i) => {
      const left = Math.max(0, rows[i] - px)
      const cut = left < reach ? 2 * left - reach : left
      row.style.clipPath = rtl
        ? `inset(-1000px -1000px -1000px ${cut}px)`
        : `inset(-1000px ${cut}px -1000px -1000px)`
    })
  }
  const release = () => {
    for (const el of [placeholder.current, front.current, back.current]) {
      if (el) el.style.width = el.style.clipPath = ''
    }
    if (text.current) text.current.style.pointerEvents = ''
  }

  useIsomorphicLayoutEffect(() => {
    if (still) {
      eased.stop()
      release()
      // The width it had isn't the width now, so should reduced motion be
      // turned off, the next change has nothing to ease from until the
      // observer below measures it
      natural.current = NaN
      return
    }
    const el = placeholder.current!
    const from = eased.isAnimating() ? eased.get() : natural.current
    el.style.width = ''
    // Not a number on the first render or while the roll isn't laid out,
    // say inside something hidden; then there is nothing to ease between
    const word = parseFloat(getComputedStyle(el).width)
    const rows = [front.current!, back.current!].map((row) =>
      parseFloat(getComputedStyle(row).width)
    )
    // While the copies carry the word, it is held open by however much wider
    // the front row is than the copies. (The rows round each letter's box, so
    // they can be a hair wider than the placeholder's text.) After another
    // change mid-turn, the copies already on screen still carry the text
    // before it, so it is held as wide as the widest row, and never narrows
    // under them.
    const mixed = holding && back.current!.textContent !== el.textContent
    const to = !holding
      ? word
      : mixed
      ? Math.max(word, rows[0] || 0, rows[1] || 0)
      : word + Math.max(0, rows[0] - rows[1] || 0)
    natural.current = to
    const held = to - word >= WIDTH_REST
    // With no time for the first letter, the width changes at once
    const easing = seconds > 0 && Math.abs(to - from) >= WIDTH_REST
    if (!easing && !held) {
      eased.stop()
      release()
      return
    }
    const { direction, fontSize } = getComputedStyle(el)
    heading.current = {
      rows,
      rtl: direction === 'rtl',
      reach: parseFloat(fontSize) / 4 || 0
    }
    if (!easing) {
      eased.stop()
      paint(to)
      return
    }
    // The text under the letters is already the new word's width, so while
    // the roll widens it reaches over the text beside it. It lets pointers
    // through to that text meanwhile. Cutting it off with the letters
    // instead would re-raster it every frame.
    if (to > from) text.current!.style.pointerEvents = 'none'
    const velocity = eased.isAnimating() ? eased.getVelocity() : 0
    if (!eased.isAnimating()) eased.jump(from)
    paint(eased.get())
    // With copies still carrying older text, each further change moves the
    // width again, so it eases there slowly enough not to push the text
    // beside it more than about a pixel a frame, and at most over the time
    // until the last letter turns in. Changes in quick succession then carry
    // it along gently rather than swinging it after every word.
    const distance = Math.abs(to - eased.get())
    const time = mixed
      ? Math.max(seconds, Math.min(span, distance * WIDTH_PACE))
      : seconds
    animateValue(eased, to, {
      ...widthSpring(time, to - eased.get(), velocity),
      onUpdate: paint,
      // Held open, it stays at the width it reached
      onComplete: held ? undefined : release
    })
  }, [size, still])

  // Stopped as the roll is taken down, before its elements are let go
  useIsomorphicLayoutEffect(() => () => eased.stop(), [])

  React.useEffect(() => {
    const el = placeholder.current!
    // Newer than this TypeScript's DOM types, and missing in some test setups
    const Observer = (window as any).ResizeObserver
    const resized =
      Observer &&
      new Observer(([entry]: { contentRect: DOMRectReadOnly }[]) => {
        if (eased.isAnimating()) return
        // Nothing to ease from while the roll is hidden
        natural.current = el.getClientRects().length
          ? entry.contentRect.width
          : NaN
      })
    if (resized) resized.observe(el)
    return () => {
      if (resized) resized.disconnect()
    }
  }, [])

  return { placeholder, front, back, text }
}

interface RollLetterProps {
  char: string
  angle: Angle
  offset: number
  depth: React.MutableRefObject<string>
}

// A plain span that follows its angle by writing its own style, so a turning
// letter costs no React work per frame and a text change re-renders only the
// letters whose character changed.
const RollLetter = React.memo(function RollLetter({
  char,
  angle,
  offset,
  depth
}: RollLetterProps) {
  const face = React.useRef<HTMLSpanElement>(null)

  useIsomorphicLayoutEffect(() => {
    // What the face shows, so one held folded or facing the viewer isn't
    // restyled every frame
    let pose = face.current!.style.transform
    let shade = face.current!.style.opacity
    const follow = (a: number) => {
      const el = face.current
      if (!el) return
      const turned = a + offset
      const opacity = rollShade(turned)
      const next = rollPose(turned, opacity, depth.current)
      if (next !== pose) el.style.transform = pose = next
      if (String(opacity) !== shade) el.style.opacity = shade = String(opacity)
    }
    // Catches up with a turn it missed while it wasn't listening, say one
    // cut short while the roll was hidden
    follow(angle.get())
    return angle.on('change', follow)
  }, [angle, offset])

  // At rest in the markup, so a server render has the face in place before
  // the effect takes over. React compares this with the last render's style,
  // not the page, and it never changes, so React leaves the turning face be.
  return (
    <span
      className={styles.face}
      ref={face}
      style={{
        transform: rollPose(offset, rollShade(offset), DEPTH),
        opacity: rollShade(offset)
      }}
    >
      {char}
    </span>
  )
})

interface BoardProps {
  letters: string[]
  duration: (i: number) => number
  stagger: number
  still: boolean
  startRef: React.MutableRefObject<(() => void) | undefined>
}

// Tiles are keyed by place, so each one flips from its old letter to its new
// one. When the text gets shorter, the tiles past its end flip to blank and
// are only taken away once they have come to rest.
const FlapBoard = ({
  letters: latest,
  duration,
  stagger,
  still,
  startRef
}: BoardProps) => {
  // New text renders in the background, a few tiles at a time, so a long
  // board changing doesn't hold up a frame. Tiles whose letter hasn't
  // changed aren't rendered at all.
  const letters = useDeferredValue(latest)
  const [slots, setSlots] = React.useState(letters.length)
  const count = still ? letters.length : Math.max(slots, letters.length)
  // Tiles past the end of the text that have come to rest on blank
  const [gone] = React.useState(() => new Set<number>())
  const length = React.useRef(letters.length)
  // Takes away the tiles at the end that have come to rest past it
  const trim = (n: number) => {
    while (n > length.current && gone.has(n - 1)) n--
    return n
  }
  useIsomorphicLayoutEffect(() => {
    // Longer text is already on its way before it reaches the tiles, so no
    // tile it will cover is taken away in the meantime
    length.current = Math.max(letters.length, latest.length)
    gone.forEach((i) => {
      if (i < length.current) gone.delete(i)
    })
    // A tile already resting on blank (a space the text now ends before)
    // reported in its own effect, before this one knew the new length
    setSlots(trim(count))
  }, [count, letters.length, latest.length])

  // Tiles added after the first render flip in from blank
  const mounted = React.useRef(false)
  React.useEffect(() => {
    mounted.current = true
  }, [])

  const blank = React.useCallback((i: number) => {
    gone.add(i)
    setSlots(trim)
  }, [])

  // What each tile does on a hover, set by the tile itself. A hover starts
  // them in a render of the board rather than in the pointer event: the
  // browser runs pointer events inside the frame it is about to draw, so
  // starting every tile there would hold that frame back, and a render comes
  // after it. The tiles' props don't change, so none of them renders.
  const [hovers] = React.useState<((() => void) | undefined)[]>(() => [])
  const [hovered, setHovered] = React.useState(0)
  const started = React.useRef(0)
  useIsomorphicLayoutEffect(() => {
    startRef.current = () => setHovered((n) => n + 1)
    return () => {
      startRef.current = undefined
    }
  }, [])
  // After the tiles' own effects, so in a render that changes them too they
  // have set what they do on a hover. Only once for each hover, as a board
  // shown again after suspending runs this again.
  useIsomorphicLayoutEffect(() => {
    if (hovered === started.current) return
    started.current = hovered
    hovers.forEach((start) => start && start())
  }, [hovered])

  return (
    <React.Fragment>
      {Array.from({ length: count }, (_, i) => (
        <FlapTile
          key={i}
          index={i}
          char={i < letters.length ? letters[i] : ' '}
          duration={duration(i)}
          delay={i * stagger}
          hovers={hovers}
          still={still}
          mounted={mounted}
          onBlank={i < letters.length ? undefined : blank}
        />
      ))}
    </React.Fragment>
  )
}

interface FlapProps {
  char: string
  duration: number
  delay: number
  hovers: ((() => void) | undefined)[]
  still: boolean
  mounted: React.MutableRefObject<boolean>
  index: number
  onBlank?: (index: number) => void
}

// One split-flap tile. The static top half shows the letter the flap is
// bringing, the static bottom half the one it is leaving. The flap carries
// the old top half on its front and the new bottom half on its back, so when
// it falls over the hinge it lands exactly over the bottom half and the new
// letter is whole. Once it settles, the flap is put back up with the new
// letter on both faces, so a tile at rest renders the same after a flip as
// before it. A flap that falls a while from now can hold its new letter
// back; until then its hidden faces show the letter it covers.
const FlapTile = React.memo(function FlapTile({
  char,
  duration,
  delay,
  hovers,
  still,
  mounted,
  index,
  onBlank
}: FlapProps) {
  const [faces, setFaces] = React.useState(() => {
    // Tiles added after the board's first render flip in from blank
    const first = mounted.current && !still ? ' ' : char
    return {
      from: first,
      to: first,
      falling: false,
      held: false, // the new letter isn't on the faces yet (see LEAD)
      turn: 0,
      settled: 0
    }
  })
  const shown = React.useRef(faces.to) // letter showing once the flap lands
  const wanted = React.useRef(char)
  const busy = React.useRef(false) // waiting to fall, falling or settling
  const falling = React.useRef(false)
  const wait = React.useRef(0)
  const bringing = React.useRef(char) // letter on the back of the flap
  const running = React.useRef<{ stop: () => void }>()
  const seconds = React.useRef(duration)
  const leave = React.useRef(onBlank)
  // The faces as last committed, and whether a change to them is on its way
  const rendered = React.useRef(faces)
  const pending = React.useRef(false)
  useIsomorphicLayoutEffect(() => {
    rendered.current = faces
    pending.current = false
    // An empty or broken timing falls back to the default
    seconds.current = duration >= 0 ? duration : 0.5
    leave.current = onBlank
  })
  const change = (next: (f: typeof faces) => typeof faces) => {
    pending.current = true
    setFaces(next)
  }
  // Whether a flap bringing a new letter this far off keeps it back for now.
  // One that would already be within LEAD on its first frame doesn't.
  const early = (delay: number) => delay * 1000 > LEAD + MAX_ELAPSED
  // A new letter for a tile at rest goes on its faces in the render that
  // brings it, rather than in a second render of every tile straight after.
  // The letter effect then finds the faces ready (see turn).
  if (
    !still &&
    !busy.current &&
    char !== shown.current &&
    (faces.from !== shown.current || faces.to !== char)
  ) {
    setFaces({
      ...faces,
      from: shown.current,
      to: char,
      falling: false,
      held: early(delay)
    })
  }
  // Whether every face already shows these letters, so a flip can start or
  // end without a render. (A tile marked falling with one letter on every
  // face renders as one that isn't.)
  const showing = (from: string, to: string) => {
    const f = rendered.current
    return !pending.current && f.from === from && f.to === to
  }

  const tile = React.useRef<HTMLSpanElement>(null)
  const flap = React.useRef<HTMLSpanElement>(null)
  const front = React.useRef<HTMLSpanElement>(null)
  const back = React.useRef<HTMLSpanElement>(null)
  const shadow = React.useRef<HTMLSpanElement>(null)
  // The flap starts at rest, as its styles draw it
  const painted = React.useRef(0)
  // What paint() last wrote, so a frame that changes nothing on an element
  // doesn't touch it and the browser has nothing of it to restyle
  const [written] = React.useState(() => new Map<string, string>())
  const write = (el: HTMLElement, key: string, name: string, value: string) => {
    if (written.get(key) === value) return
    written.set(key, value)
    el.style.setProperty(name, value)
  }

  // A face with no shade carries no filter at all, so it renders as it does
  // at rest
  const dim = (face: HTMLElement, key: string, amount: number) =>
    write(face, key, 'filter', amount ? `brightness(${1 - amount})` : '')

  // Written straight to the DOM, in the same frame as the letters change,
  // so the flap never shows a frame of the next letter before it resets.
  const paint = (rotateX: number) => {
    if (!flap.current || rotateX === painted.current) return
    painted.current = rotateX
    // The flap is 3D only while it is down, from its first frame off the
    // top to the one that puts it back up
    const turning = rotateX !== 0
    if (tile.current!.hasAttribute('data-turning') !== turning)
      tile.current!.toggleAttribute('data-turning', turning)
    const angle = (-rotateX * Math.PI) / 180
    const facing = Math.cos(angle - LIGHT)
    write(flap.current, 'flap', 'transform', `rotateX(${rotateX}deg)`)
    // Each leaf is dimmed as a whole, which its layer can do without a
    // repaint. At rest the front is fully lit and the back is hidden.
    dim(front.current!, 'front', turning ? shade(facing) : 0)
    dim(back.current!, 'back', turning ? shade(-facing) : 0)
    // How far down the bottom half the flap's shadow reaches, fading as the
    // flap closes over it
    const reach = Math.sin(angle) * Math.tan(LIGHT) - Math.cos(angle)
    write(
      shadow.current!,
      'reach',
      'transform',
      `scaleY(${clamp(0, 1, reach)})`
    )
    write(
      shadow.current!,
      'fade',
      'opacity',
      String(SHADOW * clamp(0, 1, (180 + rotateX) / 12))
    )
  }

  // The faces take the letters first, then the flap falls (see below). A
  // flip over the letter already showing, as on a hover, falls at once.
  const turn = (delay: number) => {
    busy.current = true
    falling.current = false
    wait.current = delay
    bringing.current = wanted.current
    if (showing(shown.current, wanted.current)) return fall()
    change((f) => ({
      ...f,
      from: shown.current,
      to: wanted.current,
      falling: false,
      held: wanted.current !== shown.current && early(delay),
      turn: f.turn + 1
    }))
  }
  // Letters on every face first, then the flap goes back up (see below)
  const settle = (letter: string) => {
    if (showing(letter, letter)) return settled()
    change((f) => ({
      ...f,
      from: letter,
      to: letter,
      falling: false,
      held: false,
      settled: f.settled + 1
    }))
  }
  // A tile past the end of the text reports once it rests on blank
  const restingBlank = () => {
    if (leave.current && shown.current === ' ' && wanted.current === ' ')
      leave.current(index)
  }

  // A new letter flips in. While the flap is still waiting for its turn in
  // the stagger it can take the newest letter instead; once it is falling,
  // the newest letter follows as soon as it lands.
  useIsomorphicLayoutEffect(() => {
    wanted.current = char
    if (still) {
      // No motion: the new letter just replaces the old one, and settling
      // stops the flap
      shown.current = char
      if (busy.current || faces.from !== char || faces.to !== char) settle(char)
    } else if (!busy.current) {
      if (char !== shown.current) turn(delay)
      else restingBlank()
    } else if (!falling.current) {
      if (char !== shown.current) {
        bringing.current = char
        change((f) => ({ ...f, to: char, falling: false }))
      } else settle(char) // which stops the flap, even one not started yet
    }
  }, [char, still, onBlank])

  // A hover flips the letter over itself, unless it is already turning or
  // on its way out
  useIsomorphicLayoutEffect(() => {
    const hover = () => {
      if (!busy.current && !leave.current) turn(delay)
    }
    hovers[index] = hover
    return () => {
      if (hovers[index] === hover) hovers[index] = undefined
    }
  })

  const fall = () => {
    paint(0)
    // The flap brings another letter unless it flips one over itself (a
    // hover). The faces always hold these two letters (`turn` and a letter
    // change before the fall set both), so the refs answer without a render.
    const changing = () => bringing.current !== shown.current
    const land = () => {
      // The old letter is now under the flap, so it no longer sizes the tile
      if (changing()) change((f) => ({ ...f, from: f.to }))
      shown.current = bringing.current
      // With another letter waiting, the next flap drops at once
      if (wanted.current !== shown.current) return turn(0)
      running.current = animateValue(-180, -180 + 180 * BOUNCE_HEIGHT, {
        duration: seconds.current * (1 - FALL_SHARE),
        ease: settleEase,
        onUpdate: paint,
        onComplete: () => settle(shown.current)
      })
    }
    running.current = animateValue(0, -180, {
      duration: seconds.current * FALL_SHARE,
      delay: wait.current,
      ease: fallEase,
      onUpdate: (rotateX: number, elapsed: number) => {
        if (!falling.current && rotateX < 0) {
          // Too late to change letters now; the tile makes room for both
          falling.current = true
          if (changing()) change((f) => ({ ...f, falling: true, held: false }))
        } else if (rendered.current.held && !pending.current) {
          if (elapsed > -LEAD || reveal()) {
            change((f) => ({ ...f, held: false }))
          }
        }
        paint(rotateX)
      },
      onComplete: land
    })
  }
  useIsomorphicLayoutEffect(() => {
    if (faces.turn) fall()
  }, [faces.turn])

  // With the same letter on every face, the flap can go back up unseen. Up
  // is where it starts, so the halves overlap the same way at every rest.
  const settled = () => {
    // Every settle stops the flap: a flip called off in the same render
    // that asked for it was only started after the letter effect settled it
    if (running.current) running.current.stop()
    paint(0)
    busy.current = false
    if (wanted.current !== shown.current) turn(0)
    else restingBlank()
  }
  useIsomorphicLayoutEffect(() => {
    if (faces.settled) settled()
  }, [faces.settled])

  // Stopped, the tile is no longer turning, so a tile mounted again (as
  // StrictMode does to every new one) starts its flip again
  React.useEffect(
    () => () => {
      if (running.current) running.current.stop()
      busy.current = false
      falling.current = false
    },
    []
  )

  // Until it falls, the tile is sized by the letter it shows; while it falls,
  // by whichever of the two letters is wider
  const was = faces.falling && faces.from !== faces.to ? faces.from : undefined
  // Held back, the faces the flap hides show the letter it covers
  const to = faces.held ? faces.from : faces.to
  return (
    <span className={styles.tile} ref={tile}>
      <span className={styles.sizer} data-was={was}>
        {faces.falling ? faces.to : faces.from}
      </span>
      <span className={`${styles.half} ${styles.top} ${styles.readable}`}>
        {to}
      </span>
      <span className={`${styles.half} ${styles.bottom}`} aria-hidden='true'>
        {faces.from}
        <span className={styles.shade}>
          <span ref={shadow} className={styles.shadow} />
        </span>
      </span>
      <span aria-hidden='true' className={styles.flap} ref={flap}>
        <span
          ref={front}
          className={`${styles.half} ${styles.top} ${styles.leaf}`}
        >
          {faces.from}
        </span>
        <span
          ref={back}
          className={`${styles.half} ${styles.bottom} ${styles.leaf} ${styles.underside}`}
        >
          {to}
        </span>
      </span>
    </span>
  )
})
