# Rotating Text

> Customizable 3D text hover animation.
> Created using Framer Motion.
> Respects user's Reduced Motion preferences.

**[See it live at rotating-text.vercel.app](https://rotating-text.vercel.app/)**, with a playground to try every prop on desktop, tablet or phone.

## Install

```bash
npm install --save rotating-text
```

## Usage

`text` updates the content, ignoring spaces.
`stagger` gives you control over the time between each letter.
`timing` sets the duration of each letter animation. Timing can be a single numeric value OR a custom timing array, with a specific duration for **each letter** in the `text` (e.g. if `text` is OKAY, your custom timing array can look like `[0.1, 0.4, 0.5, 0.1]`).

You can use `className` and `style` to add further customization and styling.

```tsx
import React from 'react'

import { RotatingText } from 'rotating-text'
import 'rotating-text/dist/index.css'

function MyApp() {
  return (
    <RotatingText
      text='HOVERME'
      stagger={0.1}
      timing={0.5}
      className='rotating-text'
      style={{ fontSize: '100px' }}
    />
  )
}
```

### Props

| Prop        | Type                  | Default     | Description                                                               |
| ----------- | --------------------- | ----------- | ------------------------------------------------------------------------- |
| `text`      | `string`              | (required)  | Text to animate.                                                          |
| `stagger`   | `number`              | `0.1`       | Seconds between each letter starting its animation.                       |
| `timing`    | `number \| number[]`  | `0.5`       | Seconds each letter's animation lasts, or one duration per letter.        |
| `variant`   | `'roll' \| 'flap'`    | `'roll'`    | `roll` turns each letter over like a cube; `flap` draws split-flap tiles. |
| `className` | `string`              | `undefined` | Class name added to the outer container.                                  |
| `style`     | `React.CSSProperties` | `undefined` | Inline styles applied to the outer container.                             |

### Split-flap tiles

`variant="flap"` draws every letter on its own tile, split by a seam. On hover or tap the top half of each tile falls over the seam and bounces to rest, like a departures board. When `text` changes, each tile flips from its old letter to its new one, so a board can count, cycle words or follow typing; tiles added or removed flip in from blank or out to blank. A space becomes a blank tile. With reduced motion on, letters change in place without flipping.

The tiles are styled with CSS custom properties, set on `className` or `style`:

| Property           | Default             | Description                                                                                                                                     |
| ------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `--rt-tile`        | `#1d1d1f`           | Tile background.                                                                                                                                |
| `--rt-ink`         | inherited           | Letter colour.                                                                                                                                  |
| `--rt-seam`        | `#000`              | Colour of the seam across the middle.                                                                                                           |
| `--rt-seam-width`  | `max(1px, 0.012em)` | Height of the seam.                                                                                                                             |
| `--rt-gap`         | `0.08em`            | Space between tiles.                                                                                                                            |
| `--rt-radius`      | `0.06em`            | Tile corner radius.                                                                                                                             |
| `--rt-padding`     | `0.08em 0.1em`      | Space around each letter inside its tile.                                                                                                       |
| `--rt-tile-width`  | `0.62em`            | Minimum tile width. Tiles all share the widest one's width; set this to your widest letter to keep the board a fixed width as the text changes. |
| `--rt-perspective` | `3.5em`             | Depth of the flap's 3D fall.                                                                                                                    |

```tsx
<RotatingText text='Departures' variant='flap' className='board' />
```

```css
.board {
  font-size: 80px;
  --rt-tile: #182139;
  --rt-ink: #f1ece1;
}
```

## Notes

1. Text wrapping is currently not supported. RotatingText works best with a single word or short phrase, as spaces are ignored (in the `flap` variant a space is a blank tile).
2. The text flips when the pointer moves onto it, which on a touch screen is a tap. A flip always runs to the end; hovering again mid-flip does nothing.

## License

MIT © [jueungrace](https://github.com/jueungrace)
