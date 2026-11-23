import assert from 'node:assert/strict'
import test from 'node:test'
import { cards, leaders } from '../packages/cards/index.js'
import { createLocalMatch } from '../packages/local-match/index.js'
import { createGame, deckIssue } from '../packages/engine/index.js'
import { arenaPool, autoDraft, createArenaSchedule, createDraft, doors, draftAction, draftView, rarityRanges } from '../packages/arena/index.js'
import { initializeArena, joinArena } from '../packages/online-match/arena.js'
import { updateRoom } from '../packages/online-match/lobby.js'
import { roomSnapshot } from '../packages/online-match/room-snapshot.js'
import { createArenaStore } from '../apps/web/arena.js'

const type = stage => ({ class: 'arena-class', door: 'arena-door', card: 'arena-pick' }[stage])
function finish(draft) {
  while (draft.stage !== 'complete') draftAction(draft, { type: type(draft.stage), choice: draft.choices[0] })
  return draft
}

test('闘技場の配分は範囲内で合計30枚、全職業で3候補・6扉・同一レアリティを保証する', () => {
  const allocations = new Set()
  for (let seed = 0; seed < 100; seed++) {
    const schedule = createArenaSchedule(seed)
    assert.equal(schedule.length, 30)
    const counts = Object.fromEntries(Object.entries(rarityRanges).map(([key, [min, max]]) => {
      const n = schedule.filter(r => r === key).length
      assert.ok(n >= min && n <= max, key)
      return [key, n]
    }))
    allocations.add(JSON.stringify(counts))
    const draft = createDraft(seed, schedule)
    assert.equal(new Set(draft.choices).size, 3)
    while (draft.stage !== 'complete') {
      assert.equal(draft.choices.length, 3)
      assert.equal(new Set(draft.choices).size, 3)
      if (draft.stage === 'card') for (const id of draft.choices) {
        const card = cards[id]
        assert.ok(arenaPool.includes(card))
        assert.equal(card.rarity, schedule[draft.deck.length])
        assert.ok(['neutral', draft.leader].includes(card.classId))
      }
      draftAction(draft, { type: type(draft.stage), choice: draft.choices[0] })
    }
    assert.equal(draft.history.filter(action => action.type === 'arena-door').length, 6)
    assert.equal(draft.history.filter(action => action.type === 'arena-pick').length, 30)
    assert.equal(deckIssue(draft.deck, draft.leader, 'arena'), null)
  }
  assert.ok(allocations.size > 10)
  for (const leader of Object.keys(leaders)) {
    let draft
    for (let seed = 0; ; seed++) {
      draft = createDraft(seed)
      if (draft.choices.includes(leader)) break
    }
    draftAction(draft, { type: 'arena-class', choice: leader })
    assert.equal(finish(draft).deck.length, 30)
  }
})

test('闘技場は保存復元しても候補が変わらず、不正な候補・順序を拒否する', () => {
  const draft = createDraft(42)
  assert.throws(() => draftAction(draft, { type: 'arena-class', choice: 'not-a-class' }))
  assert.throws(() => draftAction(draft, { type: 'arena-pick', choice: draft.choices[0] }))
  draftAction(draft, { type: 'arena-class', choice: draft.choices[0] })
  draftAction(draft, { type: 'arena-door', choice: draft.choices[0] })
  const restored = JSON.parse(JSON.stringify(draft))
  finish(draft)
  finish(restored)
  assert.deepEqual(restored, draft)
  const view = draftView(draft)
  assert.equal(Object.hasOwn(view, 'rng'), false)
  assert.equal(Object.hasOwn(view, 'history'), false)
})

test('扉の重み3倍は該当カードを増やし、同名制限解除は闘技場に限る', () => {
  const totals = { unit: 0, magic: 0 }
  for (let seed = 0; seed < 200; seed++) for (const door of ['unit', 'magic']) {
    const draft = createDraft(seed, Array(30).fill('common'))
    draftAction(draft, { type: 'arena-class', choice: draft.choices[0] })
    draft.choices = [door]
    draftAction(draft, { type: 'arena-door', choice: door })
    totals[door] += draft.choices.filter(id => cards[id].kind === 'unit').length
  }
  assert.ok(totals.unit - totals.magic > 20)
  const card = arenaPool.find(c => c.classId === 'neutral' && c.rarity === 'legendary')
  const deck = Array(30).fill(card.id)
  assert.equal(deckIssue(deck, 'mage', 'arena'), null)
  assert.ok(deckIssue(deck, 'mage'))
  assert.throws(() => createGame({ seed: 1, lineups: [{ leader: 'mage', deck }, { leader: 'mage', deck }] }))
  const match = createLocalMatch({ seed: 1, format: 'arena', lineups: [{ leader: 'mage', deck }, { leader: 'mage', deck }] })
  assert.equal(match.view(0).players[0].hand.length, 3)
  assert.equal(match.exportReplay().config.format, 'arena')
  assert.equal(Object.keys(doors).length, 6)
})

test('フレンド闘技場は配分を共有し、相手の候補を隠して、サーバーでピック済みデッキを確定する', () => {
  const room = { lobby: true, host: {}, guest: null, version: 0 }
  initializeArena(room, 23)
  room.guest = {}
  joinArena(room, 91)
  assert.deepEqual(room.host.draft.schedule, room.guest.draft.schedule)
  assert.notDeepEqual(room.host.draft.choices, room.guest.draft.choices)
  const snapshot = roomSnapshot(room, room.host)
  assert.equal(snapshot.arena.draft.stage, 'class')
  assert.equal(Object.hasOwn(snapshot.lobby.guest, 'draft'), false)
  assert.equal(Object.hasOwn(snapshot.arena.draft, 'rng'), false)
  assert.throws(() => updateRoom(room, room.host, 0, { type: 'lobby-ready', ready: true }, () => [0, 42]))
  for (const member of [room.host, room.guest]) while (member.draft.stage !== 'complete') {
    const before = structuredClone(member.draft)
    const version = room.version
    updateRoom(room, member, version, { type: type(before.stage), choice: before.choices[0] }, () => [0, 42])
    room.version++
    assert.throws(() => updateRoom(room, member, version, { type: type(before.stage), choice: before.choices[0] }, () => [0, 42]))
  }
  for (const member of [room.host, room.guest]) {
    updateRoom(room, member, room.version, { type: 'lobby-ready', ready: true, lineup: { leader: 'forged', deck: [] } }, () => [0, 42])
    room.version++
    assert.equal(member.lineup.leader, member.draft.leader)
    assert.deepEqual(member.lineup.deck, member.draft.deck)
  }
  updateRoom(room, room.host, room.version, { type: 'lobby-start' }, () => [0, 42])
  assert.equal(room.match.exportState().config.format, 'arena')
  assert.deepEqual(roomSnapshot(room, room.host).view.players[room.guest.seat].hand, [])
})

test('CPU勝ち抜きは対戦途中を復元し、勝利を一度だけ記録して最高記録を保持する', () => {
  const map = new Map()
  const storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }
  const store = createArenaStore(storage)
  const run = store.newRun()
  finish(run.draft)
  const config = { seed: 9, format: 'arena', lineups: [{ leader: run.draft.leader, deck: run.draft.deck }, autoDraft(78, run.draft.schedule, 1)] }
  const match = createLocalMatch(config)
  store.saveMatch(match)
  const restored = createArenaStore(storage)
  assert.deepEqual(restored.run.match, match.exportState())
  const state = match.exportState()
  state.game.phase = 'finished'
  state.game.winner = 0
  const victory = createLocalMatch(config, state.game)
  store.saveMatch(victory)
  store.saveMatch(victory)
  assert.equal(store.run.wins, 1)
  assert.equal(store.best, 1)
  assert.equal(createArenaStore(storage).run.wins, 1)
  run.settled = false
  state.game.winner = 1
  store.saveMatch(createLocalMatch(config, state.game))
  assert.equal(store.run.ended, true)
  assert.equal(store.run.wins, 1)
  store.newRun()
  assert.equal(store.run.wins, 0)
  assert.equal(store.best, 1)
})
