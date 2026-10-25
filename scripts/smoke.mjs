import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
let browser
const guard = setTimeout(() => fail('timed out'), 120_000)
function cleanup() { clearTimeout(guard); try { server.kill('SIGTERM') } catch {} }
async function fail(message) { console.error(`smoke: FAIL — ${message}`); await browser?.close().catch(() => {}); cleanup(); process.exit(1) }
async function waitForServer() { for (let i = 0; i < 60; i += 1) { try { if ((await fetch(url)).ok) return } catch {} await new Promise(r => setTimeout(r, 250)) } throw new Error('preview server did not start') }
async function launch(context, screenshot) {
  const errors = []
  const page = await context.newPage()
  page.on('console', m => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(url)
  await page.waitForSelector('[data-screen="home"]:not(.is-hidden)')
  await page.screenshot({ path: `${out}/${screenshot}-home.png` })
  await page.click('#start')
  await page.waitForSelector('[data-screen="game"]:not(.is-hidden) .memory-card')
  return { page, errors }
}
async function completeRound(page) {
  const all = await page.evaluate(() => window.__game.getCards())
  const groups = new Map()
  all.forEach((card, index) => { const list = groups.get(card.id) ?? []; list.push(index); groups.set(card.id, list) })
  for (const indexes of groups.values()) {
    const current = await page.evaluate(() => window.__game.getCards())
    const a = current.findIndex(c => c.id === all[indexes[0]].id && !c.matched)
    if (a < 0) continue
    const b = current.findIndex((c, i) => c.id === all[indexes[0]].id && !c.matched && i !== a)
    await page.locator(`[data-index="${a}"]`).click()
    await page.locator(`[data-index="${b}"]`).click()
    await page.waitForTimeout(75)
  }
}
try {
  await waitForServer()
  browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] }).catch(() => chromium.launch({ args: ['--ignore-gpu-blocklist'], channel: 'chrome' }))
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR' })
  const { page, errors } = await launch(desktop, '01-desktop')
  const initial = await page.evaluate(() => window.__game.getState())
  if (initial.total !== 6) throw new Error(`expected six pairs, got ${initial.total}`)
  const pair = await page.evaluate(() => { const cards = window.__game.getCards(); const i = cards.findIndex((c, x) => cards.some((d, y) => y > x && d.id === c.id)); const j = cards.findIndex((c, x) => x > i && c.id === cards[i].id); return [i, j] })
  await page.locator(`[data-index="${pair[0]}"]`).click(); await page.locator(`[data-index="${pair[1]}"]`).click(); await page.waitForTimeout(120)
  if ((await page.evaluate(() => window.__game.getState().matched)) !== 1) throw new Error('matching pair did not register')
  await completeRound(page)
  await page.waitForSelector('#result:not(.is-hidden)')
  await page.screenshot({ path: `${out}/02-result.png` })
  const resultState = await page.evaluate(() => window.__game.getState())
  if (resultState.matched !== 6) throw new Error(`expected six matched pairs, got ${resultState.matched}`)
  await desktop.close()
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' })
  const mobile = await launch(phone, '03-mobile')
  await mobile.page.screenshot({ path: `${out}/04-mobile-board.png` })
  if (mobile.errors.length || errors.length) throw new Error(`console errors:\n${[...errors, ...mobile.errors].join('\n')}`)
  await phone.close(); await browser.close(); cleanup(); console.log('smoke: OK — desktop, mobile and memory matching verified')
} catch (error) { await fail(error?.message ?? String(error)) }
