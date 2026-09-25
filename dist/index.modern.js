import { useLayoutEffect, useEffect, useState, useRef, useMemo, createElement, useReducer, Fragment, memo, useCallback, useDeferredValue as useDeferredValue$1 } from 'react';

function _extends() {
  _extends = Object.assign ? Object.assign.bind() : function (target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          target[key] = source[key];
        }
      }
    }
    return target;
  };
  return _extends.apply(this, arguments);
}
function _unsupportedIterableToArray(o, minLen) {
  if (!o) return;
  if (typeof o === "string") return _arrayLikeToArray(o, minLen);
  var n = Object.prototype.toString.call(o).slice(8, -1);
  if (n === "Object" && o.constructor) n = o.constructor.name;
  if (n === "Map" || n === "Set") return Array.from(o);
  if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
}
function _arrayLikeToArray(arr, len) {
  if (len == null || len > arr.length) len = arr.length;
  for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];
  return arr2;
}
function _createForOfIteratorHelperLoose(o, allowArrayLike) {
  var it = typeof Symbol !== "undefined" && o[Symbol.iterator] || o["@@iterator"];
  if (it) return (it = it.call(o)).next.bind(it);
  if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") {
    if (it) o = it;
    var i = 0;
    return function () {
      if (i >= o.length) return {
        done: true
      };
      return {
        done: false,
        value: o[i++]
      };
    };
  }
  throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}

var TIMESTEP = 1000 / 60;
var MAX_ELAPSED = 40;
var frame = {
  delta: 0,
  timestamp: 0
};
var useDefaultElapsed = true;
var runNextFrame = false;
var isProcessing = false;
var now = function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
};
var onNextFrame = function onNextFrame(callback) {
  if (typeof window !== 'undefined') window.requestAnimationFrame(callback);else setTimeout(function () {
    return callback(now());
  }, TIMESTEP);
};
var createStep = function createStep() {
  var toRun = [];
  var toRunNextFrame = [];
  var keepAlive = new WeakSet();
  var step = {
    schedule: function schedule(job, alive) {
      if (alive === void 0) {
        alive = false;
      }
      if (alive) keepAlive.add(job);
      if (toRunNextFrame.indexOf(job) === -1) toRunNextFrame.push(job);
    },
    cancel: function cancel(job) {
      var index = toRunNextFrame.indexOf(job);
      if (index !== -1) toRunNextFrame.splice(index, 1);
      keepAlive["delete"](job);
    },
    process: function process(data) {
      var _ref = [toRunNextFrame, toRun];
      toRun = _ref[0];
      toRunNextFrame = _ref[1];
      toRunNextFrame.length = 0;
      var count = toRun.length;
      for (var i = 0; i < count; i++) {
        var job = toRun[i];
        job(data);
        if (keepAlive.has(job)) {
          step.schedule(job);
          runNextFrame = true;
        }
      }
    }
  };
  return step;
};
var read = createStep();
var update = createStep();
var postRender = createStep();
var steps = [read, update, postRender];
var processFrame = function processFrame(timestamp) {
  runNextFrame = false;
  frame.delta = useDefaultElapsed ? TIMESTEP : Math.max(Math.min(timestamp - frame.timestamp, MAX_ELAPSED), 1);
  frame.timestamp = timestamp;
  isProcessing = true;
  steps.forEach(function (step) {
    return step.process(frame);
  });
  isProcessing = false;
  if (runNextFrame) {
    useDefaultElapsed = false;
    onNextFrame(processFrame);
  }
};
var frameTime = function frameTime() {
  return frame.timestamp;
};
var startLoop = function startLoop() {
  runNextFrame = true;
  useDefaultElapsed = true;
  if (!isProcessing) onNextFrame(processFrame);
};
var schedule = function schedule(step, job, alive) {
  if (alive === void 0) {
    alive = false;
  }
  if (!runNextFrame) startLoop();
  step.schedule(job, alive);
};
var velocityPerSecond = function velocityPerSecond(velocity, frameDuration) {
  return frameDuration ? velocity * (1000 / frameDuration) : 0;
};
var MotionValue = /*#__PURE__*/function () {
  function MotionValue(init) {
    var _this = this;
    this.timeDelta = 0;
    this.lastUpdated = 0;
    this.listeners = [];
    this.animation = null;
    this.scheduleVelocityCheck = function () {
      return schedule(postRender, _this.velocityCheck);
    };
    this.velocityCheck = function (_ref2) {
      var timestamp = _ref2.timestamp;
      if (timestamp !== _this.lastUpdated) _this.prev = _this.current;
    };
    this.prev = this.current = init;
  }
  var _proto = MotionValue.prototype;
  _proto.on = function on(_event, callback) {
    var _this2 = this;
    var listeners = this.listeners;
    if (listeners.indexOf(callback) === -1) listeners.push(callback);
    return function () {
      var index = listeners.indexOf(callback);
      if (index > -1) listeners.splice(index, 1);
      schedule(read, function () {
        if (!listeners.length) _this2.stop();
      });
    };
  };
  _proto.set = function set(v) {
    this.updateAndNotify(v);
  };
  _proto.jump = function jump(v) {
    this.updateAndNotify(v);
    this.prev = v;
    this.stop();
  };
  _proto.get = function get() {
    return this.current;
  };
  _proto.getVelocity = function getVelocity() {
    return velocityPerSecond(this.current - this.prev, this.timeDelta);
  };
  _proto.start = function start(startAnimation) {
    var _this3 = this;
    this.stop();
    return new Promise(function (resolve) {
      _this3.animation = startAnimation(resolve);
    }).then(function () {
      _this3.animation = null;
    });
  };
  _proto.stop = function stop() {
    if (this.animation) this.animation.stop();
    this.animation = null;
  };
  _proto.isAnimating = function isAnimating() {
    return !!this.animation;
  };
  _proto.updateAndNotify = function updateAndNotify(v) {
    this.prev = this.current;
    this.current = v;
    var delta = frame.delta,
      timestamp = frame.timestamp;
    if (this.lastUpdated !== timestamp) {
      this.timeDelta = delta;
      this.lastUpdated = timestamp;
      schedule(postRender, this.scheduleVelocityCheck);
    }
    if (this.prev !== this.current) {
      var listeners = this.listeners;
      var count = listeners.length;
      for (var i = 0; i < count; i++) {
        var listener = listeners[i];
        if (listener) listener(this.current);
      }
    }
  };
  return MotionValue;
}();
var motionValue = function motionValue(init) {
  return new MotionValue(init);
};
var spring = function spring(origin, target, _ref3) {
  var _ref3$stiffness = _ref3.stiffness,
    stiffness = _ref3$stiffness === void 0 ? 100 : _ref3$stiffness,
    _ref3$damping = _ref3.damping,
    damping = _ref3$damping === void 0 ? 10 : _ref3$damping,
    _ref3$mass = _ref3.mass,
    mass = _ref3$mass === void 0 ? 1 : _ref3$mass,
    _ref3$velocity = _ref3.velocity,
    velocity = _ref3$velocity === void 0 ? 0 : _ref3$velocity,
    restDelta = _ref3.restDelta,
    restSpeed = _ref3.restSpeed;
  var initialVelocity = velocity ? -(velocity / 1000) : 0.0;
  var dampingRatio = damping / (2 * Math.sqrt(stiffness * mass));
  var initialDelta = target - origin;
  var undampedAngularFreq = Math.sqrt(stiffness / mass) / 1000;
  var isGranularScale = Math.abs(initialDelta) < 5;
  var speed = restSpeed || (isGranularScale ? 0.01 : 2);
  var delta = restDelta || (isGranularScale ? 0.005 : 0.5);
  var resolveSpring;
  if (dampingRatio < 1) {
    var angularFreq = undampedAngularFreq * Math.sqrt(1 - dampingRatio * dampingRatio);
    resolveSpring = function resolveSpring(t) {
      var envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
      return target - envelope * ((initialVelocity + dampingRatio * undampedAngularFreq * initialDelta) / angularFreq * Math.sin(angularFreq * t) + initialDelta * Math.cos(angularFreq * t));
    };
  } else if (dampingRatio === 1) {
    resolveSpring = function resolveSpring(t) {
      return target - Math.exp(-undampedAngularFreq * t) * (initialDelta + (initialVelocity + undampedAngularFreq * initialDelta) * t);
    };
  } else {
    var dampedAngularFreq = undampedAngularFreq * Math.sqrt(dampingRatio * dampingRatio - 1);
    resolveSpring = function resolveSpring(t) {
      var envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
      var freqForT = Math.min(dampedAngularFreq * t, 300);
      return target - envelope * ((initialVelocity + dampingRatio * undampedAngularFreq * initialDelta) * Math.sinh(freqForT) + dampedAngularFreq * initialDelta * Math.cosh(freqForT)) / dampedAngularFreq;
    };
  }
  return function (t) {
    var current = resolveSpring(t);
    var currentVelocity = initialVelocity;
    if (t !== 0) {
      if (dampingRatio < 1) {
        var prevT = Math.max(0, t - 5);
        currentVelocity = velocityPerSecond(current - resolveSpring(prevT), t - prevT);
      } else {
        currentVelocity = 0;
      }
    }
    var done = Math.abs(currentVelocity) <= speed && Math.abs(target - current) <= delta;
    return {
      done: done,
      value: done ? target : current
    };
  };
};
var tween = function tween(origin, target, _ref4) {
  var duration = _ref4.duration,
    ease = _ref4.ease;
  var along = transform([0 * duration, 1 * duration], [origin, target], [ease]);
  return function (t) {
    return {
      value: along(t),
      done: t >= duration
    };
  };
};
var animate = function animate(from, to, transition) {
  var value = from instanceof MotionValue ? from : new MotionValue(from);
  value.start(function (resolve) {
    var options = _extends({
      velocity: value.getVelocity()
    }, transition);
    var onUpdate = transition.onUpdate,
      onComplete = transition.onComplete,
      onStop = transition.onStop;
    var origin = value.get();
    var next = options.type === 'spring' ? spring(origin, to, options) : tween(origin, to, _extends({}, options, {
      duration: options.duration ? options.duration * 1000 : options.duration
    }));
    var elapsed = 0 - (transition.delay || 0) * 1000;
    var isComplete = false;
    var state = {
      done: false,
      value: origin
    };
    var run = function run(_ref5) {
      var delta = _ref5.delta;
      elapsed += delta;
      if (!isComplete) {
        state = next(Math.max(0, elapsed));
        isComplete = state.done;
      }
      value.set(state.value);
      if (onUpdate) onUpdate(state.value, elapsed);
      if (isComplete) {
        update.cancel(run);
        resolve();
        if (onComplete) onComplete();
      }
    };
    schedule(update, run, true);
    return {
      stop: function stop() {
        if (onStop) onStop();
        update.cancel(run);
      }
    };
  });
  return {
    stop: function stop() {
      return value.stop();
    }
  };
};
var clamp = function clamp(min, max, v) {
  return Math.min(Math.max(v, min), max);
};
var mix = function mix(from, to, progress) {
  return -progress * from + progress * to + from;
};
var progress = function progress(from, to, value) {
  var toFromDifference = to - from;
  return toFromDifference === 0 ? 1 : (value - from) / toFromDifference;
};
var transform = function transform(input, output, ease) {
  var inputLength = input.length;
  if (input[0] > input[inputLength - 1]) {
    input = [].concat(input).reverse();
    output = [].concat(output).reverse();
  }
  var mixers = output.slice(0, -1).map(function (from, i) {
    var to = output[i + 1];
    var easing = ease && ease[i];
    return easing ? function (p) {
      return mix(from, to, easing(p));
    } : function (p) {
      return mix(from, to, p);
    };
  });
  var numMixers = mixers.length;
  return function (v) {
    v = clamp(input[0], input[inputLength - 1], v);
    var i = 0;
    if (numMixers > 1) {
      for (; i < inputLength - 2; i++) {
        if (v < input[i + 1]) break;
      }
    }
    return mixers[i](progress(input[i], input[i + 1], v));
  };
};
var useIsomorphicLayoutEffect = typeof document !== 'undefined' ? useLayoutEffect : useEffect;
var prefersReducedMotion = {
  current: null
};
var reducedMotionFollowers = new Set();
var hasReducedMotionListener = false;
var initPrefersReducedMotion = function initPrefersReducedMotion() {
  hasReducedMotionListener = true;
  if (typeof document === 'undefined') return;
  if (window.matchMedia) {
    var query = window.matchMedia('(prefers-reduced-motion)');
    var setPreference = function setPreference() {
      prefersReducedMotion.current = query.matches;
      reducedMotionFollowers.forEach(function (follow) {
        return follow();
      });
    };
    if (query.addEventListener) query.addEventListener('change', setPreference);else query.addListener(setPreference);
    setPreference();
  } else {
    prefersReducedMotion.current = false;
  }
};
var useReducedMotion = function useReducedMotion() {
  if (!hasReducedMotionListener) initPrefersReducedMotion();
  var _React$useState = useState(prefersReducedMotion.current),
    shouldReduceMotion = _React$useState[0],
    setShouldReduceMotion = _React$useState[1];
  useEffect(function () {
    var follow = function follow() {
      return setShouldReduceMotion(prefersReducedMotion.current);
    };
    reducedMotionFollowers.add(follow);
    if (prefersReducedMotion.current !== shouldReduceMotion) follow();
    return function () {
      reducedMotionFollowers["delete"](follow);
    };
  }, []);
  return shouldReduceMotion;
};
var isPrimaryPointer = function isPrimaryPointer(event) {
  return event.pointerType === 'mouse' ? typeof event.button !== 'number' || event.button <= 0 : event.isPrimary !== false;
};
var useHover = function useHover(ref, onHoverStart, scale) {
  var latest = useRef({
    onHoverStart: onHoverStart,
    scale: scale
  });
  useIsomorphicLayoutEffect(function () {
    latest.current = {
      onHoverStart: onHoverStart,
      scale: scale
    };
  });
  var resize = useRef(undefined);
  useEffect(function () {
    var el = ref.current;
    var size = new MotionValue(1);
    var over = false;
    var target = 1;
    resize.current = function () {
      var scale = latest.current.scale;
      var next = over && scale !== undefined ? scale : 1;
      if (next === target) return;
      target = next;
      animate(size, next, {
        type: 'spring',
        stiffness: 550,
        damping: 30,
        restSpeed: 10,
        onUpdate: function onUpdate(v) {
          el.style.transform = v === 1 ? 'none' : "scale(" + v + ") translateZ(0)";
        }
      });
    };
    var hover = function hover(active) {
      return function (event) {
        if (!isPrimaryPointer(event)) return;
        over = active;
        resize.current();
        if (active) latest.current.onHoverStart();
      };
    };
    var enter = hover(true);
    var leave = hover(false);
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    return function () {
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
      size.stop();
    };
  }, []);
  useIsomorphicLayoutEffect(function () {
    if (resize.current) resize.current();
  }, [scale]);
};

var styles = {"container":"_p6aGD","front":"_2ilYQ","back":"_uQNyq","text":"_32Dfs","face":"_3fNHM","placeholder":"_3HCUh","board":"_1_y2_","tile":"_1wa55","sizer":"_2mmHj","half":"_Nsxbx","readable":"_1Gz1Q","top":"_DeXoq","bottom":"_YO7Gy","flap":"_2OAp6","leaf":"_3WYvH","underside":"_1aEQP","shade":"_1QeiK","shadow":"_3IP-G"};

var ROLL_DAMPING = 0.65;
var ROLL_REST = 0.5;
var rollSpring = function rollSpring(seconds) {
  var time = seconds > 0 ? seconds : 0.01;
  var decay = Math.log(90 / ROLL_REST / Math.sqrt(1 - Math.pow(ROLL_DAMPING, 2))) / time;
  var frequency = decay / ROLL_DAMPING;
  return {
    type: 'spring',
    stiffness: Math.pow(frequency, 2),
    damping: 2 * decay,
    mass: 1,
    velocity: 0,
    restDelta: ROLL_REST,
    restSpeed: frequency * ROLL_REST
  };
};
var rollTransform = function rollTransform(rotateX, depth) {
  return "perspective(4em) translateZ(calc(-1 * " + depth + ")) rotateX(" + rotateX + "deg) translateZ(" + depth + ")";
};
var ROLL_SHADE_ANGLES = [-85, -60, 0, 60, 85];
var ROLL_SHADE = [0, 0.75, 1, 0.75, 0];
var rollShade = transform(ROLL_SHADE_ANGLES, ROLL_SHADE);
var rollPose = function rollPose(turned, shade, depth) {
  return turned === 0 ? 'perspective(4em)' : shade ? rollTransform(turned, depth) : 'scaleY(0)';
};
var DEPTH = 'var(--rt-depth)';
var readDepth = function readDepth(row) {
  var face = row && row.firstElementChild;
  var depth = face && getComputedStyle(face).getPropertyValue('--rt-depth');
  var literal = depth && depth.trim();
  return literal && typeof CSS !== 'undefined' && CSS.supports('transform', rollTransform(0, literal)) ? literal : DEPTH;
};
var WIDTH_REST = 0.1;
var WIDTH_PACE = 7.5 / Math.E / 60;
var widthSpring = function widthSpring(seconds, distance, velocity) {
  var frequency = 7.5 / seconds;
  var stiffness = Math.pow(frequency, 2);
  var fastest = frequency * Math.abs(distance);
  var toward = velocity * Math.sign(distance);
  return {
    type: 'spring',
    stiffness: stiffness,
    damping: 2 * Math.sqrt(stiffness),
    mass: 1,
    velocity: toward > fastest ? fastest * Math.sign(distance) : velocity,
    restDelta: WIDTH_REST
  };
};
var PUSH = 0.25;
var GRAVITY = 2 * (1 - PUSH);
var IMPACT = PUSH + GRAVITY;
var RESTITUTION = 0.27;
var BOUNCES = [1, 2].map(function (n) {
  var speed = IMPACT * Math.pow(RESTITUTION, n);
  return {
    speed: speed,
    time: 2 * speed / GRAVITY
  };
});
var SETTLE_TIME = BOUNCES.reduce(function (sum, bounce) {
  return sum + bounce.time;
}, 0);
var FALL_SHARE = 1 / (1 + SETTLE_TIME);
var BOUNCE_HEIGHT = Math.pow(BOUNCES[0].speed, 2) / (2 * GRAVITY);
var fallEase = function fallEase(t) {
  return PUSH * t + GRAVITY / 2 * t * t;
};
var settleEase = function settleEase(t) {
  var s = t * SETTLE_TIME;
  for (var _iterator = _createForOfIteratorHelperLoose(BOUNCES), _step; !(_step = _iterator()).done;) {
    var _step$value = _step.value,
      speed = _step$value.speed,
      time = _step$value.time;
    if (s <= time) return (speed * s - GRAVITY / 2 * s * s) / BOUNCE_HEIGHT;
    s -= time;
  }
  return 0;
};
var LIGHT = 20 * Math.PI / 180;
var AMBIENT = 0.4;
var SHADOW = 0.5;
var lit = function lit(facing) {
  return AMBIENT + (1 - AMBIENT) * Math.max(0, facing);
};
var shade = function shade(facing) {
  return Math.max(0, 1 - lit(facing) / lit(Math.cos(LIGHT)));
};
var LEAD = 3 * MAX_ELAPSED;
var REVEALS = 4;
var reveals = {
  at: -1,
  left: 0
};
var reveal = function reveal() {
  var now = frameTime();
  if (reveals.at !== now) {
    reveals.at = now;
    reveals.left = REVEALS;
  }
  if (!reveals.left) return false;
  reveals.left--;
  return true;
};
var RotatingText = function RotatingText(_ref) {
  var text = _ref.text,
    _ref$timing = _ref.timing,
    timing = _ref$timing === void 0 ? 0.5 : _ref$timing,
    _ref$stagger = _ref.stagger,
    stagger = _ref$stagger === void 0 ? 0.1 : _ref$stagger,
    _ref$variant = _ref.variant,
    variant = _ref$variant === void 0 ? 'roll' : _ref$variant,
    className = _ref.className,
    style = _ref.style;
  var prefersReducedMotion = useReducedMotion();
  var still = !!prefersReducedMotion;
  var startRoll = useRef(undefined);
  var startFlap = useRef(undefined);
  var duration = function duration(i) {
    return Array.isArray(timing) ? timing[Math.min(i, timing.length - 1)] : timing;
  };
  var letters = useMemo(function () {
    return splitLetters(text);
  }, [text]);
  var flip = function flip() {
    if (still) return;
    var start = variant === 'flap' ? startFlap.current : startRoll.current;
    if (start) start();
  };
  var root = useRef(null);
  useHover(root, flip, still ? 1.05 : undefined);
  var rootClass = [styles.container, variant === 'flap' ? styles.board : '', className].filter(Boolean).join(' ');
  return createElement("div", {
    className: rootClass,
    ref: root,
    style: style
  }, variant === 'flap' ? createElement(FlapBoard, {
    letters: letters,
    duration: duration,
    stagger: stagger,
    still: still,
    startRef: startFlap
  }) : createElement(RollFaces, {
    letters: letters,
    duration: duration,
    stagger: stagger,
    still: still,
    startRef: startRoll
  }));
};
var useDeferredValue = useDeferredValue$1;
var splitLetters = function splitLetters(text) {
  var Segmenter = Intl.Segmenter;
  return Segmenter ? Array.from(new Segmenter().segment(text), function (part) {
    return part.segment;
  }) : Array.from(text);
};
var createAngle = function createAngle() {
  return motionValue(0);
};
var RollFaces = function RollFaces(_ref2) {
  var letters = _ref2.letters,
    duration = _ref2.duration,
    stagger = _ref2.stagger,
    still = _ref2.still,
    startRef = _ref2.startRef;
  var angles = useRef([]).current;
  var _React$useState = useState(function () {
      return new Set();
    }),
    turning = _React$useState[0];
  var _React$useState2 = useState(function () {
      return new Set();
    }),
    hovered = _React$useState2[0];
  var _React$useState3 = useState(function () {
      return new Set();
    }),
    moved = _React$useState3[0];
  var faces = useRef({
    front: letters,
    back: letters
  }).current;
  var landing = useRef(false);
  var syncing = useRef(false);
  var latest = useRef(letters);
  var depth = useRef(DEPTH);
  var _React$useReducer = useReducer(function (n) {
      return n + 1;
    }, 0),
    rerender = _React$useReducer[1];
  var update = function update() {
    return Promise.resolve().then(rerender);
  };
  var next = still ? {
    front: letters,
    back: letters
  } : plan(faces, letters, angles, landing.current);
  while (angles.length < next.front.length) angles.push(createAngle());
  var word = letters.join('');
  var was = next.front.join('');
  var coming = next.back.join('');
  var width = useEasedWidth([word, was, coming].join('\n'), was !== word || coming !== word, duration(0), Math.max(0, (next.back.length - 1) * stagger), still);
  var finish = function finish() {
    if (landing.current || syncing.current || turning.size) return;
    if (!moved.size && faces.front.every(function (_char, i) {
      return _char === faces.back[i];
    })) return;
    landing.current = true;
    update();
  };
  var rested = function rested(angle) {
    turning["delete"](angle);
    hovered["delete"](angle);
    var i = angles.indexOf(angle);
    if (i >= 0 && faces.front[i] === faces.back[i] && !moved.has(angle)) {
      if (angle.get() !== 0) angle.jump(0);
    }
    var text = latest.current;
    var count = Math.max(text.length, faces.back.length);
    for (var j = 0; j < count; j++) {
      if ((faces.back[j] || '') !== (text[j] || '')) {
        update();
        break;
      }
    }
    finish();
  };
  var turn = function turn(angle, i, delay) {
    turning.add(angle);
    var over = false;
    animate(angle, -90, _extends({}, rollSpring(duration(i)), {
      delay: delay,
      onComplete: function onComplete() {
        over = true;
        rested(angle);
      },
      onStop: function onStop() {
        if (over) return;
        over = true;
        angle.set(0);
        rested(angle);
      }
    }));
  };
  var sync = function sync() {
    var landed = landing.current;
    landing.current = false;
    var changed = word !== latest.current.join('');
    latest.current = letters;
    var bringing = faces.back;
    faces.front = next.front;
    faces.back = next.back;
    if (landed || still) moved.clear();
    angles.splice(next.front.length).forEach(function (a) {
      moved["delete"](a);
      a.stop();
    });
    if (landed || still) {
      angles.forEach(function (angle) {
        angle.stop();
        if (angle.get() !== 0) angle.jump(0);
      });
    }
    if (still) return;
    var reflowed = landed || bringing.length !== next.back.length || next.back.some(function (_char2, i) {
      return _char2 !== bringing[i];
    });
    var starts = reflowed && next.front.some(function (_char3, i) {
      return _char3 !== next.back[i];
    }) && [width.front.current, width.back.current].map(offsets);
    var first = -1;
    next.front.forEach(function (_char4, i) {
      var angle = angles[i];
      if (angle.get() !== 0) return;
      if (reflowed) {
        if (starts && Math.abs(starts[0][i] - starts[1][i]) > 0.5) moved.add(angle);else moved["delete"](angle);
      }
      var needed = _char4 !== next.back[i] || moved.has(angle);
      if (turning.has(angle)) {
        if (!needed && !hovered.has(angle)) angle.stop();
      } else if (needed) {
        if (first < 0) {
          first = changed ? 0 : i;
          depth.current = readDepth(width.front.current);
        }
        turn(angle, i, (i - first) * stagger);
      }
    });
  };
  useIsomorphicLayoutEffect(function () {
    if (!still && !sameFaces(next, plan(faces, letters, angles, landing.current))) {
      rerender();
      return;
    }
    syncing.current = true;
    try {
      sync();
    } finally {
      syncing.current = false;
    }
    finish();
    var slots = angles.slice();
    startRef.current = function () {
      if (turning.size || landing.current) return;
      depth.current = readDepth(width.front.current);
      slots.forEach(function (angle, i) {
        hovered.add(angle);
        turn(angle, i, i * stagger);
      });
    };
  });
  useEffect(function () {
    return function () {
      startRef.current = undefined;
      angles.forEach(function (a) {
        return a.stop();
      });
    };
  }, []);
  return createElement(Fragment, null, createElement("div", {
    className: styles.text,
    ref: width.text
  }, word), createElement("div", {
    className: styles.front,
    "aria-hidden": 'true',
    ref: width.front
  }, next.front.map(function (_char5, i) {
    return createElement(RollLetter, {
      key: i,
      "char": _char5,
      angle: angles[i],
      offset: 0,
      depth: depth
    });
  })), createElement("div", {
    className: styles.back,
    "aria-hidden": 'true',
    ref: width.back
  }, next.back.map(function (_char6, i) {
    return createElement(RollLetter, {
      key: i,
      "char": _char6,
      angle: angles[i],
      offset: 90,
      depth: depth
    });
  })), createElement("div", {
    className: styles.placeholder,
    ref: width.placeholder
  }, word));
};
var plan = function plan(faces, letters, angles, landing) {
  var front = [];
  var back = [];
  var count = Math.max(letters.length, faces.front.length);
  var shown = -1;
  for (var i = 0; i < faces.front.length && i < angles.length; i++) {
    if (angles[i].get() !== 0) shown = i;
  }
  for (var _i = 0; _i < count; _i++) {
    var bringing = _i < faces.back.length ? faces.back[_i] : '';
    var free = landing || _i > shown;
    front.push(landing ? bringing : _i < faces.front.length ? faces.front[_i] : '');
    back.push(free ? _i < letters.length ? letters[_i] : '' : bringing);
  }
  while (front.length > letters.length && !front[front.length - 1] && !back[back.length - 1]) {
    front.pop();
    back.pop();
  }
  return {
    front: front,
    back: back
  };
};
var sameFaces = function sameFaces(a, b) {
  return a.front.length === b.front.length && a.front.every(function (_char7, i) {
    return _char7 === b.front[i] && a.back[i] === b.back[i];
  });
};
var offsets = function offsets(row) {
  var along = 0;
  return Array.from(row.children, function (letter) {
    var start = along;
    along += parseFloat(getComputedStyle(letter).width) || 0;
    return start;
  });
};
var useEasedWidth = function useEasedWidth(size, holding, seconds, span, still) {
  var placeholder = useRef(null);
  var front = useRef(null);
  var back = useRef(null);
  var text = useRef(null);
  var _React$useState4 = useState(function () {
      return motionValue(0);
    }),
    eased = _React$useState4[0];
  var natural = useRef(NaN);
  var heading = useRef({
    rows: [0, 0],
    rtl: false,
    reach: 0
  });
  var paint = function paint(px) {
    if (!placeholder.current || !front.current || !back.current) return;
    placeholder.current.style.width = px + "px";
    var _heading$current = heading.current,
      rows = _heading$current.rows,
      rtl = _heading$current.rtl,
      reach = _heading$current.reach;
    [front.current, back.current].forEach(function (row, i) {
      var left = Math.max(0, rows[i] - px);
      var cut = left < reach ? 2 * left - reach : left;
      row.style.clipPath = rtl ? "inset(-1000px -1000px -1000px " + cut + "px)" : "inset(-1000px " + cut + "px -1000px -1000px)";
    });
  };
  var release = function release() {
    for (var _i2 = 0, _arr = [placeholder.current, front.current, back.current]; _i2 < _arr.length; _i2++) {
      var el = _arr[_i2];
      if (el) el.style.width = el.style.clipPath = '';
    }
    if (text.current) text.current.style.pointerEvents = '';
  };
  useIsomorphicLayoutEffect(function () {
    if (still) {
      eased.stop();
      release();
      natural.current = NaN;
      return;
    }
    var el = placeholder.current;
    var from = eased.isAnimating() ? eased.get() : natural.current;
    el.style.width = '';
    var word = parseFloat(getComputedStyle(el).width);
    var rows = [front.current, back.current].map(function (row) {
      return parseFloat(getComputedStyle(row).width);
    });
    var mixed = holding && back.current.textContent !== el.textContent;
    var to = !holding ? word : mixed ? Math.max(word, rows[0] || 0, rows[1] || 0) : word + Math.max(0, rows[0] - rows[1] || 0);
    natural.current = to;
    var held = to - word >= WIDTH_REST;
    var easing = seconds > 0 && Math.abs(to - from) >= WIDTH_REST;
    if (!easing && !held) {
      eased.stop();
      release();
      return;
    }
    var _getComputedStyle = getComputedStyle(el),
      direction = _getComputedStyle.direction,
      fontSize = _getComputedStyle.fontSize;
    heading.current = {
      rows: rows,
      rtl: direction === 'rtl',
      reach: parseFloat(fontSize) / 4 || 0
    };
    if (!easing) {
      eased.stop();
      paint(to);
      return;
    }
    if (to > from) text.current.style.pointerEvents = 'none';
    var velocity = eased.isAnimating() ? eased.getVelocity() : 0;
    if (!eased.isAnimating()) eased.jump(from);
    paint(eased.get());
    var distance = Math.abs(to - eased.get());
    var time = mixed ? Math.max(seconds, Math.min(span, distance * WIDTH_PACE)) : seconds;
    animate(eased, to, _extends({}, widthSpring(time, to - eased.get(), velocity), {
      onUpdate: paint,
      onComplete: held ? undefined : release
    }));
  }, [size, still]);
  useIsomorphicLayoutEffect(function () {
    return function () {
      return eased.stop();
    };
  }, []);
  useEffect(function () {
    var el = placeholder.current;
    var Observer = window.ResizeObserver;
    var resized = Observer && new Observer(function (_ref3) {
      var entry = _ref3[0];
      if (eased.isAnimating()) return;
      natural.current = el.getClientRects().length ? entry.contentRect.width : NaN;
    });
    if (resized) resized.observe(el);
    return function () {
      if (resized) resized.disconnect();
    };
  }, []);
  return {
    placeholder: placeholder,
    front: front,
    back: back,
    text: text
  };
};
var RollLetter = memo(function RollLetter(_ref4) {
  var _char8 = _ref4["char"],
    angle = _ref4.angle,
    offset = _ref4.offset,
    depth = _ref4.depth;
  var face = useRef(null);
  useIsomorphicLayoutEffect(function () {
    var pose = face.current.style.transform;
    var shade = face.current.style.opacity;
    var follow = function follow(a) {
      var el = face.current;
      if (!el) return;
      var turned = a + offset;
      var opacity = rollShade(turned);
      var next = rollPose(turned, opacity, depth.current);
      if (next !== pose) el.style.transform = pose = next;
      if (String(opacity) !== shade) el.style.opacity = shade = String(opacity);
    };
    follow(angle.get());
    return angle.on('change', follow);
  }, [angle, offset]);
  return createElement("span", {
    className: styles.face,
    ref: face,
    style: {
      transform: rollPose(offset, rollShade(offset), DEPTH),
      opacity: rollShade(offset)
    }
  }, _char8);
});
var FlapBoard = function FlapBoard(_ref5) {
  var latest = _ref5.letters,
    duration = _ref5.duration,
    stagger = _ref5.stagger,
    still = _ref5.still,
    startRef = _ref5.startRef;
  var letters = useDeferredValue(latest);
  var _React$useState5 = useState(letters.length),
    slots = _React$useState5[0],
    setSlots = _React$useState5[1];
  var count = still ? letters.length : Math.max(slots, letters.length);
  var _React$useState6 = useState(function () {
      return new Set();
    }),
    gone = _React$useState6[0];
  var length = useRef(letters.length);
  var trim = function trim(n) {
    while (n > length.current && gone.has(n - 1)) n--;
    return n;
  };
  useIsomorphicLayoutEffect(function () {
    length.current = Math.max(letters.length, latest.length);
    gone.forEach(function (i) {
      if (i < length.current) gone["delete"](i);
    });
    setSlots(trim(count));
  }, [count, letters.length, latest.length]);
  var mounted = useRef(false);
  useEffect(function () {
    mounted.current = true;
  }, []);
  var blank = useCallback(function (i) {
    gone.add(i);
    setSlots(trim);
  }, []);
  var _React$useState7 = useState(function () {
      return [];
    }),
    hovers = _React$useState7[0];
  var _React$useState8 = useState(0),
    hovered = _React$useState8[0],
    setHovered = _React$useState8[1];
  var started = useRef(0);
  useIsomorphicLayoutEffect(function () {
    startRef.current = function () {
      return setHovered(function (n) {
        return n + 1;
      });
    };
    return function () {
      startRef.current = undefined;
    };
  }, []);
  useIsomorphicLayoutEffect(function () {
    if (hovered === started.current) return;
    started.current = hovered;
    hovers.forEach(function (start) {
      return start && start();
    });
  }, [hovered]);
  return createElement(Fragment, null, Array.from({
    length: count
  }, function (_, i) {
    return createElement(FlapTile, {
      key: i,
      index: i,
      "char": i < letters.length ? letters[i] : ' ',
      duration: duration(i),
      delay: i * stagger,
      hovers: hovers,
      still: still,
      mounted: mounted,
      onBlank: i < letters.length ? undefined : blank
    });
  }));
};
var FlapTile = memo(function FlapTile(_ref6) {
  var _char9 = _ref6["char"],
    duration = _ref6.duration,
    delay = _ref6.delay,
    hovers = _ref6.hovers,
    still = _ref6.still,
    mounted = _ref6.mounted,
    index = _ref6.index,
    onBlank = _ref6.onBlank;
  var _React$useState9 = useState(function () {
      var first = mounted.current && !still ? ' ' : _char9;
      return {
        from: first,
        to: first,
        falling: false,
        held: false,
        turn: 0,
        settled: 0
      };
    }),
    faces = _React$useState9[0],
    setFaces = _React$useState9[1];
  var shown = useRef(faces.to);
  var wanted = useRef(_char9);
  var busy = useRef(false);
  var falling = useRef(false);
  var wait = useRef(0);
  var bringing = useRef(_char9);
  var running = useRef(undefined);
  var seconds = useRef(duration);
  var leave = useRef(onBlank);
  var rendered = useRef(faces);
  var pending = useRef(false);
  useIsomorphicLayoutEffect(function () {
    rendered.current = faces;
    pending.current = false;
    seconds.current = duration >= 0 ? duration : 0.5;
    leave.current = onBlank;
  });
  var change = function change(next) {
    pending.current = true;
    setFaces(next);
  };
  var early = function early(delay) {
    return delay * 1000 > LEAD + MAX_ELAPSED;
  };
  if (!still && !busy.current && _char9 !== shown.current && (faces.from !== shown.current || faces.to !== _char9)) {
    setFaces(_extends({}, faces, {
      from: shown.current,
      to: _char9,
      falling: false,
      held: early(delay)
    }));
  }
  var showing = function showing(from, to) {
    var f = rendered.current;
    return !pending.current && f.from === from && f.to === to;
  };
  var tile = useRef(null);
  var flap = useRef(null);
  var front = useRef(null);
  var back = useRef(null);
  var shadow = useRef(null);
  var painted = useRef(0);
  var _React$useState0 = useState(function () {
      return new Map();
    }),
    written = _React$useState0[0];
  var write = function write(el, key, name, value) {
    if (written.get(key) === value) return;
    written.set(key, value);
    el.style.setProperty(name, value);
  };
  var dim = function dim(face, key, amount) {
    return write(face, key, 'filter', amount ? "brightness(" + (1 - amount) + ")" : '');
  };
  var paint = function paint(rotateX) {
    if (!flap.current || rotateX === painted.current) return;
    painted.current = rotateX;
    var turning = rotateX !== 0;
    if (tile.current.hasAttribute('data-turning') !== turning) tile.current.toggleAttribute('data-turning', turning);
    var angle = -rotateX * Math.PI / 180;
    var facing = Math.cos(angle - LIGHT);
    write(flap.current, 'flap', 'transform', "rotateX(" + rotateX + "deg)");
    dim(front.current, 'front', turning ? shade(facing) : 0);
    dim(back.current, 'back', turning ? shade(-facing) : 0);
    var reach = Math.sin(angle) * Math.tan(LIGHT) - Math.cos(angle);
    write(shadow.current, 'reach', 'transform', "scaleY(" + clamp(0, 1, reach) + ")");
    write(shadow.current, 'fade', 'opacity', String(SHADOW * clamp(0, 1, (180 + rotateX) / 12)));
  };
  var turn = function turn(delay) {
    busy.current = true;
    falling.current = false;
    wait.current = delay;
    bringing.current = wanted.current;
    if (showing(shown.current, wanted.current)) return fall();
    change(function (f) {
      return _extends({}, f, {
        from: shown.current,
        to: wanted.current,
        falling: false,
        held: wanted.current !== shown.current && early(delay),
        turn: f.turn + 1
      });
    });
  };
  var settle = function settle(letter) {
    if (showing(letter, letter)) return settled();
    change(function (f) {
      return _extends({}, f, {
        from: letter,
        to: letter,
        falling: false,
        held: false,
        settled: f.settled + 1
      });
    });
  };
  var restingBlank = function restingBlank() {
    if (leave.current && shown.current === ' ' && wanted.current === ' ') leave.current(index);
  };
  useIsomorphicLayoutEffect(function () {
    wanted.current = _char9;
    if (still) {
      shown.current = _char9;
      if (busy.current || faces.from !== _char9 || faces.to !== _char9) settle(_char9);
    } else if (!busy.current) {
      if (_char9 !== shown.current) turn(delay);else restingBlank();
    } else if (!falling.current) {
      if (_char9 !== shown.current) {
        bringing.current = _char9;
        change(function (f) {
          return _extends({}, f, {
            to: _char9,
            falling: false
          });
        });
      } else settle(_char9);
    }
  }, [_char9, still, onBlank]);
  useIsomorphicLayoutEffect(function () {
    var hover = function hover() {
      if (!busy.current && !leave.current) turn(delay);
    };
    hovers[index] = hover;
    return function () {
      if (hovers[index] === hover) hovers[index] = undefined;
    };
  });
  var fall = function fall() {
    paint(0);
    var changing = function changing() {
      return bringing.current !== shown.current;
    };
    var land = function land() {
      if (changing()) change(function (f) {
        return _extends({}, f, {
          from: f.to
        });
      });
      shown.current = bringing.current;
      if (wanted.current !== shown.current) return turn(0);
      running.current = animate(-180, -180 + 180 * BOUNCE_HEIGHT, {
        duration: seconds.current * (1 - FALL_SHARE),
        ease: settleEase,
        onUpdate: paint,
        onComplete: function onComplete() {
          return settle(shown.current);
        }
      });
    };
    running.current = animate(0, -180, {
      duration: seconds.current * FALL_SHARE,
      delay: wait.current,
      ease: fallEase,
      onUpdate: function onUpdate(rotateX, elapsed) {
        if (!falling.current && rotateX < 0) {
          falling.current = true;
          if (changing()) change(function (f) {
            return _extends({}, f, {
              falling: true,
              held: false
            });
          });
        } else if (rendered.current.held && !pending.current) {
          if (elapsed > -LEAD || reveal()) {
            change(function (f) {
              return _extends({}, f, {
                held: false
              });
            });
          }
        }
        paint(rotateX);
      },
      onComplete: land
    });
  };
  useIsomorphicLayoutEffect(function () {
    if (faces.turn) fall();
  }, [faces.turn]);
  var settled = function settled() {
    if (running.current) running.current.stop();
    paint(0);
    busy.current = false;
    if (wanted.current !== shown.current) turn(0);else restingBlank();
  };
  useIsomorphicLayoutEffect(function () {
    if (faces.settled) settled();
  }, [faces.settled]);
  useEffect(function () {
    return function () {
      if (running.current) running.current.stop();
      busy.current = false;
      falling.current = false;
    };
  }, []);
  var was = faces.falling && faces.from !== faces.to ? faces.from : undefined;
  var to = faces.held ? faces.from : faces.to;
  return createElement("span", {
    className: styles.tile,
    ref: tile
  }, createElement("span", {
    className: styles.sizer,
    "data-was": was
  }, faces.falling ? faces.to : faces.from), createElement("span", {
    className: styles.half + " " + styles.top + " " + styles.readable
  }, to), createElement("span", {
    className: styles.half + " " + styles.bottom,
    "aria-hidden": 'true'
  }, faces.from, createElement("span", {
    className: styles.shade
  }, createElement("span", {
    ref: shadow,
    className: styles.shadow
  }))), createElement("span", {
    "aria-hidden": 'true',
    className: styles.flap,
    ref: flap
  }, createElement("span", {
    ref: front,
    className: styles.half + " " + styles.top + " " + styles.leaf
  }, faces.from), createElement("span", {
    ref: back,
    className: styles.half + " " + styles.bottom + " " + styles.leaf + " " + styles.underside
  }, to)));
});

export { RotatingText };
//# sourceMappingURL=index.modern.js.map
