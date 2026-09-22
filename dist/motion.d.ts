import * as React from 'react';
interface Playback {
    stop: () => void;
}
export declare class MotionValue {
    private current;
    private prev;
    private timeDelta;
    private lastUpdated;
    private listeners;
    private animation;
    constructor(init: number);
    on(_event: 'change', callback: (latest: number) => void): () => void;
    set(v: number): void;
    jump(v: number): void;
    get(): number;
    getVelocity(): number;
    start(startAnimation: (onComplete: () => void) => Playback): Promise<void>;
    stop(): void;
    isAnimating(): boolean;
    private updateAndNotify;
    private scheduleVelocityCheck;
    private velocityCheck;
}
export declare const motionValue: (init: number) => MotionValue;
interface SpringOptions {
    type: 'spring';
    stiffness?: number;
    damping?: number;
    mass?: number;
    velocity?: number;
    restDelta?: number;
    restSpeed?: number;
}
interface TweenOptions {
    type?: undefined;
    duration: number;
    ease: (progress: number) => number;
}
export declare type AnimationOptions = (SpringOptions | TweenOptions) & {
    delay?: number;
    onUpdate?: (latest: number) => void;
    onComplete?: () => void;
    onStop?: () => void;
};
export declare const animate: (from: MotionValue | number, to: number, transition: AnimationOptions) => {
    stop: () => void;
};
export declare const clamp: (min: number, max: number, v: number) => number;
export declare const transform: (input: number[], output: number[], ease?: ((progress: number) => number)[] | undefined) => (v: number) => number;
export declare const useIsomorphicLayoutEffect: typeof React.useEffect;
export declare const useReducedMotion: () => boolean | null;
export declare const useHover: (ref: React.RefObject<HTMLElement | null>, onHoverStart: () => void, scale?: number | undefined) => void;
export {};
