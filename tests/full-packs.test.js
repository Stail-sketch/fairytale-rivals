import assert from 'node:assert/strict'
import test from 'node:test'
import { cards, catalog } from '../packages/cards/index.js'
import { starterLineup } from '../packages/cards/decks.js'
import { createGame, dispatch, leaderTarget, legalAttack, legalLeaderAttack, legalPlay, legalSkill, unitTarget } from '../packages/engine/index.js'
import { createInstance, resolution } from '../packages/engine/effects.js'
import { project } from '../packages/local-match/index.js'

const front = (column = 0) => ({ row: 'front', column })
const back = (column = 0) => ({ row: 'back', column })

function run(game, action) {
  const result = dispatch(game, game.active, action)
  assert(result.ok, result.issue)
  return result.game
}

function fixture(leader, seed = 192501) {
  let game = createGame({ seed, lineups: [starterLineup(leader), starterLineup('warrior')] })
  game = run(run(game, { type: 'mulligan', replace: [] }), { type: 'mulligan', replace: [] })
  Object.assign(game.players[0], { mp: 15, tension: 3, skillUses: 2, fallen: ['FT-0010'], hand: [], hp: 14 })
  return game
}

function put(game, seat, card, position) {
  const unit = createInstance(game, card)
  resolution(game).summon(seat, unit, position)
  return unit.id
}

function add(game, seat, card) {
  const instance = createInstance(game, card)
  game.players[seat].hand.push(instance)
  return instance.id
}

function choose(game) {
  let remaining = 10
  while (game.pending && remaining-- > 0) {
    assert.equal(game.pending.seat, game.active)
    game = run(game, { type: 'decide', choice: 0 })
  }
  assert(!game.pending, 'すべての選択を確定できる')
  return game
}

test('追加した原作対応カードの全種類を対戦で使用できる', async t => {
  const expansion = catalog.filter(card => card.id.startsWith('FT-') && Number(card.id.slice(3)) >= 61)
  assert.equal(expansion.length, 513)
  for (const card of expansion) await t.test(card.id + ' ' + card.name, () => {
    let game = fixture(card.classId === 'neutral' ? 'warrior' : card.classId)
    put(game, 0, 'FT-0012', front(1))
    put(game, 0, 'FT-0031', back(1))
    put(game, 1, 'FT-0018', front(0))
    put(game, 1, 'token-frost-block', front(1))
    put(game, 1, 'night-dragon', back(1))
    for (let index = 0; index < 6; index++) {
      add(game, 0, 'moon-hare')
      add(game, 1, 'dew')
    }
    if (card.packId === 'set-3') {
      game.players[0].mp = 25
      game.players[0].terrain['front:0'] = 'treasure'
      add(game, 0, 'dew')
    }
    const id = add(game, 0, card.id)
    const legal = legalPlay(game, 0, id)
    assert(legal.enabled, legal.reason)
    const position = legal.positions?.[0]
    game = choose(run(game, {
      type: 'play', id, position,
      extraPosition: legal.extraPositions?.find(option => option !== position),
      column: legal.columns?.[0],
      target: legal.targets?.[0],
      handChoice: legal.handChoices?.[0],
      choice: legal.choices ? 0 : undefined,
    }))
    assert(!game.players[0].hand.some(instance => instance.id === id), '手札から使用された')
    if (game.phase === 'battle') game = choose(run(game, { type: 'end' }))
    if (game.phase === 'battle') game = choose(run(game, { type: 'end' }))
    assert(game.players.every(player => Number.isFinite(player.hp) && player.units.every(unit => Number.isFinite(unit.hp))))
  })
})

test('武器を装備し、双撃が2回使え、耐久を消費する', () => {
  let game = fixture('fighter')
  game = run(game, { type: 'play', id: add(game, 0, 'FT-0090') })
  const initial = game.players[0].weapon.durability
  for (let index = 0; index < 2; index++) game = run(game, { type: 'leaderAttack', target: leaderTarget(1) })
  assert.equal(game.players[0].weapon.durability, initial - 2)
  assert.equal(legalLeaderAttack(game, 0).enabled, false)
})

test('攻撃時に強化されるユニットは攻撃力0から攻撃できる', () => {
  let game = fixture('warrior')
  const id = put(game, 0, 'FT-0232', front())
  game.players[0].units[0].attacks = 0
  assert.equal(game.players[0].units[0].attack, 0)
  assert.equal(legalAttack(game, 0, id).enabled, true)
  game = run(game, { type: 'attack', id, target: leaderTarget(1) })
  assert.equal(game.players[1].hp, 24)
})

test('復活、装備効果、最終奥義は選んだ陣地に解決する', () => {
  let game = fixture('priest')
  const place = back(2)
  game = run(game, { type: 'play', id: add(game, 0, 'FT-0099'), position: place })
  assert.deepEqual(game.players[0].units[0].position, place)
  assert.equal(game.players[0].units[0].card, 'FT-0010')

  game = fixture('swordsman')
  const other = put(game, 1, 'night-dragon', back(1))
  game = run(game, { type: 'play', id: add(game, 0, 'FT-0243') })
  assert.equal(game.players[0].hp, 22)
  assert.equal(game.players[0].weapon.attack, 6)
  assert.equal(game.players[0].tension, 0)
  game.players[0].tension = 3
  assert.equal(legalSkill(game, 0).positionSeat, 1)
  game = run(game, { type: 'skill', position: back(1) })
  assert.equal(game.players[1].hp, 20)
  assert.equal(game.players[1].units.find(unit => unit.id === other).hp, cards['night-dragon'].hp - 5)
})

test('山札の選択を相手に公開せず、選んだ処理を確定するまで操作が待機する', () => {
  let game = fixture('seer')
  const victim = put(game, 1, 'night-dragon', front())
  const first = game.players[0].deck[0]
  game = run(game, { type: 'play', id: add(game, 0, 'FT-0114'), target: unitTarget(victim) })
  assert.equal(project(game, 1).pending, null)
  assert.deepEqual(project(game, 0).pending.cards, [first.card])
  assert.equal(dispatch(game, 0, { type: 'end' }).ok, false)
  game = run(game, { type: 'decide', choice: 1 })
  assert.deepEqual(game.players[0].deck.at(-1), first)
})

test('未来視と未来の統合は運命の分岐の解決方法を変える', () => {
  let game = fixture('seer')
  const sun = add(game, 0, 'FT-0110')
  const enemy = put(game, 1, 'brass-squire', front())
  game = run(game, { type: 'play', id: add(game, 0, 'FT-0113') })
  assert.equal(legalPlay(game, 0, sun).choices.length, 2)
  const orbit = game.players[0].hand.find(instance => instance.card === 'token-orbit')
  game = run(game, { type: 'play', id: orbit.id })
  assert.equal(legalPlay(game, 0, sun).choices, undefined)
  game = run(game, { type: 'play', id: sun })
  assert.equal(game.players[0].hp, 21)
  assert.equal(game.players[1].units.find(unit => unit.id === enemy).hp, 1)
})
