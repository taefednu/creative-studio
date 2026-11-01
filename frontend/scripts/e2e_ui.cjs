// Браузерный сквозной прогон по настоящим экранам: живой бэкенд и модели, синтетические данные.
// Нужны бэкенд на 8100 с временной базой и фронт на 5180. Запуск из frontend/: node scripts/e2e_ui.cjs
const { chromium } = require('playwright')
const BASE = 'http://localhost:5180'
const OUT = '/tmp/ui-e2e'
const tag = Math.random().toString(16).slice(2, 6)
const PW = 'correct-horse-' + tag
const results = []
const problems = []

function ok(name, cond, detail = '') {
  results.push([name, !!cond, detail])
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${String(detail).slice(0, 140)}`)
}

async function ctx(browser, width = 1672, height = 941) {
  const c = await browser.newContext({ viewport: { width, height } })
  const p = await c.newPage()
  p.on('pageerror', (e) => { console.log('PAGEERROR', e.message.slice(0, 300), (e.stack || '').split(String.fromCharCode(10)).slice(1, 4).join(' ').slice(0, 300)) })
  p.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 140)}`) })
  p.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) problems.push(`${r.status()} ${r.url().replace(BASE, '')}`) })
  return p
}
const T = (p, id) => p.getByTestId(id)

async function register(p, role, email) {
  await p.goto(BASE + '/login')
  await T(p, `role-${role}`).click()
  await T(p, 'mode-toggle').click()
  await T(p, 'email').fill(email)
  await T(p, 'password').fill(PW)
  await T(p, 'email-submit').click()
  await p.waitForURL(`**/${role}`, { timeout: 20000 })
}

async function addKid(p, nick) {
  if (await T(p, 'kid-nick').count() === 0) await T(p, 'add-kid').click()
  await T(p, 'kid-nick').fill(nick)
  for (const i of [3, 7, 1]) await T(p, `pic-${i}`).click()
  await T(p, 'kid-submit').click()
  await T(p, `kid-${nick}`).waitFor({ timeout: 40000 })
}

async function childLogin(p, nick) {
  await p.goto(BASE + '/login')
  await T(p, 'role-child').click()
  await T(p, 'nick').fill(nick)
  for (const i of [3, 7, 1]) await T(p, `pic-${i}`).click()
  await T(p, 'child-submit').click()
  await T(p, 'create-title').waitFor({ timeout: 20000 })
}

async function joinClass(p, code) {
  await T(p, 'class-code-input').fill(code)
  await T(p, 'class-code-input').press('Enter')
  await T(p, 'my-class').waitFor({ timeout: 15000 })
}

async function noScroll(p, name) {
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ok(`нет горизонтального скролла: ${name}`, over <= 0, over)
}

async function main() {
  const browser = await chromium.launch()
  const teacher = await ctx(browser)
  const parent = await ctx(browser)
  const a = await ctx(browser)
  const b = await ctx(browser, 390, 844)
  const A = `SkyFox${tag}`
  const B = `MoonCat${tag}`

  await register(teacher, 'teacher', `t${tag}@example.com`)
  await T(teacher, 'class-name').fill('5B')
  await T(teacher, 'class-create').click()
  await T(teacher, 'class-code').first().waitFor({ timeout: 30000 })
  const code = (await T(teacher, 'class-code').first().innerText()).trim()
  ok('учитель создал класс на экране', code.length === 6, code)

  await register(parent, 'parent', `p${tag}@example.com`)
  await addKid(parent, A)
  await addKid(parent, B)
  ok('родитель завёл двух детей', true)

  // QR настоящим кликом: токен из ответа сервера, вход во втором браузере
  const qrResp = parent.waitForResponse((r) => r.url().includes('/qr') && r.request().method() === 'POST')
  await T(parent, `qr-${B}`).click()
  const token = (await (await qrResp).json()).token
  await T(parent, 'qr-box').waitFor({ timeout: 10000 })
  ok('QR показан родителю', true)
  await b.goto(`${BASE}/qr?token=${encodeURIComponent(token)}`)
  await T(b, 'create-title').waitFor({ timeout: 20000 })
  ok('вход ребёнка по QR настоящим переходом', true)
  const c2 = await ctx(browser)
  await c2.goto(`${BASE}/qr?token=${encodeURIComponent(token)}`)
  await T(c2, 'qr-failed').waitFor({ timeout: 15000 })
  ok('повторный QR не работает', true)
  problems.length = 0 // 401 повторного QR ожидаем
  await c2.context().close()

  await childLogin(a, A)
  ok('вход ребёнка картинками', true)
  await T(a, 'coins').waitFor()
  ok('баланс 20 в шапке', (await T(a, 'coins').innerText()).includes('20'), await T(a, 'coins').innerText())
  await joinClass(a, code)
  await joinClass(b, code)
  ok('оба ребёнка в классе', true)

  // Главный кадр: шаблон → «Нарисовать»
  await a.goto(BASE + '/create')
  await T(a, 'tpl-space_pet').click()
  await T(a, 'draw').click()
  await T(a, 'result-image').waitFor({ timeout: 120000 })
  ok('шаблон → «Нарисовать» → картинка за 2 нажатия', true)
  await a.screenshot({ path: `${OUT}/a-result-1672.png` })
  ok('баланс 19 после картинки', (await T(a, 'coins').innerText()).includes('19'), await T(a, 'coins').innerText())

  // Публикация с контактом → задержано → учитель одобряет
  await T(a, 'publish-open').click()
  await T(a, 'audience-class').click().catch(() => {})
  await T(a, 'caption-input').fill('пиши мне в тг @fake_cat_00')
  await T(a, 'publish-send').click()
  await T(a, 'publish-form').waitFor({ state: 'detached', timeout: 40000 }).catch(() => {})
  await a.waitForTimeout(500)
  await a.screenshot({ path: `${OUT}/a-held-1672.png` })
  await b.goto(BASE + '/')
  await T(b, 'feed-empty').waitFor({ timeout: 15000 })
  ok('одноклассник задержанный пост не видит: лента загружена и пуста', (await T(b, 'post-card').count()) === 0, await T(b, 'post-card').count())
  await b.goto(BASE + '/no-such-page')
  await T(b, 'feed-empty').waitFor({ timeout: 15000 })
  ok('неверный адрес ведёт на главную, а не на пустой экран', true, b.url())

  await teacher.reload()
  await T(teacher, 'review-approve').first().waitFor({ timeout: 15000 })
  ok('у учителя карточка «Задержано»', true, await T(teacher, 'review-reason').first().innerText())
  await teacher.screenshot({ path: `${OUT}/teacher-1672.png` })
  await T(teacher, 'review-approve').first().click()
  await T(teacher, 'review-empty').waitFor({ timeout: 15000 })
  ok('«Одобрить» убрал карточку', true)

  await b.reload()
  try {
    await T(b, 'post-card').first().waitFor({ timeout: 15000 })
  } catch (e) {
    await b.screenshot({ path: `${OUT}/b-fail-390.png` })
    console.log('URL', b.url())
    console.log('BODY', (await b.locator('body').innerText()).split(String.fromCharCode(10)).join(' | ').slice(0, 400))
    console.log('FEED', JSON.stringify(await b.evaluate(() => fetch('/api/feed/class').then((r) => r.json()))).slice(0, 300))
    console.log('ME', JSON.stringify(await b.evaluate(() => fetch('/api/child/me').then((r) => r.json()))).slice(0, 300))
    console.log('A-MINE', JSON.stringify(await a.evaluate(() => fetch('/api/feed/class').then((r) => r.json()))).slice(0, 400))
    throw e
  }
  ok('после одобрения одноклассник видит пост', true)
  await b.screenshot({ path: `${OUT}/b-feed-390.png` })
  await noScroll(b, 'лента 390')

  // Реакция и «Скажи добрее?» настоящими кликами
  await T(b, 'post-card').first().click()
  await T(b, 'post-modal').waitFor({ timeout: 10000 })
  await T(b, 'react-heart').click()
  await b.waitForTimeout(800)
  ok('реакция засчитана', (await T(b, 'count-heart').innerText()).includes('1'), await T(b, 'count-heart').innerText())
  await T(b, 'tab-comments').click()
  await T(b, 'comment-input').fill('ты тупой рисуешь как курица')
  await T(b, 'comment-send').click()
  await T(b, 'kinder-text').waitFor({ timeout: 40000 })
  ok('«Скажи добрее?» на экране', true, await T(b, 'kinder-text').innerText())
  await b.screenshot({ path: `${OUT}/b-kinder-390.png` })
  await T(b, 'kinder-use').click()
  await T(b, 'comment').first().waitFor({ timeout: 15000 })
  const shown = await T(b, 'comments').innerText()
  ok('в комментариях добрая версия, грубой нет', !shown.includes('тупой'), shown)
  await noScroll(b, 'окно работы 390')

  // Самоповреждение: тёплый экран, срочная карточка взрослым
  await b.goto(BASE + '/create')
  await T(b, 'prompt-input').fill('я хочу себя поранить')
  await T(b, 'tpl-clay').click()
  await T(b, 'draw').click()
  await b.waitForTimeout(500)
  await T(b, 'work-support').waitFor({ timeout: 60000 })
  const warm = await T(b, 'work-support').innerText()
  ok('ребёнку тёплый ответ без «заблокировано»', !/заблок|ошибк|нельзя|дружеская|иначе/i.test(warm), warm)
  await b.screenshot({ path: `${OUT}/b-support-390.png` })
  await teacher.reload()
  await T(teacher, 'review-urgent-note').first().waitFor({ timeout: 15000 })
  ok('у учителя срочная карточка', true)
  ok('в срочной карточке нет «Одобрить»', (await T(teacher, 'review-approve').count()) === 0, await T(teacher, 'review-approve').count())
  const tText = await T(teacher, 'review').innerText()
  ok('текста ребёнка в списке нет', !tText.includes('поранить'))
  await parent.reload()
  await T(parent, 'review-urgent-note').first().waitFor({ timeout: 15000 })
  ok('у родителя срочная карточка', true)
  await parent.screenshot({ path: `${OUT}/parent-1672.png` })
  await noScroll(parent, 'кабинет родителя 1672')

  // Язык интерфейса
  await T(a, 'lang-uz').click()
  await a.waitForTimeout(300)
  await a.goto(BASE + '/create')
  ok('переключатель языка на uz', (await T(a, 'create-title').innerText()) !== 'Что нарисуем сегодня?', await T(a, 'create-title').innerText())

  await browser.close()
}

main()
  .catch((e) => { ok('сценарий дошёл до конца', false, e.message.split('\n')[0]) })
  .finally(() => {
    const bad = results.filter((r) => !r[1])
    console.log(`\nИТОГ: ${results.length - bad.length} из ${results.length}`)
    console.log('Ошибки консоли и HTTP >= 400 после повторного QR:', JSON.stringify([...new Set(problems)].slice(0, 12)))
    process.exit(bad.length ? 1 : 0)
  })
