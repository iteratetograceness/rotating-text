import * as React from 'react'
import {
  animate as animateValue,
  clamp,
  transform as interpolate,
  motion,
  motionValue,
  useIsomorphicLayoutEffect,
  useReducedMotion
} from 'framer-motion'
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
// true size rather than magnified.
// The letters keep this 3D transform at rest too, so their text rendering
// doesn't shift when a flip starts or ends.
const rollTransform = ({ rotateX }: { rotateX?: string | number }) =>
  `perspective(4em) translateZ(calc(-1 * var(--rt-depth))) rotateX(${rotateX}) translateZ(var(--rt-depth))`
const ROLL_SHADE_ANGLES = [-85, -60, 0, 60, 85]
const ROLL_SHADE = [0, 0.75, 1, 0.75, 0]

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
  const startRoll = React.useRef<() => void>()
  // Flap tiles run their own flips; a hover tells them to by bumping this
  const [shuffles, setShuffles] = React.useState(0)

  // Letters past the end of a timing array reuse its last entry
  const duration = (i: number) =>
    Array.isArray(timing) ? timing[Math.min(i, timing.length - 1)] : timing

  const letters = splitLetters(text)

  // A second hover while letters are still moving is ignored, so a flip
  // always runs to the end instead of snapping back to the start. Rolling
  // letters know when they have settled, so roll asks them; flap tiles each
  // ignore a hover while they are turning.
  const flip = () => {
    if (still) return
    if (variant === 'flap') setShuffles((n) => n + 1)
    else if (startRoll.current) startRoll.current()
  }

  const rootClass = [
    styles.container,
    variant === 'flap' ? styles.board : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <motion.div
      className={rootClass}
      whileHover={still ? { scale: 1.05 } : undefined}
      onHoverStart={flip}
      style={style}
    >
      {variant === 'flap' ? (
        <FlapBoard
          letters={letters}
          duration={duration}
          stagger={stagger}
          shuffles={shuffles}
          still={still}
        />
      ) : (
        <RollFaces
          letters={letters}
          duration={duration}
          stagger={stagger}
          startRef={startRoll}
        />
      )}
    </motion.div>
  )
}

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
  startRef: React.MutableRefObject<(() => void) | undefined>
}

// The front letter rolls down and away while its copy rolls in from above.
const RollFaces = ({ letters, duration, stagger, startRef }: RollProps) => {
  // One angle per letter, the front face's. They outlive text changes, so a
  // letter that is turning keeps turning when the text changes under it.
  const angles = React.useRef<Angle[]>([]).current
  while (angles.length < letters.length) angles.push(createAngle())

  useIsomorphicLayoutEffect(() => {
    // Letters that are gone stop turning and their angles are dropped, so a
    // letter that comes back later starts at rest
    angles.splice(letters.length).forEach((a) => a.stop())

    // Only the letters on screen turn, not any a render in progress added
    const turning = angles.slice()
    startRef.current = () => {
      // Letters still turning finish first
      if (turning.some((a) => a.isAnimating())) return
      turning.forEach((angle, i) =>
        animateValue(angle, -90, {
          ...rollSpring(duration(i)),
          delay: i * stagger,
          // The copy is showing now. Put the front face back, which looks
          // the same, so selecting text and the next flip start from there.
          onComplete: () => angle.jump(0),
          // A turn cut short, say because the letter was hidden, goes back
          // to rest rather than staying frozen part way round
          onStop: () => angle.set(0)
        })
      )
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
      <div className={styles.front}>
        {letters.map((char, i) => (
          <RollLetter key={i} char={char} angle={angles[i]} offset={0} />
        ))}
      </div>
      <div className={`${styles.back} ${styles.copy}`} aria-hidden='true'>
        {letters.map((char, i) => (
          <RollLetter key={i} char={char} angle={angles[i]} offset={90} />
        ))}
      </div>
      <div className={styles.placeholder}>{letters.join('')}</div>
    </React.Fragment>
  )
}

interface RollLetterProps {
  char: string
  angle: Angle
  offset: number
}

// A face dims as it turns away from the viewer, as if lit from the front,
// and is gone by the time it is edge on.
const rollShade = interpolate(ROLL_SHADE_ANGLES, ROLL_SHADE)
const rollStyle = (rotateX: number) => ({
  transform: rollTransform({ rotateX: `${rotateX}deg` }),
  opacity: String(rollShade(rotateX))
})

// A plain span that follows its angle by writing its own style, so a turning
// letter costs no React work per frame and a text change re-renders only the
// letters whose character changed.
const RollLetter = React.memo(function RollLetter({
  char,
  angle,
  offset
}: RollLetterProps) {
  const face = React.useRef<HTMLSpanElement>(null)

  useIsomorphicLayoutEffect(() => {
    const follow = (a: number) => {
      const { transform, opacity } = rollStyle(a + offset)
      face.current!.style.transform = transform
      face.current!.style.opacity = opacity
    }
    follow(angle.get())
    return angle.on('change', follow)
  }, [angle, offset])

  // Drawn at rest to start with, so server-rendered markup has the face in
  // place before the effect takes over. React leaves the style alone after
  // that, because it never changes between renders.
  const rest = React.useMemo(() => rollStyle(offset), [offset])

  return (
    <span className={styles.face} ref={face} style={rest}>
      {char}
    </span>
  )
})

interface BoardProps {
  letters: string[]
  duration: (i: number) => number
  stagger: number
  shuffles: number
  still: boolean
}

// Tiles are keyed by place, so each one flips from its old letter to its new
// one. When the text gets shorter, the tiles past its end flip to blank and
// are only taken away once they have come to rest.
const FlapBoard = ({
  letters,
  duration,
  stagger,
  shuffles,
  still
}: BoardProps) => {
  const [slots, setSlots] = React.useState(letters.length)
  const count = still ? letters.length : Math.max(slots, letters.length)
  // Tiles past the end of the text that have come to rest on blank
  const [gone] = React.useState(() => new Set<number>())
  const length = React.useRef(letters.length)
  useIsomorphicLayoutEffect(() => {
    length.current = letters.length
    gone.forEach((i) => {
      if (i < letters.length) gone.delete(i)
    })
    setSlots(count)
  }, [count, letters.length])

  // Tiles added after the first render flip in from blank
  const mounted = React.useRef(false)
  React.useEffect(() => {
    mounted.current = true
  }, [])

  const blank = React.useCallback((i: number) => {
    gone.add(i)
    setSlots((n) => {
      while (n > length.current && gone.has(n - 1)) n--
      return n
    })
  }, [])

  return (
    <React.Fragment>
      {Array.from({ length: count }, (_, i) => (
        <FlapTile
          key={i}
          index={i}
          char={i < letters.length ? letters[i] : ' '}
          duration={duration(i)}
          delay={i * stagger}
          shuffles={shuffles}
          still={still}
          enter={mounted.current && !still}
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
  shuffles: number
  still: boolean
  enter: boolean
  index: number
  onBlank?: (index: number) => void
}

// One split-flap tile. The static top half shows the letter the flap is
// bringing, the static bottom half the one it is leaving. The flap carries
// the old top half on its front and the new bottom half on its back, so when
// it falls over the hinge it lands exactly over the bottom half and the new
// letter is whole. Once it settles, the flap is put back up with the new
// letter on both faces, so a tile at rest renders the same after a flip as
// before it.
const FlapTile = ({
  char,
  duration,
  delay,
  shuffles,
  still,
  enter,
  index,
  onBlank
}: FlapProps) => {
  const [faces, setFaces] = React.useState(() => {
    const first = enter ? ' ' : char
    return { from: first, to: first, falling: false, turn: 0, settled: 0 }
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
  useIsomorphicLayoutEffect(() => {
    // An empty or broken timing falls back to the default
    seconds.current = duration >= 0 ? duration : 0.5
    leave.current = onBlank
  })

  const flap = React.useRef<HTMLSpanElement>(null)
  const frontShade = React.useRef<HTMLSpanElement>(null)
  const backShade = React.useRef<HTMLSpanElement>(null)
  const shadow = React.useRef<HTMLSpanElement>(null)
  const painted = React.useRef(NaN)

  // Written straight to the DOM, in the same frame as the letters change,
  // so the flap never shows a frame of the next letter before it resets.
  const paint = (rotateX: number) => {
    if (!flap.current || rotateX === painted.current) return
    painted.current = rotateX
    const angle = (-rotateX * Math.PI) / 180
    const facing = Math.cos(angle - LIGHT)
    flap.current.style.transform = `rotateX(${rotateX}deg)`
    frontShade.current!.style.opacity = String(shade(facing))
    backShade.current!.style.opacity = String(shade(-facing))
    // How far down the bottom half the flap's shadow reaches, fading as the
    // flap closes over it
    const reach = Math.sin(angle) * Math.tan(LIGHT) - Math.cos(angle)
    shadow.current!.style.transform = `scaleY(${clamp(0, 1, reach)})`
    shadow.current!.style.opacity = String(
      SHADOW * clamp(0, 1, (180 + rotateX) / 12)
    )
  }

  const turn = (delay: number) => {
    busy.current = true
    falling.current = false
    wait.current = delay
    bringing.current = wanted.current
    setFaces((f) => ({
      ...f,
      from: shown.current,
      to: wanted.current,
      falling: false,
      turn: f.turn + 1
    }))
  }
  // Letters on every face first, then the flap goes back up (see below)
  const settle = (letter: string) =>
    setFaces((f) => ({
      ...f,
      from: letter,
      to: letter,
      falling: false,
      settled: f.settled + 1
    }))
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
      // No motion: the new letter just replaces the old one
      if (running.current) running.current.stop()
      shown.current = char
      if (busy.current || faces.from !== char || faces.to !== char) settle(char)
    } else if (!busy.current) {
      if (char !== shown.current) turn(delay)
      else restingBlank()
    } else if (!falling.current) {
      if (char !== shown.current) {
        bringing.current = char
        setFaces((f) => ({ ...f, to: char }))
      } else {
        running.current!.stop()
        settle(char)
      }
    }
  }, [char, still, onBlank])

  // A hover flips the letter over itself, unless it is already turning or
  // on its way out
  const shuffled = React.useRef(shuffles)
  React.useEffect(() => {
    if (shuffles === shuffled.current) return
    shuffled.current = shuffles
    if (!busy.current && !leave.current) turn(delay)
  }, [shuffles])

  useIsomorphicLayoutEffect(() => {
    if (!faces.turn) return
    paint(0)
    const land = () => {
      shown.current = bringing.current
      // The old letter is now under the flap, so it no longer sizes the tile
      setFaces((f) => (f.from === f.to ? f : { ...f, from: f.to }))
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
      onUpdate: (rotateX: number) => {
        if (!falling.current && rotateX < 0) {
          // Too late to change letters now; the tile makes room for both
          falling.current = true
          setFaces((f) => ({ ...f, falling: true }))
        }
        paint(rotateX)
      },
      onComplete: land
    })
  }, [faces.turn])

  // With the same letter on every face, the flap can go back up unseen. Up
  // is where it starts, so the halves overlap the same way at every rest.
  useIsomorphicLayoutEffect(() => {
    if (!faces.settled) return
    paint(0)
    busy.current = false
    if (wanted.current !== shown.current) turn(0)
    else restingBlank()
  }, [faces.settled])

  React.useEffect(
    () => () => {
      if (running.current) running.current.stop()
    },
    []
  )

  // Until it falls, the tile is sized by the letter it shows; while it falls,
  // by whichever of the two letters is wider
  const was = faces.falling && faces.from !== faces.to ? faces.from : undefined
  return (
    <span className={styles.tile}>
      <span className={styles.sizer} data-was={was}>
        {faces.falling ? faces.to : faces.from}
      </span>
      <span className={`${styles.half} ${styles.top} ${styles.readable}`}>
        {faces.to}
      </span>
      <span className={`${styles.half} ${styles.bottom}`} aria-hidden='true'>
        {faces.from}
        <span ref={shadow} className={`${styles.shade} ${styles.shadow}`} />
      </span>
      <span aria-hidden='true' className={styles.flap} ref={flap}>
        <span className={`${styles.half} ${styles.top} ${styles.leaf}`}>
          {faces.from}
          <span ref={frontShade} className={styles.shade} />
        </span>
        <span
          className={`${styles.half} ${styles.bottom} ${styles.leaf} ${styles.underside}`}
        >
          {faces.to}
          <span ref={backShade} className={styles.shade} />
        </span>
      </span>
    </span>
  )
}
