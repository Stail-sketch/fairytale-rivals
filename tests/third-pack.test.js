import assert from 'node:assert/strict'
import test from 'node:test'
import { cardCost, cards, leaders } from '../packages/cards/index.js'
import { cpuLineup, starterLineup } from '../packages/cards/decks.js'
import { chooseCpuAction } from '../packages/cpu/index.js'
import { attackValue, createGame, deckIssue, dispatch, leaderPower, leaderTarget, legalAttack, legalPlay, unitTarget } from '../packages/engine/index.js'
import { createInstance, resolution } from '../packages/engine/effects.js'
import { definitionPowerRows, targetDamagePreview } from '../packages/engine/power-preview.js'
import { orbCards, terrainKey } from '../packages/engine/terrain.js'
import { project } from '../packages/local-match/index.js'

const front = column => ({ row: 'front', column })
const back = column => ({ row: 'back', column })
const space = (seat, position) => ({ ...position, seat })

function run(game, action) {
  const result = dispatch(game, game.active, action)
  assert(result.ok, result.issue)
  return result.game
}

function fixture(leader) {
  let game = createGame({ seed: 10324, lineups: [starterLineup(leader), starterLineup('warrior')] })
  for (let index = 0; index < 2; index++) game = run(game, { type: 'mulligan', replace: [] })
  Object.assign(game.players[0], { hand: [], mp: 25 })
  return game
}

function add(game, card, seat = game.active) {
  const instance = createInstance(game, card)
  game.players[seat].hand.push(instance)
  return instance.id
}

function play(game, card, fields = {}) {
  return run(game, { type: 'play', id: add(game, card), ...fields })
}

function put(game, card, seat, position) {
  const instance = createInstance(game, card)
  const resolver = resolution(game)
  resolver.summon(seat, instance, position)
  resolver.settle()
  return instance.id
}

function defeat(game, id) {
  unit(game, id).hp = 0
  resolution(game).settle()
}

function unit(game, id) {
  return game.players.flatMap(player => player.units).find(unit => unit.id === id)
}

test('花癒やしの祈杖を装備し、共鳴と攻撃で耐久を消費して壊す', () => {
  let game = fixture('priest')
  const receiver = put(game, 'night-dragon', 0, front(0))
  unit(game, receiver).hp -= 3
  game = play(game, 'FT-0420')
  assert.deepEqual(game.players[0].units.map(unit => unit.id), [receiver])
  assert.equal(game.players[0].weapon.durability, 3)
  const woundedHp = unit(game, receiver).hp
  game = run(game, { type: 'focus' })
  assert.equal(unit(game, receiver).hp, woundedHp + 2)
  assert.equal(game.players[0].weapon.durability, 2)
  game = run(game, { type: 'leaderAttack', target: leaderTarget(1) })
  assert.equal(game.players[1].hp, 24)
  assert.equal(game.players[0].weapon.durability, 1)

  unit(game, receiver).hp = woundedHp
  const eventCount = game.events.length
  game = play(game, 'token-sun-pendant')
  assert.equal(game.players[0].tension, 3)
  assert.equal(unit(game, receiver).hp, woundedHp + 2, '壊れた杖の共鳴は再発動しない')
  assert.equal(game.players[0].weapon, null)
  const events = game.events.slice(eventCount)
  const breaks = events.filter(event => event.type === 'weaponBreak')
  assert.equal(breaks.length, 1)
  assert.equal(breaks[0].card, 'FT-0420')
  assert.equal(events.filter(event => event.triggered && event.source?.card === 'FT-0420').length, 1)

  game = play(fixture('priest'), 'FT-0420')
  game = run(game, { type: 'focus' })
  assert.equal(game.players[0].hp, 25)
  assert.equal(game.players[0].weapon.durability, 2, '回復対象がいなくても共鳴時に耐久を消費する')
})

test('剣の紋章はユニットが乗っている間だけ武器を強化し、安息の地を上書きできない', () => {
  let game = fixture('warrior')
  game = play(game, 'FT-0507', { position: front(0) })
  game = play(game, 'FT-0511')
  assert.equal(game.players[0].terrain['front:0'], 'sword')
  assert.equal(leaderPower(game, 0), cards['FT-0511'].attack + 1)
  game = run(game, { type: 'leaderAttack', target: leaderTarget(1) })
  assert.equal(game.players[1].hp, 25 - cards['FT-0511'].attack - 1)
  const maker = game.players[0].units[0].id
  defeat(game, maker)
  assert.equal(game.players[0].terrain['front:0'], 'sword')
  assert.equal(leaderPower(game, 0), cards['FT-0511'].attack)

  game.players[0].terrain['back:1'] = 'rest'
  game = play(game, 'FT-0507', { position: back(1) })
  const resting = game.players[0].units.at(-1)
  resting.attacks = 0
  const territory = add(game, 'FT-0509')
  assert(!legalPlay(game, 0, territory).positions.some(position => position.seat === 0 && terrainKey(position) === 'back:1'))
  assert.equal(legalAttack(game, 0, resting.id).enabled, false)
})

test('魔法陣と祝福の地を盤面の値へ反映する', () => {
  let game = fixture('mage')
  const maker = put(game, 'FT-0516', 0, front(0))
  defeat(game, maker)
  assert.equal(game.players[0].terrain['front:0'], 'circle')
  const enemy = put(game, 'night-dragon', 1, front(0))
  const dragon = unit(game, enemy)
  dragon.hp += 10
  dragon.maxHp += 10
  game = play(game, 'FT-0001', { target: unitTarget(enemy) })
  assert.equal(unit(game, enemy).hp, cards['night-dragon'].hp + 10 - 3)
  put(game, 'moon-hare', 0, front(0))
  game = play(game, 'FT-0001', { target: unitTarget(enemy) })
  assert.equal(unit(game, enemy).hp, cards['night-dragon'].hp + 10 - 7)

  game = fixture('priest')
  const own = put(game, 'night-dragon', 0, front(1))
  game = play(game, 'FT-0538', { position: space(0, back(1)) })
  assert.deepEqual(game.players[0].terrain, { 'front:1': 'blessing', 'back:1': 'blessing' })
  resolution(game).damage(unitTarget(own), 1)
  assert.equal(attackValue(game, unit(game, own)), unit(game, own).hp)
})

test('特技の魔法陣と覚醒を別々に表示して、選んだ対象への見込みを実ダメージに一致させる', () => {
  let game = fixture('mage')
  game.players[0].skillUses = 1
  game.players[0].terrain = { 'front:0': 'circle', 'front:1': 'circle' }
  put(game, 'moon-hare', 0, front(0))
  const secondCircle = put(game, 'moon-hare', 0, front(1))
  put(game, 'FT-0135', 0, back(0))
  const enemy = put(game, 'night-dragon', 1, front(0))
  const target = unitTarget(enemy)
  unit(game, enemy).hp = 20
  const spell = cards['FT-0040']
  const [power] = definitionPowerRows(project(game, 0), 0, spell)
  assert.deepEqual({ base: power.base, value: power.value, modifiers: power.modifiers }, {
    base: 2, value: 7, modifiers: [{ label: '覚醒', amount: 1 }, { label: cards['FT-0135'].name, amount: 2 },
      { label: '魔法陣', amount: 2 }],
  })
  const [skillPower] = definitionPowerRows(project(game, 0), 0, leaders.mage.skill, { skill: true })
  assert.equal(skillPower.value, 3)
  unit(game, enemy).grants = ['RESIST_SPELL']
  assert.deepEqual(targetDamagePreview(project(game, 0), 0, spell, target), { value: 0, hp: 20 })
  unit(game, enemy).grants = []
  assert.deepEqual(targetDamagePreview(project(game, 0), 0, spell, target), { value: 7, hp: 13 })
  game = play(game, spell.id, { target })
  assert.equal(unit(game, enemy).hp, 13)
  defeat(game, secondCircle)
  assert.equal(definitionPowerRows(project(game, 0), 0, spell)[0].value, 6)
  const hits = definitionPowerRows(project(game, 0), 0, cards['FT-0060'])
  assert.deepEqual(hits.map(row => [row.label, row.base, row.value]), [['連撃の回数', 3, 4], ['1回のダメージ', 1, 4]])
})

test('滑走路が転位を誘発し、危険床を重ねると再びダメージになる', () => {
  let game = fixture('fighter')
  const runner = put(game, 'FT-0526', 0, back(2))
  game = play(game, 'FT-0527', { position: front(0), extraPosition: space(0, back(2)) })
  assert.deepEqual(unit(game, runner).position, front(2))
  assert.equal(unit(game, runner).attack, cards['FT-0526'].attack + 2)
  assert.equal(unit(game, runner).hp, cards['FT-0526'].hp - 1)
  assert.equal(game.players[0].unitsMoved, 1)

  game = fixture('swordsman')
  put(game, 'FT-0565', 0, front(0))
  const victim = put(game, 'night-dragon', 0, back(1))
  for (let index = 1; index <= 2; index++) {
    game = play(game, 'FT-0572', { position: space(0, back(1)) })
    assert.equal(unit(game, victim).hp, cards['night-dragon'].hp - index)
    assert.equal(unit(game, victim).attack, cards['night-dragon'].attack + 2 * index)
  }
  assert.equal(game.players[1].terrain['back:1'], 'hazard')
})

test('導きの地は退場時能力の後に消え、山札から取得したカードが反応する', () => {
  let game = fixture('seer')
  const oracle = put(game, 'FT-0556', 0, front(0))
  const enemy = put(game, 'night-dragon', 1, front(0))
  game = play(game, 'FT-0557', { position: space(0, front(0)) })
  const drawn = createInstance(game, 'FT-0558')
  drawn.discount = cardCost(drawn) - cardCost(unit(game, oracle)) - 1
  game.players[0].deck = [drawn]
  defeat(game, oracle)
  assert.deepEqual(game.players[0].hand, [drawn])
  assert.equal(unit(game, enemy).hp, cards['night-dragon'].hp - 3)
  assert.equal(game.players[0].terrain['front:0'], undefined)
  assert.deepEqual(project(game, 1).players[0].hand, [])
})

test('暁鳥の種晶は複製も破壊もされず、6色目で対戦が終了する', () => {
  let game = fixture('fighter')
  game = play(game, 'FT-0491', { position: front(0) })
  const player = game.players[0]
  assert.equal(player.units.length, 0)
  assert.equal(game.exiled.at(-1).card, 'FT-0491')
  assert.deepEqual(new Set(player.deck.filter(item => orbCards.includes(item.card)).map(item => item.card)), new Set(orbCards))
  const orbs = player.deck.filter(item => orbCards.includes(item.card))
  player.deck = player.deck.filter(item => !orbCards.includes(item.card))
  player.hand = orbs
  player.copyNextSpell = true
  player.mp = 40
  game = run(game, { type: 'play', id: orbs[0].id, position: space(0, front(0)) })
  assert(!game.players[0].hand.some(item => item.card === orbs[0].card))
  game = play(game, 'FT-0521', { position: space(0, front(0)) })
  assert.equal(game.players[0].terrain['front:0'], orbs[0].card.slice(6))
  for (const [index, orb] of orbs.slice(1).entries()) {
    const spots = [front(1), front(2), back(0), back(1), back(2)]
    game = run(game, { type: 'play', id: orb.id, position: space(0, spots[index]) })
    assert.equal(game.phase, index === 4 ? 'finished' : 'battle')
  }
  assert.equal(game.winner, 0)
  assert.equal(project(game, 1).specialVictory, 0)
  assert.equal(Object.keys(project(game, 1).players[0].terrain).length, 6)
  assert.equal(game.events.filter(event => event.type === 'specialVictory').length, 1)
})

test('手札を選ぶ特技は自身や敵の手札を候補に含めない', () => {
  let game = fixture('fighter')
  const ability = add(game, 'FT-0522')
  assert.equal(legalPlay(game, 0, ability).enabled, false)
  const enemy = add(game, 'dew', 1)
  const own = add(game, 'dew')
  assert.deepEqual(legalPlay(game, 0, ability).handChoices, [own])
  for (const handChoice of [enemy, ability, undefined]) {
    assert.equal(dispatch(game, 0, { type: 'play', id: ability, handChoice }).ok, false)
  }
  assert.equal(project(game, 1).legal, null)
  game = run(game, { type: 'play', id: ability, handChoice: own })
  assert.equal(game.players[0].hand[0].discount, 5)
})

test('CPUの7デッキに第3弾があり、地形で強くなるカードを適切なマスに置く', () => {
  for (const leader of Object.keys(leaders)) {
    const { deck } = cpuLineup(leader)
    assert.equal(deckIssue(deck, leader), null)
    assert.equal(deck.filter(id => cards[id].packId === 'set-3').length, 2)
  }
  let game = fixture('warrior')
  game.players[0].terrain['front:2'] = 'sword'
  const id = add(game, 'FT-0475')
  const action = chooseCpuAction(project(game, 0), 0)
  assert.deepEqual(action.position, front(2))
  game = run(game, action)
  assert.equal(unit(game, id).attack, cards['FT-0475'].attack + 1)
  assert.equal(unit(game, id).hp, cards['FT-0475'].hp + 2)
})


test('生成ユニット5種が出現し、それぞれの効果を解決する', () => {
  let game = fixture('mage')
  const target = put(game, 'night-dragon', 1, front(0))
  game.players[0].terrain['front:0'] = 'circle'
  put(game, 'moon-hare', 0, front(0))
  game = play(game, 'FT-0515', { target: unitTarget(target) })
  const sisters = game.players[0].units.find(unit => unit.card === 'token-petal-sisters')
  assert.deepEqual([sisters.attack, sisters.hp], [2, 2])

  game = fixture('fighter')
  game = play(game, 'FT-0532', { position: front(0) })
  const practice = game.players[0].units[0].id
  assert.deepEqual([unit(game, practice).attack, unit(game, practice).hp], [1, 1])
  game = play(game, 'moon-hare', { position: front(1) })
  assert.deepEqual([unit(game, practice).attack, unit(game, practice).hp], [2, 2])

  game = fixture('merchant')
  game.players[0].terrain['front:0'] = 'sword'
  game = play(game, 'FT-0554', { position: front(0) })
  const stags = game.players[0].units.filter(unit => unit.card === 'token-oak-stag')
  assert.equal(stags.length, 2)
  assert(stags.every(unit => unit.hp === 2 && unit.attack === 2 && cards[unit.card].keywords.includes('GUARD')))

  game = fixture('seer')
  const victim = put(game, 'FT-0011', 0, front(2))
  game.players[0].terrain['front:2'] = 'guide'
  const guardCard = createInstance(game, 'FT-0564')
  guardCard.discount = cards['FT-0564'].cost - 3
  game.players[0].deck = [guardCard]
  defeat(game, victim)
  assert(game.players[0].units.some(unit => unit.card === 'token-sanctuary-guard' && unit.attack === 4 && unit.hp === 4))

  game.players[0].deck = [createInstance(game, 'FT-0519')]
  game = play(game, 'FT-0560', { position: back(1) })
  const dragon = game.players[0].units.find(unit => unit.card === 'token-scarf-dragon')
  assert(dragon)
  assert(game.players[0].hand.some(card => card.card === 'FT-0519' && cardCost(card) === 0))
  game = run(game, { type: 'end' })
  assert.equal(game.players[1].hp, 21)
})

test('秘宝箱は味方が踏むと消え、箱呼びの縞猫は商人カードの代わりに星錠の宝箱を出す', () => {
  let game = fixture('merchant')
  game = play(game, 'FT-0546', { position: space(0, back(0)) })
  game = play(game, 'FT-0548', { position: front(0) })
  assert(game.players[0].units.some(unit => unit.card === 'FT-0203' && unit.attack === 4 && unit.hp === 4))
  assert.equal(game.players[0].terrain['front:0'], undefined)
  assert.equal(game.players[0].hand.length, 0)
  game = play(game, 'moon-hare', { position: back(0) })
  assert.equal(game.players[0].terrain['back:0'], undefined)
  const reward = cards[game.players[0].hand[0].card]
  assert.equal(reward.classId, 'merchant')
  assert.notEqual(reward.kind, 'unit')
})

