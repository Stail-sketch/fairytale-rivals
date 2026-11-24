import test from 'node:test'
import assert from 'node:assert/strict'
import { cardCost, cards, catalog, leaders, names, prototypeDeck } from '../packages/cards/index.js'
import { createGame, deckIssue, dispatch, leaderTarget as leader, legalAttack, legalLeaderAttack, legalPlay, legalSkill,
  replay, unitTarget as target } from '../packages/engine/index.js'
import { createInstance, resolution } from '../packages/engine/effects.js'
import { attackBreakdown, leaderAttackBreakdown } from '../packages/engine/targeting.js'
import { project } from '../packages/local-match/index.js'
import { statusVisuals, statusDescriptions } from '../apps/web/battle-status.js'

const front = (column = 0) => ({ row: 'front', column })
const back = (column = 0) => ({ row: 'back', column })
const config = { seed: 123 }
function act(game, action, seat = game.active) {
  const result = dispatch(game, seat, action)
  assert.equal(result.ok, true, result.issue)
  return result.game
}
function battle() {
  return act(act(createGame(config), { type: 'mulligan', replace: [] }), { type: 'mulligan', replace: [] })
}
function fixture() {
  const game = battle()
  game.players[0].mp = 10
  game.players[0].maxMp = 10
  game.players[0].hand = []
  return game
}
function add(game, seat, card, position) {
  const resolver = resolution(game)
  const instance = createInstance(game, card)
  resolver.summon(seat, instance, position)
  const unit = game.players[seat].units.at(-1)
  unit.attacks = 0
  return unit
}
function prepare(game, card, seat = game.active) {
  const instance = createInstance(game, card)
  game.players[seat].hand.push(instance)
  return instance.id
}
function play(game, card, options = {}) {
  return act(game, { type: 'play', id: prepare(game, card), ...options })
}

test('カタログ、30枚デッキ、同名制限、正式名称', () => {
  assert.equal(catalog.filter(card => card.packId === 'prototype').length, 30)
  assert.equal(new Set(prototypeDeck).size, 30)
  assert.equal(Object.keys(leaders).length, 7)
  assert.equal(names.TENSION_LINK, '共鳴')
  assert.equal(names.SKILL_LINK, '物語の共鳴')
  assert.equal(deckIssue(prototypeDeck, 'warrior'), null)
  assert.match(deckIssue([...prototypeDeck.slice(0, 29), 'toString'], 'warrior'), /未知/)
  assert.match(deckIssue([...prototypeDeck.slice(0, 29), 'night-dragon'], 'warrior'), /同名/)
})

test('マリガン、先攻と後攻の手札・熱量・MP、決定的な再生', () => {
  const start = createGame(config)
  assert.deepEqual(start.players.map(p => [p.hp, p.hand.length, p.tension]), [[25, 3, 0], [25, 4, 2]])
  const ids = start.players[0].hand.map(c => c.id)
  assert.equal(dispatch(start, 0, { type: 'mulligan', replace: [ids[0], ids[0]] }).ok, false)
  let game = act(start, { type: 'mulligan', replace: ids })
  assert(game.players[0].hand.every(c => !ids.includes(c.id)))
  assert(ids.every(id => game.players[0].deck.some(c => c.id === id)))
  game = act(game, { type: 'mulligan', replace: [] })
  assert.deepEqual(game.players.map(p => p.hand.length), [4, 4])
  assert.deepEqual(game.players.map(p => p.mp), [1, 0])
  game = act(game, { type: 'end' })
  assert.equal(game.players[1].mp, 1)
  assert.deepEqual(replay(config, game.history), game)
})

test('存在しないカード、相手ターン、MP不足、盤面外、占有マス、空きなしを拒否', () => {
  const game = fixture()
  const id = prepare(game, 'brass-squire')
  const action = { type: 'play', id, position: front() }
  const before = structuredClone(game)
  assert.equal(dispatch(game, 0, { ...action, id: 9876 }).ok, false)
  assert.equal(dispatch(game, 1, action).ok, false)
  assert.equal(dispatch(game, 0, { ...action, position: front(3) }).ok, false)
  assert.deepEqual(game, before)
  game.players[0].mp = 1
  assert.equal(dispatch(game, 0, action).issue, 'MPが足りません')
  game.players[0].mp = 10
  let after = act(game, action)
  assert.equal(after.players[0].mp, 8)
  assert.equal(after.players[0].hand.length, 0)
  assert.equal(legalAttack(after, 0, id).enabled, false)
  const bunny = prepare(after, 'moon-hare')
  assert.equal(dispatch(after, 0, { ...action, id: bunny }).ok, false)
  for (const position of [front(1), front(2), back(), back(1), back(2)]) add(after, 0, 'moon-hare', position)
  assert.equal(legalPlay(after, 0, bunny).enabled, false)
  after = act(act(after, { type: 'end' }), { type: 'end' })
  assert.equal(legalAttack(after, 0, id).enabled, true)
})

test('前衛防護、守りの陣、騎士の誓い、鷹の目、影隠れ', () => {
  const game = fixture()
  const normal = add(game, 0, 'moon-hare', front())
  const aim = add(game, 0, 'lake-scout', front(1))
  const guard = add(game, 1, 'twig-guard', front())
  const blocked = add(game, 1, 'brass-squire', back())
  const front2 = add(game, 1, 'moon-hare', front(1))
  const hidden = add(game, 1, 'mist-cat', back(2))
  assert.deepEqual(legalAttack(game, 0, normal.id).targets, [target(guard.id)])
  assert.deepEqual(legalAttack(game, 0, aim.id).targets, [target(guard.id), target(blocked.id), target(front2.id), leader(1)])
  assert.equal(dispatch(game, 0, { type: 'attack', id: aim.id, target: target(hidden.id) }).ok, false)
  guard.statuses.push('SILENCE')
  assert(legalAttack(game, 0, normal.id).targets.some(t => t.kind === 'leader'))
  const back2 = add(game, 1, 'moon-hare', front(2))
  assert.deepEqual(legalAttack(game, 0, normal.id).targets, [target(guard.id), target(front2.id), target(back2.id)])
  assert.equal(dispatch(game, 0, { type: 'attack', id: normal.id, target: target(blocked.id) }).ok, false)
  assert.equal(dispatch(game, 0, { type: 'attack', id: normal.id, target: leader(1) }).ok, false)
  assert.equal(play(game, 'spark', { target: leader(1) }).players[1].hp, 23)
  const spell = prepare(game, 'spark')
  assert.equal(dispatch(game, 0, { type: 'play', id: spell, target: target(hidden.id) }).ok, false)
})

test('戦闘の予測は軽減と反撃を反映し、前衛防護と攻撃前の誘発を表示する', () => {
  const game = fixture()
  const attacker = add(game, 0, 'brass-squire', front())
  const beetle = add(game, 1, 'steel-beetle', front())
  const protectedUnit = add(game, 1, 'moon-hare', back())
  const view = project(game, 0)
  const preview = view.legal.attack[attacker.id]
  const forecast = preview.forecasts.find(info => info.target.id === beetle.id)
  assert.equal(forecast.damage, 1)
  assert.equal(preview.protection.covered[protectedUnit.id], beetle.id)
  assert.equal(project(game, 1).legal, null)
  const after = act(game, { type: 'attack', id: attacker.id, target: target(beetle.id) })
  assert.equal(after.players[1].units.find(unit => unit.id === beetle.id).hp, forecast.hp)
  assert.equal(Math.max(0, after.players[0].units.find(unit => unit.id === attacker.id)?.hp ?? 0), forecast.attackerHp)

  const triggered = add(game, 0, 'FT-0232', front(1))
  const variable = project(game, 0).legal.attack[triggered.id].forecasts[0]
  assert.match(variable.note, /攻撃前/)
  assert.equal(variable.damage, undefined)

  game.players[1].terrain['front:0'] = 'blessing'
  const blessing = project(game, 0).legal.attack[attacker.id].forecasts.find(info => info.target.id === beetle.id)
  const blessed = act(game, { type: 'attack', id: attacker.id, target: target(beetle.id) })
  const returnHit = blessed.events.findLast(event => event.type === 'damage' && event.target.id === attacker.id)
  assert.equal(blessing.retaliation, beetle.hp)
  assert.equal(blessing.retaliation, returnHit.value)
})

test('奇襲、双撃、穿ちの一撃、鋼の身、攻撃時が戦闘に先行', () => {
  let game = play(fixture(), 'ember-whelp', { position: front() })
  const charger = game.players[0].units[0]
  game = act(game, { type: 'attack', id: charger.id, target: leader(1) })
  assert.equal(game.players[1].hp, 23)
  const fox = add(game, 0, 'twin-fox', front(1))
  game = act(act(game, { type: 'attack', id: fox.id, target: leader(1) }), { type: 'attack', id: fox.id, target: leader(1) })
  assert.equal(legalAttack(game, 0, fox.id).enabled, false)
  const knight = add(game, 0, 'needle-knight', front(2))
  const beetle = add(game, 1, 'steel-beetle', front())
  const behind = add(game, 1, 'brass-squire', back())
  game = act(game, { type: 'attack', id: knight.id, target: target(beetle.id) })
  assert.deepEqual(game.players[1].units.map(unit => [unit.id, unit.hp]), [[beetle.id, 3]])
  assert.equal(game.players[1].graveyard.at(-1).id, behind.id)
  assert.equal(game.players[0].units.find(unit => unit.id === knight.id).hp, 2)
  const owl = add(game, 0, 'thorn-owl', back())
  game.players[1].hp = 1
  game = act(game, { type: 'attack', id: owl.id, target: target(beetle.id) })
  assert.equal(game.winner, 0)
  assert.equal(game.players[1].units[0].hp, 3)
})

test('同時死亡は一括処理し、退場時の召喚を解決し、両リーダーの同時敗北は引き分け', () => {
  let game = fixture()
  const bomb0 = add(game, 0, 'sugar-bomb', front())
  const bomb1 = add(game, 1, 'sugar-bomb', front())
  game.players.forEach(p => { p.hp = 2 })
  game = act(game, { type: 'attack', id: bomb0.id, target: target(bomb1.id) })
  assert.equal(game.winner, 'draw')
  const tail = game.events.slice(-7)
  assert.deepEqual(tail.map(event => event.type), ['death', 'death', 'ability', 'damage', 'ability', 'damage', 'finish'])
  assert.deepEqual(tail.filter(event => event.type === 'damage').map(event => [event.source, event.destination]), [
    [{ kind: 'unit', seat: 0, id: bomb0.id, position: front(), card: 'sugar-bomb' }, { kind: 'leader', seat: 1 }],
    [{ kind: 'unit', seat: 1, id: bomb1.id, position: front(), card: 'sugar-bomb' }, { kind: 'leader', seat: 0 }],
  ])
  assert.equal(dispatch(game, 0, { type: 'end' }).ok, false)
  game = fixture()
  const ghost = add(game, 1, 'lantern-ghost', front(1))
  const guard = add(game, 0, 'twig-guard', back(2))
  guard.hp = 3
  ghost.hp = 2
  const deckCount = game.players[1].deck.length
  const after = play(game, 'storm')
  assert.equal(after.players[1].units[0].card, 'page-sprite')
  assert.deepEqual(after.players[1].units[0].position, front(1))
  assert.equal(after.players[1].units[0].hp, 2)
  assert.equal(after.players[1].deck.length, deckCount - 1)
  assert.deepEqual(after.events.slice(-5).map(e => e.type), ['ability', 'summon', 'ability', 'draw', 'handAdded'])
  assert.equal(after.events.findLast(event => event.type === 'spell').played, true)
  assert.equal(after.events.findLast(event => event.type === 'summon').played, undefined)
  assert.deepEqual(after.events.filter(event => event.type === 'damage').map(event => [
    event.source.card, event.destination.id, event.destination.position,
  ]), [['storm', guard.id, back(2)], ['storm', ghost.id, front(1)]])
})

test('対象不在、除外、能力封じ、毒、完全防護、転位', () => {
  let game = fixture()
  const empty = prepare(game, 'ink')
  assert.equal(legalPlay(game, 0, empty).enabled, false)
  assert.equal(dispatch(game, 0, { type: 'play', id: empty, target: target(998) }).ok, false)
  const ghost = add(game, 1, 'lantern-ghost', front())
  game = play(game, 'exile', { target: target(ghost.id) })
  assert.equal(game.players[1].units.length, 0)
  assert.equal(game.exiled[0].id, ghost.id)
  const guard = add(game, 1, 'twig-guard', front())
  game = act(game, { type: 'play', id: empty, target: target(guard.id) })
  assert(game.players[1].units[0].statuses.includes('SILENCE'))
  game = act(act(game, { type: 'end' }), { type: 'end' })
  const own = add(game, 0, 'moon-hare', front())
  game = play(game, 'retreat', { target: target(own.id) })
  assert.deepEqual(game.players[0].units[0].position, back())
  game = play(game, 'veil', { target: target(own.id) })
  game = play(game, 'poison', { target: target(guard.id) })
  game = act(game, { type: 'end' })
  game = act(game, { type: 'attack', id: guard.id, target: target(own.id) })
  assert.equal(game.players[0].units[0].hp, 2)
  assert(game.events.some(event => event.type === 'damage' && event.target.id === own.id &&
    event.value === 0 && event.protection === 'INVULNERABLE'))
  game = act(game, { type: 'end' })
  assert.equal(game.players[1].units.length, 0)
  assert.deepEqual(game.players[0].units[0].statuses, [])
})

test('防護と常在型能力の表示を、付与・実際の軽減・期限切れに合わせる', () => {
  let game = fixture()
  game.players[0].leader = 'merchant'
  const guard = add(game, 0, 'twig-guard', back())
  const steel = add(game, 0, 'steel-beetle', front(2))
  const cloaked = add(game, 0, 'mist-cat', back(1))
  const view = () => project(game, game.active)
  const status = (unit, before, events = []) => {
    const current = view()
    const live = current.players[unit.owner].units.find(value => value.id === unit.id)
    return statusVisuals(current, before, live.owner, live, cards[live.card], events)
  }
  const before = view()
  assert.match(status(guard, before).markup, /data-ability="GUARD" data-active="false"/)
  guard.position = front()
  assert.match(status(guard, before, [{}]).cls, /guard-active/)
  game = play(game, 'FT-0108', { target: target(guard.id) })
  assert.match(status(guard, before, game.events.slice(-1)).markup, /ability-pulse" data-ability="PIERCE"/)
  game = act(game, { type: 'attack', id: cloaked.id, target: leader(1) })
  assert.match(status(cloaked, before, game.events.slice(-2)).markup, /ability-pulse" data-ability="STEALTH" data-active="false"/)

  game = act(game, { type: 'end' })
  game = play(game, 'spark', { target: target(steel.id) })
  const reduced = game.events.at(-1)
  assert.equal(reduced.protection, 'METAL_BODY')
  assert.equal(reduced.value, 1)
  assert.match(status(steel, before, [reduced]).markup, /ability-pulse" data-ability="METAL_BODY"/)

  game = act(game, { type: 'end' })
  game = play(game, 'FT-0139', { position: front(1) })
  assert.match(status(guard, before, game.events.slice(-2)).markup, /defense-burst/)
  game = act(game, { type: 'end' })
  const hp = game.players[0].hp
  game = play(game, 'spark', { target: leader(0) })
  const blocked = game.events.at(-1)
  assert.equal(blocked.protection, 'SPELL_WARD')
  assert.equal(blocked.value, 0)
  assert.equal(game.players[0].hp, hp)
  assert.match(statusVisuals(view(), before, 0, null, null, [blocked]).markup, /defense-burst/)
  assert.match(statusDescriptions(view().players[0], view()).join(), /現在のターン終了まで/)
  game = act(game, { type: 'end' })
  assert.deepEqual(statusDescriptions(view().players[0], view()), [])
})

test('MPと熱量上限、共鳴と物語の共鳴が別々に発動', () => {
  let game = fixture()
  const bell = add(game, 0, 'bell-familiar', front())
  add(game, 0, 'choir-siren', front(1))
  game.players[0].hp = 15
  game = act(game, { type: 'focus' })
  assert.equal(game.players[0].mp, 9)
  assert.equal(dispatch(game, 0, { type: 'focus' }).ok, false)
  game = play(game, 'cheer')
  game = play(game, 'cheer')
  assert.equal(game.players[0].tension, 3)
  const buffed = game.players[0].units.find(unit => unit.id === bell.id)
  assert.deepEqual(attackBreakdown(project(game, 0), buffed), {
    base: 1, modifiers: [{ label: '共鳴', amount: 3 }], value: 4,
  })
  assert.equal(game.players[0].hp, 15)
  game = act(game, { type: 'skill' })
  assert.equal(game.players[0].hp, 17)
  assert.equal(game.players[0].tension, 0)
  assert.deepEqual(leaderAttackBreakdown(project(game, 0), 0), {
    base: 0, modifiers: [{ label: '語り手の奥義', amount: 3 }], value: 3,
  })
  game = act(game, { type: 'leaderAttack', target: leader(1) })
  assert.equal(game.players[1].hp, 22)
  assert.equal(game.players[0].units[0].attack, 4)
  for (let i = 0; i < 24; i++) game = act(game, { type: 'end' })
  assert.deepEqual(game.players.map(p => p.maxMp), [10, 10])
})

test('札の生成と選択、手札上限、山札切れ、乱数による破棄', () => {
  let game = fixture()
  const id = prepare(game, 'crossroads')
  assert.equal(dispatch(game, 0, { type: 'play', id, choice: 3 }).ok, false)
  game = act(game, { type: 'play', id, choice: 1 })
  assert.equal(game.players[0].hand[0].card, 'moon-hare')
  const trade = prepare(game, 'tithe')
  const action = { type: 'play', id: trade }
  const next = act(game, action)
  assert.equal(next.players[0].graveyard.at(-1).card, 'moon-hare')
  assert.equal(next.players[0].hand.length, 2)
  assert.deepEqual(act(game, action), next)
  game = fixture()
  for (let i = 0; i < 9; i++) prepare(game, 'moon-hare')
  const sprite = prepare(game, 'page-sprite')
  game = act(game, { type: 'play', id: sprite, position: front() })
  assert.equal(game.players[0].hand.length, 9)
  assert(game.events.some(e => e.type === 'burn'))
  game.players[0].deck = []
  game.players[0].hp = 1
  game = act(act(game, { type: 'end' }), { type: 'end' })
  assert.equal(game.winner, 1)
})

test('全30カードの合法な使用がリソースを消費して想定の効果を適用', async t => {
  for (const card of catalog.filter(card => card.packId === 'prototype')) {
    await t.test(card.name, () => {
      const game = fixture()
      const friendly = add(game, 0, 'moon-hare', front())
      const enemy = add(game, 1, 'brass-squire', front())
      game.players[0].hp = 18
      const id = prepare(game, card.id)
      const legal = legalPlay(game, 0, id)
      assert(legal.enabled, legal.reason)
      const beforeDeck = game.players[0].deck.length
      const result = act(game, { type: 'play', id, position: legal.positions?.[0],
        target: legal.targets?.[0], choice: legal.choices ? 0 : undefined })
      const player = result.players[0]
      assert.equal(player.mp, 10 - card.cost)
      assert(!player.hand.some(instance => instance.id === id))
      if (card.kind === 'unit') {
        const unit = player.units.find(unit => unit.id === id)
        assert.deepEqual([unit.attack, unit.hp], [card.attack, card.hp])
      }
      switch (card.id) {
        case 'page-sprite': assert.equal(player.deck.length, beforeDeck - 1); break
        case 'dawn-deer': case 'dew': assert.equal(player.hp, 21); break
        case 'crossroads': case 'tithe': assert.equal(player.deck.length, beforeDeck - 2); break
        case 'spark': assert.equal(result.players[1].units[0].hp, 1); break
        case 'blessing': assert.deepEqual([player.units[0].attack, player.units[0].hp], [2, 4]); break
        case 'cheer': assert.equal(player.tension, 1); break
        case 'ink': assert.deepEqual(result.players[1].units[0].statuses, ['SILENCE']); break
        case 'poison': assert.deepEqual(result.players[1].units[0].statuses, ['POISON']); break
        case 'veil': assert.deepEqual(player.units[0].statuses, ['INVULNERABLE']); break
        case 'retreat': assert.deepEqual(player.units[0].position, back()); break
        case 'storm':
          assert.equal(player.graveyard.at(-1).id, friendly.id)
          assert.equal(result.players[1].units[0].hp, 1)
          break
        case 'exile': assert.equal(result.exiled[0].id, enemy.id); break
      }
    })
  }
})

function skillFixture(classId) {
  const game = fixture()
  Object.assign(game.players[0], { leader: classId, tension: 3, hp: 16, mp: 2 })
  return game
}

test('レオンの奥義でリーダー攻撃が解禁し、前後を貫通して前衛から反撃を受ける', () => {
  const game = skillFixture('warrior')
  const enemy = add(game, 1, 'brass-squire', front())
  const rear = add(game, 1, 'moon-hare', back())
  assert.equal(legalLeaderAttack(game, 0).enabled, false)
  let after = act(game, { type: 'skill' })
  assert.equal(after.players[0].tension, 0)
  assert.equal(after.players[0].leaderAttack, 3)
  assert.equal(after.players[0].mp, 2)
  assert.equal(after.players[1].hp, 25)
  assert.equal(dispatch(after, 0, { type: 'leaderAttack', target: target(rear.id) }).ok, false)
  after = act(after, { type: 'leaderAttack', target: target(enemy.id) })
  assert.equal(after.players[0].hp, 14)
  assert.deepEqual(after.players[1].units, [])
  assert.equal(dispatch(after, 0, { type: 'leaderAttack', target: leader(1) }).ok, false)
  after = act(after, { type: 'end' })
  assert.equal(after.players[0].leaderAttack, 0)
  assert.equal(after.players[0].leaderPierce, false)
})

test('アリスの奥義は敵リーダーにも3ダメージ。味方・影隠れと熱量不足では使えない', () => {
  const game = skillFixture('mage')
  const hidden = add(game, 1, 'mist-cat', front())
  assert.deepEqual(legalSkill(game, 0).targets, [leader(1)])
  assert.equal(dispatch(game, 0, { type: 'skill', target: target(hidden.id) }).ok, false)
  assert.equal(dispatch(game, 0, { type: 'skill', target: leader(0) }).ok, false)
  game.players[1].hp = 3
  const after = act(game, { type: 'skill', target: leader(1) })
  assert.equal(after.winner, 0)
  assert.equal(after.players[0].tension, 0)
  game.players[0].tension = 2
  assert.equal(legalSkill(game, 0).enabled, false)
})

test('ルゥは1枚引いて武術を生成し、0MPの蹴りで同列のユニットを交換できる', () => {
  const game = skillFixture('fighter')
  const deckCount = game.players[0].deck.length
  let after = act(game, { type: 'skill' })
  assert.deepEqual(after, act(game, { type: 'skill' }))
  assert.equal(after.players[0].deck.length, deckCount - 1)
  assert.equal(after.players[0].hand.length, 2)
  assert.match(after.players[0].hand[1].card, /^token-(fist|kick|breath)$/)
  const a = add(after, 1, 'twig-guard', front())
  const b = add(after, 1, 'moon-hare', back())
  after = play(after, 'token-kick', { target: target(a.id) })
  assert.deepEqual(after.players[1].units.find(u => u.id === a.id).position, back())
  assert.deepEqual(after.players[1].units.find(u => u.id === b.id).position, front())
  after = play(after, 'token-fist', { target: leader(1) })
  assert.equal(after.players[1].hp, 24)
  after = play(after, 'token-breath')
  assert.equal(after.players[0].deck.length, deckCount - 2)
  assert.equal(after.players[0].mp, 1)
})

test('オーロラは味方全体を回復し、HPが回復した数だけ誘発する', () => {
  const game = skillFixture('priest')
  const beast = add(game, 0, 'FT-0006', front())
  beast.hp = 1
  add(game, 0, 'brass-squire', back()).hp = 2
  add(game, 1, 'brass-squire', front()).hp = 1
  const after = act(game, { type: 'skill' })
  assert.equal(after.players[0].hp, 19)
  assert.deepEqual(after.players[0].units.map(u => u.hp), [4, 3])
  assert.equal(after.players[0].units[0].attack, 5)
  assert.equal(after.players[1].units[0].hp, 1)
})

test('ジャックは道具カードを3枚生成し、道具3種類の効果が別々に処理される', () => {
  const game = skillFixture('merchant')
  let after = act(game, { type: 'skill' })
  assert.equal(after.players[0].hand.length, 3)
  assert(after.players[0].hand.every(c => /^token-(power|life|fortune)$/.test(c.card)))
  assert.deepEqual(after, act(game, { type: 'skill' }))
  const unit = add(after, 0, 'moon-hare', front())
  for (const card of ['token-power', 'token-life', 'token-fortune']) {
    after = play(after, card, { target: target(unit.id) })
  }
  assert.deepEqual(after.players[0].units.map(u => [u.attack, u.hp]), [[3, 4]])
  assert.equal(after.players[0].mp, 1)
  assert.match(deckIssue([...prototypeDeck.slice(1), 'token-power'], 'merchant'), /生成カード/)
  const full = skillFixture('merchant')
  for (let i = 0; i < 8; i++) prepare(full, 'moon-hare')
  const limited = act(full, { type: 'skill' })
  assert.equal(limited.players[0].hand.length, 9)
  assert.equal(limited.players[0].graveyard.length, 2)
})

test('スノウの奥義は特技だけを引き、札単位でコストを下げる。特技なしでは鏡の審判を生成する', () => {
  const game = skillFixture('seer')
  game.players[0].deck = [createInstance(game, 'moon-hare'), createInstance(game, 'spark')]
  game.players[0].mp = 0
  const ordinary = prepare(game, 'spark')
  let after = act(game, { type: 'skill' })
  assert.deepEqual(after.players[0].deck.map(c => c.card), ['moon-hare'])
  const drawn = after.players[0].hand.at(-1)
  assert.equal(drawn.card, 'spark')
  assert.equal(cardCost(drawn), 0)
  assert.equal(legalPlay(after, 0, ordinary).enabled, false)
  assert.equal(legalPlay(after, 0, drawn.id).enabled, true)
  after = act(after, { type: 'play', id: drawn.id, target: leader(1) })
  assert.equal(after.players[1].hp, 23)
  after.players[0].tension = 3
  after = act(after, { type: 'skill' })
  const fallback = after.players[0].hand.at(-1)
  assert.equal(fallback.card, 'token-reflection')
  const outcome = act(after, { type: 'play', id: fallback.id })
  assert(outcome.players[0].hp === 18 || outcome.players[0].deck.length === 0)
})

test('ヴァルドは空いている前衛に3/2を出す。満員時は熱量を消費しない', () => {
  const game = skillFixture('swordsman')
  add(game, 0, 'moon-hare', front())
  const after = act(game, { type: 'skill' })
  const knight = after.players[0].units.at(-1)
  assert.deepEqual([knight.card, knight.attack, knight.hp, knight.position], ['token-rose-knight', 3, 2, front(1)])
  assert.equal(legalAttack(after, 0, knight.id).enabled, false)
  for (const position of [front(1), front(2), back(), back(1), back(2)]) add(game, 0, 'moon-hare', position)
  assert.equal(dispatch(game, 0, { type: 'skill' }).ok, false)
  assert.equal(game.players[0].tension, 3)
})

test('待ち行列、消えた対象、効果の処理上限', () => {
  const game = fixture()
  const ghost = add(game, 1, 'lantern-ghost', front())
  const resolver = resolution(game)
  const chosen = target(ghost.id)
  resolver.enqueue([{ id: 'damage', amount: 3, to: 'chosen' }], { seat: 0, chosen }, '先に処理')
  resolver.enqueue([{ id: 'damage', amount: 3, to: 'chosen' }], { seat: 0, chosen }, '対象不在')
  resolver.settle()
  assert.equal(game.players[1].units[0].hp, 2)
  const texts = game.events.map(e => e.text)
  assert(texts.indexOf('対象不在') < texts.indexOf('提灯おばけの退場時'))
  const loopGuard = resolution(game)
  loopGuard.enqueue(Array.from({ length: 257 }, () => ({ id: 'mp', amount: 1 })), { seat: 0 })
  assert.throws(() => loopGuard.settle(), /処理上限/)
})

test('手札と山札順、乱数と私的なイベントを相手のビューに返さない', () => {
  const game = battle()
  const view = project(game, 1)
  assert.equal(view.players[0].hand.length, 0)
  assert.equal(view.players[0].handCount, 4)
  assert(!('rng' in view || 'history' in view || 'deck' in view.players[0]))
  assert(!view.events.some(e => e.privateTo === 0))
  assert(view.events.some(e => e.type === 'handAdded'))
  assert(project(game, 0).events.some(e => e.type === 'draw' && e.privateTo === 0))
  assert(project(game, null).players.every(p => p.hand.length === 0))
})

