# Changelog

## Unreleased

### Fixes

- Turning reduced motion on or off now applies while the page is open. The
  setting used to be read once, as the component mounted, so a reader who
  turned it on kept getting flips and rolls until a reload. Turned on mid-flip,
  both variants come to rest on the current text at once, with no letter left
  part way round, and a flap's extra tiles for a shorter word go with it.
  Turned off, the next hover or text change moves again. The reduced-motion
  hover scale now follows the setting while the pointer is over the text,
  scaling up or back down at once rather than on the next enter or leave.
  Server rendering and the first render are unchanged.

## 1.2.0 (2026-09-21)

### Changes

- framer-motion is no longer bundled into the package. The few parts of it the
  component used (its frame loop, spring and tween, and hover) are ported into
  `src/motion.ts` with the same arithmetic, so every frame renders as before.
  `dist/index.modern.js` drops from 346 KB (84 KB gzipped) to 37 KB (10 KB
  gzipped), and mounting takes 16 to 35% less main-thread time. React is
  still the only dependency.
- The roll's text is read by screen readers and selected and copied as the
  new text from the moment `text` changes, rather than the old text until
  every letter has landed. It is read and copied as one word, where it used
  to come a letter at a time, and a drag or double-click over the letters
  now selects them like ordinary text. The text sits unseen under the
  letters, which are only drawn, so the motion is unchanged. A selection's
  highlight is drawn behind the letters, which keep their own colour; set
  `--rt-selection` to give it a colour of your own.
- Roll letters are only 3D while they turn. At rest each letter keeps the
  same transform matrix without the 3D steps in it, so it draws exactly as
  before but no longer needs a compositor layer of its own: 32 letters at
  rest go from 69 layers to 4 in Chromium, and a flip across them spends 19%
  less time layerizing and 37% less committing.
- A roll letter that has turned while the rest of its row is still turning
  now waits flat on its copy, off a layer of its own, as it does at rest.
  During a 32-letter text change the roll used to keep two layers for every
  letter that had turned until the last one landed. The turning letters'
  depth is also written into their transforms as the stylesheet gives it
  rather than through `var()`, which Chromium restyles about twice as fast.
  A 32-letter text change spends 43% less time on style, 36% less
  layerizing and 25% less committing, and 18% less main-thread time in a
  typical frame; rapid changes across 32 letters spend 38% less on style
  and 31% less committing.

### Fixes

- A roll text change rendered inside `startTransition` no longer changes a
  letter that has already started turning into view. React can commit such a
  render well after it ran; if letters have moved on in the meantime, the roll
  renders again from where they are before the frame is painted.
- A flap tile whose side falls between two device pixels no longer darkens
  that outer pixel column while the falling flap's shadow passes over it.
- A roll word whose letters kern closer in its font, like `AVATAR`, `WAVE`
  or `Type`, is now as wide as its letters are drawn. Each letter turns in
  its own box, so it is never kerned, but the roll was sized from the kerned
  word and drew past its edge over the text after it. Words with no kerning
  or ligatures keep exactly the width they had.
- When flap text loses a trailing space, like `go ` becoming `go`, the space's
  blank tile is now taken away. It used to stay at the end of the board until
  the text changed again.
- A flap no longer throws when a hover starts a space's first flip and the
  same render ends the text before that space. The flip is called off before
  its flap moves.
- When the roll's text changes again while letters are still turning, its
  width no longer narrows under letters still showing the earlier text and
  then widens again, which bounced the text after it back and forth. It is
  held as wide as the widest letters on screen and eased toward the new
  word's width no faster than about a pixel a frame, so changes in quick
  succession carry the text beside it along smoothly.

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
