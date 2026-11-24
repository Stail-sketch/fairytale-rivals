import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { starterLineup } from '../packages/cards/decks.js'
import { createGame, dispatch } from '../packages/engine/index.js'
import { createInstance, resolution } from '../packages/engine/effects.js'
import { createDevServer } from '../scripts/dev-server.js'
import { browserControl } from './browser-driver.js'
import { createDraft, draftAction } from '../packages/arena/index.js'

test('第4弾の刻印・奥義変更・強化状態を対戦画面から確認できる', { timeout: 30000 }, async t => {
  const server = createDevServer()
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)) })
  const temp = await realpath(tmpdir()), directory = await mkdtemp(join(temp, 'fairytale-fourth-'))
  const open = await browserControl(t, directory)
  t.after(async () => {
    const path = await realpath(directory)
    if (dirname(path) !== temp) throw new Error('Unexpected test directory')
    await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  })
  const config = { seed: 521, format: 'arena', lineups: [starterLineup('merchant'), starterLineup('seer')] }
  let game = createGame(config)
  for (let seat = 0; seat < 2; seat++) game = dispatch(game, seat, { type: 'mulligan', replace: [] }).game
  Object.assign(game.players[0], { mp: 10, maxMp: 10, hand: [createInstance(game, 'FT-0650')] })
  game.players[1].skillOverride = 'dragonGuide'
  game.players[1].badges = [{ id: game.nextId++, card: 'FT-0659', family: 'dragon', keyword: 'GUARD' }]
  game.players[0].badges = [{ id: game.nextId++, card: 'FT-0647', metal: true, attack: 1 }]
  const resolver = resolution(game)
  resolver.summon(0, createInstance(game, 'FT-0012'), { row: 'front', column: 0 })
  resolver.summon(0, createInstance(game, 'FT-0649'), { row: 'back', column: 0 })
  resolver.summon(1, createInstance(game, 'FT-0655'), { row: 'front', column: 0 })
  resolver.settle()
  let draft, seed = 1
  do { draft = createDraft(seed++) } while (!draft.choices.includes('merchant'))
  draftAction(draft, { type: 'arena-class', choice: 'merchant' })
  while (draft.stage !== 'complete') draftAction(draft, { type: draft.stage === 'door' ? 'arena-door' : 'arena-pick', choice: draft.choices[0] })
  const run = { version: 1, wins: 0, ended: false, settled: false, draft, match: { config, game } }
  const page = await open(), origin = 'http://127.0.0.1:' + server.address().port
  await page.viewport(1600, 1000)
  await page.navigate(origin + '/')
  await page.wait('[data-op=arena-open]')
  await page.evaluate('localStorage.setItem("fairytale-rivals.arena.v1",' + JSON.stringify(JSON.stringify(run)) + ')')
  await page.navigate(origin + '/?fourth-ui=1')
  try { await page.click('[data-op=arena-open]'); await page.click('[data-op=arena-resume]') }
  catch (error) { t.diagnostic(JSON.stringify(page.errors())); throw error }
  await page.wait('.battle')
  assert.equal(await page.evaluate('document.querySelectorAll("[data-inspect-badges]").length'), 2)
  assert(await page.evaluate('Boolean(document.querySelector("[data-ability=HARD_METAL_BODY][data-active=true]"))'))
  await page.click('[data-inspect-badges="0"]')
  assert(await page.evaluate('document.querySelector(".battle-card-dialog").textContent.includes("銀環の刻印卵")'))
  await page.click('.battle-card-dialog [data-term=STORY_BADGE]')
  assert.equal(await page.evaluate('document.querySelector(".term-dialog h2").textContent'), '物語の刻印')
  await page.click('.term-dialog button'); await page.click('.battle-card-dialog form button')
  await page.click('[data-inspect-skill="1"]')
  assert(await page.evaluate('document.querySelector(".battle-card-dialog").textContent.includes("竜詩の導き")'))
  assert(await page.evaluate('document.querySelector(".battle-card-dialog").textContent.includes("コスト-1")'))
  await page.click('.battle-card-dialog form button')
  await page.evaluate(`document.querySelector('[data-inspect-badges="0"]').dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}))`)
  if (process.env.FAIRYTALE_FOURTH_SCREENSHOT) await page.capture(process.env.FAIRYTALE_FOURTH_SCREENSHOT)
  assert.equal(await page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth'), false)
})
