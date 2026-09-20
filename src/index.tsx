import * as React from 'react'
import {
  motion,
  useAnimationControls,
  useMotionValue,
  useReducedMotion,
  useTransform
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

// Roll: the letter turns like a face of a cube, overshoots a few degrees and
// settles back, as if caught by a detent. Both faces share these keyframe
// times so they stay joined at the edge the whole way round.
const ROLL_TIMES = [0, 0.64, 0.84, 1]
const ROLL_EASE = [
  [0.45, 0, 0.25, 1],
  [0.4, 0, 0.6, 1],
  [0.4, 0, 0.6, 1]
]
const ROLL_IN = [90, -7, 2, 0]
const ROLL_OUT = ROLL_IN.map((angle) => angle - 90)
// The turn is about an axis set back behind the letter by --rt-depth. The
// perspective sits outside that offset, so a letter at rest is drawn at its
// true size rather than magnified.
// The letters keep this 3D transform at rest too, so their text rendering
// doesn't shift when a flip starts or ends.
const rollTransform = ({ rotateX }: { rotateX?: string | number }) =>
  `perspective(4em) translateZ(calc(-1 * var(--rt-depth))) rotateX(${rotateX}) translateZ(var(--rt-depth))`
const ROLL_SHADE_ANGLES = [-85, -60, 0, 60, 85]
const ROLL_SHADE = [0, 0.75, 1, 0.75, 0]

// Flap: the top half falls over the centre hinge under gravity, hits the stop
// and bounces twice before it rests.
const FLAP_TIMES = [0, 0.6, 0.74, 0.86, 0.93, 1]
const FLAP_EASE = [
  [0.55, 0, 0.85, 0.35],
  [0.2, 0.6, 0.4, 1],
  [0.6, 0, 0.8, 0.4],
  [0.2, 0.6, 0.4, 1],
  [0.6, 0, 0.8, 0.4]
]
const FLAP_FALL = [0, -180, -166, -180, -175, -180]

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
  const animate = useAnimationControls()
  const busyUntil = React.useRef(0)

  // Letters past the end of a timing array reuse its last entry
  const duration = (i: number) =>
    Array.isArray(timing) ? timing[Math.min(i, timing.length - 1)] : timing

  const letters = splitLetters(text)
  const transitionFor = (i: number) => ({
    duration: duration(i),
    delay: i * stagger,
    times: variant === 'flap' ? FLAP_TIMES : ROLL_TIMES,
    ease: variant === 'flap' ? FLAP_EASE : ROLL_EASE
  })

  // A second hover while letters are still moving is ignored, so a flip
  // always runs to the end instead of snapping back to the start.
  const flip = () => {
    const now = performance.now()
    if (still || now < busyUntil.current) return
    const longest = Math.max(
      ...letters.map((_, i) => i * stagger + duration(i))
    )
    busyUntil.current = now + longest * 1000
    animate.start('rotate')
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
      animate={animate}
      initial='initial'
      whileHover={still ? { scale: 1.05 } : undefined}
      onHoverStart={flip}
      style={style}
    >
      {variant === 'flap' ? (
        letters.map((char, i) => (
          <FlapTile
            key={`${char}${i}`}
            char={char}
            fall={
              still
                ? undefined
                : {
                    rotate: { rotateX: FLAP_FALL, transition: transitionFor(i) }
                  }
            }
          />
        ))
      ) : (
        <RollFaces
          letters={letters}
          front={still ? undefined : rollVariant(ROLL_OUT, transitionFor)}
          back={still ? undefined : rollVariant(ROLL_IN, transitionFor)}
        />
      )}
    </motion.div>
  )
}

type MotionVariants = React.ComponentProps<typeof motion.span>['variants']
type MotionStyle = React.ComponentProps<typeof motion.span>['style']

// framer-motion's style type loses its CSS properties under the TypeScript
// version this package builds with, so styles holding motion values go
// through here.
const motionStyle = (style: object) => style as MotionStyle

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

const rollVariant = (
  angles: number[],
  transitionFor: (i: number) => object
): MotionVariants => ({
  rotate: (i: number) => ({ rotateX: angles, transition: transitionFor(i) })
})

interface RollProps {
  letters: string[]
  front?: MotionVariants
  back?: MotionVariants
}

// The front letter rolls down and away while its copy rolls in from above.
const RollFaces = ({ letters, front, back }: RollProps) => (
  <React.Fragment>
    <div className={styles.front}>
      {letters.map((char, i) => (
        <RollLetter
          key={`${char}${i}`}
          char={char}
          index={i}
          variants={front}
          from={0}
        />
      ))}
    </div>
    <div className={`${styles.back} ${styles.copy}`} aria-hidden='true'>
      {letters.map((char, i) => (
        <RollLetter
          key={`${char}${i}copy`}
          char={char}
          index={i}
          variants={back}
          from={ROLL_IN[0]}
        />
      ))}
    </div>
    <div className={styles.placeholder}>{letters.join('')}</div>
  </React.Fragment>
)

interface RollLetterProps {
  char: string
  index: number
  variants?: MotionVariants
  from: number
}

const RollLetter = ({ char, index, variants, from }: RollLetterProps) => {
  const rotateX = useMotionValue(from)
  // A face dims as it turns away from the viewer, as if lit from the front,
  // and is gone by the time it is edge on.
  const opacity = useTransform(rotateX, ROLL_SHADE_ANGLES, ROLL_SHADE)

  return (
    <motion.span
      custom={index}
      variants={variants}
      className={styles.face}
      style={motionStyle({ rotateX, opacity })}
      transformTemplate={rollTransform}
    >
      {char}
    </motion.span>
  )
}

interface FlapProps {
  char: string
  fall?: MotionVariants
}

// One split-flap tile. The static halves show the letter at rest; the flap
// carries the top half on its front and the bottom half on its back, so when
// it falls over the hinge it lands exactly over the bottom half.
const FlapTile = ({ char, fall }: FlapProps) => {
  const rotateX = useMotionValue(0)
  // Light falls on the flap from above: it darkens as it turns away from the
  // viewer and brightens again as its back comes up to face them.
  const frontShade = useTransform(rotateX, [0, -90], [0, 0.55])
  const backShade = useTransform(rotateX, [-90, -180], [0.4, 0])
  // The falling flap casts a shadow on the bottom half just before it lands.
  const shadow = useTransform(rotateX, [-60, -150, -180], [0, 0.3, 0])

  return (
    <span className={styles.tile}>
      <span className={styles.sizer}>{char}</span>
      <span className={`${styles.half} ${styles.top} ${styles.readable}`}>
        {char}
      </span>
      <span className={`${styles.half} ${styles.bottom}`} aria-hidden='true'>
        {char}
        <Shade opacity={shadow} />
      </span>
      <motion.span
        aria-hidden='true'
        className={styles.flap}
        variants={fall}
        style={motionStyle({ rotateX })}
      >
        <span className={`${styles.half} ${styles.top} ${styles.leaf}`}>
          {char}
          <Shade opacity={frontShade} />
        </span>
        <span
          className={`${styles.half} ${styles.bottom} ${styles.leaf} ${styles.underside}`}
        >
          {char}
          <Shade opacity={backShade} />
        </span>
      </motion.span>
    </span>
  )
}

const Shade = ({ opacity }: { opacity: ReturnType<typeof useMotionValue> }) => (
  <motion.span className={styles.shade} style={motionStyle({ opacity })} />
)
