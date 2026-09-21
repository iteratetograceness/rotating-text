import * as React from 'react'

// The few parts of framer-motion 9.0.1 that RotatingText uses, ported here so
// the package no longer carries all of framer inside it. Each part keeps
// framer's own arithmetic and timing, step for step, so every frame comes out
// as it did with framer; only the options this package passes are kept.
// framer-motion is MIT licensed, Copyright (c) 2018 Framer B.V.; its notice
// is in LICENSE.

interface Frame {
  delta: number // ms since the last frame
  timestamp: number
}
type Job = (frame: Frame) => void

// Frame loop. Jobs run once a frame, in steps, on requestAnimationFrame. A
// loop's first frame counts as one 60fps frame; after that, a frame is the
// time since the last one, kept between 1 and 40 ms.
const TIMESTEP = 1000 / 60
const MAX_ELAPSED = 40
const frame: Frame = { delta: 0, timestamp: 0 }
let useDefaultElapsed = true
let runNextFrame = false
let isProcessing = false

const now = () =>
  typeof performance !== 'undefined' ? performance.now() : Date.now()
const onNextFrame = (callback: (timestamp: number) => void) => {
  if (typeof window !== 'undefined') window.requestAnimationFrame(callback)
  else setTimeout(() => callback(now()), TIMESTEP)
}

const createStep = () => {
  let toRun: Job[] = []
  let toRunNextFrame: Job[] = []
  // Jobs that schedule themselves again each time they run
  const keepAlive = new WeakSet<Job>()
  const step = {
    schedule: (job: Job, alive = false) => {
      if (alive) keepAlive.add(job)
      if (toRunNextFrame.indexOf(job) === -1) toRunNextFrame.push(job)
    },
    // Only takes the job out of the next frame, so a job cancelled by one
    // that ran before it in this frame still runs this once
    cancel: (job: Job) => {
      const index = toRunNextFrame.indexOf(job)
      if (index !== -1) toRunNextFrame.splice(index, 1)
      keepAlive.delete(job)
    },
    process: (data: Frame) => {
      ;[toRun, toRunNextFrame] = [toRunNextFrame, toRun]
      toRunNextFrame.length = 0
      const count = toRun.length
      for (let i = 0; i < count; i++) {
        const job = toRun[i]
        job(data)
        if (keepAlive.has(job)) {
          step.schedule(job)
          runNextFrame = true
        }
      }
    }
  }
  return step
}

// In the order they run each frame
const read = createStep()
const update = createStep()
const postRender = createStep()
const steps = [read, update, postRender]

const processFrame = (timestamp: number) => {
  runNextFrame = false
  frame.delta = useDefaultElapsed
    ? TIMESTEP
    : Math.max(Math.min(timestamp - frame.timestamp, MAX_ELAPSED), 1)
  frame.timestamp = timestamp
  isProcessing = true
  steps.forEach((step) => step.process(frame))
  isProcessing = false
  if (runNextFrame) {
    useDefaultElapsed = false
    onNextFrame(processFrame)
  }
}

const startLoop = () => {
  runNextFrame = true
  useDefaultElapsed = true
  if (!isProcessing) onNextFrame(processFrame)
}

const schedule = (
  step: ReturnType<typeof createStep>,
  job: Job,
  alive = false
) => {
  if (!runNextFrame) startLoop()
  step.schedule(job, alive)
}

const velocityPerSecond = (velocity: number, frameDuration: number) =>
  frameDuration ? velocity * (1000 / frameDuration) : 0

interface Playback {
  stop: () => void
}

// A number that animations drive and others follow. Its velocity is the
// change over the last frame it was set in, and falls to zero once a frame
// passes without it being set.
export class MotionValue {
  private current: number
  private prev: number
  private timeDelta = 0
  private lastUpdated = 0
  private listeners: ((latest: number) => void)[] = []
  private animation: Playback | null = null

  constructor(init: number) {
    this.prev = this.current = init
  }

  // Calls back each time the value changes. Once nothing is listening by the
  // start of the next frame, any animation on the value stops.
  on(_event: 'change', callback: (latest: number) => void) {
    const { listeners } = this
    if (listeners.indexOf(callback) === -1) listeners.push(callback)
    return () => {
      const index = listeners.indexOf(callback)
      if (index > -1) listeners.splice(index, 1)
      schedule(read, () => {
        if (!listeners.length) this.stop()
      })
    }
  }

  set(v: number) {
    this.updateAndNotify(v)
  }

  // Sets the value with no velocity and stops any animation on it
  jump(v: number) {
    this.updateAndNotify(v)
    this.prev = v
    this.stop()
  }

  get() {
    return this.current
  }

  getVelocity() {
    return velocityPerSecond(this.current - this.prev, this.timeDelta)
  }

  // Only one animation drives the value at a time. It lets go of the value a
  // microtask after it completes, so the value still counts as animating
  // while its completion is handled, and stopping it then calls its onStop.
  start(startAnimation: (onComplete: () => void) => Playback) {
    this.stop()
    return new Promise<void>((resolve) => {
      this.animation = startAnimation(resolve)
    }).then(() => {
      this.animation = null
    })
  }

  stop() {
    if (this.animation) this.animation.stop()
    this.animation = null
  }

  isAnimating() {
    return !!this.animation
  }

  private updateAndNotify(v: number) {
    this.prev = this.current
    this.current = v
    const { delta, timestamp } = frame
    if (this.lastUpdated !== timestamp) {
      this.timeDelta = delta
      this.lastUpdated = timestamp
      schedule(postRender, this.scheduleVelocityCheck)
    }
    if (this.prev !== this.current) {
      const { listeners } = this
      const count = listeners.length
      for (let i = 0; i < count; i++) {
        const listener = listeners[i]
        if (listener) listener(this.current)
      }
    }
  }

  private scheduleVelocityCheck = () => schedule(postRender, this.velocityCheck)

  private velocityCheck = ({ timestamp }: Frame) => {
    if (timestamp !== this.lastUpdated) this.prev = this.current
  }
}

export const motionValue = (init: number) => new MotionValue(init)

// The value at `t` ms, and whether it has come to rest
type Generator = (t: number) => { done: boolean; value: number }

interface SpringOptions {
  type: 'spring'
  stiffness?: number
  damping?: number
  mass?: number
  velocity?: number // units per second
  restDelta?: number
  restSpeed?: number // units per second
}

// A damped spring from `origin` to `target`, at rest once it is within
// restDelta of the target and slower than restSpeed
const spring = (
  origin: number,
  target: number,
  {
    stiffness = 100,
    damping = 10,
    mass = 1,
    velocity = 0,
    restDelta,
    restSpeed
  }: SpringOptions
): Generator => {
  const initialVelocity = velocity ? -(velocity / 1000) : 0.0
  const dampingRatio = damping / (2 * Math.sqrt(stiffness * mass))
  const initialDelta = target - origin
  const undampedAngularFreq = Math.sqrt(stiffness / mass) / 1000
  // Smaller thresholds for a change of only a few units
  const isGranularScale = Math.abs(initialDelta) < 5
  const speed = restSpeed || (isGranularScale ? 0.01 : 2)
  const delta = restDelta || (isGranularScale ? 0.005 : 0.5)

  let resolveSpring: (t: number) => number
  if (dampingRatio < 1) {
    const angularFreq =
      undampedAngularFreq * Math.sqrt(1 - dampingRatio * dampingRatio)
    resolveSpring = (t) => {
      const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t)
      return (
        target -
        envelope *
          (((initialVelocity +
            dampingRatio * undampedAngularFreq * initialDelta) /
            angularFreq) *
            Math.sin(angularFreq * t) +
            initialDelta * Math.cos(angularFreq * t))
      )
    }
  } else if (dampingRatio === 1) {
    resolveSpring = (t) =>
      target -
      Math.exp(-undampedAngularFreq * t) *
        (initialDelta +
          (initialVelocity + undampedAngularFreq * initialDelta) * t)
  } else {
    const dampedAngularFreq =
      undampedAngularFreq * Math.sqrt(dampingRatio * dampingRatio - 1)
    resolveSpring = (t) => {
      const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t)
      // sinh and cosh overflow past this
      const freqForT = Math.min(dampedAngularFreq * t, 300)
      return (
        target -
        (envelope *
          ((initialVelocity +
            dampingRatio * undampedAngularFreq * initialDelta) *
            Math.sinh(freqForT) +
            dampedAngularFreq * initialDelta * Math.cosh(freqForT))) /
          dampedAngularFreq
      )
    }
  }

  return (t) => {
    const current = resolveSpring(t)
    let currentVelocity = initialVelocity
    if (t !== 0) {
      // Only an underdamped spring can pass its target, so only its speed is
      // checked, over the last 5 ms
      if (dampingRatio < 1) {
        const prevT = Math.max(0, t - 5)
        currentVelocity = velocityPerSecond(
          current - resolveSpring(prevT),
          t - prevT
        )
      } else {
        currentVelocity = 0
      }
    }
    const done =
      Math.abs(currentVelocity) <= speed && Math.abs(target - current) <= delta
    return { done, value: done ? target : current }
  }
}

interface TweenOptions {
  type?: undefined
  duration: number // seconds
  ease: (progress: number) => number
}

// From `origin` to `target` over `duration` ms, along `ease`
const tween = (
  origin: number,
  target: number,
  { duration, ease }: Pick<TweenOptions, 'duration' | 'ease'>
): Generator => {
  const along = transform(
    [0 * duration, 1 * duration],
    [origin, target],
    [ease]
  )
  return (t) => ({ value: along(t), done: t >= duration })
}

export type AnimationOptions = (SpringOptions | TweenOptions) & {
  delay?: number // seconds
  onUpdate?: (latest: number) => void
  onComplete?: () => void
  onStop?: () => void
}

// Animates a value, or a number (as a value of its own), to `to`. It moves
// on the first frame after it starts, by the time that frame took, and is
// called with the value on every frame, its delay included.
export const animate = (
  from: MotionValue | number,
  to: number,
  transition: AnimationOptions
) => {
  const value = from instanceof MotionValue ? from : new MotionValue(from)
  value.start((resolve) => {
    const options = { velocity: value.getVelocity(), ...transition }
    const { onUpdate, onComplete, onStop } = transition
    const origin = value.get()
    const next =
      options.type === 'spring'
        ? spring(origin, to, options)
        : tween(origin, to, {
            ...options,
            duration: options.duration
              ? options.duration * 1000
              : options.duration
          })
    let elapsed = 0 - (transition.delay || 0) * 1000
    let isComplete = false
    let state = { done: false, value: origin }

    const run = ({ delta }: Frame) => {
      elapsed += delta
      if (!isComplete) {
        state = next(Math.max(0, elapsed))
        isComplete = state.done
      }
      value.set(state.value)
      if (onUpdate) onUpdate(state.value)
      if (isComplete) {
        update.cancel(run)
        resolve()
        if (onComplete) onComplete()
      }
    }
    schedule(update, run, true)
    return {
      stop: () => {
        if (onStop) onStop()
        update.cancel(run)
      }
    }
  })
  return { stop: () => value.stop() }
}

export const clamp = (min: number, max: number, v: number) =>
  Math.min(Math.max(v, min), max)

const mix = (from: number, to: number, progress: number) =>
  -progress * from + progress * to + from

const progress = (from: number, to: number, value: number) => {
  const toFromDifference = to - from
  return toFromDifference === 0 ? 1 : (value - from) / toFromDifference
}

// Maps a number in `input` to the matching one in `output`, piece by piece,
// each piece along its `ease`. Numbers outside `input` are held at its ends.
// Framer exports it as `transform`.
export const transform = (
  input: number[],
  output: number[],
  ease?: ((progress: number) => number)[]
) => {
  const inputLength = input.length
  if (input[0] > input[inputLength - 1]) {
    input = [...input].reverse()
    output = [...output].reverse()
  }
  const mixers = output.slice(0, -1).map((from, i) => {
    const to = output[i + 1]
    const easing = ease && ease[i]
    return easing
      ? (p: number) => mix(from, to, easing(p))
      : (p: number) => mix(from, to, p)
  })
  const numMixers = mixers.length
  return (v: number) => {
    v = clamp(input[0], input[inputLength - 1], v)
    let i = 0
    if (numMixers > 1) {
      for (; i < inputLength - 2; i++) {
        if (v < input[i + 1]) break
      }
    }
    return mixers[i](progress(input[i], input[i + 1], v))
  }
}

export const useIsomorphicLayoutEffect =
  typeof document !== 'undefined' ? React.useLayoutEffect : React.useEffect

// Whether the device asks for reduced motion; null on the server
const prefersReducedMotion: { current: boolean | null } = { current: null }
// Components to tell when the setting changes
const reducedMotionFollowers = new Set<() => void>()
let hasReducedMotionListener = false
const initPrefersReducedMotion = () => {
  hasReducedMotionListener = true
  if (typeof document === 'undefined') return
  if (window.matchMedia) {
    const query = window.matchMedia('(prefers-reduced-motion)')
    const setPreference = () => {
      prefersReducedMotion.current = query.matches
      reducedMotionFollowers.forEach((follow) => follow())
    }
    // addListener for Safari before 14
    if (query.addEventListener) query.addEventListener('change', setPreference)
    else query.addListener(setPreference)
    setPreference()
  } else {
    prefersReducedMotion.current = false
  }
}

// Framer reads the setting once, as the component mounts. This starts from
// the same value, so a server render and the first render are unchanged, but
// then follows the setting as the reader turns it on or off, where framer
// kept the first value until a remount.
export const useReducedMotion = () => {
  if (!hasReducedMotionListener) initPrefersReducedMotion()
  const [shouldReduceMotion, setShouldReduceMotion] = React.useState(
    prefersReducedMotion.current
  )
  React.useEffect(() => {
    const follow = () => setShouldReduceMotion(prefersReducedMotion.current)
    reducedMotionFollowers.add(follow)
    // It may have changed between the first render and now. Only then is it
    // set, so a mount never costs a second render.
    if (prefersReducedMotion.current !== shouldReduceMotion) follow()
    return () => {
      reducedMotionFollowers.delete(follow)
    }
  }, [])
  return shouldReduceMotion
}

// A mouse's main button, or the first finger or pen
const isPrimaryPointer = (event: PointerEvent) =>
  event.pointerType === 'mouse'
    ? typeof event.button !== 'number' || event.button <= 0
    : event.isPrimary !== false

// Framer's `onHoverStart` and `whileHover={{ scale }}` for an element. The
// element scales on the spring framer gives scale by default, and at rest
// its transform is none.
export const useHover = (
  ref: React.RefObject<HTMLElement>,
  onHoverStart: () => void,
  scale?: number
) => {
  const latest = React.useRef({ onHoverStart, scale })
  useIsomorphicLayoutEffect(() => {
    latest.current = { onHoverStart, scale }
  })

  // Moves the element to the size it should be at now
  const resize = React.useRef<() => void>()

  React.useEffect(() => {
    const el = ref.current!
    const size = new MotionValue(1)
    // Whether the pointer is over the element, and the size it was last sent
    // toward. A leave with no enter before it does nothing.
    let over = false
    let target = 1
    resize.current = () => {
      const { scale } = latest.current
      const next = over && scale !== undefined ? scale : 1
      if (next === target) return
      target = next
      animate(size, next, {
        type: 'spring',
        stiffness: 550,
        damping: 30,
        restSpeed: 10,
        onUpdate: (v) => {
          el.style.transform = v === 1 ? 'none' : `scale(${v}) translateZ(0)`
        }
      })
    }
    const hover = (active: boolean) => (event: PointerEvent) => {
      if (!isPrimaryPointer(event)) return
      over = active
      resize.current!()
      if (active) latest.current.onHoverStart()
    }
    const enter = hover(true)
    const leave = hover(false)
    el.addEventListener('pointerenter', enter)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointerenter', enter)
      el.removeEventListener('pointerleave', leave)
      size.stop()
    }
  }, [])

  // A scale given or taken away while the pointer is over the element (say
  // reduced motion was turned on or off) applies at once, as framer's
  // whileHover does, rather than on the next enter or leave
  useIsomorphicLayoutEffect(() => {
    if (resize.current) resize.current()
  }, [scale])
}
