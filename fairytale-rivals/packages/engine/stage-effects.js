import { cardCost, cards, catalog } from '../cards/index.js'
import { other, positions, samePosition, unitTarget } from './rules.js'
import { allUnits, at, attackValue, openPositions } from './targeting.js'
import { isOrb, orbCards, terrainAt, terrainKey, terrainName } from './terrain.js'

const terrainReacts = new Set(['runway', 'treasure', 'hazard'])

export function stageEffects(game, api) {
  const { emit, enqueue, trigger, damage, createInstance, addCard, addToHand, summon, applyEffect, applyTo, pick, shuffle } = api

  function changeTerrain(seat, position, id, overwrite = true) {
    const previous = terrainAt(game, seat, position)
    if (isOrb(previous) || (previous && id && (!overwrite || previous === 'rest'))) return false
    if (previous === id && id !== 'hazard') return false
    const field = game.players[seat].terrain ??= {}
    const key = terrainKey(position)
    if (id) field[key] = id
    else delete field[key]
    const spot = { row: position.row, column: position.column }
    emit(game, 'terrain', id ? terrainName(id) + 'を配置' : terrainName(previous) + 'が消えた', {
      seat, position: spot, terrain: id ?? null,
    })
    const occupant = id && at(game, seat, position)
    if (occupant) enter(occupant)
    return true
  }

  function enter(unit) {
    const stage = terrainAt(game, unit.owner, unit.position)
    if (terrainReacts.has(stage)) {
      enqueue([{ id: 'enterStage', stage }], { seat: unit.owner, source: unit, stagePosition: { ...unit.position } })
    }
  }

  function move(unit, position) {
    if (samePosition(unit.position, position)) return
    unit.position = position
    afterMove(unit)
  }

  function afterMove(unit) {
    const active = game.players[game.active]
    active.unitsMoved = (active.unitsMoved ?? 0) + 1
    emit(game, 'move', cards[unit.card].name + 'が転位', { seat: unit.owner, id: unit.id, position: unit.position })
    trigger(unit, 'ON_MOVE')
    enter(unit)
  }

  function fall(unit) {
    if (terrainAt(game, unit.owner, unit.position) !== 'guide') return
    enqueue([{ id: 'guideReward', cost: cardCost(unit, game.players[unit.owner].skillUses) + 1 }],
      { seat: unit.owner, position: unit.position })
  }

  function recoverScheduled(seat) {
    const player = game.players[seat]
    for (const id of player.nextTurnCards ?? []) {
      if (!player.hand.some(instance => instance.card === id)) addCard(seat, id)
    }
    delete player.nextTurnCards
  }

  function schedule(seat, card) {
    const scheduled = game.players[seat].nextTurnCards ??= []
    if (!scheduled.includes(card)) scheduled.push(card)
  }

  function affectedSpaces(target, source, seat, mode) {
    if (mode === 'ownOccupied') return game.players[seat].units.map(unit => ({ ...unit.position, seat }))
    if (mode === 'backOccupied') return allUnits(game).filter(unit => unit.position.row === 'back')
      .map(unit => ({ ...unit.position, seat: unit.owner }))
    if (mode === 'all') return [0, 1].flatMap(seat => positions.map(position => ({ ...position, seat })))
    const selected = target ?? source?.position
    if (!selected || selected.row === undefined) return []
    if (mode === 'bothBack') return [0, 1].map(seat => ({ row: 'back', column: selected.column, seat }))
    const owner = target?.seat ?? source?.owner ?? seat
    if (mode === 'rank') return positions.filter(position => position.column === selected.column).map(position => ({ ...position, seat: owner }))
    if (mode === 'mirror') return positions.filter(position => position.column === selected.column && position.row !== selected.row)
      .map(position => ({ ...position, seat: owner }))
    if (mode === 'neighbors') return positions.filter(position => position.row === selected.row &&
      Math.abs(position.column - selected.column) === 1).map(position => ({ ...position, seat: owner }))
    return [{ ...selected, seat: owner }]
  }

  function apply(effect, context) {
    const { seat, source, chosen, position, handChoice } = context
    const player = game.players[seat]
    const enemy = other(seat)
    const unit = () => allUnits(game).find(unit => unit.id === chosen?.id)
    switch (effect.id) {
      case 'setStage': {
        const input = effect.area === 'source' ? undefined : position
        const stage = effect.copy ? terrainAt(game, seat, source?.position) : effect.stage
        if (effect.copy && (!stage || isOrb(stage))) break
        for (const target of affectedSpaces(input, source, seat, effect.area)) {
          changeTerrain(target.seat, target, stage ?? null, !effect.fresh)
        }
        break
      }
      case 'enterStage': {
        if (!source || source.hp <= 0 || !player.units.includes(source)
            || !samePosition(source.position, context.stagePosition)
            || terrainAt(game, seat, source.position) !== effect.stage) break
        emit(game, 'terrainTrigger', terrainName(effect.stage) + 'が発動', {
          seat, id: source.id, position: { ...source.position }, terrain: effect.stage,
        })
        if (effect.stage === 'hazard') damage(unitTarget(source.id), 1)
        if (effect.stage === 'runway' && source.position.row === 'back') {
          const ahead = { row: 'front', column: source.position.column }
          if (!at(game, seat, ahead)) move(source, ahead)
        }
        if (effect.stage === 'treasure') {
          const treasure = pick(catalog.filter(card => card.packId !== 'generated' && card.classId === 'merchant' && card.kind !== 'unit'))
          if (treasure) addCard(seat, treasure.id)
          changeTerrain(seat, source.position, null)
        }
        break
      }
      case 'guideReward': {
        if (terrainAt(game, seat, position) !== 'guide') break
        emit(game, 'terrainTrigger', terrainName('guide') + 'が発動', { seat, position, terrain: 'guide' })
        const instance = pick(player.deck.filter(instance => cardCost(instance, player.skillUses) === effect.cost))
        if (!instance) {
          changeTerrain(seat, position, null)
          break
        }
        player.deck.splice(player.deck.indexOf(instance), 1)
        if (addToHand(game, seat, instance, false)) {
          for (const ability of cards[instance.card].abilities.filter(ability => ability.trigger === 'ON_GUIDE_DRAW')) {
            enqueue(ability.effects, { seat }, cards[instance.card].name + 'が導きの地に反応')
          }
        }
        changeTerrain(seat, position, null)
        break
      }
      case 'seedOrbs':
        for (const id of orbCards) player.deck.splice(api.random(game, player.deck.length + 1), 0, createInstance(game, id))
        player.phoenix = true
        emit(game, 'ability', '六彩の暁鳥が山札に種晶を託した', { seat, card: 'FT-0491' })
        break
      case 'placeOrb': {
        if (!position || !changeTerrain(seat, position, 'orb-' + effect.color)) break
        if (player.phoenix && orbCards.every(id => Object.values(player.terrain).includes(id.slice('token-'.length)))) {
          game.specialVictory = seat
          emit(game, 'specialVictory', '六色の種晶が揃い、六彩の暁鳥がよみがえった', { seat, card: 'FT-0491' })
        }
        break
      }
      case 'stageDamage': {
        const target = at(game, position.seat ?? seat, position)
        if (target) applyTo({ id: 'damage', amount: effect.amount }, unitTarget(target.id), player.skillUses, context)
        break
      }
      case 'spendHeat':
        if (player.tension > 0) {
          player.tension--
          applyEffect(effect.effect, context)
        }
        break
      case 'scheduleReturn':
        if (source) schedule(seat, source.card)
        break
      case 'takeControl': {
        const target = unit()
        const space = openPositions(game, seat)[0]
        if (!target || target.owner === seat || !space) break
        const owner = game.players[target.owner]
        owner.units.splice(owner.units.indexOf(target), 1)
        if (effect.temporary) {
          const grants = target.grants ??= []
          const removeCharge = !grants.includes('CHARGE')
          target.borrowed = { owner: target.owner, position: target.position, removeCharge }
          if (removeCharge) grants.push('CHARGE')
        }
        target.owner = seat
        target.position = space
        target.summonedTurn = game.turn
        target.attacks = effect.temporary ? 0 : 2
        player.units.push(target)
        if (cards[target.card].apathy && !target.statuses.includes('SILENCE')) game.players[enemy].tension = 0
        afterMove(target)
        break
      }
      case 'spendMpDamage': {
        const amount = player.mp
        player.mp = 0
        applyEffect({ id: 'damage', amount, to: 'enemies' }, context)
        break
      }
      case 'hitSpawn': {
        if (!unit()) break
        const dealt = applyTo({ id: 'damage', amount: effect.amount }, chosen, player.skillUses, context)
        const space = openPositions(game, seat)[0]
        if (dealt > 0 && space) summon(seat, createInstance(game, effect.card), space,
          undefined, undefined, false, undefined, undefined, { attack: dealt, hp: dealt })
        break
      }
      case 'selectHand': {
        const instance = player.hand.find(item => item.id === handChoice)
        if (instance && effect.discount) instance.discount = (instance.discount ?? 0) + effect.discount
        if (instance && !effect.discount) player.deck.unshift(...player.hand.splice(player.hand.indexOf(instance), 1))
        break
      }
      case 'randomMove':
        for (const side of [seat, enemy]) {
          const spaces = [...positions]
          shuffle(game, spaces)
          const units = [...game.players[side].units]
          units.forEach((unit, index) => move(unit, spaces[index]))
        }
        break
      case 'reverseHealing':
        game.players[enemy].healReversedThrough = game.turn
        break
      case 'recoverOwnSpells':
        for (const id of source?.usedOn ?? []) addCard(seat, id)
        break
      case 'copyUnitStats': {
        const target = unit()
        const space = openPositions(game, seat)[0]
        if (target && space) summon(seat, createInstance(game, target.card), space,
          undefined, undefined, false, undefined, undefined, {
            attack: effect.attack, hp: effect.hp, grants: target.grants, extraAbilities: target.extraAbilities,
          })
        break
      }
      case 'burnTreasure':
        if (source && terrainAt(game, seat, source.position) === 'treasure' && openPositions(game, seat).length) {
          changeTerrain(seat, source.position, null)
          applyEffect({ id: 'summon', card: effect.card }, context)
        }
        break
      case 'powerByHealing':
        if (source === player.weapon) {
          source.attack++
          source.temporaryAttack = (source.temporaryAttack ?? 0) + 1
        }
        break
      case 'sacrifice': {
        const target = unit()
        if (target) {
          const value = attackValue(game, target)
          target.hp = 0
          api.sweep()
          enqueue([{ id: 'heal', amount: value * effect.multiplier, to: 'ownLeader' }, { id: 'draw', amount: 1 }], context)
        }
        break
      }
      case 'knightBuff':
        player.knightBuff = (player.knightBuff ?? 0) + 1
        for (const unit of player.units.filter(unit => unit.card === 'token-rose-knight')) {
          applyTo({ id: 'buff', attack: 1, hp: 1 }, unitTarget(unit.id), player.skillUses, context)
        }
        break
      case 'returnToDeck': {
        const target = unit()
        if (target) {
          const owner = game.players[target.owner]
          owner.units.splice(owner.units.indexOf(target), 1)
          owner.deck.unshift({ id: target.id, card: target.card })
          emit(game, 'withdraw', cards[target.card].name + 'が山札に戻った', { seat: target.owner, position: target.position, id: target.id })
        }
        break
      }
      case 'discountDrawTop': {
        const top = player.deck.shift()
        if (top) {
          top.discount = cardCost(top, player.skillUses) + (top.discount ?? 0)
          addToHand(game, seat, top, false)
        }
        break
      }
      case 'randomLaneDamage':
        applyEffect({ id: 'damage', amount: effect.amount, to: 'enemyColumn' },
          { ...context, position: { column: api.random(game, 3) } })
        applyEffect({ id: 'damage', amount: effect.amount, to: 'enemyLeader' }, context)
        break
      default: return false
    }
    return true
  }

  return { enter, move, afterMove, fall, apply, recoverScheduled, schedule }
}
