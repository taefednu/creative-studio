// Как открыть каждый экран для сверки: стенд с данными seed_demo (scripts/stand.sh).
const BASE = 'http://localhost:5180'
const child = (page, nick = 'StarFox') => page.request.post(`${BASE}/api/child/login`, { data: { nick, pictures: [3, 7, 1] } })
const go = async (page, path, sel) => {
  await page.goto(BASE + path)
  await page.getByTestId(sel).first().waitFor({ timeout: 15000 })
  await page.waitForLoadState('networkidle')
}
const adult = (page, who) => page.request.post(`${BASE}/api/${who}/login`, { data: { email: `${who === 'teacher' ? 'aziza' : 'parent'}@example.com`, password: 'demo-pass-1234' } })
const firstReady = async (page) => {
  const works = await (await page.request.get(`${BASE}/api/works/mine`)).json()
  return works.find((w) => w.status === 'ready').id
}
// Работа с комментариями: порядок карточек в сетке совпадает с ответом API
const openPost = async (page, match) => {
  const { items } = await (await page.request.get(`${BASE}/api/feed/class`)).json()
  await page.goto(BASE + '/')
  await page.getByTestId('post-card').first().waitFor({ timeout: 15000 })
  await page.getByTestId('post-card').nth(Math.max(0, items.findIndex(match))).click()
  await page.getByTestId('modal-image').waitFor({ timeout: 15000 })
  await page.waitForLoadState('networkidle')
}

module.exports = {
  shell: async (p) => { await child(p); await go(p, '/create', 'templates') },
  // Lumi: класс без родителя, вкладок две, как на макете; вкладка «Семья» у StarFox сдвигает вторую
  feed: async (p) => { await child(p, 'Lumi'); await go(p, '/', 'post-card') },
  create: async (p) => { await child(p); await go(p, '/create', 'templates') },
  result: async (p) => { await child(p); await go(p, `/create?work=${await firstReady(p)}`, 'result-image') },
  // «Давай так» без живой модели: подмена только статуса работы
  proposed: async (p) => {
    await child(p)
    await p.route('**/api/works/777', (r) => r.fulfill({ json: { id: 777, kind: 'image', template_id: 'anime', status: 'proposed', reason_codes: ['unsafe_content'], rewrite_text: 'a brave knight protecting a castle', image_url: null, adult_notified: true } }))
    await go(p, '/create?work=777', 'accept')
  },
  work: async (p) => { await child(p, 'Lumi'); await openPost(p, (x) => x.comments === 0) },
  kinder: async (p) => {
    await child(p, 'Lumi')
    await openPost(p, (x) => x.comments > 1)
    await p.getByTestId('tab-comments').click()
    await p.route('**/api/posts/*/comments', (r) => (r.request().method() === 'POST' ? r.fulfill({ json: { status: 'suggest', suggestion_id: 1, kinder: 'I love the colors! Maybe add more stars?' } }) : r.continue()))
    await p.getByTestId('comment-input').fill('this is ugly lol')
    await p.getByTestId('comment-send').click()
    await p.getByTestId('kinder').waitFor({ timeout: 15000 })
  },
  // гость: витрина «Лучшее», без входа
  showcase: async (p) => { await go(p, '/', 'post-card') },
  // новые экраны без макета (партия 4а): план в specs/tasks.json и specs/teacher-tasks.json
  tasks: async (p) => { await child(p, 'Lumi'); await go(p, '/tasks', 'task-card') },
  'teacher-tasks': async (p) => { await adult(p, 'teacher'); await go(p, '/teacher/tasks', 'assignment-card') },
  // партия 4в: экраны по макетам mine, classes, plans
  mine: async (p) => { await child(p); await go(p, '/my-works', 'work-card') },
  classes: async (p) => { await adult(p, 'teacher'); await go(p, '/teacher/classes', 'class-code') },
  plans: async (p) => { await adult(p, 'parent'); await go(p, '/parent/plans', 'plan-small') },
  login: async (p) => { await go(p, '/login', 'role-child') },
  parent: async (p) => { await adult(p, 'parent'); await go(p, '/parent', 'kid-card') },
  teacher: async (p) => { await adult(p, 'teacher'); await go(p, '/teacher', 'review-urgent') },
}
