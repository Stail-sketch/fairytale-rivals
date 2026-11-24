import { cards, catalog } from '../cards/index.js'
import { allUnits, at, attackValue, canUseAbilities, openPositions } from './targeting.js'
import { leaderTarget, other, samePosition, unitTarget } from './rules.js'
import { badgeMatches, metalCard, syncBadgeStates } from './badges.js'
import { terrainAt, terrainCount } from './terrain.js'
import { recordPower } from './power.js'

const collectible = card => !['generated', 'prototype'].includes(card.packId)
const family = (instance, value) => cards[instance.card].family === value
const token = name => 'token-set4-' + name

export function fourthEffects(game, api) {
  const { emit, enqueue, applyEffect, applyTo, createInstance, addToHand, addCard, summon, pick, shuffle, gainTension } = api
  const find = id => allUnits(game).find(unit => unit.id === id)
  const filtered = (type, predicate) => catalog.filter(card => collectible(card) && (!type || card.kind === type) && predicate(card))
  function take(seat, predicate, discount = 0, highest = false) {
    const player = game.players[seat]
    let pool = player.deck.filter(instance => predicate(cards[instance.card]))
    if (highest && pool.length) {
      const cost = Math.max(...pool.map(instance => cards[instance.card].cost))
      pool = pool.filter(instance => cards[instance.card].cost === cost)
    }
    const instance = pick(pool)
    if (!instance) return
    player.deck.splice(player.deck.indexOf(instance), 1)
    instance.discount = (instance.discount ?? 0) + discount
    addToHand(game, seat, instance, false)
    return instance
  }
  function register(seat, data, source) {
    const record = { ...data, id: game.nextId++, card: source.card }
    ;(game.players[seat].badges ??= []).push(record)
    emit(game, 'badge', '物語の刻印 · ' + cards[source.card].name, { seat, card: source.card, badge: record })
    syncBadgeStates(game)
  }
  function played(seat, cardId) {
    const card = cards[cardId]
    if (card.kind !== 'unit') return
    const player = game.players[seat]
    for (const badge of player.badges ?? []) {
      if (!badge.event || !badgeMatches(badge, card)) continue
      const context = { seat, effectSource: { kind: 'card', seat, card: badge.card } }
      if (badge.event === 'heal') enqueue([{ id: 'heal', amount: badge.amount, to: 'ownLeader' }], context)
      if (badge.event === 'damage') enqueue([{ id: 'damage', amount: badge.amount, to: 'enemyLeader' }], context)
      if (badge.event === 'mp') enqueue([{ id: 'mp', amount: badge.amount }], context)
      if (badge.event === 'tension') enqueue([{ id: 'tension', amount: badge.amount }], context)
      if (badge.event === 'weaponRust') {
        const weapon = game.players[other(seat)].weapon
        if (weapon) {
          const amount = Math.min(weapon.attack, badge.amount)
          weapon.attack -= amount
          recordPower(weapon, 'attack', '物語の刻印', -amount)
        }
      }
    }
  }
  function end(seat) {
    for (const badge of game.players[seat].badges ?? []) {
      if (badge.event === 'endBuff') enqueue([{ id: 'buff', attack: badge.attack, hp: badge.hp,
        to: 'allyUnits', filter: { family: badge.family } }], { seat, effectSource: { kind: 'card', seat, card: badge.card } })
    }
  }
  function entered(unit) {
    const player = game.players[unit.owner]
    if (family(unit, 'slime') && cards[player.weapon?.card]?.slimeEntryWeapon) {
      player.weapon.attack++
      player.weapon.temporaryAttack = (player.weapon.temporaryAttack ?? 0) + 1
      recordPower(player.weapon, 'attack', cards[player.weapon.card].name, 1, true)
    }
    syncBadgeStates(game)
  }
  function reconcileControl() {
    for (const unit of allUnits(game)) {
      if (!unit.boundTo || find(unit.boundTo.source)) continue
      const { owner, position } = unit.boundTo
      delete unit.boundTo
      game.players[unit.owner].units = game.players[unit.owner].units.filter(candidate => candidate.id !== unit.id)
      unit.owner = owner
      unit.position = !at(game, owner, position) ? position : openPositions(game, owner)[0]
      if (!unit.position) {
        unit.position = position
        unit.hp = 0
      }
      game.players[owner].units.push(unit)
      emit(game, 'move', cards[unit.card].name + 'が元の陣営に戻った', { seat: owner, id: unit.id, position: unit.position })
    }
  }
  function wish(number, context) {
    const player = game.players[context.seat]
    if (number === 0) applyEffect({ id: 'draw', amount: Math.max(0, 7 - player.hand.length) }, context)
    if (number === 1) for (const instance of player.hand.filter(instance => family(instance, 'dragon') && cards[instance.card].kind === 'unit')) {
      instance.discount = (instance.discount ?? 0) + 5
    }
    if (number === 2) register(context.seat, { family: 'dragon', attack: 2, hp: 2 }, { card: token('wish-strength') })
    if (number === 3) addCard(context.seat, token('secret-grimoire'))
  }
  function apply(effect, context) {
    const { seat, source, chosen, position } = context
    const player = game.players[seat], enemySeat = other(seat), enemy = game.players[enemySeat]
    const unit = chosen?.kind === 'unit' ? find(chosen.id) : undefined
    const behind = player.maxMp <= enemy.maxMp
    const uses = player.skillUses ?? 0
    const act = effect => applyEffect(effect, context)
    const giveRandom = (kind, predicate) => {
      const card = pick(filtered(kind, predicate))
      if (card) addCard(seat, card.id)
    }
    if (effect.id === 'storyBadge') { register(seat, effect.badge, source); return true }
    if (effect.id !== 'fourth') return false
    switch (effect.operation) {
      case 'leaderHitBookmark': if (chosen?.kind === 'leader' && chosen.seat === enemySeat) addCard(enemySeat, effect.card); break
      case 'drawBadge': take(seat, card => card.kind === 'unit' && card.badge); break
      case 'behindBuff': act({ id: 'buff', attack: 1, hp: behind ? 1 : 0, to: 'chosen' }); break
      case 'behindDamage': act({ id: 'damage', amount: behind ? 3 : 1, to: 'chosen' }); break
      case 'slimeScatter': {
        const amount = 2 + player.units.filter(unit => unit.id !== source.id && family(unit, 'slime')).length
        applyEffect({ id: 'scatterSpaces', amount }, { ...context, position: source.position })
        break
      }
      case 'drawThreeFamilies': take(seat, card => card.kind === 'unit' && ['slime', 'dragon', 'undead'].includes(card.family)); break
      case 'loseMaxMp': player.maxMp = Math.max(0, player.maxMp - 1); player.mp = Math.min(player.mp, player.maxMp); break
      case 'reviveHere': {
        const id = pick(player.fallen.filter(id => cards[id].family === effect.family && cards[id].cost <= effect.maxCost))
        if (id && !at(game, seat, source.position)) summon(seat, createInstance(game, id), { ...source.position })
        break
      }
      case 'behindSlimes': act({ id: 'summon', card: effect.card, amount: behind ? 2 : 1 }); break
      case 'boundControl': {
        if (!unit) break
        act({ id: 'buff', attack: 2, hp: 2, to: 'chosen' })
        const free = openPositions(game, seat)[0]
        if (!free) break
        unit.boundTo = { source: source.id, owner: unit.owner, position: { ...unit.position } }
        enemy.units = enemy.units.filter(candidate => candidate !== unit)
        unit.owner = seat; unit.position = free; unit.attacks = 2; unit.summonedTurn = game.turn
        player.units.push(unit)
        api.afterMove(unit)
        break
      }
      case 'seedSpells': {
        const pool = filtered('spell', card => card.cost === 2)
        for (const recipient of game.players) {
          for (let i = 0; i < 3 && pool.length; i++) recipient.deck.push(createInstance(game, pick(pool).id))
          shuffle(game, recipient.deck)
        }
        break
      }
      case 'terrainAttack': act({ id: 'buff', attack: terrainCount(game, seat), hp: 0, to: 'self' }); break
      case 'discountDragon': {
        const instance = player.hand.find(instance => instance.id === context.handChoice)
        if (behind && instance && family(instance, 'dragon')) instance.discount = (instance.discount ?? 0) + 2
        break
      }
      case 'eraseBadge': {
        const selected = pick(enemy.badges ?? [])
        if (selected) { enemy.badges.splice(enemy.badges.indexOf(selected), 1); emit(game, 'badge', '物語の刻印が消えた', { seat: enemySeat, card: selected.card, removed: true }) }
        break
      }
      case 'dragonForm': if (source && attackValue(game, source) >= 6) {
        act({ id: 'transform', card: effect.card, to: 'self' })
        const replacement = find(source.id)
        if (replacement?.card === effect.card) replacement.attacks = 0
      } break
      case 'terrainBuff': for (const ally of player.units.filter(ally => terrainAt(game, seat, ally.position))) {
        applyTo({ id: 'buff', attack: 1, hp: 1 }, unitTarget(ally.id), uses, context)
      } break
      case 'bothBoostDraw': act({ id: 'bothDraw', amount: 1 + uses }); break
      case 'boostDraw': act({ id: 'draw', amount: 1 + uses }); break
      case 'dragonBurst': act({ id: 'damage', amount: 1 + 3 * [...player.units, ...player.hand].filter(i => i.id !== source?.id && family(i, 'dragon')).length, to: 'enemyUnits', randomTargets: 1 }); break
      case 'hpFifteen': player.hp = Math.min(player.hp, 15); break
      case 'recoverWeapon': {
        const id = pick(player.brokenWeapons ?? [])
        if (id) addToHand(game, seat, { ...createInstance(game, id), bonusAttack: 1, bonusHp: 1 }, true)
        break
      }
      case 'returnSelf': addCard(seat, source.card); break
      case 'fillSlimes': for (const free of openPositions(game, seat).filter(free => free.row === position?.row)) summon(seat, createInstance(game, effect.card), free); break
      case 'crystalReturn': for (const ally of [...player.units].filter(ally => ally.id !== source.id && family(ally, 'slime'))) {
        const spot = { ...ally.position }
        applyTo({ id: 'return' }, unitTarget(ally.id), uses, context)
        summon(seat, createInstance(game, effect.card), spot)
      } break
      case 'slimeHand': {
        const pool = filtered('unit', card => card.family === 'slime')
        player.hand = player.hand.map(instance => cards[instance.card].kind === 'spell' && pool.length ? createInstance(game, pick(pool).id) : instance)
        break
      }
      case 'bounceSlime': if (unit && unit.id !== source.id && family(unit, 'slime')) {
        act({ id: 'return', to: 'chosen' }); act({ id: 'grant', keyword: 'DOUBLE_ATTACK', to: 'self' })
      } break
      case 'revealSlimes': for (const instance of player.deck.splice(0, 3)) {
        emit(game, 'reveal', '山札のカードを公開', { seat, card: instance.card })
        if (family(instance, 'slime') && cards[instance.card].kind === 'unit') addToHand(game, seat, instance, false)
        else { player.graveyard.push(instance); emit(game, 'discard', cards[instance.card].name + 'を捨てた', { seat, card: instance.card }) }
      } break
      case 'dragonHere': {
        const card = pick(filtered('unit', card => card.family === 'dragon' && card.cost === 1 + uses))
        if (card && !at(game, seat, source.position)) summon(seat, createInstance(game, card.id), { ...source.position })
        break
      }
      case 'rankBuff': for (const ally of game.players[position?.seat ?? seat].units.filter(ally => ally.position.row === position?.row)) applyTo({ id: 'buff', attack: 0, hp: 2 }, unitTarget(ally.id), uses, context); break
      case 'drawIfDragon': if (unit && family(unit, 'dragon')) act({ id: 'draw', amount: 1 }); break
      case 'refundArrow': if (unit) {
        act({ id: 'damage', amount: effect.amount, to: 'chosen' })
        if (unit.hp <= 0) act({ id: 'mp', amount: context.cost ?? 0 })
      } break
      case 'generateMetal': giveRandom(null, card => ['unit', 'weapon'].includes(card.kind) && metalCard(card)); break
      case 'boostBuff': act({ id: 'buff', attack: 1 + uses, hp: 1 + uses, to: 'chosen' }); break
      case 'metalRank': for (const victim of [...game.players[position?.seat ?? seat].units].filter(unit => unit.position.row === position?.row)) {
        const card = pick(filtered('unit', metalCard))
        if (card) applyTo({ id: 'transform', card: card.id }, unitTarget(victim.id), uses, context)
      } break
      case 'drawMetalCosts': {
        const costs = [...new Set(player.deck.filter(instance => ['unit', 'weapon'].includes(cards[instance.card].kind) && cards[instance.card].keywords.includes('METAL_BODY')).map(instance => cards[instance.card].cost))].sort((a,b) => a-b)
        for (const cost of costs) take(seat, card => ['unit', 'weapon'].includes(card.kind) && card.cost === cost && card.keywords.includes('METAL_BODY'))
        break
      }
      case 'changeSkill': player.skillOverride = effect.skill; emit(game, 'skillChange', '語り手の奥義が変化', { seat, skill: effect.skill }); break
      case 'copyToDeck': if (unit) {
        for (let i = 0; i < 2; i++) player.deck.push(createInstance(game, unit.card))
        shuffle(game, player.deck)
      } break
      case 'dragonWrath': act({ id: 'damage', amount: Math.max(0, ...player.units.filter(unit => family(unit, 'dragon')).map(unit => attackValue(game, unit))), to: 'enemyUnits', randomTargets: 1 }); break
      case 'dragonFortune': if (player.hand.some(instance => cards[instance.card].kind === 'unit' && family(instance, 'dragon'))) addCard(seat, 'token-orbit'); break
      case 'wishes': if (player.fortune === 'both' || player.bothFortunesThisTurn) for (let i = 0; i < 4; i++) wish(i, context)
        else wish(context.choice ?? 0, context)
        break
      case 'wish': wish(effect.wish, context); break
      case 'dragonGuide': take(seat, card => card.kind === 'unit' && card.family === 'dragon', 1); break
      case 'mummy': act({ id: 'summon', card: 'token-cloth-dead' }); break
      case 'drawHighestUndead': take(seat, card => card.kind === 'unit' && card.family === 'undead', 6, true); break
      default: throw new Error('未知の第4弾効果: ' + effect.operation)
    }
    return true
  }
  return { apply, played, end, entered, reconcileControl }
}
