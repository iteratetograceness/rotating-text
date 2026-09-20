---
name: verify
description: How to verify changes to the rotating-text component (src/, dist/) by driving the built package in Chromium, frame by frame
---

# Verifying the component

The surface is the built package: `dist/index.modern.js` plus `dist/index.css`,
imported the way a user would. Rebuild dist first (`npm run build`, from a
`npx yarn@1 install --frozen-lockfile` layout so the source maps stay stable).
For page-level checks, use `demo-sandbox/.claude/skills/verify/SKILL.md`: the
landing page links `../dist`.

## Harness (scratch, not committed)

1. `app.jsx`: a React 18 root rendering `<RotatingText>` from `DIST/index.modern.js`
   with `text`, `stagger`, `timing` read from the query string (split `timing`
   on commas for arrays) and `window.setText` exposed for mid-flip text changes.
2. Bundle it with the repo's esbuild (`node_modules/esbuild`), `alias: { DIST: <dist dir> }`,
   `nodePaths: [<repo>/node_modules]`, `jsx: 'automatic'`, plus an `index.html`.
   Bundle `git show origin/main:dist/...` the same way for a "before" build.
3. Drive it with `playwright-core` and `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`.
   In `addInitScript`, replace `performance.now`, `requestAnimationFrame` and
   `cancelAnimationFrame` with a manual clock, then step `1000/60` ms per frame
   (`1000/60/4` for 4x slow motion). framer-motion follows the fake clock, so
   frames are deterministic.
4. Per frame, log each letter span's `rotateX(...)` and `opacity` from
   `style.transform`. This trace is the most useful evidence: front faces are
   the first N spans, copies the next N (always front + 90).
5. For video, screenshot each frame and `ffmpeg -framerate 60 -i f%04d.png -pix_fmt yuv420p`;
   stack before over after with `-filter_complex vstack`.

## Flows worth driving

- Hover once: every letter turns to about -96, settles at -90, then snaps to
  0 (front) / 90 (copy). First frame and last frame must be byte-identical.
- Change `text` mid-flip (longer, shorter, empty then back): letters keep
  turning, nothing is left frozen part way round, all end at 0 / 90.
- Leave and re-enter several times mid-flip: no restart, no freeze.
- Roll text change with text on either side (a flex row, as in `bench/`):
  log the x of the text after the component every frame. It glides over the
  first letter's timing (no frame moves more than ~12px at 0.5s for a
  127px change), a change mid-ease carries on without a jump, and once the
  width lets go the frame is byte-identical to main's. Also check
  `dir=rtl` (the clip is on the left) and reduced motion (one-frame jump).
- `timing` as an array, and `timing=0`.
- `reducedMotion: 'reduce'` context: no turn, root gets `scale(1.05)`.
- `hasTouch` context and `page.touchscreen.tap`: a tap starts a flip.

## Performance

For frame cost, React commits and layout shift, use the committed harness in
`bench/` (see `bench/README.md`): `cd bench && npm ci && npm run bench -- --ref main --ref .`
measures main and the working copy interleaved and writes `compare.md`. It
uses the real clock, not the fake one above.

## Gotchas

- Recompute the element's bounding box before each hover: the harness centres
  the text, so a text change moves it.
- `Number('0.2,0.4')` is NaN; a harness that forgets to split arrays tests the
  zero-timing path instead.
- Don't `pkill -f` a pattern that is also in your own command line.
