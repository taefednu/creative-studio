const { chromium } = require('playwright')
// Клики второй партии на стенде stand.sh (без живых моделей: POST подменены через route, следствие проверяется на экране).
// Запуск из frontend/: node scripts/click_batch2.cjs
const BASE = process.env.BASE || 'http://127.0.0.1:5180'
const OUT = '/tmp/ui-batch2'
const T = (p, id) => p.getByTestId(id)
let fails = 0
const ok = (n, c, d = '') => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', n, String(d).slice(0, 140)) }
const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
require('fs').mkdirSync(OUT, { recursive: true })

async function login(b, w, h, nick = 'StarFox', lang = 'ru') {
  const c = await b.newContext({ viewport: { width: w, height: h } })
  await c.addInitScript((l) => { try { localStorage.setItem('studio.lang', l) } catch { /* ignore */ } }, lang)
  const p = await c.newPage()
  const errs = []
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  p.on('response', (r) => r.status() >= 400 && errs.push(r.status() + r.url()))
  p.errs = errs
  await p.goto(BASE + '/login'); await T(p, 'role-child').click(); await T(p, 'nick').fill(nick)
  for (const i of [3, 7, 1]) await T(p, 'pic-' + i).click()
  await T(p, 'child-submit').click(); await T(p, 'coins').waitFor()
  return p
}
const feed = async (p) => (await (await p.request.get(BASE + '/api/feed/class')).json()).items
async function openCard(p, match) {
  const items = await feed(p)
  const i = items.findIndex(match)
  if (i < 0) return null
  await p.goto(BASE + '/'); await T(p, 'post-card').first().waitFor()
  await T(p, 'post-card').nth(i).click(); await T(p, 'modal-image').waitFor()
  return items[i]
}
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const proposed = { id: 777, kind: 'image', template_id: 'anime', status: 'proposed', reason_codes: ['unsafe_content'], rewrite_text: 'a brave knight protecting a castle', image_url: null, adult_notified: true }

;(async () => {
  const b = await chromium.launch()
  const p = await login(b, 1672, 941, 'StarFox')

  // ---- экран результата и публикация (настоящая работа, POST /api/posts подменён)
  const works = await (await p.request.get(BASE + '/api/works/mine')).json()
  const ready = works.find((w) => w.status === 'ready')
  await p.goto(BASE + `/create?work=${ready.id}`); await T(p, 'result-card').waitFor()
  ok('результат: заголовок, картинка, робот справа', (await T(p, 'result-title').isVisible()) && (await T(p, 'result-image').isVisible()) && (await T(p, 'side-robot').isVisible()))
  ok('результат: нет формы до нажатия', (await T(p, 'publish-form').count()) === 0)
  await T(p, 'publish-class').click()
  ok('publish-class раскрывает подпись и выбор', (await T(p, 'publish-form').isVisible()) && (await T(p, 'caption-input').isVisible()) && (await T(p, 'audience-class').count()) === 1)
  const sent = []
  await p.route('**/api/posts', async (r) => {
    if (r.request().method() !== 'POST') return r.continue()
    sent.push(JSON.parse(r.request().postData()))
    await r.fulfill(json({ id: 5, status: 'published', support: false }))
  })
  await T(p, 'caption-input').fill('мой замок')
  await T(p, 'publish-send').click(); await T(p, 'publish-done').waitFor()
  ok('publish-send: тело запроса и «Опубликовано»', sent.length === 1 && sent[0].caption === 'мой замок' && sent[0].audience === 'class', JSON.stringify(sent))
  await p.unroute('**/api/posts')
  await T(p, 'draw-more').click(); await p.waitForURL('**/create'); ok('draw-more → /create', true)
  await p.goBack(); await T(p, 'to-mine').click(); await p.waitForURL('**/my-works'); ok('to-mine → /my-works', true)

  // ---- «Давай так»: принять и отказаться
  await p.route('**/api/works/777', (r) => r.fulfill(json(proposed)))
  await p.route('**/api/works/777/accept', (r) => r.fulfill(json({ ...proposed, status: 'generating', rewrite_text: proposed.rewrite_text })))
  await p.route('**/api/works/777/decline', (r) => r.fulfill(json({ ...proposed, status: 'refused' })))
  await p.goto(BASE + '/create?work=777'); await T(p, 'accept').waitFor()
  ok('proposed: робот, текст идеи, образец стиля', (await T(p, 'side-robot').isVisible()) && /knight/.test(await T(p, 'rewrite').innerText()) && (await T(p, 'style-sample').count()) === 1)
  await T(p, 'accept').click(); await T(p, 'work-progress').waitFor()
  ok('accept → экран прогресса', true)
  await p.goto(BASE + '/create?work=777'); await T(p, 'decline').click(); await T(p, 'create-title').waitFor()
  ok('decline → /create', p.url().endsWith('/create'), p.url())
  await p.unroute('**/api/works/777'); await p.unroute('**/api/works/777/accept'); await p.unroute('**/api/works/777/decline')

  // ---- ремикс: чужая работа класса
  const remixable = await openCard(p, (x) => x.can_remix)
  ok('есть работа с can_remix', !!remixable)
  if (remixable) {
    ok('draw-same без блока ремикса до нажатия', (await T(p, 'remix-box').count()) === 0)
    await T(p, 'draw-same').click(); await T(p, 'remix-box').waitFor()
    await p.waitForFunction(() => document.querySelector('[data-testid=remix-price]')?.textContent.trim())
    ok('draw-same открывает remix-box с ценой', true, await T(p, 'remix-price').innerText())
    ok('remix-go выключен без стиля и текста', await T(p, 'remix-go').isDisabled())
    await T(p, 'remix-text').fill('добавь дракона')
    ok('remix-go включается от текста', !(await T(p, 'remix-go').isDisabled()))
    const bodies = []
    await p.route('**/api/posts/*/remix', async (r) => {
      bodies.push(JSON.parse(r.request().postData()))
      if (bodies.length === 1) return r.fulfill(json({ detail: 'remix_not_allowed' }, 403))
      if (bodies.length === 2) return r.fulfill(json({ detail: 'platform_unavailable' }, 503))
      return r.fulfill(json({ id: 999, status: 'checking' }))
    })
    await p.route('**/api/works/999', (r) => r.fulfill(json({ id: 999, template_id: 'remix', status: 'generating', reason_codes: [], rewrite_text: null, image_url: null })))
    await T(p, 'remix-go').click(); await T(p, 'error').waitFor()
    ok('remix_not_allowed: текст ошибки на экране', /не разрешил/.test(await T(p, 'error').innerText()), await T(p, 'error').innerText())
    await T(p, 'remix-go').click(); await p.waitForTimeout(400)
    await T(p, 'remix-go').click(); await p.waitForURL('**/create?work=999')
    ok('ремикс → /create?work=999', true)
    ok('тело: текст без стиля, request_id', bodies[0].text === 'добавь дракона' && bodies[0].template_id === null && !!bodies[0].request_id, JSON.stringify(bodies[0]))
    ok('4xx сбросил request_id, 5xx оставил', bodies[0].request_id !== bodies[1].request_id && bodies[1].request_id === bodies[2].request_id, bodies.map((x) => x.request_id.slice(0, 4)).join(' '))
    await p.unroute('**/api/posts/*/remix'); await p.unroute('**/api/works/999')
    // можно только стиль
    await openCard(p, (x) => x.id === remixable.id)
    await T(p, 'draw-same').click(); await T(p, 'remix-style').selectOption('clay')
    ok('remix-go включается от стиля', !(await T(p, 'remix-go').isDisabled()))
  }

  // ---- автор: переключатель «Разрешить ремикс» вместо кнопки
  const mine = await openCard(p, (x) => x.is_author && x.status === 'published')
  ok('есть свой пост', !!mine)
  if (mine) {
    ok('автор: вместо draw-same переключатель', (await T(p, 'remix-allow').count()) === 1 && (await T(p, 'draw-same').count()) === 0)
    const before = await T(p, 'remix-allow').getAttribute('aria-checked')
    const calls = []
    await p.route('**/api/posts/*/remix-allowed', (r) => { calls.push(JSON.parse(r.request().postData())); return r.fulfill(json({ id: mine.id, remix_allowed: before !== 'true' })) })
    await T(p, 'remix-allow').click(); await p.waitForTimeout(300)
    ok('переключатель меняет состояние и шлёт allowed', (await T(p, 'remix-allow').getAttribute('aria-checked')) !== before && calls[0]?.allowed === (before !== 'true'), JSON.stringify(calls))
    await p.unroute('**/api/posts/*/remix-allowed')
    await p.route('**/api/posts/*/remix-allowed', (r) => r.fulfill(json({ detail: 'x' }, 500)))
    const cur = await T(p, 'remix-allow').getAttribute('aria-checked')
    await T(p, 'remix-allow').click(); await T(p, 'error').waitFor()
    ok('ошибка → откат переключателя и текст', (await T(p, 'remix-allow').getAttribute('aria-checked')) === cur)
    await p.unroute('**/api/posts/*/remix-allowed')
  }

  // ---- ссылка на исходную работу (поле remix_of подменено в ответе поста)
  const other = (await feed(p)).find((x) => x.id !== (mine?.id ?? -1) && x.template_id)
  const host = other && (await feed(p)).find((x) => x.id !== other.id)
  if (other && host) {
    await p.route(`**/api/posts/${host.id}`, async (r) => {
      const j = await (await r.fetch()).json()
      await r.fulfill(json({ ...j, remix_of: { post_id: other.id, nick: other.nick } }))
    })
    await openCard(p, (x) => x.id === host.id)
    const link = T(p, 'remix-of')
    ok('«Ремикс работы @ник» показан', (await link.innerText()).includes('@' + other.nick), await link.innerText())
    await link.click()
    await p.waitForFunction((id) => document.querySelector('[data-testid=modal-image]')?.getAttribute('src')?.includes(`/posts/${id}/`), other.id)
    ok('ссылка открыла окно исходного поста', true)
    await p.unroute(`**/api/posts/${host.id}`)
  } else ok('нет данных для remix_of', false)

  // ---- реакция
  await openCard(p, (x) => x.can_react)
  const c0 = Number(await T(p, 'count-wow').innerText())
  await T(p, 'react-wow').click(); await p.waitForTimeout(600)
  const c1 = Number(await T(p, 'count-wow').innerText())
  ok('реакция: счётчик +1 или -1', Math.abs(c1 - c0) === 1, `${c0}->${c1}`)
  await T(p, 'react-wow').click(); await p.waitForTimeout(600)
  ok('реакция: второй клик возвращает', Number(await T(p, 'count-wow').innerText()) === c0)

  // ---- «Скажи добрее?»: use / edit / cancel
  await openCard(p, (x) => x.can_comment)
  await T(p, 'tab-comments').click()
  let n = 0
  await p.route('**/api/posts/*/comments', (r) => (r.request().method() === 'POST' ? r.fulfill(json({ status: 'suggest', suggestion_id: ++n, kinder: 'I love the colors! Maybe add more stars?' })) : r.continue()))
  const acts = []
  await p.route('**/api/comments/suggestions/*/*', (r) => { acts.push(r.request().url().split('/').pop()); return r.fulfill(json({})) })
  const ask = async () => { await T(p, 'comment-input').fill('this is ugly lol'); await T(p, 'comment-send').click(); await T(p, 'kinder').waitFor() }
  await ask()
  ok('kinder: робот и текст', (await T(p, 'kinder-text').innerText()).includes('stars'))
  await T(p, 'kinder-edit').click(); await T(p, 'kinder').waitFor({ state: 'detached' })
  ok('kinder-edit: окно ушло, текст остался', (await T(p, 'comment-input').inputValue()) === 'this is ugly lol' && acts.includes('cancel'))
  await T(p, 'comment-send').click(); await T(p, 'kinder').waitFor()
  await T(p, 'kinder-cancel').click(); await T(p, 'kinder').waitFor({ state: 'detached' })
  ok('kinder-cancel: окно ушло, поле очищено', (await T(p, 'comment-input').inputValue()) === '')
  await ask()
  await T(p, 'kinder-use').click(); await T(p, 'kinder').waitFor({ state: 'detached' })
  ok('kinder-use: accept отправлен, поле очищено', acts.includes('accept') && (await T(p, 'comment-input').inputValue()) === '', acts.join())
  await p.screenshot({ path: `${OUT}/kinder-1672.png` })
  await p.unroute('**/api/posts/*/comments'); await p.unroute('**/api/comments/suggestions/*/*')
  const unexpected = p.errs.filter((e) => !/\/remix|works\/999|status of (403|404|500|503)/.test(e)) // 403 и 503 ремикса подменены нарочно
  ok('ошибки консоли/HTTP (1672)', unexpected.length === 0, unexpected.join('|'))

  // ---- support на публикации: только тёплый ответ (экран работы и карточка «Мои работы»), ru/en/uz
  const bannedPub = { ru: /иде[яюие]|нарису|монет|отказ|заблок|ошибк|получилось/i, en: /idea|draw|coin|refus|block|error|looks great/i, uz: /g['‘’ʻ]oya|chiz|tanga|rad etil|bloklan|xato|zo['‘’ʻ]r chiqdi/i }
  const mockPublish = (q) => q.route('**/api/posts', (r) => (r.request().method() === 'POST' ? r.fulfill(json({ id: 6, status: 'held', support: true })) : r.continue()))
  for (const lang of ['ru', 'en', 'uz']) {
    const s = await login(b, 1672, 941, 'StarFox', lang)
    await mockPublish(s)
    await s.goto(BASE + `/create?work=${ready.id}`); await T(s, 'result-card').waitFor()
    await T(s, 'publish-class').click(); await T(s, 'publish-send').click(); await T(s, 'publish-support').waitFor()
    const txt = await T(s, 'publish-support').innerText()
    const rest = ['side-robot', 'result-side', 'result-image', 'draw-more', 'to-mine', 'accept', 'style-sample'].map((id) => s.getByTestId(id).count())
    ok(`publish-support ${lang}: тёплый ответ, ни робота, ни «нарисовать ещё»`, !bannedPub[lang].test(txt) && (await Promise.all(rest)).every((c) => c === 0) && /./.test(txt), txt.slice(0, 70))
    await s.goto(BASE + '/my-works'); await T(s, 'work-card').first().waitFor()
    const before = await s.getByTestId('publish-class').count()
    const card = s.locator('[data-testid=work-card]', { has: s.getByTestId('publish-class') }).first()
    await card.getByTestId('publish-class').click(); await card.getByTestId('publish-send').click(); await s.getByTestId('publish-support').waitFor()
    const ctxt = await s.getByTestId('publish-support').innerText()
    ok(`MyWorks publish-support ${lang}: в карточке только тёплый текст`, !bannedPub[lang].test(ctxt) && (await s.getByTestId('publish-class').count()) === before - 1 && (await s.getByTestId('publish-support').count()) === 1, ctxt.slice(0, 70))
    await s.context().close()
  }

  // ---- support: true на посте, карточке и комментарии: пометок «ждёт взрослого» нет; без support пометки есть
  {
    const items = await feed(p)
    const target = items.find((x) => x.can_comment) || items[0]
    for (const sup of [true, false]) {
      await p.route('**/api/feed/class*', async (r) => {
        const j = await (await r.fetch()).json()
        await r.fulfill(json({ ...j, items: j.items.map((x) => (x.id === target.id ? { ...x, status: 'held', support: sup } : x)) }))
      })
      await p.route(`**/api/posts/${target.id}`, async (r) => { const j = await (await r.fetch()).json(); await r.fulfill(json({ ...j, status: 'held', support: sup })) })
      await p.route(`**/api/posts/${target.id}/comments`, async (r) => {
        if (r.request().method() !== 'GET') return r.continue()
        const j = await (await r.fetch()).json()
        await r.fulfill(json([...j, { id: 9001, nick: 'StarFox', text: 'мой текст', status: 'held', mine: true, support: sup }]))
      })
      await p.goto(BASE + '/'); await T(p, 'post-card').first().waitFor()
      const idx = items.findIndex((x) => x.id === target.id)
      const cardTxt = await T(p, 'post-card').nth(idx).innerText()
      await T(p, 'post-card').nth(idx).click(); await T(p, 'modal-image').waitFor()
      await T(p, 'tab-comments').click(); await T(p, 'comment').first().waitFor()
      const heldPost = await T(p, 'post-held').count(), heldCom = await T(p, 'comment-held').count()
      ok(`support=${sup}: пометки поста, карточки и комментария ${sup ? 'нет' : 'есть'}`, sup ? heldPost === 0 && heldCom === 0 && !/ждёт взрослого/.test(cardTxt) : heldPost === 1 && heldCom === 1 && /ждёт взрослого/.test(cardTxt), `${heldPost} ${heldCom} ${cardTxt.slice(0, 40)}`)
      await p.unroute('**/api/feed/class*'); await p.unroute(`**/api/posts/${target.id}`); await p.unroute(`**/api/posts/${target.id}/comments`)
    }
  }

  // ---- взрослому «Нарисовать так же» не показывается (лента родителя)
  {
    const par = await b.newContext({ viewport: { width: 1672, height: 941 } })
    const pp = await par.newPage()
    await pp.request.post(BASE + '/api/parent/login', { data: { email: 'parent@example.com', password: 'demo-pass-1234' } })
    await pp.goto(BASE + '/parent/feed'); await pp.waitForTimeout(1500)
    const cards = pp.getByTestId('post-card')
    if (await cards.count()) {
      await cards.first().click(); await pp.getByTestId('modal-image').waitFor()
      ok('взрослый: draw-same и remix нет', (await pp.getByTestId('draw-same').count()) === 0 && (await pp.getByTestId('remix-allow').count()) === 0)
    } else ok('нет данных для ленты взрослого', false, pp.url())
    await par.close()
  }

  // ---- support: только тёплый ответ (ru, en, uz)
  const banned = {
    ru: /иде[яюие]|нарису|монет|отказ|заблок|ошибк|не получилось/i,
    en: /idea|draw|coin|refus|block|error|didn't work/i,
    uz: /g['‘’ʻ]oya|chiz|tanga|rad etil|bloklan|xato/i,
  }
  for (const lang of ['ru', 'en', 'uz']) {
    const s = await login(b, 1672, 941, 'StarFox', lang)
    for (const adult of [true, false]) {
      await s.route('**/api/works/778', (r) => r.fulfill(json({ id: 778, template_id: 'anime', status: 'support', reason_codes: ['self_harm'], rewrite_text: 'a brave knight', image_url: null, adult_notified: adult })))
      await s.goto(BASE + '/create?work=778'); await T(s, 'work-support').waitFor()
      const txt = await T(s, 'work-support').innerText()
      const extra = (await s.getByTestId('side-robot').count()) + (await s.getByTestId('accept').count()) + (await s.getByTestId('result-side').count()) + (await s.getByTestId('style-sample').count())
      ok(`support ${lang} adult=${adult}: нет запрещённых слов, робота, образца`, !banned[lang].test(txt) && extra === 0 && (await T(s, 'try-again').count()) === 1, txt.slice(0, 80))
      await s.unroute('**/api/works/778')
    }
    await s.context().close()
  }

  // ---- без горизонтального скролла: 320, 390, 768, 1024, 1672 × ru, uz
  for (const lang of ['ru', 'uz']) {
    const q = await login(b, 1672, 941, 'StarFox', lang)
    const host2 = (await feed(q)).find((x) => x.can_comment)
    for (const w of [320, 390, 768, 1024, 1672]) {
      await q.setViewportSize({ width: w, height: 900 })
      await q.route('**/api/works/777', (r) => r.fulfill(json(proposed)))
      await q.goto(BASE + '/create?work=777'); await T(q, 'accept').waitFor(); await q.waitForTimeout(250)
      ok(`noScroll ${lang} ${w} proposed`, (await noScroll(q)) <= 0, await noScroll(q))
      await q.unroute('**/api/works/777')
      await q.goto(BASE + `/create?work=${ready.id}`); await T(q, 'result-card').waitFor(); await q.waitForTimeout(250)
      await T(q, 'publish-class').click()
      ok(`noScroll ${lang} ${w} result+форма`, (await noScroll(q)) <= 0, await noScroll(q))
      await openCard(q, (x) => x.id === host2.id); await q.waitForTimeout(250)
      ok(`noScroll ${lang} ${w} окно работы`, (await noScroll(q)) <= 0, await noScroll(q))
      if (w <= 390) {
        ok(`крестик виден ${lang} ${w}`, await T(q, 'modal-close').isVisible())
        await T(q, 'modal-side').scrollIntoViewIfNeeded()
        await q.evaluate(() => document.querySelector('[data-testid=post-modal]').scrollTo(0, 99999))
        const r = await T(q, 'modal-close').boundingBox()
        ok(`крестик остаётся в окне после прокрутки ${lang} ${w}`, r && r.y >= 0 && r.y < 120, r && r.y)
      }
      await T(q, 'tab-comments').click(); await q.waitForTimeout(150)
      ok(`noScroll ${lang} ${w} комментарии`, (await noScroll(q)) <= 0, await noScroll(q))
      await q.screenshot({ path: `${OUT}/modal-${lang}-${w}.png` })
    }
    await q.context().close()
  }

  await b.close(); console.log('fails', fails); process.exit(fails ? 1 : 0)
})().catch((e) => { console.log('ERR', e.message); process.exit(2) })
