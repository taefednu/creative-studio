const { chromium } = require('playwright')
// Клики по партии 4а (витрина гостя, задания #13) на стенде stand.sh, без живых моделей.
// Ручки с моделью (POST задания, POST submit, POST works) подменены route: проверяем видимое следствие, а не ответ сервера.
// Реальные запросы: список, сдачи, картинки, show-in-feed, сдача без подписи (модель не нужна).
// Запуск из frontend/: node scripts/click_batch4.cjs. Реальная сдача тратит открытое задание ребёнка: на старом стенде будет SKIP.
const BASE = process.env.BASE || 'http://127.0.0.1:5180'
const OUT = '/tmp/ui-batch4'
require('fs').mkdirSync(OUT, { recursive: true })
const I18N = { ru: require('../src/i18n/ru.json'), en: require('../src/i18n/en.json'), uz: require('../src/i18n/uz.json') }
const T = (p, id) => p.getByTestId(id)
let fails = 0
const ok = (n, c, d = '') => {
  if (!c) fails++
  console.log(c ? 'PASS' : 'FAIL', n, String(d).slice(0, 160))
}
const skip = (n, why) => console.log('SKIP', n, why)
const PW = 'demo-pass-1234'
const LANGS = ['ru', 'en', 'uz']
// слова, которых нет у тёплого ответа ребёнку, которому плохо
const BAN = {
  ru: /заблок|ошибк|нельзя|нарисуй|идея|идеи|дружеск|монет/i,
  en: /block|error|draw|idea|friendly|coin|not allowed/i,
  uz: /bloklan|xato|chiz|g‘oya|do‘stona|tanga|mumkin emas/i,
}

async function page(b, { w = 1672, h = 941, lang = 'ru' } = {}) {
  const c = await b.newContext({ viewport: { width: w, height: h } })
  await c.addInitScript((l) => localStorage.setItem('studio.lang', l), lang)
  const p = await c.newPage()
  p.errs = []
  p.reqs = []
  p.on('console', (m) => m.type() === 'error' && p.errs.push(m.text()))
  p.on('response', (r) => r.status() >= 400 && r.url().includes('/api/') && p.errs.push(r.status() + ' ' + r.url().replace(BASE, '')))
  p.on('request', (r) => p.reqs.push(r.method() + ' ' + r.url().replace(BASE, '')))
  return p
}
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const child = (p, nick) => p.request.post(`${BASE}/api/child/login`, { data: { nick, pictures: [3, 7, 1] } })
const adult = (p, who) =>
  p.request.post(`${BASE}/api/${who}/login`, { data: { email: who === 'teacher' ? 'aziza@example.com' : 'parent@example.com', password: PW } })
const json = async (p, path) => (await p.request.get(BASE + path)).json()
const text = (p, id) => T(p, id).first().innerText()

;(async () => {
  const b = await chromium.launch()

  // ---------- 1. витрина гостя ----------
  const g = await page(b)
  await g.goto(BASE + '/')
  await T(g, 'post-card').first().waitFor({ timeout: 20000 })
  await g.waitForLoadState('networkidle')
  ok('гость на /: витрина, кнопка «Войти»', (await T(g, 'guest-login').isVisible()) && (await text(g, 'feed-title')) === I18N.ru.showcase.title)
  ok('нет вкладок, монет, аватара, строки задания', (await T(g, 'main-nav').count()) + (await T(g, 'coins').count()) + (await T(g, 'avatar-me').count()) + (await T(g, 'task-strip').count()) === 0)
  ok('панель создания внизу есть', await T(g, 'create-panel').isVisible())
  ok('в сети нет закрытых ручек', !g.reqs.some((r) => /\/api\/(feed\/(class|family)|child\/|teacher\/|parent\/)/.test(r)), g.reqs.filter((r) => r.includes('/api/')).join(' | '))
  ok('в консоли нет 401 и ошибок', g.errs.length === 0, g.errs.join(' | '))
  const total = await T(g, 'post-card').count()
  const opts = await T(g, 'style-filter').locator('option').evaluateAll((o) => o.map((x) => x.value).filter(Boolean))
  let changed = false
  for (const v of opts) {
    await T(g, 'style-filter').selectOption(v)
    await g.waitForTimeout(150)
    if ((await T(g, 'post-card').count()) !== total) { changed = true; break }
  }
  ok('стиль-фильтр на витрине меняет число карточек', changed, `${total}`)
  await T(g, 'style-filter').selectOption('')
  await g.screenshot({ path: `${OUT}/showcase-1672.png` })
  // окно работы
  await T(g, 'post-card').first().click()
  await T(g, 'post-modal').waitFor()
  await T(g, 'modal-image').waitFor()
  const before = g.reqs.length
  await T(g, 'react-heart').click()
  await T(g, 'guest-hint').waitFor({ timeout: 5000 })
  ok('реакция гостя: подсказка «войди», запроса нет', !g.reqs.slice(before).some((r) => r.includes('/reactions')), await text(g, 'guest-hint'))
  ok('счётчик реакции виден числом', /\d/.test(await text(g, 'count-heart')))
  ok('вкладки комментариев нет, запроса комментариев не было', (await T(g, 'tab-comments').count()) === 0 && !g.reqs.some((r) => r.includes('/comments')))
  ok('нет ошибок после окна работы', g.errs.length === 0, g.errs.join(' | '))
  await g.screenshot({ path: `${OUT}/showcase-modal-1672.png` })
  const same = T(g, 'draw-same')
  ok('draw-same у гостя ведёт на /login', (await same.count()) === 1 && (await same.getAttribute('href')) === '/login')
  await same.click()
  await g.waitForURL('**/login')
  ok('клик по draw-same открыл вход', true)
  await T(g, 'to-showcase').click()
  await g.waitForURL(BASE + '/')
  await T(g, 'guest-login').waitFor()
  ok('to-showcase с входа возвращает на витрину', true)
  await T(g, 'post-card').first().waitFor()
  const n0 = g.reqs.length
  await T(g, 'prompt-input').fill('мой дракон')
  await T(g, 'draw').click()
  await g.waitForURL('**/login')
  ok('draw у гостя -> /login, POST /api/works не было', !g.reqs.slice(n0).some((r) => r.startsWith('POST')))
  for (const id of ['voice', 'upload-open']) {
    await g.goto(BASE + '/')
    await T(g, id).click()
    await g.waitForURL('**/login')
    ok(`${id} у гостя -> /login`, true)
  }
  await g.goto(BASE + '/')
  await T(g, 'guest-login').click()
  await g.waitForURL('**/login')
  ok('guest-login -> /login', true)
  for (const path of ['/create', '/tasks', '/my-works']) {
    await g.goto(BASE + path)
    await g.waitForURL('**/login')
    ok(`гость на ${path} уходит на /login`, true)
  }
  await g.goto(BASE + '/')
  await T(g, 'lang-uz').click()
  ok('витрина на uz', (await text(g, 'feed-title')) === I18N.uz.showcase.title && (await text(g, 'guest-login')).toLowerCase() === I18N.uz.showcase.login.toLowerCase())
  const gt = await page(b)
  await adult(gt, 'teacher')
  await gt.goto(BASE + '/')
  await gt.waitForURL('**/teacher')
  ok('учитель на / уходит в свой кабинет', true)
  await gt.context().close()
  await g.context().close()

  // ---------- 2. учитель: задания ----------
  const t = await page(b)
  await adult(t, 'teacher')
  const created = []
  let mode = 'ok'
  const bodies = []
  await t.route('**/api/teacher/classes/*/assignments', async (route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      const body = req.postDataJSON()
      bodies.push(body)
      if (mode !== 'ok') return route.fulfill({ status: mode.status, json: { detail: mode.code } })
      const v = { id: 9000 + created.length, class_id: 1, title: body.title, description: body.description, due_at: body.due_at ? body.due_at.replace(/\.\d+Z$/, '') : null, status: 'published', submissions: 0, created_at: new Date().toISOString() }
      created.push(v)
      return route.fulfill({ status: 201, json: v })
    }
    const real = await (await route.fetch()).json()
    return route.fulfill({ json: [...created.slice().reverse(), ...real] })
  })
  await t.goto(BASE + '/teacher/tasks')
  await T(t, 'assignment-card').first().waitFor({ timeout: 20000 })
  const classes = await json(t, '/api/teacher/classes')
  const api0 = await json(t, `/api/teacher/classes/${classes[0].id}/assignments`)
  ok('список заданий = ответ API', (await T(t, 'assignment-card').count()) === api0.length, `${api0.length}`)
  ok('счётчик сдач первой карточки из API', (await text(t, 'assignment-count')).includes(String(api0[0].submissions)), await text(t, 'assignment-count'))
  ok('заглушки tasks-empty нет, класс выбран', (await T(t, 'tasks-empty').count()) === 0 && (await T(t, 'task-class').inputValue()) === String(classes[0].id))
  const title = 'Нарисуй осеннюю сказку ' + Math.random().toString(36).slice(2, 5)
  await T(t, 'task-title').fill(title)
  await T(t, 'task-description').fill('Лес, листья и ёжик')
  await T(t, 'task-due').fill('2026-12-01')
  await T(t, 'task-lang').selectOption('uz')
  await T(t, 'task-create').click()
  await T(t, 'assignment-card').filter({ hasText: title }).waitFor({ timeout: 10000 })
  const expDue = new Date(2026, 11, 1, 23, 59, 59).toISOString()
  ok('POST: срок = конец дня местного времени в UTC, язык и название', bodies[0].due_at === expDue && bodies[0].lang === 'uz' && bodies[0].title === title, JSON.stringify(bodies[0]))
  ok('новое задание в списке со счётчиком 0, форма очищена', (await T(t, 'task-title').inputValue()) === '' && (await T(t, 'assignment-card').filter({ hasText: title }).innerText()).includes('0'))
  await T(t, 'task-title').fill('Без срока')
  await T(t, 'task-create').click()
  await T(t, 'assignment-card').filter({ hasText: 'Без срока' }).waitFor({ timeout: 10000 })
  ok('без даты due_at = null', bodies[1].due_at === null, JSON.stringify(bodies[1]))
  await t.screenshot({ path: `${OUT}/teacher-tasks-1672.png` })
  // ошибки на трёх языках
  for (const [code, status, key] of [['assignment_rejected', 422, 'assignment_rejected'], ['check_unavailable', 503, 'check_unavailable'], ['validation', 422, 'task_invalid']]) {
    mode = { status, code }
    const seen = []
    for (const l of LANGS) {
      await T(t, `lang-${l}`).click()
      await T(t, 'task-title').fill('Плохое задание')
      await T(t, 'task-create').click()
      await T(t, 'error').waitFor({ timeout: 5000 })
      seen.push([await text(t, 'error'), I18N[l].errors[key]])
    }
    ok(`ошибка ${code} на ru, en, uz`, seen.every(([a, e]) => a === e) && new Set(seen.map((s) => s[0])).size === 3, seen.map((s) => s[0].slice(0, 25)).join(' / '))
  }
  mode = 'ok'
  await T(t, 'lang-ru').click()
  ok('при ошибке задание не добавилось', !(await T(t, 'assignment-card').filter({ hasText: 'Плохое задание' }).count()))
  // галерея сдач, настоящие данные
  const seeded = api0.find((a) => a.submissions > 0)
  await T(t, 'assignment-card').filter({ hasText: seeded.title }).first().click()
  await T(t, 'submissions').waitFor()
  await T(t, 'submission').first().waitFor({ timeout: 10000 })
  const subs = await json(t, `/api/teacher/assignments/${seeded.id}/submissions`)
  ok('галерея: плиток столько же, сколько сдач в API', (await T(t, 'submission').count()) === subs.length, `${subs.length}`)
  await t.waitForTimeout(800)
  const loaded = await T(t, 'submission').locator('img').evaluateAll((im) => im.every((i) => i.complete && i.naturalWidth > 0))
  ok('картинки сдач /api/submissions/{id}/image загрузились', loaded)
  ok('ник у каждой плитки', (await T(t, 'submission').filter({ hasText: subs[0].nick }).count()) >= 1)
  await t.screenshot({ path: `${OUT}/teacher-gallery-1672.png` })
  const btns = await T(t, 'show-in-feed').count()
  if (btns > 0) {
    const shown0 = await T(t, 'sub-shown').count()
    await T(t, 'show-in-feed').first().click()
    await t.waitForFunction(([n]) => document.querySelectorAll('[data-testid=sub-shown]').length === n + 1, [shown0], { timeout: 10000 })
    ok('show-in-feed: плитка стала «Показано», кнопка ушла', (await T(t, 'show-in-feed').count()) === btns - 1)
    const after = await json(t, `/api/teacher/assignments/${seeded.id}/submissions`)
    ok('сервер подтвердил shown_in_feed', after.filter((s) => s.shown_in_feed).length === shown0 + 1)
  } else skip('show-in-feed на настоящих данных', 'на стенде все сдачи уже показаны')
  // синтетика: принятая, на проверке, ошибки показа
  let showCode = 'not_accepted'
  await t.route('**/api/teacher/assignments/*/submissions', (r) =>
    r.fulfill({ json: [
      { id: 9001, nick: 'StarFox', status: 'accepted', shown_in_feed: false, image_url: '/api/submissions/9001/image', comment: null, created_at: new Date().toISOString() },
      { id: 9002, nick: 'Lumi', status: 'held', shown_in_feed: false, image_url: '/api/submissions/9002/image', comment: null, created_at: new Date().toISOString() },
    ] }),
  )
  await t.route('**/api/teacher/submissions/*/show-in-feed', (r) => r.fulfill({ status: 409, json: { detail: showCode } }))
  await T(t, 'assignment-card').filter({ hasText: seeded.title }).first().click() // закрыть
  await T(t, 'assignment-card').filter({ hasText: seeded.title }).first().click() // открыть заново: подтянет синтетику
  await T(t, 'sub-held').waitFor()
  ok('на проверке: пометка и без кнопки показа', (await T(t, 'show-in-feed').count()) === 1 && (await text(t, 'sub-held')) === I18N.ru.cab.tasks.held)
  for (const code of ['not_accepted', 'removed_by_adult', 'already_in_feed']) {
    showCode = code
    const seen = []
    for (const l of LANGS) {
      await T(t, `lang-${l}`).click()
      await T(t, 'show-in-feed').click()
      const e = T(t, 'submission').getByTestId('error')
      await e.waitFor({ timeout: 5000 })
      seen.push([await e.innerText(), I18N[l].errors[`show_${code}`]])
    }
    ok(`show-in-feed ${code}: текст на ru, en, uz`, seen.every(([a, e]) => a === e), seen.map((s) => s[0].slice(0, 22)).join(' / '))
  }
  await T(t, 'lang-ru').click()
  ok('нет ошибок консоли у учителя, кроме подменённых 409/4xx', t.errs.filter((e) => !/^(409|422|503) |status of (409|422|503)|^404 \/api\/submissions\/900|status of 404/.test(e)).length === 0, t.errs.filter((e) => !/^(409|422|503) |status of (409|422|503)/.test(e)).join(' | '))
  await t.context().close()

  // ---------- 3. ребёнок ----------
  const c = await page(b)
  let kid = null
  for (const nick of ['StarFox', 'Lumi', 'PipFox', 'TinyStar']) {
    await child(c, nick)
    const list = await json(c, '/api/child/assignments')
    const works = await json(c, '/api/works/mine')
    const open = list.filter((a) => !a.submissions.some((s) => s.status !== 'rejected'))
    const ready = works.find((w) => w.status === 'ready')
    if (open.length && ready) { kid = { nick, open, list, work: ready.id }; break }
  }
  if (!kid) {
    ok('есть ребёнок с открытым заданием и готовой работой (нужен свежий стенд)', false)
  } else {
    const A = kid.open[0]
    await child(c, kid.nick)
    await c.goto(BASE + '/tasks')
    await T(c, 'task-card').first().waitFor({ timeout: 20000 })
    ok('ребёнок: карточек столько же, сколько заданий в API', (await T(c, 'task-card').count()) === kid.list.length, `${kid.nick}: ${kid.list.length}`)
    ok('на карточке название и описание из API', (await T(c, 'task-card').first().innerText()).includes(kid.list[0].title))
    ok('остаток дней у задания со сроком', (kid.list[0].due_at === null) || (await T(c, 'task-left').count()) >= 1)
    await c.screenshot({ path: `${OUT}/tasks-1672.png` })
    await T(c, 'task-card').filter({ hasText: A.title }).getByTestId('task-draw').click()
    await c.waitForURL(`**/create?assignment=${A.id}`)
    await T(c, 'task-strip').waitFor()
    ok('task-draw -> /create?assignment=id, строка задания видна', (await text(c, 'task-title')) === A.title)
    // «Нарисовать» с заданием: POST works подменён, параметр не теряется
    await c.route('**/api/works', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 201, json: { id: kid.work } }) : r.continue()))
    await T(c, 'prompt-input').fill('дракон')
    await T(c, 'draw').click()
    await c.waitForURL(`**/create?work=${kid.work}&assignment=${A.id}`)
    await T(c, 'result-image').waitFor({ timeout: 20000 })
    ok('draw ведёт на ?work=..&assignment=.. (параметр сохранён)', true, c.url())
    await c.unroute('**/api/works')
    const url = c.url()
    await T(c, 'submit-task').waitFor({ timeout: 10000 })
    ok('на экране результата есть submit-task, поле подписи и название задания', (await T(c, 'submit-task').isVisible()) && (await T(c, 'submit-comment').isVisible()) && (await text(c, 'submit-title')) === A.title, `${await T(c, 'submit-task').count()} ${await T(c, 'submit-comment').count()} ${await text(c, 'submit-title').catch(() => 'no')} vs ${A.title}`)
    await c.screenshot({ path: `${OUT}/result-submit-1672.png` })
    ok('без параметра assignment кнопки нет', await (async () => { await c.goto(BASE + `/create?work=${kid.work}`); await T(c, 'result-image').waitFor(); return (await T(c, 'submit-task').count()) === 0 })())
    ok('чужое/несуществующее задание в ссылке: кнопки нет', await (async () => { await c.goto(BASE + `/create?work=${kid.work}&assignment=999999`); await T(c, 'result-image').waitFor(); await c.waitForLoadState('networkidle'); return (await T(c, 'submit-task').count()) === 0 })())

    // исходы сдачи
    let reply = null
    const subs = []
    await c.route('**/api/assignments/*/submit', async (r) => {
      subs.push(r.request().postDataJSON())
      await new Promise((ok2) => setTimeout(ok2, 300)) // чтобы двойной клик попал в окно «идёт запрос»
      return r.fulfill(reply)
    })
    const openResult = async (lang) => {
      await c.goto(url)
      if (lang) await T(c, `lang-${lang}`).click()
      await T(c, 'submit-task').waitFor({ timeout: 15000 })
    }
    reply = { status: 200, json: { id: 1, status: 'accepted', support: false } }
    await openResult('ru')
    subs.length = 0
    await T(c, 'submit-comment').fill('мой герой')
    await T(c, 'submit-task').dblclick()
    await T(c, 'submit-done').waitFor({ timeout: 5000 })
    ok('accepted: «Сдано», один запрос при двойном клике, тело {work_id, comment}', subs.length === 1 && subs[0].work_id === kid.work && subs[0].comment === 'мой герой', JSON.stringify(subs))
    ok('после сдачи кнопки нет', (await T(c, 'submit-task').count()) === 0)
    await c.screenshot({ path: `${OUT}/submit-done-1672.png` })
    reply = { status: 200, json: { id: 2, status: 'held', support: false } }
    await openResult('ru')
    await T(c, 'submit-task').click()
    await T(c, 'submit-held').waitFor({ timeout: 5000 })
    ok('held: «отправили учителю посмотреть»', (await text(c, 'submit-held')) === I18N.ru.task.submitHeld)
    ok('без подписи comment = null', subs[subs.length - 1].comment === null)
    // срочное: только тёплый ответ, на трёх языках
    reply = { status: 200, json: { id: 3, status: 'held', support: true } }
    for (const l of LANGS) {
      await openResult(l)
      await T(c, 'submit-task').click()
      await T(c, 'publish-support').waitFor({ timeout: 5000 })
      const body = await c.locator('main').innerText()
      const imgs = await c.locator('main img[src*="robot"], main img[src*="coin"]').count()
      ok(`support на ${l}: тёплый текст, без запретных слов, робота и монет`, !BAN[l].test(body) && imgs === 0 && (await T(c, 'submit-task').count()) === 0 && body.includes(I18N[l].create.supportTitle), body.replace(/\n/g, ' | ').slice(0, 120))
    }
    // коды ошибок
    for (const [status, code, key] of [[403, 'needs_adult', 'needs_adult'], [404, 'not_found', 'task_not_found'], [409, 'work_not_ready', 'work_not_ready']]) {
      reply = { status, json: { detail: code } }
      const seen = []
      for (const l of LANGS) {
        await openResult(l)
        await T(c, 'submit-task').click()
        await T(c, 'error').waitFor({ timeout: 5000 })
        seen.push([await text(c, 'error'), I18N[l].errors[key]])
        if (l === 'ru') ok(`${code}: кнопка снова доступна для повтора`, await T(c, 'submit-task').isEnabled())
      }
      ok(`${status} ${code}: текст на ru, en, uz`, seen.every(([a, e]) => a === e) && new Set(seen.map((s) => s[0])).size === 3, seen.map((s) => s[0].slice(0, 22)).join(' / '))
    }
    await c.unroute('**/api/assignments/*/submit')
    await c.screenshot({ path: `${OUT}/submit-error-1672.png` })

    // «Мои работы»: выбор задания и та же сдача
    await c.route('**/api/assignments/*/submit', (r) => r.fulfill(reply))
    await c.goto(BASE + '/my-works')
    await T(c, 'submit-from-works').first().waitFor({ timeout: 15000 })
    await T(c, 'submit-from-works').first().click()
    if (kid.open.length > 1) {
      ok('submit-pick: столько вариантов, сколько открытых заданий', (await T(c, 'submit-pick').locator('option').count()) === kid.open.length)
      await T(c, 'submit-pick').selectOption(String(kid.open[1].id))
      ok('выбор задания меняет подпись', (await text(c, 'submit-title')) === kid.open[1].title)
    } else skip('submit-pick', 'у ребёнка одно открытое задание')
    reply = { status: 200, json: { id: 4, status: 'accepted', support: false } }
    await T(c, 'submit-task').click()
    await T(c, 'submit-done').waitFor({ timeout: 5000 })
    ok('из «Мои работы»: «Сдано»', true)
    await c.goto(BASE + '/my-works')
    await T(c, 'submit-from-works').first().click()
    reply = { status: 200, json: { id: 5, status: 'held', support: true } }
    await T(c, 'submit-task').click()
    await T(c, 'publish-support').waitFor({ timeout: 5000 })
    const mw = await T(c, 'work-card').filter({ has: c.getByTestId('publish-support') }).innerText()
    ok('из «Мои работы» support: только тёплый ответ', !BAN.ru.test(mw), mw.replace(/\n/g, ' | ').slice(0, 100))
    await c.unroute('**/api/assignments/*/submit')

    // настоящая сдача без подписи (модель не нужна)
    await c.goto(url)
    await T(c, 'submit-task').waitFor({ timeout: 15000 })
    await T(c, 'submit-task').click()
    await T(c, 'submit-done').waitFor({ timeout: 15000 })
    ok('настоящая сдача: «Сдано»', true)
    const after = await json(c, '/api/child/assignments')
    ok('сервер: сдача принята, задание закрыто', after.find((a) => a.id === A.id).submissions.some((s) => s.work_id === kid.work && s.status === 'accepted'))
    await c.goto(BASE + '/tasks')
    const card = T(c, 'task-card').filter({ hasText: A.title })
    await card.waitFor()
    ok('карточка: миниатюра сданной работы, кнопки «Нарисовать» нет', (await card.getByTestId('task-sent').locator('img').count()) === 1 && (await card.getByTestId('task-draw').count()) === 0)
    await c.goto(BASE + `/create?assignment=${A.id}`)
    await T(c, 'create-title').waitFor()
    await c.waitForLoadState('networkidle')
    ok('строка задания на «Создать» исчезла', (await T(c, 'task-strip').count()) === 0 || (await text(c, 'task-title')) !== A.title)
    await c.goto(url)
    await T(c, 'result-image').waitFor()
    await c.waitForLoadState('networkidle')
    ok('у сданного задания кнопки «Сдать» нет', (await T(c, 'submit-task').count()) === 0)
    const tt = await page(b)
    await adult(tt, 'teacher')
    const cl = await json(tt, '/api/teacher/classes')
    const tl = await json(tt, `/api/teacher/classes/${cl[0].id}/assignments`)
    ok('учитель: счётчик сдач задания вырос', tl.find((a) => a.id === A.id).submissions >= 1)
    await tt.goto(BASE + '/teacher/tasks')
    await T(tt, 'assignment-card').filter({ hasText: A.title }).first().click()
    await T(tt, 'submission').filter({ hasText: kid.nick }).first().waitFor({ timeout: 10000 })
    ok('учитель видит сдачу ребёнка в галерее', true)
    await tt.context().close()
    ok('ошибок консоли у ребёнка нет (кроме подменённых 4xx)', c.errs.filter((e) => !/^(403|404|409) |status of (403|404|409)/.test(e)).length === 0, c.errs.slice(0, 3).join(' | '))

    // ---------- 4. без горизонтального скролла ----------
    for (const lang of ['ru', 'uz']) {
      for (const w of [320, 390, 768, 1024, 1672]) {
        const p = await page(b, { w, h: w < 800 ? 844 : 941, lang })
        const res = []
        await p.goto(BASE + '/')
        await T(p, 'post-card').first().waitFor({ timeout: 20000 })
        res.push(['витрина', await noScroll(p)])
        await T(p, 'post-card').first().click()
        await T(p, 'guest-hint').count()
        await T(p, 'react-heart').click()
        await T(p, 'guest-hint').waitFor()
        res.push(['окно гостя', await noScroll(p)])
        await child(p, kid.nick)
        await p.goto(BASE + '/tasks')
        await T(p, 'task-card').first().waitFor({ timeout: 20000 })
        res.push(['задания ребёнка', await noScroll(p)])
        await p.goto(BASE + `/create?work=${kid.work}&assignment=${kid.open[kid.open.length - 1].id}`)
        await T(p, 'result-image').waitFor({ timeout: 20000 })
        res.push(['результат', await noScroll(p)])
        await p.goto(BASE + '/my-works')
        await T(p, 'work-card').first().waitFor({ timeout: 20000 })
        res.push(['мои работы', await noScroll(p)])
        await adult(p, 'teacher')
        await p.goto(BASE + '/teacher/tasks')
        await T(p, 'assignment-card').first().waitFor({ timeout: 20000 })
        await T(p, 'assignment-card').first().click()
        await T(p, 'submissions').waitFor()
        res.push(['учитель', await noScroll(p)])
        ok(`noScroll ${w} × ${lang}`, res.every((r) => r[1]), res.filter((r) => !r[1]).map((r) => r[0]).join(', '))
        await p.context().close()
      }
    }
  }
  await c.context().close()
  await b.close()
  console.log(fails ? `\nИТОГ: провалов ${fails}` : '\nИТОГ: всё прошло')
  process.exit(fails ? 1 : 0)
})().catch((e) => {
  console.log('FAIL сценарий упал:', e.message.split('\n')[0])
  process.exit(1)
})
