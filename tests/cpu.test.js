import test from 'node:test'
import assert from 'node:assert/strict'
import { cardCost, cards, catalog, leaders } from '../packages/cards/index.js'
import { createDeckCollection, deckStorageKey, savedDeckPrefix, starterLineup } from '../packages/cards/decks.js'
import { chooseCpuAction } from '../packages/cpu/index.js'
import { createInstance, resolution } from '../packages/engine/effects.js'
import { createGame, dispatch, deckIssue, leaderTarget as leader, legalAttack, legalPlay,
  replay, unitTarget as target } from '../packages/engine/index.js'
import { project } from '../packages/local-match/index.js'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

function perform(game, action) {
  const result = dispatch(game, game.active, action)
  assert(result.ok, JSON.stringify(action) + ' ' + result.issue)
  return result.game
}

function fixture(leaderId) {
  let game = createGame({ seed: 42, lineups: [starterLineup(leaderId), starterLineup('warrior')] })
  game = perform(perform(game, { type: 'mulligan', replace: [] }), { type: 'mulligan', replace: [] })
  Object.assign(game.players[0], { mp: 10, maxMp: 10, hand: [] })
  return game
}

function hand(game, card) {
  const instance = createInstance(game, card)
  game.players[0].hand.push(instance)
  return instance.id
}

function put(game, card, seat = 0, row = 'front', column = 0) {
  const resolver = resolution(game)
  resolver.summon(seat, createInstance(game, card), { row, column })
  const unit = game.players[seat].units.at(-1)
  unit.attacks = 0
  return unit
}

const cpu = game => chooseCpuAction(project(game, game.active), game.active)

test('原作カード1種につきFT IDが1つあり、対応表の基本性能とゲームの定義が一致する', () => {
  const { cards: mapped, packs } = JSON.parse(readFileSync(new URL('../docs/card-correspondence.json', import.meta.url), 'utf8'))
  const comparisons = mapped.filter(record => record.implementation === 'tested')
  assert.deepEqual(Object.fromEntries(['basic', 'standard', 'set-2', 'set-3'].map(pack =>
    [pack, comparisons.filter(record => record.pack === pack).length])), { basic: 86, standard: 287, 'set-2': 100, 'set-3': 100 })
  assert.equal(new Set(mapped.map(record => record.sourceKey)).size, mapped.length)
  assert.equal(new Set(mapped.map(record => record.ftId)).size, mapped.length)
  const archived = mapped.flatMap(record => record.archive ? [record.archive.id] :
    record.verification === 'archive-catalogued' ? [Number(record.referenceId.split(':')[1])] : [])
  assert.equal(new Set(archived).size, archived.length)
  assert.equal(archived.length, packs.reduce((count, pack) => count + (pack.archivedCount ?? 0), 0))
  assert(mapped.filter(record => record.implementation === 'not-implemented').every(record => !cards[record.ftId]))
  for (const record of comparisons) {
    const { cost, attack, hp, classId, kind, rarity, keywords, packId } = cards[record.ftId]
    assert.deepEqual({ cost, attack, hp, classId, kind, rarity, keywords }, record.stats, record.ftId)
    assert.equal(packId, record.pack)
  }
  for (const leaderId of Object.keys(leaders)) {
    const { deck } = starterLineup(leaderId)
    assert.equal(deckIssue(deck, leaderId), null)
    assert(['FT-0010', 'FT-0011', 'FT-0012'].every(id => deck.includes(id)), leaderId)
  }
  const { deck } = starterLineup('mage')
  assert.match(deckIssue(deck, 'priest'), /職業/)
})

test('各カードが別々の有効なWebPイラストを持つ', () => {
  const hashes = catalog.map(card => {
    const art = readFileSync(new URL('../apps/web/assets/' + card.artId + '.webp', import.meta.url))
    assert.equal(art.subarray(8, 12).toString(), 'WEBP', card.id)
    return createHash('sha256').update(art).digest('hex')
  })
  assert.equal(new Set(hashes).size, catalog.length)
})

test('旧枠を引き継ぎ、同じ語り手の複数デッキを別々に保存・改名できる', () => {
  const state = new Map()
  const storage = {
    keys: () => state.keys(), getItem: key => state.get(key),
    setItem: (key, value) => state.set(key, value), removeItem: key => state.delete(key),
  }
  const original = starterLineup('mage').deck
  state.set(deckStorageKey + '.mage', JSON.stringify(original))
  state.set(deckStorageKey + '.priest', '{')
  const collection = createDeckCollection(storage)
  const anotherTab = createDeckCollection(storage)
  assert.deepEqual(collection.list().map(record => record.id), ['legacy-mage'])
  const deck = [...original]
  deck[deck.indexOf('ember-whelp')] = 'FT-0034'
  assert.equal(collection.save({ leader: 'mage', name: '未完成', deck: deck.slice(1) }).ok, false)
  assert.equal(collection.save({ leader: 'priest', name: '職業違い', deck }).ok, false)
  assert.equal(collection.save({ leader: 'unknown', name: '未知', deck }).ok, false)
  assert.equal(collection.save({ leader: 'mage', name: ' ', deck }).ok, false)
  const result = collection.save({ leader: 'mage', name: '星降る夜', deck })
  assert.equal(result.ok, true)
  const warrior = [...starterLineup('warrior').deck]
  warrior[0] = 'FT-0041'
  assert.equal(anotherTab.save({ leader: 'warrior', name: '戦士の剣', deck: warrior }).ok, true)
  assert.equal(anotherTab.save({ ...result.deck, name: ' 星夜の魔法 ' }).deck.name, '星夜の魔法')
  assert.equal(collection.save({ ...collection.get('legacy-mage'), name: '夢時計' }).ok, true)
  for (let index = 0; index < 12; index++) {
    assert.equal(anotherTab.save({ leader: 'mage', name: '追加' + index, deck }).ok, true)
  }
  state.set(savedDeckPrefix + 'a'.repeat(32), '{"deck":[]}')
  const restored = createDeckCollection(storage)
  assert.equal(restored.list('mage').length, 14)
  assert.equal(restored.list().length, 15)
  assert.deepEqual(restored.list('mage').map(record => record.name),
    ['夢時計', '星夜の魔法', ...Array.from({ length: 12 }, (_, index) => '追加' + index)])
  assert.deepEqual(restored.get(result.deck.id).deck, deck)
  assert.equal(restored.get(result.deck.id).name, '星夜の魔法')
  assert.deepEqual(restored.list('warrior')[0].deck, warrior)
  assert.equal(restored.get('legacy-mage').name, '夢時計')
  assert.deepEqual(restored.get('legacy-mage').deck, original)
  assert.deepEqual(restored.list('priest'), [])
  const game = createGame({ seed: 31, lineups: [restored.get(result.deck.id), starterLineup('priest')] })
  assert.deepEqual([...game.players[0].hand, ...game.players[0].deck].map(card => card.card).sort(), [...deck].sort())
  const legends = [...deck]
  legends[0] = 'FT-0037'
  assert.match(deckIssue(legends, 'mage'), /同名/)

  for (const leader of ['swordsman', 'seer', 'merchant', 'priest', 'fighter']) {
    assert.equal(restored.save({ ...starterLineup(leader), name: leader }).ok, true)
  }
  assert.deepEqual([...new Set(restored.list().map(record => record.leader))],
    ['warrior', 'mage', 'fighter', 'priest', 'merchant', 'seer', 'swordsman'])
  assert.equal(restored.remove(result.deck.id).ok, true)
  assert.equal(anotherTab.get(result.deck.id), null)
  assert.equal(restored.save(result.deck).ok, false)
  assert.equal(restored.remove('legacy-mage').ok, true)
  assert.equal(state.has(deckStorageKey + '.mage'), false)
  assert.equal(state.has(savedDeckPrefix + 'legacy-mage'), false)
  state.set(deckStorageKey + '.priest', JSON.stringify(starterLineup('priest').deck))
  assert.equal(restored.get('legacy-priest').id, 'legacy-priest')
  assert.equal(restored.remove('legacy-priest').ok, true)
  const afterRemoval = createDeckCollection(storage)
  assert.equal(afterRemoval.get('legacy-mage'), null)
  assert.equal(afterRemoval.get('legacy-priest'), null)
  assert.equal(afterRemoval.list('mage').length, 12)
  assert.deepEqual(afterRemoval.list('warrior')[0].deck, warrior)
})

test('追加した48種を対応する職業が対戦中に使用できる', async t => {
  const expansion = catalog.filter(card => /^FT-\d+$/.test(card.id) &&
    Number(card.id.slice(3)) >= 13 && Number(card.id.slice(3)) <= 60)
  assert.equal(expansion.length, 48)
  for (const card of expansion) {
    await t.test(card.id + ' ' + card.name, () => {
      let game = fixture(card.classId === 'neutral' ? 'mage' : card.classId)
      Object.assign(game.players[0], { skillUses: 3, tension: 1, hp: 19 })
      put(game, 'moon-hare')
      const enemy = put(game, 'night-dragon', 1)
      const id = hand(game, card.id)
      const legal = legalPlay(game, 0, id)
      assert(legal.enabled, legal.reason)
      const cost = cardCost({ card: card.id }, 3)
      game = perform(game, { type: 'play', id, position: legal.positions?.[0],
        target: legal.targets?.find(candidate => candidate.id === enemy.id) ?? legal.targets?.[0] })
      assert.equal(game.players[0].mp, 10 - cost)
      assert(!game.players[0].hand.some(instance => instance.id === id))
      if (card.kind === 'unit') assert(game.players[0].units.some(unit => unit.id === id))
    })
  }
})

test('声援、共鳴、物語の共鳴、覚醒を別々に処理し、CPUにも反映する', () => {
  let game = fixture('mage')
  const mole = put(game, 'FT-0026')
  const singer = put(game, 'FT-0037', 0, 'front', 1)
  const enemy = put(game, 'night-dragon', 1)
  Object.assign(game.players[0], { tension: 2 })
  const support = hand(game, 'FT-0043')
  const flash = hand(game, 'FT-0040')
  const beetle = hand(game, 'FT-0042')
  assert(!legalPlay(game, 0, beetle).enabled)
  game = perform(game, { type: 'play', id: support, position: { row: 'back', column: 0 } })
  assert.equal(game.players[0].tension, 3)
  assert.equal(game.players[0].units.find(unit => unit.id === mole.id).attack, 2)
  assert.equal(game.players[1].hp, 25)
  game = perform(game, { type: 'skill', target: leader(1) })
  assert.equal(game.players[1].hp, 19)
  assert.equal(game.players[0].skillUses, 1)
  assert.equal(project(game, 0).players[0].skillUses, 1)
  assert(game.events.some(event => event.type === 'ability' && event.id === singer.id))
  game = perform(game, { type: 'play', id: flash, target: target(enemy.id) })
  assert.equal(game.players[1].units[0].hp, enemy.hp - 3)
  const puppet = hand(game, 'FT-0039')
  game = perform(game, { type: 'play', id: puppet, position: { row: 'back', column: 1 } })
  assert.equal(game.players[0].units.find(unit => unit.id === puppet).attack, 2)
  assert.equal(cardCost({ card: 'FT-0042' }, 7), 0)
})

test('対象付き召喚は配置と対象の両方を検証し、対象が空でも召喚できる', () => {
  let game = fixture('mage')
  const piece = hand(game, 'FT-0034')
  const position = { row: 'front', column: 0 }
  assert.equal(legalPlay(game, 0, piece).targets, undefined)
  const unit = put(game, 'mist-cat', 0, 'back', 0)
  assert(!dispatch(game, 0, { type: 'play', id: piece, position }).ok)
  game = perform(game, { type: 'play', id: piece, position, target: target(unit.id) })
  assert(game.players[0].units[0].statuses.includes('SILENCE'))
  const kite = hand(game, 'FT-0036')
  game = perform(game, { type: 'play', id: kite, position: { row: 'front', column: 1 }, target: target(unit.id) })
  assert.equal(game.players[0].units.find(candidate => candidate.id === unit.id).position.row, 'front')
  assert.equal(game.players[0].units.find(candidate => candidate.id === piece).position.row, 'back')
})

test('リーダーの軽減は次の自分のターン開始まで続く', () => {
  let game = fixture('warrior')
  game.players[0].skillUses = 1
  const rooster = hand(game, 'FT-0055')
  game = perform(game, { type: 'play', id: rooster, position: { row: 'back', column: 0 } })
  assert.equal(game.players[0].leaderArmor, 2)
  const opponent = put(game, 'night-dragon', 1)
  game = perform(game, { type: 'end' })
  game = perform(game, { type: 'attack', id: opponent.id, target: leader(0) })
  assert.equal(game.players[0].hp, 25 - opponent.attack + 2)
  game = perform(game, { type: 'end' })
  assert.equal(game.players[0].leaderArmor, 0)
})

test('魔法使いの単体ダメージ、全体除去と特技誘発をCPUが使い分ける', () => {
  let game = fixture('mage')
  const mage = put(game, 'FT-0002')
  const targetUnit = put(game, 'brass-squire', 1)
  const blast = hand(game, 'FT-0001')
  const sweep = hand(game, 'FT-0003')
  assert.equal(legalPlay(game, 0, blast).targets.length, 4)
  game = perform(game, { type: 'play', id: blast, target: target(targetUnit.id) })
  assert.equal(game.players[0].units.find(unit => unit.id === mage.id).attack, 3)
  assert.equal(game.players[1].units.length, 0)
  put(game, 'brass-squire', 1)
  put(game, 'FT-0011', 1, 'front', 1)
  const sweepMove = cpu(game)
  assert.deepEqual(sweepMove, { type: 'play', id: sweep })
  game = perform(game, sweepMove)
  assert.equal(game.players[1].units.length, 0)
  assert.equal(game.players[0].units[0].attack, 4)
  assert.equal(game.players[0].mp, 1)

  game = fixture('mage')
  game.players[1].hp = 3
  put(game, 'twig-guard', 1)
  const finishing = hand(game, 'FT-0001')
  assert.deepEqual(cpu(game), { type: 'play', id: finishing, target: leader(1) })
  assert.equal(perform(game, cpu(game)).winner, 0)
})

test('僧侶は味方を回復して誘発し、満タンと敵の回復では強化しない', () => {
  let game = fixture('priest')
  const beast = put(game, 'FT-0006')
  const enemy = put(game, 'brass-squire', 1)
  enemy.hp = 1
  game.players[0].hp = 12
  const healing = hand(game, 'FT-0005')
  const ward = hand(game, 'FT-0004')
  game = perform(game, { type: 'play', id: ward, target: target(beast.id) })
  assert.deepEqual(game.players[0].units.map(unit => [unit.attack, unit.hp, unit.maxHp]), [[2, 7, 7]])
  game.players[0].units[0].attacks = 2
  assert.deepEqual(cpu(game), { type: 'play', id: healing, target: leader(0) })
  game = perform(game, cpu(game))
  assert.equal(game.players[0].hp, 15)
  assert.equal(game.players[0].units[0].attack, 3)
  const empty = hand(game, 'FT-0005')
  game = perform(game, { type: 'play', id: empty, target: target(beast.id) })
  const forEnemy = hand(game, 'FT-0005')
  game = perform(game, { type: 'play', id: forEnemy, target: target(enemy.id) })
  assert.equal(game.players[0].units[0].attack, 3)
  assert.equal(game.players[1].units[0].hp, 3)
})

test('魔剣士は退場・ドロー・最大MP増加の順で処理し、一時MPで大型を先出しする', () => {
  let game = fixture('swordsman')
  Object.assign(game.players[0], { mp: 3, maxMp: 3 })
  const sacrifice = put(game, 'sugar-bomb')
  sacrifice.attacks = 2
  const pact = hand(game, 'FT-0007')
  assert.deepEqual(cpu(game), { type: 'play', id: pact, target: target(sacrifice.id) })
  game = perform(game, cpu(game))
  assert.equal(game.players[0].maxMp, 4)
  assert.equal(game.players[0].mp, 2)
  assert.equal(game.players[1].hp, 23)
  assert.equal(game.players[0].hand.length, 1)
  const types = game.events.map(event => event.type)
  assert(types.lastIndexOf('death') < types.lastIndexOf('draw'))
  assert(types.lastIndexOf('draw') < types.lastIndexOf('mp'))
  game = fixture('swordsman')
  Object.assign(game.players[0], { mp: 6, maxMp: 6 })
  const boost = hand(game, 'FT-0008')
  const dragon = hand(game, 'FT-0009')
  assert.deepEqual(cpu(game), { type: 'play', id: boost })
  game = perform(game, cpu(game))
  assert.equal(game.players[0].mp, 7)
  assert.equal(game.players[0].maxMp, 6)
  const deploy = cpu(game)
  assert.equal(deploy.id, dragon)
  assert.equal(deploy.position.row, 'front')
  game = perform(game, deploy)
  assert.equal(game.players[0].units[0].attack, 7)
  game = perform(perform(game, { type: 'end' }), { type: 'end' })
  assert.equal(game.players[0].mp, 7)
})

test('共通3種を召喚し、鋼の身に3と4ダメージを与え、前衛の騎士の誓いを判定する', () => {
  let game = fixture('mage')
  for (const [index, card] of ['FT-0010', 'FT-0011', 'FT-0012'].entries()) {
    const id = hand(game, card)
    game = perform(game, { type: 'play', id, position: { row: 'front', column: index } })
    assert.deepEqual(game.players[0].units[index].card, card)
  }
  const metal = game.players[0].units[2]
  const hit = hand(game, 'FT-0001')
  game = perform(game, { type: 'play', id: hit, target: target(metal.id) })
  assert.equal(game.players[0].units[2].hp, 1)
  game.players[1].maxMp = 10
  const foe = put(game, 'night-dragon', 1)
  foe.attack = 4
  game = perform(game, { type: 'end' })
  game = perform(game, { type: 'attack', id: foe.id, target: target(metal.id) })
  assert.equal(game.players[0].units.length, 2)
  game = fixture('priest')
  const ally = put(game, 'brass-squire')
  const guard = put(game, 'FT-0009', 1, 'back')
  assert(legalAttack(game, 0, ally.id).targets.some(t => t.kind === 'leader'))
  guard.position = { row: 'front', column: 0 }
  assert.deepEqual(legalAttack(game, 0, ally.id).targets, [target(guard.id)])
})

test('CPUの判断は相手の手札内容と山札の並びに依存しない', () => {
  const game = fixture('mage')
  game.players[0].mp = 3
  hand(game, 'FT-0002')
  hand(game, 'FT-0001')
  const choice = cpu(game)
  game.players[0].deck.reverse()
  game.players[1].deck.reverse()
  game.players[1].hand.forEach(instance => { instance.card = 'storm' })
  assert.deepEqual(cpu(game), choice)
})

test('CPUはレオンの奥義からリーダー攻撃につないで勝利する', () => {
  let game = fixture('warrior')
  game.players[0].tension = 3
  game.players[1].hp = 3
  assert.deepEqual(cpu(game), { type: 'skill' })
  game = perform(game, cpu(game))
  assert.deepEqual(cpu(game), { type: 'leaderAttack', target: leader(1) })
  assert.equal(perform(game, cpu(game)).winner, 0)
})

for (const [i, pair] of [['mage', 'priest'], ['priest', 'swordsman'], ['swordsman', 'mage']].entries()) {
  test('CPUの合法手で最後まで対戦し、リプレイを再現する ' + pair.join(' / '), () => {
    const config = { seed: i + 87, lineups: pair.map(id => starterLineup(id)) }
    let game = createGame(config)
    for (let actions = 0; actions < 350 && game.phase !== 'finished'; actions++) {
      game = perform(game, cpu(game))
    }
    assert.equal(game.phase, 'finished')
    for (const [seat, classId] of pair.entries()) {
      assert(game.events.some(event => event.seat === seat && cards[event.card]?.classId === classId), classId)
    }
    assert.deepEqual(replay(config, game.history), game)
  })
}
