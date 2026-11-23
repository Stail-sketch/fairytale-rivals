import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createDevServer } from '../scripts/dev-server.js'
import { browserControl, eventually } from './browser-driver.js'

async function setup(t) {
  const temp = await realpath(tmpdir())
  const directory = await mkdtemp(join(temp, 'fairytale-arena-'))
  let origin = process.env.FAIRYTALE_SERVER_URL
  if (!origin) {
    const server = createDevServer()
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    origin = 'http://127.0.0.1:' + server.address().port
    t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)) })
  }
  const open = await browserControl(t, directory)
  t.after(async () => {
    const path = await realpath(directory)
    if (dirname(path) !== temp) throw new Error('Unexpected test directory')
    await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  })
  return { open, origin }
}

async function choose(page) {
  await page.click('[data-arena-choice]:not(:disabled)')
  await page.click('[data-op=arena-confirm]:not(:disabled)')
}

test('闘技場で扉と30枚を選び、保存・再開してCPUと対戦できる', { timeout: 60000 }, async t => {
  const { open, origin } = await setup(t)
  const page = await open()
  await page.viewport(1600, 1000)
  await page.navigate(origin + '/')
  await page.click('[data-op=arena-open]')
  await page.click('[data-op=arena-cpu-new]')
  assert.equal(await page.evaluate('document.querySelectorAll(".arena-class").length'), 3)
  assert.equal(await page.evaluate('document.querySelector("[data-op=arena-confirm]").disabled'), true)
  await choose(page)
  assert.equal(await page.evaluate('document.querySelectorAll(".arena-door").length'), 3)
  await choose(page)
  await page.wait('.arena-card')
  const initial = await page.evaluate('[...document.querySelectorAll(".arena-card")].map(node=>node.dataset.arenaChoice)')
  await page.click('[data-arena-choice]')
  assert.equal(await page.evaluate('document.querySelector(".arena-deck > p b").textContent'), '0')
  await page.viewport(390, 844)
  assert.equal(await page.evaluate('document.documentElement.scrollWidth === document.documentElement.clientWidth'), true)
  await page.viewport(1600, 1000)
  await page.click('[data-op=arena-suspend]')
  await page.navigate(origin + '/')
  await page.click('[data-op=arena-open]')
  await page.click('[data-op=arena-resume]')
  assert.deepEqual(await page.evaluate('[...document.querySelectorAll(".arena-card")].map(node=>node.dataset.arenaChoice)'), initial)
  await page.evaluate(`{
    for (let step = 0; step < 20 && Number(document.querySelector('.arena-deck > p b').textContent) < 11; step++) {
      document.querySelector('[data-arena-choice]').click()
      document.querySelector('[data-op=arena-confirm]').click()
    }
    document.querySelector('[data-arena-choice]').click()
  }`)
  if (process.env.FAIRYTALE_ARENA_SCREENSHOT) await page.capture(process.env.FAIRYTALE_ARENA_SCREENSHOT)
  await page.evaluate(`{
    for (let step = 0; step < 40 && !document.querySelector('.arena-complete'); step++) {
      document.querySelector('[data-arena-choice]').click()
      document.querySelector('[data-op=arena-confirm]').click()
    }
  }`)
  await page.wait('.arena-complete')
  assert.equal(await page.evaluate('document.querySelector(".arena-deck > p b").textContent'), '30')
  await page.click('[data-op=arena-cpu-battle]')
  await page.click('[data-op=mulligan]:enabled')
  await page.wait('.battle')
  const before = await page.evaluate('JSON.parse(localStorage.getItem("fairytale-rivals.arena.v1")).match')
  assert.equal(before.config.format, 'arena')
  await page.click('[data-op=home]')
  await page.wait('[data-op=arena-resume]')
  await page.navigate(origin + '/')
  await page.click('[data-op=arena-open]')
  await page.click('[data-op=arena-resume]')
  await page.wait('.battle')
  const after = await page.evaluate('JSON.parse(localStorage.getItem("fairytale-rivals.arena.v1")).match')
  assert.equal(after.config.seed, before.config.seed)
  assert.deepEqual(after.config.lineups, before.config.lineups)
  assert.equal(after.game.phase, 'battle')
})

test('フレンド闘技場でそれぞれピックし、同じロビーから対戦できる', { timeout: 90000 }, async t => {
  const { open, origin } = await setup(t)
  const [host, guest] = await Promise.all([open(), open()])
  await host.navigate(origin + '/')
  await host.click('[data-op=arena-open]')
  await host.click('[data-op=arena-friend-create]')
  await host.wait('[data-op=arena-friend-pick]')
  const invite = await host.evaluate('document.querySelector("#invite-url").value')
  await guest.navigate(invite)
  await guest.click('[data-op=start]')
  await guest.wait('[data-op=arena-friend-pick]')
  for (const page of [host, guest]) {
    await page.click('[data-op=arena-friend-pick]')
    await page.evaluate(`(async () => {
      for (let step = 0; step < 40 && !document.querySelector('.arena-complete'); step++) {
        const choice = document.querySelector('[data-arena-choice]:not(:disabled)')
        if (!choice) throw new Error('ピック候補が見つかりません')
        choice.click()
        document.querySelector('[data-op=arena-confirm]').click()
        const deadline = Date.now() + 10000
        while (!document.querySelector('.arena-complete') && !document.querySelector('[data-arena-choice]:not(:disabled)')) {
          if (Date.now() > deadline) throw new Error('ピックの応答がありません')
          await new Promise(resolve => setTimeout(resolve, 20))
        }
      }
    })()`)
    await page.wait('.arena-complete')
    await page.click('[data-op=arena-lobby-back]')
    await page.click('[data-op=lobby-ready]:enabled')
  }
  await host.click('[data-op=lobby-start]:enabled')
  await Promise.all([host.wait('.mulligan'), guest.wait('.mulligan')])
  const active = '[data-op=mulligan]:enabled'
  const [first, second] = await host.evaluate(`Boolean(document.querySelector('${active}'))`) ? [host, guest] : [guest, host]
  await first.click(active)
  await second.click(active)
  await Promise.all([host.wait('.battle'), guest.wait('.battle')])
  await guest.navigate(invite)
  await guest.wait('.battle')
  assert.equal(await guest.evaluate('Boolean(document.querySelector(".enemy-formation [data-hand]"))'), false)
})
