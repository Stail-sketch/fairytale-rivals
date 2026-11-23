import assert from 'node:assert/strict'
import test from 'node:test'
import { cards } from '../packages/cards/index.js'
import { autoDraft, createArenaSchedule, createDraft, draftAction } from '../packages/arena/index.js'
import { arenaCardQuality, arenaCpuLevel } from '../packages/arena/cpu-level.js'
import { deckIssue } from '../packages/engine/index.js'

test('CPUレベルは勝利数ごとに上がり、境界と上限を維持する', () => {
  const expected = [[0, 1, '入門'], [2, 3, '入門'], [3, 4, '標準'], [5, 6, '標準'],
    [6, 7, '熟練'], [9, 10, '熟練'], [10, 11, '達人'], [100, 11, '達人']]
  for (const [wins, level, label] of expected) {
    assert.equal(arenaCpuLevel(wins).level, level)
    assert.equal(arenaCpuLevel(wins).label, label)
  }
  for (let wins = 0; wins < 10; wins++) assert.ok(arenaCpuLevel(wins + 1).quality > arenaCpuLevel(wins).quality)
  assert.deepEqual(arenaCpuLevel(-3), arenaCpuLevel(0))
})

test('多数の同一シードで序盤のデッキを控えめにし、連勝時の平均カード評価を上げる', () => {
  const wins = [0, 2, 5, 9, 10]
  const totals = wins.map(() => 0)
  let previousOpening = 0
  const before = JSON.stringify(cards)
  for (let seed = 0; seed < 150; seed++) {
    const schedule = createArenaSchedule(seed)
    const legacy = createDraft(seed, schedule)
    while (legacy.stage !== 'complete') draftAction(legacy, {
      type: { class: 'arena-class', door: 'arena-door', card: 'arena-pick' }[legacy.stage], choice: legacy.choices[0],
    })
    previousOpening += legacy.deck.reduce((sum, id) => sum + arenaCardQuality(cards[id]), 0)
    for (const [i, count] of wins.entries()) {
      const lineup = autoDraft(seed, schedule, count)
      assert.equal(deckIssue(lineup.deck, lineup.leader, 'arena'), null)
      assert.deepEqual(lineup, autoDraft(seed, schedule, count))
      for (const rarity of new Set(schedule)) assert.equal(lineup.deck.filter(id => cards[id].rarity === rarity).length,
        schedule.filter(value => value === rarity).length)
      totals[i] += lineup.deck.reduce((sum, id) => sum + arenaCardQuality(cards[id]), 0)
    }
  }
  for (let i = 1; i < totals.length; i++) assert.ok(totals[i] > totals[i - 1], JSON.stringify(totals))
  assert.ok(totals.at(-1) > totals[0] * 1.2)
  assert.ok(totals[0] < previousOpening * .95, '入門の平均評価は以前の初戦より控えめにする')
  assert.equal(JSON.stringify(cards), before, 'カードの数値や能力は変更しない')
})
