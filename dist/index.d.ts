import * as React from 'react';
interface Props {
    text: string;
    stagger?: number;
    timing?: number | number[];
    variant?: 'roll' | 'flap';
    className?: string;
    style?: React.CSSProperties;
}
export declare const RotatingText: ({ text, timing, stagger, variant, className, style }: Props) => JSX.Element;
export {};
