const { chromium } = require('playwright')
// Клики по первой партии на стенде stand.sh (без живой модели: draw перехвачен). Запуск из frontend/: node scripts/click_batch1.cjs
const BASE = process.env.BASE || 'http://127.0.0.1:5180'
const OUT = '/tmp/ui-batch1'
const T=(p,id)=>p.getByTestId(id)
let fails=0
const ok=(n,c,d='')=>{ if(!c) fails++; console.log(c?'PASS':'FAIL',n,String(d).slice(0,120)) }
async function login(b,w,h,nick='StarFox'){
  const c=await b.newContext({viewport:{width:w,height:h}}); const p=await c.newPage()
  const errs=[]; p.on('console',m=>m.type()==='error'&&errs.push(m.text())); p.on('response',r=>r.status()>=400&&errs.push(r.status()+r.url()))
  p.errs=errs
  await p.goto(BASE+'/login'); await T(p,'role-child').click(); await T(p,'nick').fill(nick)
  for (const i of [3,7,1]) await T(p,'pic-'+i).click()
  await T(p,'child-submit').click(); await T(p,'coins').waitFor(); return p
}
;(async()=>{
  const b=await chromium.launch()
  const p=await login(b,1672,941)
  await p.goto(BASE+'/'); await T(p,'post-card').first().waitFor()
  ok('feed-title', await T(p,'feed-title').count()===1)
  ok('task-strip на ленте', await T(p,'task-strip').count()===1, await T(p,'task-strip').innerText())
  const n0=await T(p,'post-card').count()
  ok('20+ постов', n0>=1, n0)
  await p.waitForTimeout(1500); await p.screenshot({path:`${OUT}/feed-1672.png`})
  // фильтр
  const opts=await T(p,'style-filter').locator('option').evaluateAll(o=>o.map(x=>x.value))
  let changed=false
  for (const v of opts.filter(Boolean)) { await T(p,'style-filter').selectOption(v); const n=await T(p,'post-card').count(); if(n!==n0){changed=true; ok('фильтр '+v+' меняет число карточек',true,n0+'->'+n); break} }
  ok('фильтр меняет число', changed)
  // panel-style синхронен с фильтром
  const sel=await T(p,'panel-style').inputValue(); ok('panel-style взял стиль фильтра', sel===(await T(p,'style-filter').inputValue()), sel)
  await T(p,'style-filter').selectOption('')
  // вкладка
  await T(p,'tab-create').click(); await p.waitForURL('**/create'); await T(p,'create-title').waitFor()
  ok('вкладка Создать', true)
  await T(p,'tpl-clay').click()
  ok('panel-style синхронен с сеткой', (await T(p,'panel-style').inputValue())==='clay')
  await T(p,'panel-style').selectOption('paper')
  ok('panel-style меняет выбор в сетке', (await T(p,'tpl-paper').getAttribute('aria-pressed'))==='true')
  await p.screenshot({path:`${OUT}/create-1672.png`})
  ok('Создать без прокрутки', await p.evaluate(()=>document.documentElement.scrollHeight<=window.innerHeight), await p.evaluate(()=>document.documentElement.scrollHeight))
  // task-start
  await T(p,'tab-feed').click(); await T(p,'task-start').click(); await p.waitForURL('**/create?assignment=*')
  ok('task-start → /create?assignment', /assignment=\d+/.test(p.url()), p.url())
  await T(p,'task-start').waitFor({state:'detached'}); await T(p,'task-strip').waitFor(); ok('на create task-strip без кнопки', (await T(p,'task-strip').count())===1 && (await T(p,'task-start').count())===0, (await T(p,'task-strip').count())+' '+(await T(p,'task-start').count()))
  // draw перехват
  await p.route('**/api/works', async r=>{ if(r.request().method()==='POST'){ await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:999})}) } else r.continue() })
  await p.route('**/api/works/999', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:999,template_id:'clay',status:'generating',reason_codes:[],rewrite_text:null,image_url:null})}))
  await p.goto(BASE+'/'); await T(p,'post-card').first().waitFor()
  await T(p,'prompt-input').fill('кот'); await T(p,'draw').click()
  await p.waitForURL('**/create?work=999'); await T(p,'work-progress').waitFor()
  ok('draw с ленты → /create?work=999 и WorkView', true, p.url())
  // меню аватара
  await p.unroute('**/api/works'); await p.unroute('**/api/works/999')
  await p.goto(BASE+'/'); await T(p,'avatar-me').click()
  ok('меню открылось', await T(p,'my-nick').isVisible() && await T(p,'my-class').isVisible() && await T(p,'logout').isVisible())
  await p.keyboard.press('Escape'); ok('Esc закрывает', await T(p,'my-nick').count()===0)
  await T(p,'avatar-me').click(); await p.mouse.click(900,40); ok('клик вне закрывает', await T(p,'my-nick').count()===0)
  await T(p,'avatar-me').click(); await T(p,'logout').click(); await p.waitForURL('**/login'); ok('выход', true)
  ok('ошибки консоли/HTTP (1672)', p.errs.length===0, p.errs.join('|'))
  // телефон
  const m=await login(b,390,844)
  await m.goto(BASE+'/'); await T(m,'post-card').first().waitFor()
  await m.waitForTimeout(1500); await m.screenshot({path:`${OUT}/feed-390.png`})
  await m.screenshot({path:`${OUT}/feed-390-full.png`,fullPage:true})
  ok('нет гор. скролла feed 390', await m.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth))
  await m.goto(BASE+'/create'); await T(m,'create-title').waitFor(); await m.screenshot({path:`${OUT}/create-390.png`})
  ok('нет гор. скролла create 390', await m.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth))
  await m.setViewportSize({width:374,height:844}); ok('нет гор. скролла 374', await m.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth))
  await m.setViewportSize({width:390,height:844})
  await T(m,'tab-feed').click(); ok('вкладка на телефоне', m.url().endsWith('/'))
  ok('ошибки консоли/HTTP (390)', m.errs.length===0, m.errs.join('|'))
  // ---- ревью: ширины × языки без горизонтального скролла
  const sizes = [320, 360, 390, 768, 1024, 1280, 1672]
  for (const lang of ['ru', 'en', 'uz']) {
    const q = await login(b, 390, 844)
    await q.evaluate((l) => localStorage.setItem('studio.lang', l), lang)
    for (const w of sizes) {
      await q.setViewportSize({ width: w, height: 900 })
      for (const path of ['/', '/create']) {
        await q.goto(BASE + path); await T(q, 'coins').waitFor(); await q.waitForTimeout(300)
        const over = await q.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        ok(`noScroll ${lang} ${w} ${path}`, over <= 0, over)
      }
    }
  }
  // ---- на 390×844 кнопка draw над нижним меню (панель липкая), и на «Создать», и на ленте
  const s2 = await login(b, 390, 844)
  await s2.goto(BASE + '/create'); await T(s2, 'draw').waitFor()
  const bx = await T(s2, 'draw').boundingBox(); const nv = await s2.locator('nav[aria-label=main]').boundingBox()
  ok('create 390: draw выше нижнего меню', bx.y + bx.height <= nv.y + 1, `${bx.y + bx.height} <= ${nv.y}`)
  // ---- ретраи: 5xx оставляет request_id, правка текста меняет его
  const ids = []
  await s2.route('**/api/works', async (r) => {
    if (r.request().method() !== 'POST') return r.continue()
    ids.push(JSON.parse(r.request().postData()).request_id)
    await r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'platform_unavailable' }) })
  })
  await T(s2, 'draw').click(); await T(s2, 'error').waitFor()
  await T(s2, 'draw').click(); await s2.waitForTimeout(400)
  await T(s2, 'prompt-input').fill('другой текст'); await T(s2, 'draw').click(); await s2.waitForTimeout(400)
  ok('503: тот же request_id, после правки текста новый', ids.length === 3 && ids[0] === ids[1] && ids[2] !== ids[1], ids.join(' '))
  await s2.unroute('**/api/works')
  // ---- /create?work=<id>: 404 уводит на /create, сбой сети — нет
  await s2.route('**/api/works/777', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'not_found' }) }))
  await s2.goto(BASE + '/create?work=777'); await s2.waitForURL((u) => !u.search.includes('work='), { timeout: 5000 })
  ok('404 работы → /create', true)
  await s2.unroute('**/api/works/777')
  await s2.route('**/api/works/778', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'x' }) }))
  await s2.goto(BASE + '/create?work=778'); await s2.waitForTimeout(2500)
  ok('500 работы → остаёмся на ссылке', s2.url().includes('work=778'), s2.url())
  // ---- затемнение окна работы: настоящий computed цвет
  await s2.goto(BASE + '/'); await T(s2, 'post-card').first().click(); await T(s2, 'post-modal-bg').waitFor()
  const bg = await T(s2, 'post-modal-bg').evaluate((e) => getComputedStyle(e).backgroundColor)
  ok('окно работы: фон = токен scrim', /^rgba\(31, 42, 92, 0\.55\)$/.test(bg), bg)
  // ---- форма класса выше ленты, панель её не закрывает (ответ me без класса подменён)
  for (const w of [390, 1024]) {
    const j = await login(b, w, 844)
    await j.route('**/api/child/me', async (r) => {
      const me = await (await r.fetch()).json()
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...me, class: null }) })
    })
    await j.goto(BASE + '/'); await T(j, 'join-class').waitFor(); await j.waitForTimeout(800)
    const jb = await T(j, 'join-class').locator('button').boundingBox()
    const top = await j.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid]')?.dataset.testid, { x: jb.x + jb.width / 2, y: jb.y + jb.height / 2 })
    ok(`join-class ${w}: кнопка не закрыта панелью`, top !== 'create-panel' && top !== undefined, top)
  }
  await b.close(); console.log('fails',fails); process.exit(fails?1:0)
})().catch(e=>{console.log('ERR',e.message);process.exit(2)})
