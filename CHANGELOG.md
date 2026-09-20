# Changelog

## Unreleased

### Features

- New `variant="flap"` draws each letter as a split-flap tile: the top half
  falls over a centre hinge, speeding up like anything under gravity, lands
  over the bottom half and bounces twice, each time lower, before it rests.
  Faces are shaded by how squarely they face the light, and the falling flap
  casts a shadow down the bottom half. When `text` changes, each tile flips
  from its old letter to its new one; a change mid-flip is picked up as soon
  as the flap lands. Tiles past the end of shorter text flip to blank before
  they go, and new tiles flip in from blank. Tile colours and sizes are set
  with CSS custom properties (see the README).

### Changes

- The default roll is now a real 3D turn. Each letter rotates like the face of
  a cube with perspective, dims as it turns away, and settles with a small
  overshoot, instead of shrinking and sliding while it rotates flat.
- Hovering again while letters are still moving no longer restarts the flip
  from the beginning; the running flip finishes first.
- With reduced motion on, the text is drawn once instead of as two
  overlapping copies. The hover scale is unchanged.
- The duplicate copies of each letter are hidden from screen readers and
  left out of text selection, so copying the text gives it once.
- Text is split into the characters a reader sees, so an accented letter or
  an emoji with a skin tone stays in one piece.

## 1.0.5 (2026-09-20)

### Fixes

- Letters added after the first render (for example when `text` changes) no
  longer get an undefined animation duration. When `timing` is an array
  shorter than the text, the remaining letters reuse its last entry.
- The container no longer gets a stray `undefined` class when no `className`
  is passed.

### Docs

- The README usage example now uses the named `RotatingText` export and the
  `style` prop, and declares `MyApp` correctly.
- The README documents every prop with its type and default.

### Internal

- Added a Vitest and React Testing Library test suite (`npm test`).
- Dev dependencies now use React 18, matching the `react` peer range.
- Removed the unused Travis config.

## 1.0.4 (2023-02-03)

- Last release before this changelog was started.
