# Rotating Text

> Customizable 3D text hover animation.
> Created using Framer Motion.
> Respects user's Reduced Motion preferences.
> Visit the demo [here](www.rotating-text.vercel.app), optimized for Desktop.

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
import React, { Component } from 'react'

import RotatingText from 'rotating-text'
import 'rotating-text/dist/index.css'

function MyApp {
  return (
    <RotatingText
      text="HOVERME"
      stagger={0.1}
      timing={0.5}
      className="rotating-text"
      styles={{ fontSize: '100px' }}
    />
  )
}
```

## Notes

1. Text wrapping is currently not supported. RotatingText works best with a single word or short phrase, as spaces are ignored.

## License

MIT © [jueungrace](https://github.com/jueungrace)
