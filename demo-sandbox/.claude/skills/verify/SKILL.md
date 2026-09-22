---
name: verify
description: How to verify changes to the demo-sandbox landing page end to end, including the mobile audit
---

# Verifying the landing page

1. `npx pnpm@10 install --frozen-lockfile` in `demo-sandbox`, then `npx next build` and `npx next start -p 3100`. The `@emotion/is-prop-valid` warning is expected.
2. Drive the page with Playwright (Chromium lives at `/opt/pw-browsers/chromium`):
   - Hover the hero and check that a letter's computed transform changes mid-flip.
   - Click each Copy button and read the text back from the clipboard (grant `clipboard-read` and `clipboard-write`).
   - Press **Try it** and check that the playground inputs change.
   - Watch the console for hydration errors (React #418/#423). The only expected error is the Vercel Analytics 404.
3. Audit mobile every time, not just one phone width. Check 320, 360, 390, 430, 600, 768, 761, 900 and landscape 844×390 with `isMobile` and `hasTouch`, plus 1440 desktop. At each width confirm:
   - `document.documentElement.scrollWidth` equals the viewport width.
   - The board, props table and playground preview don't scroll sideways.
   - Every button, input and link is at least 44px tall on touch.
   - Tapping a word flips it.
4. Take full-page screenshots at 320, 390, 768 and 1440 (both colour schemes), look at them, and attach them to the thread.
