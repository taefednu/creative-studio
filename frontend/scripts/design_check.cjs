// Сверка экрана с макетом: docs/design/measure/specs/<экран>.json, стенд из scripts/stand.sh.
// Запуск из frontend/: node scripts/design_check.cjs <экран|all>. Код выхода 1 — есть блок с Δ больше 5 %.
// Снимок не ждёт document.fonts.ready: на окне «Скажи добрее?» headless зависал в статусе loading при завершённых запросах.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1'
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')
const screens = require('./design_screens.cjs')

const DIR = path.resolve(__dirname, '../../docs/design/measure')
const DESIGN = path.resolve(__dirname, '../../docs/design')
const LIMIT = 5
const pct = (a, b) => Math.round((Math.abs(a - b) / b) * 1000) / 10

async function drawOverlay(page, spec, boxes, mode, W) {
  await page.evaluate(
    ({ spec, boxes, mode, W, img }) => {
      const root = document.createElement('div')
      root.style.cssText = 'position:absolute;left:0;top:0;width:100%;pointer-events:none;z-index:99999'
      if (img) {
        const i = document.createElement('img')
        i.src = img
        i.style.cssText = `position:absolute;left:0;top:0;width:${W}px;opacity:.5`
        root.appendChild(i)
      }
      const rect = (b, color, name) => {
        const d = document.createElement('div')
        d.style.cssText = `position:absolute;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;outline:2px solid ${color};font:10px sans-serif;color:${color}`
        if (name) d.textContent = name
        root.appendChild(d)
      }
      spec.blocks.forEach((b) => b[mode] && b[mode].y !== null && rect({ ...b[mode], h: b[mode].h ?? 4 }, '#ff00aa', b.name))
      boxes.forEach((b) => b.box && rect(b.box, '#00c2ff', ''))
      document.body.appendChild(root)
    },
    { spec, boxes, mode, W, img: mode === 'd' ? spec.img : null },
  )
  await page.waitForTimeout(400)
}

async function check(browser, name) {
  const spec = JSON.parse(fs.readFileSync(path.join(DIR, 'specs', `${name}.json`), 'utf8'))
  const raw = fs.readFileSync(path.join(DESIGN, spec.design))
  spec.img = `data:image/jpeg;base64,${raw.toString('base64')}`
  let bad = 0
  const lines = [`# ${name}`, '', `Макет \`${spec.design}\`. Голубое на наложении — страница, розовое — макет.`, '']
  for (const [mode, W, H] of [['d', 1672, 941], ['m', 390, 844]]) {
    if (!spec.blocks.some((b) => b[mode])) continue
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: 'en-US' })
    await ctx.addInitScript(() => localStorage.setItem('studio.lang', 'en'))
    const page = await ctx.newPage()
    const problems = []
    page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 120)}`))
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 120)}`))
    page.on('response', (r) => r.status() >= 400 && r.url().includes('/api/') && !spec.allow4xx && problems.push(`${r.status()} ${r.url()}`))
    await screens[name](page)
    await page.waitForTimeout(600)
    await Promise.race([page.evaluate(() => document.fonts.ready.then(() => 1)), page.waitForTimeout(3000)])
    const boxes = []
    for (const b of spec.blocks) {
      const loc = page.locator(b.sel).first()
      boxes.push({ name: b.name, box: (await loc.count()) ? await loc.boundingBox() : null })
    }
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    lines.push(`## ${W} px (${mode === 'd' ? 'против макета' : 'против плана, телефонного макета нет'})`, '')
    lines.push('| Блок | План x y w h | Страница x y w h | Δx % | Δy % | Δw % | Δh % |', '|---|---|---|---|---|---|---|')
    spec.blocks.forEach((b, i) => {
      const t = b[mode]
      if (!t) return
      const p = boxes[i].box
      if (!p) {
        bad++
        lines.push(`| ${b.name} | ${t.x} ${t.y} ${t.w} ${t.h} | **нет** | — | — | — | — |`)
        return
      }
      // h: null — высота блока зависит от данных (сетка), сверяем только верх и ширину
      const d = [(Math.abs(p.x - t.x) / W) * 100, t.y === null ? 0 : (Math.abs(p.y - t.y) / H) * 100, pct(p.width, t.w), t.h === null ? 0 : pct(p.height, t.h)]
        .map((v) => Math.round(v * 10) / 10)
      const over = d.map((v) => v > LIMIT)
      if (over.some(Boolean)) bad++
      const cell = d.map((v, k) => (over[k] ? `**${v}**` : `${v}`))
      lines.push(`| ${b.name} | ${t.x} ${t.y ?? '—'} ${t.w} ${t.h ?? '—'} | ${[p.x, p.y, p.width, p.height].map(Math.round).join(' ')} | ${cell.join(' | ')} |`)
    })
    if (scroll > 0) { bad++; lines.push('', `**Горизонтальный скролл: ${scroll}px**`) }
    if (problems.length) { bad++; lines.push('', '**Ошибки:** ' + [...new Set(problems)].join('; ')) }
    lines.push('')
    await page.screenshot({ path: path.join(DIR, 'overlay', `${name}-${W}-page.jpg`), type: 'jpeg', quality: 70, timeout: 15000 })
    await drawOverlay(page, spec, boxes.map((b) => b), mode, W)
    await page.screenshot({ path: path.join(DIR, 'overlay', `${name}-${W}.jpg`), type: 'jpeg', quality: 70, timeout: 15000 })
    await ctx.close()
  }
  fs.writeFileSync(path.join(DIR, 'report', `${name}.md`), lines.join('\n') + '\n')
  console.log(lines.join('\n'))
  console.log(`${bad ? 'FAIL' : 'PASS'} ${name}: блоков вне допуска ${bad}`)
  return bad
}

;(async () => {
  const target = process.argv[2]
  const names = target === 'all' ? Object.keys(screens) : [target]
  let bad = 0
  for (const n of names) {
    const browser = await chromium.launch() // свой браузер: после десятка снимков headless зависал на шрифтах
    // Снимок иногда виснет на «waiting for fonts» в headless с dev-сервером: повторяем экран целиком.
    for (let attempt = 1; ; attempt++) {
      try {
        bad += await check(browser, n)
        break
      } catch (e) {
        if (attempt === 3) throw e
        console.log(`повтор ${n}: ${e.message.split(String.fromCharCode(10))[0]}`)
      }
    }
    await browser.close()
  }
  process.exit(bad ? 1 : 0)
})()
