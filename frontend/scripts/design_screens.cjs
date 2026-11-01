// Как открыть каждый экран для сверки: стенд с данными seed_demo (scripts/stand.sh).
const BASE = 'http://localhost:5180'
const child = (page, nick = 'StarFox') => page.request.post(`${BASE}/api/child/login`, { data: { nick, pictures: [3, 7, 1] } })
const go = async (page, path, sel) => {
  await page.goto(BASE + path)
  await page.getByTestId(sel).first().waitFor({ timeout: 15000 })
  await page.waitForLoadState('networkidle')
}

module.exports = {
  shell: async (p) => { await child(p); await go(p, '/create', 'templates') },
  // Lumi: класс без родителя, вкладок две, как на макете; вкладка «Семья» у StarFox сдвигает вторую
  feed: async (p) => { await child(p, 'Lumi'); await go(p, '/', 'post-card') },
  create: async (p) => { await child(p); await go(p, '/create', 'templates') },
}
