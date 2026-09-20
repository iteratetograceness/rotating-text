'use client'

import { RotatingText } from '~/../dist'
import '~/../dist/index.css'

type FlipProps = {
  text: string
  stagger?: number
  timing?: number | number[]
  // Letter tiles are page CSS on className; the component ships plain letters
  tiles?: boolean
  // 'flap' draws the component's own split-flap tiles, coloured by .rt-flap
  variant?: 'roll' | 'flap'
  style?: React.CSSProperties
}

export function Flip({
  text,
  stagger,
  timing,
  tiles = true,
  variant = 'roll',
  style
}: FlipProps) {
  const className =
    variant === 'flap' ? 'rt rt-flap' : tiles ? 'rt rt-tiles' : 'rt'

  // The component renders every letter twice, so callers give screen
  // readers the text once in an sr-only span and this copy is hidden
  return (
    <div aria-hidden='true'>
      <RotatingText
        text={text}
        stagger={stagger}
        timing={timing}
        variant={variant}
        className={className}
        style={style}
      />
    </div>
  )
}
