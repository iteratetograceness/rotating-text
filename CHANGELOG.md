# Changelog

## 1.1.0 (2026-09-21)

### Features

- New `variant="flap"` draws each letter as a split-flap tile: the top half
  falls over a centre hinge, speeding up like anything under gravity, lands
  over the bottom half and bounces twice, each time lower, before it rests.
  Faces are shaded by how squarely they face the light, and the falling flap
  casts a shadow down the bottom half. When `text` changes, each tile flips
  from its old letter to its new one; a change mid-flip is picked up as soon
  as the flap lands. Tiles past the end of shorter text flip to blank before
  they go, and new tiles flip in from blank. Every tile is as wide as the
  widest capitals (`M` and `W`), so new text never resizes the board. Tile colours
  and sizes are set with CSS custom properties (see the README).

### Changes

- The default roll is now a real 3D turn. Each letter rotates like the face of
  a cube with perspective, dims as it turns away, and settles with a small
  overshoot, instead of shrinking and sliding while it rotates flat.
- A text change on the roll turns each changed letter over to its new one,
  like the flap, instead of swapping the text at once. The old letter rolls
  away with the new one on the face behind it, in the usual stagger and
  spring, and letters pushed along by a wider or narrower one turn too;
  letters added or removed turn in from blank or out to blank. Letters still
  turning when the text changes again finish, then turn on to the newest
  text once the others have landed. With reduced motion on, the text still
  changes at once.
- The roll is driven by a damped spring: a letter leaves the moment it is
  hovered, swings about 6 degrees past the next face and settles within its
  `timing`. For the same `timing` the turn itself is quicker than before, and
  the rest of the time goes on settling. The copy on the next face is locked
  to it, so the two faces can never come apart.
- Changing `text` while letters are rolling no longer snaps the changed
  letters back to rest part way through their turn. They finish their turn
  and then turn on to the new text, and a letter that comes back later
  starts at rest.
- After a flip the letters come to rest on their front faces, so selecting
  and copying the text works the same before and after a hover.
- Hovering again while letters are still moving no longer restarts the flip
  from the beginning; the running flip finishes first.
- With reduced motion on, the text is drawn once instead of as two
  overlapping copies. The hover scale is unchanged.
- The duplicate copies of each letter are hidden from screen readers and
  left out of text selection, so copying the text gives it once.
- Rolling letters are plain elements that follow their angle directly
  instead of motion components, so a turn costs no React work per frame and
  changing `text` re-renders only the letters that changed. Changing 32
  letters now takes about a third of the React time and two thirds of the
  main-thread time it did. The motion is unchanged.
- Flap tiles shade their turning faces with a brightness filter and draw the
  shadow on the bottom half on a layer of its own, so shading no longer
  repaints the tile every frame. A 32-letter flip paints a third as often and
  spends about a tenth of the time rasterizing. The shading looks the same,
  except that with a see-through `--rt-tile` the page behind a turning face
  is no longer darkened with it.
- A flap tile flipping its letter over itself on hover no longer re-renders
  as the flap falls and lands, which leaves the settle as its only render
  after the flip starts. The motion is unchanged.
- Text is split into the characters a reader sees, so an accented letter or
  an emoji with a skin tone stays in one piece.
- When `text` changes on the roll, its width eases from the old word's to the
  new one's over the first letter's `timing`, so the text beside it glides
  instead of jumping. A longer word is uncovered as the width grows rather
  than drawn over its neighbours, and a shorter one keeps the old word's
  room until its letters have turned away. With reduced motion on the width
  changes at once as before, and with a first `timing` of 0 it changes at
  once when the letters have turned.

### Fixes

- Spaces in the roll's text are drawn again, so "Rotating text!" no longer
  shows as "Rotatingtext!". Runs of spaces keep their width too.

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
