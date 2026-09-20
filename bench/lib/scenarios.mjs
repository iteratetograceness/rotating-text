// Each scenario loads a fresh page, sets it up, then measures one action.
// `act` runs inside the measured window; it sets __bench.trigger (page time)
// at the moment the action starts. `geometry`, where present, repeats a
// similar action afterwards, untimed, while every element's layout box is
// checked on every frame.

// Words of exactly n characters
const words = (list, n) => list.map((s) => s.slice(0, n).padEnd(n, '.'))

export const TEXTS = {
  short: words(['Word', 'Flip', 'Turn', 'Spin'], 4),
  medium: words(['Hello, world', 'Rotate these', 'Split flaps!', 'Departures 9'], 12),
  long: words(
    [
      'Sphinx of black quartz, judge my vow',
      'The five boxing wizards jump quickly',
      'Jackdaws love my big sphinx of quartz',
      'Pack my box with five dozen liquor jugs'
    ],
    32
  )
}

const OUTSIDE = { x: 8, y: 8 }

const center = async (page) => {
  const box = await page.locator('#stage > *').first().boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

const markTrigger = (page) => page.evaluate(() => (window.__bench.trigger = performance.now()))

export const SCENARIOS = {
  // First render of the component
  mount: {
    mounted: false,
    act: async (page, { props }) => {
      await page.evaluate((p) => {
        window.__bench.trigger = performance.now()
        window.__bench.mount(p)
      }, props)
    }
  },
  // The text prop changes to another word of the same length, with no hover
  change: {
    geometry: async (page, { texts }) => {
      await page.evaluate((text) => window.__bench.setProps({ text }), texts[2])
    },
    act: async (page, { texts }) => {
      await page.evaluate((text) => {
        window.__bench.trigger = performance.now()
        window.__bench.setProps({ text })
      }, texts[1])
    }
  },
  // The pointer moves onto the text and it runs one full transition
  flip: {
    geometry: async (page) => {
      const target = await center(page)
      await page.mouse.move(OUTSIDE.x, OUTSIDE.y)
      await page.waitForTimeout(50)
      await page.mouse.move(target.x, target.y)
    },
    act: async (page) => {
      const target = await center(page)
      await markTrigger(page)
      await page.mouse.move(target.x, target.y)
    }
  },
  // Text changes every 60ms (faster than any letter's transition) while the
  // pointer leaves and re-enters every 150ms
  rapid: {
    act: async (page, { texts }) => {
      const target = await center(page)
      await markTrigger(page)
      await page.mouse.move(target.x, target.y)
      const changes = page.evaluate(
        ({ texts, every, count }) =>
          new Promise((resolve) => {
            let i = 0
            const id = setInterval(() => {
              window.__bench.setProps({ text: texts[++i % texts.length] })
              if (i >= count) {
                clearInterval(id)
                resolve()
              }
            }, every)
          }),
        { texts, every: 60, count: 12 }
      )
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(150)
        await page.mouse.move(OUTSIDE.x, OUTSIDE.y)
        await page.waitForTimeout(150)
        await page.mouse.move(target.x, target.y)
      }
      await changes
    }
  }
}

export { OUTSIDE }
