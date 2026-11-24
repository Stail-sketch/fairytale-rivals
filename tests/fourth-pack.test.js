import assert from 'node:assert/strict'
import test from 'node:test'
import { cards, catalog } from '../packages/cards/index.js'
import { starterLineup } from '../packages/cards/decks.js'
import { attackValue, createGame, dispatch, leaderTarget, legalPlay, legalSkill, playCost, playerSkill, unitTarget } from '../packages/engine/index.js'
import { createInstance, damage, resolution } from '../packages/engine/effects.js'
import { has } from '../packages/engine/targeting.js'
import { createLocalMatch, project } from '../packages/local-match/index.js'
import { chooseCpuAction } from '../packages/cpu/index.js'
import { definitionPowerRows, targetDamagePreview } from '../packages/engine/power-preview.js'
import { relatedCards } from '../apps/web/card-related.js'

const front = column => ({ row: 'front', column })
const back = column => ({ row: 'back', column })
const unit = (game, id) => game.players.flatMap(player => player.units).find(unit => unit.id === id)
function run(game, action) {
  const result = dispatch(game, game.active, action)
  assert(result.ok, result.issue)
  return result.game
}
function fixture(leader = 'warrior', seed = 449) {
  let game = createGame({ seed, lineups: [starterLineup(leader), starterLineup('mage')] })
  game = run(run(game, { type: 'mulligan', replace: [] }), { type: 'mulligan', replace: [] })
  Object.assign(game.players[0], { mp: 40, maxMp: 10, hand: [] })
  return game
}
function add(game, card, seat = 0) {
  const instance = createInstance(game, card)
  game.players[seat].hand.push(instance)
  return instance.id
}
function play(game, card, fields = {}) { return run(game, { type: 'play', id: add(game, card), ...fields }) }
function put(game, card, seat, position) {
  const instance = createInstance(game, card), resolver = resolution(game)
  resolver.summon(seat, instance, position); resolver.settle()
  return instance.id
}
function defeat(game, id) { unit(game, id).hp = 0; resolution(game).settle() }

test('第4弾100種類を使い、次のターンまで効果を解決できる', async t => {
  const pack = catalog.filter(card => card.packId === 'set-4')
  assert.equal(pack.length, 100)
  for (const card of pack) await t.test(card.id + ' ' + card.name, () => {
    let game = fixture(card.classId === 'neutral' ? 'warrior' : card.classId)
    put(game, 'FT-0013', 0, front(0))
    put(game, 'FT-0031', 0, back(0))
    put(game, 'night-dragon', 0, back(1))
    put(game, 'FT-0037', 1, front(0))
    put(game, 'FT-0013', 1, back(0))
    add(game, 'night-dragon'); add(game, 'dew')
    game.players[0].fallen = ['FT-0031', 'FT-0011', 'FT-0012']
    game.players[0].brokenWeapons = ['FT-0069']
    game.players[0].terrain['front:0'] = 'circle'
    const id = add(game, card.id), check = legalPlay(game, 0, id)
    assert(check.enabled, check.reason)
    game = run(game, { type: 'play', id, position: check.positions?.[0], target: check.targets?.[0],
      choice: check.choices ? 0 : undefined, handChoice: check.handChoices?.[0], column: check.columns?.[0] })
    while (game.pending) game = run(game, { type: 'decide', choice: 0 })
    assert(!game.players[0].hand.some(instance => instance.id === id))
    for (let i = 0; i < 2 && game.phase === 'battle'; i++) game = run(game, { type: 'end' })
    for (const player of game.players) {
      assert(Number.isFinite(player.hp)); assert(Number.isFinite(player.mp))
      assert(player.units.every(unit => Number.isFinite(unit.hp) && Number.isFinite(attackValue(game, unit))))
    }
  })
})

test('刻印は発動元の退場後も継続し、重複、能力封じ、解除を処理する', () => {
  let game = fixture('mage')
  game = play(game, 'FT-0618', { position: front(0) })
  const first = game.players[0].units[0].id
  defeat(game, first)
  game = play(game, 'FT-0618', { position: front(0) })
  const slime = put(game, 'FT-0013', 0, back(0))
  assert.equal(unit(game, slime).maxHp, cards['FT-0013'].hp + 2)
  unit(game, slime).statuses.push('SILENCE')
  resolution(game).settle()
  assert.equal(unit(game, slime).maxHp, cards['FT-0013'].hp + 2)
  assert.equal(game.players[0].badges.length, 2)
  const fang = put(game, 'FT-0576', 0, back(1))
  assert.equal(unit(game, fang).maxHp, cards['FT-0576'].hp + 2, '露牙の小獣も露珠の一族として刻印を受ける')
  const resolver = resolution(game)
  resolver.enqueue([{ id: 'fourth', operation: 'eraseBadge' }], { seat: 1 }); resolver.settle()
  assert.equal(game.players[0].badges.length, 1)
  assert.equal(unit(game, slime).maxHp, cards['FT-0013'].hp + 1)
})

test('刻印の奇襲は生成されたユニットにも付き、使用時能力は生成時には発動しない', () => {
  let game = fixture('warrior')
  game = play(game, 'FT-0613', { position: front(0) })
  game.players[0].badges.push({ id: game.nextId++, card: 'FT-0672', family: 'undead', event: 'mp', amount: 1 })
  game.players[0].mp = 3
  const spawned = put(game, 'token-set4-returning-revenant', 0, back(0))
  assert(has(unit(game, spawned), 'CHARGE'))
  assert.equal(unit(game, spawned).attacks, 0)
  assert.equal(game.players[0].mp, 3)
  game = play(game, 'FT-0606', { position: front(1) })
  assert.equal(game.players[0].mp, 3)
})

test('刻印の軽減は手札だけに適用し、復活時にもHP強化を重ね直さない', () => {
  let game = fixture('priest')
  game = play(game, 'FT-0640', { position: front(0) })
  const dragon = { id: game.nextId++, card: 'FT-0011' }
  assert.equal(playCost(game, 0, dragon), Math.max(0, cards[dragon.card].cost - 1))
  game = play(game, 'FT-0638', { position: front(1) })
  const id = put(game, 'FT-0011', 0, back(0))
  const hp = unit(game, id).maxHp
  defeat(game, id)
  const resolver = resolution(game)
  resolver.enqueue([{ id: 'resurrect', filter: { family: 'dragon' } }], { seat: 0 }); resolver.settle()
  assert.equal(game.players[0].units.find(unit => unit.card === 'FT-0011').maxHp, hp)
})

test('最大MPの条件で効果が分岐し、同値も強化側になる', () => {
  for (const [maxMp, expected] of [[0, 3], [1, 1]]) {
    let game = fixture()
    game.players[0].maxMp = maxMp
    const id = put(game, 'night-dragon', 1, front(0)), hp = unit(game, id).hp
    game = play(game, 'FT-0586', { position: front(0), target: unitTarget(id) })
    assert.equal(unit(game, id).hp, hp - expected)
  }
})

test('アウルの全4形態と第三幕の全体攻撃が連続で動く', () => {
  let game = fixture()
  for (const card of ['FT-0596', 'token-set4-aul-act-two', 'token-set4-aul-act-three', 'token-set4-aul-act-four']) {
    game.players[0].mp = 40
    const existing = game.players[0].hand.find(instance => instance.card === card)
    game = existing ? run(game, { type: 'play', id: existing.id, position: front(0) }) : play(game, card, { position: front(0) })
    const id = game.players[0].units.find(unit => unit.card === card).id
    if (card.endsWith('act-two')) assert(has(unit(game, id), 'DOUBLE_ATTACK'))
    if (card.endsWith('act-four')) assert(has(unit(game, id), 'GUARD'))
    defeat(game, id)
  }
  assert(!game.players[0].hand.some(instance => instance.card.startsWith('token-set4-aul-')))
})

test('竜詩への変身は攻撃力6で起き、退場履歴と奇襲を引き継ぐ', () => {
  let game = fixture()
  game.players[0].fallen = Array(4).fill('FT-0011')
  game = play(game, 'FT-0597', { position: front(0) })
  game = run(run(game, { type: 'end' }), { type: 'end' })
  const transformed = game.players[0].units[0]
  assert.equal(transformed.card, 'token-set4-serena-dragon')
  assert.equal(attackValue(game, transformed), 6)
  assert(has(transformed, 'SUPER_PIERCE'))
  assert.equal(transformed.attacks, 0)
})

test('硬鋼への常在強化は武器にも働き、能力封じで元に戻る', () => {
  let game = fixture('merchant')
  game = play(game, 'FT-0646')
  const metal = put(game, 'FT-0012', 0, front(0))
  const aura = put(game, 'FT-0649', 0, back(0))
  assert.equal(damage(game, unitTarget(metal), 5), 1)
  assert.equal(damage(game, leaderTarget(0), 5), 1)
  unit(game, aura).statuses.push('SILENCE')
  assert.equal(damage(game, unitTarget(metal), 5), 5)
  assert.equal(damage(game, leaderTarget(0), 5), 5)
  game.active = 1
  assert.equal(damage(game, leaderTarget(0), 3), 3)
})

test('4つの願いは通常1つ、未来の統合なら4つすべて解決する', () => {
  for (const both of [false, true]) {
    let game = fixture('seer')
    game.players[0].fortune = both ? 'both' : 'random'
    add(game, 'FT-0011')
    const check = legalPlay(game, 0, add(game, 'FT-0664'))
    assert.equal(check.choices?.length ?? 0, both ? 0 : 4)
    game = run(game, { type: 'play', id: game.players[0].hand.at(-1).id, position: front(0), choice: both ? undefined : 2 })
    assert.equal(game.players[0].badges.length, 1)
    assert.equal(game.players[0].badges[0].attack, 2)
    if (both) {
      assert(game.players[0].hand.some(instance => instance.card === 'token-set4-secret-grimoire'))
      assert.equal(game.players[0].hand.find(instance => instance.card === 'FT-0011').discount, 5)
    }
  }
})

test('奥義変更を表示し、保存・復元後も効果を使用できる', () => {
  let game = fixture('seer')
  game = play(game, 'FT-0655', { position: front(0) })
  assert.equal(playerSkill(game.players[0]).name, '竜詩の導き')
  game.players[0].deck = [createInstance(game, 'FT-0011')]
  game.players[0].tension = 3
  const restored = createLocalMatch({}, JSON.parse(JSON.stringify(game)))
  assert.equal(restored.view(1).players[0].skill.name, '竜詩の導き')
  assert(restored.act(0, { type: 'skill' }).ok)
  assert.equal(restored.view(0).players[0].hand.at(-1).discount, 1)
  assert.equal(project(game, 1).players[0].hand.length, 0)
})

test('支配元が退場・手札に戻ると元の陣営へ戻り、付与された強化は残る', () => {
  for (const exit of ['death', 'return']) {
    let game = fixture()
    const stolen = put(game, 'FT-0037', 1, front(0))
    game = play(game, 'FT-0590', { position: front(0), target: unitTarget(stolen) })
    const source = game.players[0].units.find(unit => unit.card === 'FT-0590').id
    assert.equal(unit(game, stolen).owner, 0)
    if (exit === 'death') defeat(game, source)
    else {
      const resolver = resolution(game)
      resolver.enqueue([{ id: 'return', to: 'chosen' }], { seat: 0, chosen: unitTarget(source) }); resolver.settle()
    }
    assert.equal(unit(game, stolen).owner, 1)
    assert.equal(unit(game, stolen).attack, cards['FT-0037'].attack + 2)
  }
})

test('第4弾の全職業デッキをCPU同士で進めても不正な操作を選ばない', { timeout: 120000 }, () => {
  for (const leader of ['warrior', 'mage', 'fighter', 'priest', 'merchant', 'seer', 'swordsman']) {
    const deck = [...catalog.filter(card => card.packId === 'set-4' && card.classId === 'neutral').slice(0, 20),
      ...catalog.filter(card => card.packId === 'set-4' && card.classId === leader)].map(card => card.id)
    let game = createGame({ seed: 716, lineups: [{ leader, deck }, { leader, deck }] })
    let actions = 0
    while (game.phase !== 'finished' && game.turn < 18 && ++actions < 220) {
      const action = chooseCpuAction(project(game, game.active), game.active)
      assert(action, leader + ' CPUが操作を選ぶ')
      game = run(game, action)
    }
    assert(game.phase === 'finished' || game.turn >= 18, leader + ' 対戦が進行する')
  }
})

test('全体の毒は双方の終了時に働き、武器の回収は壊れたものだけを強化する', () => {
  let game = fixture('swordsman')
  const own = put(game, 'night-dragon', 0, front(0)), enemy = put(game, 'night-dragon', 1, front(0))
  const hp = unit(game, own).hp
  game = play(game, 'FT-0668')
  game = run(game, { type: 'end' })
  assert.equal(unit(game, own).hp, hp - 1)
  assert.equal(unit(game, enemy).hp, hp - 1)
  game = run(game, { type: 'end' })
  assert.equal(unit(game, own).hp, hp - 2)
  assert.equal(unit(game, enemy).hp, hp - 2)

  game = fixture('warrior')
  game = play(game, 'FT-0614')
  const resolver = resolution(game)
  resolver.wearWeapon(0, 2); resolver.settle()
  game = play(game, 'FT-0609')
  const recovered = game.players[0].hand.find(instance => instance.card === 'FT-0614')
  assert(recovered)
  game = run(game, { type: 'play', id: recovered.id })
  assert.equal(game.players[0].weapon.attack, 5)
  assert.equal(game.players[0].weapon.durability, 3)
})

test('覚醒と刻印を内訳に表示し、生成・変身・願いの関連カードを表示する', () => {
  let game = fixture('warrior')
  game.players[0].skillUses = 3
  game = play(game, 'FT-0608')
  assert.equal(game.players[0].leaderAttack, 5)
  const power = definitionPowerRows(project(game, 0), 0, cards['FT-0608'])[0]
  assert.deepEqual([power.base, power.value], [2, 5])
  assert.equal(power.modifiers[0].label, '覚醒')
  assert.equal(relatedCards(cards['FT-0664']).length, 4)
  assert.equal(relatedCards(cards['FT-0597'])[0].card.id, 'token-set4-serena-dragon')
  assert(relatedCards(cards['FT-0641']).some(entry => entry.card.id === 'token-set4-dawn-regalia'))
  assert(relatedCards(cards['FT-0665']).some(entry => entry.card.id === 'token-cloth-dead'))
})

test('露珠の帰還は空いたマスを守晶に置き換え、常在強化と手札軽減は退場で消える', () => {
  let game = fixture('mage')
  put(game, 'FT-0013', 0, front(0)); put(game, 'FT-0012', 0, back(0))
  game = play(game, 'FT-0623', { position: front(1) })
  assert.deepEqual(game.players[0].units.filter(unit => unit.card === 'token-set4-dusk-crystal').map(unit => unit.position), [front(0), back(0)])
  assert(game.players[0].hand.some(instance => instance.card === 'FT-0013'))
  const hp = game.players[1].hp
  game = run(game, { type: 'end' })
  assert.equal(game.players[1].hp, hp - 4)

  game = fixture('fighter')
  const slime = put(game, 'FT-0013', 0, back(0))
  const aura = put(game, 'FT-0634', 0, front(0))
  assert.equal(attackValue(game, unit(game, slime)), cards['FT-0013'].attack + 1)
  assert.equal(playCost(game, 0, { card: 'FT-0013' }), Math.max(0, cards['FT-0013'].cost - 1))
  defeat(game, aura)
  assert.equal(attackValue(game, unit(game, slime)), cards['FT-0013'].attack)
  assert.equal(playCost(game, 0, { card: 'FT-0013' }), cards['FT-0013'].cost)
})
