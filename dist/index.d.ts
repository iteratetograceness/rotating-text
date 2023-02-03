import * as React from 'react';
interface Props {
    text: string;
    stagger?: number;
    timing?: number | number[];
    className?: string;
    style?: React.CSSProperties;
}
export declare const RotatingText: ({ text, timing, stagger, className, style }: Props) => JSX.Element;
export {};
