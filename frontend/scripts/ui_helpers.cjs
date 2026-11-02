// Общие помощники сценариев. pick: выбор в ChipSelect (кнопка testid + опция `${testid}-opt-${value}`).
async function pick(page, testid, value) {
  await page.getByTestId(testid).click()
  await page.getByTestId(`${testid}-opt-${value}`).click()
}
// значения опций списка (открывает и закрывает его)
async function optionValues(page, testid) {
  await page.getByTestId(testid).click()
  const vals = await page.getByTestId(`${testid}-list`).locator('[role=option]').evaluateAll((o, id) => o.map((x) => x.dataset.testid.slice(id.length + 5)), testid)
  await page.keyboard.press('Escape')
  return vals
}
module.exports = { pick, optionValues }
