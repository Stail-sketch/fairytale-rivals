import { cardCost, cards, catalog, names } from '../cards/index.js'
import { leaderTarget, other, positions, rules, samePosition, unitTarget } from './rules.js'
import { allUnits, at, attackValue, aurasFor, canUseAbilities, has, leaderPower, openPositions, opposingApathy } from './targeting.js'
import { stageEffects } from './stage-effects.js'
import { occupiedTerrainCount, orbCards, terrainAt, terrainCount } from './terrain.js'

const triggerLabels = { ON_ALLY_SPELL: '特技への反応', ON_ALLY_HEAL: '回復への反応' }

export function emit(game, type, text, fields = {}) {
  game.events.push({ seq: game.events.length + 1, type, text, ...fields })
}

export const displayName = unit => cards[unit.card].name
export const findUnit = (game, id) => allUnits(game).find(unit => unit.id === id)

function unitAnchor(unit) {
  return { kind: 'unit', id: unit.id, seat: unit.owner, position: { ...unit.position }, card: unit.card }
}

export function effectAnchor(game, target) {
  if (!target) return undefined
  if (target.kind === 'leader') return { kind: 'leader', seat: target.seat }
  const unit = findUnit(game, target.id)
  return unit && unitAnchor(unit)
}

export function damageValue(game, victim, amount) {
  if (amount <= 0) return 0
  const unit = victim.position && victim
  let value = amount
  if (!unit) {
    const reduction = victim.units.reduce((total, ally) => total + (ally.position.row === 'front' &&
      canUseAbilities(ally) ? cards[ally.card].frontLeaderArmor ?? 0 : 0), 0)
    value = Math.max(0, amount - (victim.leaderArmor ?? 0) - (victim.temporaryArmor ?? 0) - reduction)
  }
  if (unit && (unit.statuses.includes('INVULNERABLE') || has(unit, 'DARK_CLOAK'))) value = 0
  else if (unit && has(unit, 'METAL_BODY') && amount <= 3) value = 1
  else if (unit && (has(unit, 'VULNERABLE') || allUnits(game).some(otherUnit =>
    canUseAbilities(otherUnit) && cards[otherUnit.card].doubleDamageAura))) value *= 2
  if (unit && value > 0 && unit.oneDamageTurn === game.turn && canUseAbilities(unit)) value = 1
  return value
}

export function damage(game, target, amount, source) {
  if (amount <= 0) return 0
  const victim = target.kind === 'unit' ? findUnit(game, target.id) : game.players[target.seat]
  if (!victim) return 0
  const value = damageValue(game, victim, amount)
  victim.hp -= value
  const unit = target.kind === 'unit' && victim
  const label = unit ? displayName(unit) : (target.seat === 0 ? '先攻リーダー' : '後攻リーダー')
  emit(game, 'damage', value ? label + 'に' + value + 'ダメージ' : label + 'がダメージを防いだ', {
    target, value, destination: unit ? unitAnchor(unit) : effectAnchor(game, target), source,
  })
  return value
}

export function createInstance(game, card) {
  return { id: game.nextId++, card }
}

function addToHand(game, seat, instance, generated) {
  const player = game.players[seat]
  if (player.hand.length >= rules.maxHand) {
    player.graveyard.push(instance)
    emit(game, 'burn', '手札が上限のため' + cards[instance.card].name + 'を破棄', { seat, card: instance.card })
    return false
  }
  player.hand.push(instance)
  emit(game, generated ? 'generate' : 'draw', cards[instance.card].name + 'を手札に加えた', {
    seat, id: instance.id, card: instance.card, privateTo: seat,
  })
  emit(game, 'handAdded', (seat === 0 ? '先攻' : '後攻') + 'がカードを1枚手札に加えた', { seat })
  if (!generated) {
    const curses = game.players[other(seat)].units.filter(unit =>
      unit.hp > 0 && canUseAbilities(unit) && cards[unit.card].curseEnemyDraw).length
    if (curses) {
      instance.discount = (instance.discount ?? 0) - curses
      for (let index = 0; index < curses; index++) damage(game, leaderTarget(seat), 2)
    }
    for (const ally of game.players[other(seat)].units) {
      if (ally.hp > 0 && canUseAbilities(ally) && cards[ally.card].enemyDrawDamage) {
        damage(game, leaderTarget(seat), cards[ally.card].enemyDrawDamage)
      }
    }
  }
  return true
}

export function draw(game, seat, count) {
  const player = game.players[seat]
  for (let i = 0; i < count && player.hp > 0; i++) {
    const instance = player.deck.shift()
    if (instance) addToHand(game, seat, instance, false)
    else {
      emit(game, 'fatigue', '山札切れ', { seat })
      damage(game, leaderTarget(seat), rules.fatigueDamage)
    }
  }
}

export function random(game, limit) {
  game.rng = (Math.imul(1664525, game.rng) + 1013904223) >>> 0
  return Math.floor(game.rng / 4294967296 * limit)
}

export function shuffle(game, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const pick = random(game, i + 1)
    const current = list[i]
    list[i] = list[pick]
    list[pick] = current
  }
}

export function resolution(game) {
  const queue = game.effectBacklog ?? []
  delete game.effectBacklog
  let cursor = 0
  let steps = 0

  function enqueue(effects, context, label) {
    if (effects.length) queue.push({ effects, context, label })
  }

  function trigger(unit, event, chosen, data = {}) {
    if (!canUseAbilities(unit)) return
    for (const ability of [...cards[unit.card].abilities, ...(unit.extraAbilities ?? [])]) {
      if (ability.trigger === event) {
        if (ability.once) {
          const fired = unit.fired ??= []
          if (fired.includes(event)) continue
          fired.push(event)
        }
        enqueue(ability.effects, { seat: unit.owner, source: unit, chosen, ...data }, displayName(unit) + 'の' +
          (names[event] ?? triggerLabels[event] ?? '能力'))
      }
    }
  }

  function dealDamage(target, amount, source) {
    const dealt = damage(game, target, amount, source)
    const wounded = target.kind === 'unit' && findUnit(game, target.id)
    if (dealt > 0 && wounded?.owner === game.active) {
      for (const ally of game.players[wounded.owner].units) {
        if (ally.hp > 0) trigger(ally, 'ON_ALLY_DAMAGE', target)
      }
    }
    return dealt
  }

  function sweep() {
    for (const unit of allUnits(game)) {
      if (unit.hp <= 0) continue
      const auraHp = aurasFor(game, unit, 'hpAura').reduce((total, { aura, provider }) =>
        total + aura.amount + (aura.boost ?? 0) * game.players[provider.owner].skillUses, 0)
      const difference = auraHp - (unit.auraHp ?? 0)
      unit.hp += difference
      unit.maxHp += difference
      unit.auraHp = auraHp
    }
    const dead = allUnits(game).filter(unit => unit.hp <= 0)
    for (const unit of dead) {
      const player = game.players[unit.owner]
      player.units = player.units.filter(candidate => candidate.id !== unit.id)
      player.graveyard.push({ id: unit.id, card: unit.card })
      const fallen = player.fallen ??= []
      fallen.push(unit.card)
      emit(game, 'death', displayName(unit) + 'が退場', { seat: unit.owner, id: unit.id, position: unit.position, card: unit.card })
    }
    for (const unit of dead) {
      trigger(unit, 'ON_DEATH')
      third.fall(unit)
      for (const ally of game.players[unit.owner].units) trigger(ally, 'ON_ALLY_DEATH', unitTarget(unit.id))
      for (const enemy of game.players[other(unit.owner)].units) trigger(enemy, 'ON_ENEMY_DEATH', unitTarget(unit.id))
    }
  }

  function summon(seat, instance, position, chosen, choice, triggersSummon = false, effectPosition, cost, stats) {
    const definition = cards[instance.card]
    const player = game.players[seat]
    const skillUses = player.skillUses ?? 0
    const knight = instance.card === 'token-rose-knight' ? player.knightBuff ?? 0 : 0
    const attack = stats?.attack ?? definition.attack + (definition.boost?.attack ?? 0) * skillUses + knight
    const hp = stats?.hp ?? definition.hp + (definition.boost?.hp ?? 0) * skillUses + knight
    const unit = {
      ...instance, owner: seat, position, attack, hp, maxHp: hp, summonedTurn: game.turn,
      attacks: definition.keywords.includes('CHARGE') ? 0 : 2, revealed: false, statuses: [],
      decoyId: instance.decoyId ?? (definition.decoyGroup ? instance.id : undefined),
    }
    if (stats?.grants) unit.grants = [...stats.grants]
    if (stats?.extraAbilities) unit.extraAbilities = structuredClone(stats.extraAbilities)
    if (stats?.createdByAction) unit.createdByAction = stats.createdByAction
    player.units.push(unit)
    if (definition.apathy) game.players[other(seat)].tension = 0
    emit(game, 'summon', definition.name + 'を召喚', { seat, id: unit.id, position, card: unit.card,
      ...(cost !== undefined ? { played: true, cost } : {}),
    })
    if (triggersSummon) {
      trigger(unit, 'ON_SUMMON', chosen, { position: effectPosition, summonedTerrain: terrainAt(game, seat, position) })
      if (definition.fortune) fortune(definition.fortune, { seat, source: unit, chosen, choice })
    }
    third.enter(unit)
    for (const ally of player.units) if (ally !== unit) trigger(ally, 'ON_ALLY_ENTER', unitTarget(unit.id))
  }

  function addCard(seat, id) {
    addToHand(game, seat, createInstance(game, id), true)
  }

  function redirectTarget(target, seat) {
    const unit = findUnit(game, target?.id)
    if (!unit?.decoyId || seat === unit.owner) return target
    return unitTarget(pick(game.players[unit.owner].units.filter(candidate => candidate.decoyId === unit.decoyId)).id)
  }

  function wearWeapon(seat, amount) {
    const player = game.players[seat]
    const weapon = player.weapon
    if (!weapon) return
    weapon.durability -= amount
    if (weapon.durability > 0) return
    player.weapon = null
    player.graveyard.push({ id: weapon.id, card: weapon.card })
    emit(game, 'weaponBreak', displayName(weapon) + 'が壊れた', { seat, card: weapon.card })
    trigger(weapon, 'ON_WEAPON_BREAK')
  }

  function equip(seat, instance, context = {}) {
    const player = game.players[seat]
    const card = cards[instance.card]
    wearWeapon(seat, player.weapon?.durability ?? 0)
    const attack = card.attack + (card.boost?.attack ?? 0) * player.skillUses
    player.weapon = { ...instance, owner: seat, attack, durability: card.hp }
    emit(game, 'equip', card.name + 'を装備', { seat, card: card.id, id: instance.id,
      ...(context.played ? { played: true, cost: context.cost } : {}),
    })
    enqueue(card.effects, { ...context, seat, source: player.weapon })
  }

  function fortune(options, context) {
    const player = game.players[context.seat]
    const mode = player.bothFortunesThisTurn ? 'both' : player.fortune
    const choose = mode !== 'both' && (mode === 'choose' || player.nextFortune)
    player.nextFortune = false
    const branches = choose ? [context.choice ?? random(game, options.length)] :
      mode === 'both' ? [0, 1] : [random(game, options.length)]
    for (const index of branches) {
      emit(game, 'fortune', '運命の分岐 · ' + options[index].label, { seat: context.seat })
      enqueue(options[index].effects, context)
      for (const unit of player.units) trigger(unit, index === 0 ? 'ON_FORTUNE_FIRST' : 'ON_FORTUNE_SECOND')
    }
    for (const unit of player.units) trigger(unit, 'ON_FORTUNE')
  }

  function returnBorrowed(seat) {
    for (const unit of game.players[seat].units.filter(candidate => candidate.borrowed)) {
      const { owner, position, removeCharge } = unit.borrowed
      delete unit.borrowed
      if (removeCharge) unit.grants = unit.grants.filter(keyword => keyword !== 'CHARGE')
      game.players[seat].units = game.players[seat].units.filter(candidate => candidate !== unit)
      const space = !at(game, owner, position) ? position : openPositions(game, owner)[0]
      if (space) {
        unit.owner = owner
        unit.position = space
        game.players[owner].units.push(unit)
        third.enter(unit)
      } else addToHand(game, owner, { id: unit.id, card: unit.card }, true)
      emit(game, 'withdraw', displayName(unit) + 'が元の陣営に戻った', { seat: owner, id: unit.id })
    }
  }

  function decide(index) {
    const pending = game.pending
    const { seat, mode, instances } = pending
    const player = game.players[seat]
    delete game.pending
    if (mode === 'topOrBottom') {
      if (index === 1) player.deck.push(...instances)
      else player.deck.unshift(...instances)
    }
    if (mode === 'arrangeTop') {
      player.deck.unshift(instances[index])
      player.deck.push(...instances.filter((_, item) => item !== index))
    }
    if (mode === 'drawOne') {
      addToHand(game, seat, instances[index], false)
      player.deck.unshift(...instances.filter((_, item) => item !== index))
    }
    if (mode === 'handToDeck') {
      const instance = instances[index]
      const atIndex = player.hand.findIndex(value => value.id === instance.id)
      if (atIndex !== -1) player.deck.unshift(...player.hand.splice(atIndex, 1))
    }
    if (mode === 'usedSpellToDeck') player.deck.unshift(createInstance(game, instances[index].card))
  }

  function gainTension(seat, amount) {
    if (opposingApathy(game, seat)) return
    const player = game.players[seat]
    for (let i = 0; i < amount && player.tension < rules.maxTension; i++) {
      player.tension++
      emit(game, 'focus', '熱量が' + player.tension + 'に上昇', { seat, value: player.tension })
      for (const unit of player.units) trigger(unit, 'TENSION_LINK', undefined, { tension: player.tension })
      if (player.weapon) trigger(player.weapon, 'TENSION_LINK', undefined, { tension: player.tension })
      for (const unit of game.players[other(seat)].units) trigger(unit, 'ON_ENEMY_FOCUS')
    }
  }

  function targets(to, { seat, source, chosen, position, targetArea }) {
    const own = game.players[seat].units
    const enemy = game.players[other(seat)].units
    const area = position ?? targetArea?.position ?? findUnit(game, chosen?.id)?.position ?? source?.position
    const row = area?.row
    const column = area?.column
    const asTargets = units => units.map(unit => unitTarget(unit.id))
    switch (to) {
      case 'chosen': return chosen ? [chosen] : []
      case 'self': return source ? [unitTarget(source.id)] : []
      case 'ownLeader': return [leaderTarget(seat)]
      case 'enemyLeader': return [leaderTarget(other(seat))]
      case 'allies': return [leaderTarget(seat), ...game.players[seat].units.map(unit => unitTarget(unit.id))]
      case 'allyUnits': return game.players[seat].units.map(unit => unitTarget(unit.id))
      case 'enemyUnits': return game.players[other(seat)].units.map(unit => unitTarget(unit.id))
      case 'allUnits': return allUnits(game).map(unit => unitTarget(unit.id))
      case 'bothLeaders': return [leaderTarget(seat), leaderTarget(other(seat))]
      case 'allCharacters': return [leaderTarget(seat), leaderTarget(other(seat)), ...asTargets(allUnits(game))]
      case 'enemies': return [leaderTarget(other(seat)), ...asTargets(enemy)]
      case 'otherUnits': return asTargets(allUnits(game).filter(unit => unit.id !== source?.id))
      case 'otherCharacters': return [leaderTarget(seat), leaderTarget(other(seat)),
        ...asTargets(allUnits(game).filter(unit => unit.id !== source?.id))]
      case 'otherAllies': return asTargets(own.filter(unit => unit.id !== source?.id))
      case 'frontEnemies': return asTargets(enemy.filter(unit => unit.position.row === 'front'))
      case 'backEnemies': return asTargets(enemy.filter(unit => unit.position.row === 'back'))
      case 'frontUnits': return asTargets(allUnits(game).filter(unit => unit.position.row === 'front'))
      case 'backUnits': return asTargets(allUnits(game).filter(unit => unit.position.row === 'back'))
      case 'enemyColumn': return asTargets(enemy.filter(unit => unit.position.column === column))
      case 'allyColumn': return asTargets(own.filter(unit => unit.position.column === column))
      case 'allColumn': return asTargets(allUnits(game).filter(unit => unit.position.column === column))
      case 'enemyRow': return asTargets(enemy.filter(unit => unit.position.row === row))
      case 'allyRow': return asTargets(own.filter(unit => unit.position.row === row))
      case 'allRow': return asTargets(allUnits(game).filter(unit => unit.position.row === row))
      case 'alignedAlly': return asTargets(own.filter(unit => unit.id !== source?.id && unit.position.column === column))
      case 'enemyOpposite': return asTargets(enemy.filter(unit => unit.position.column === column && unit.position.row === 'front'))
      case 'justAhead': {
        if (!source?.position) return []
        if (source.position.row === 'back') return asTargets(own.filter(unit => unit.position.column === column &&
          unit.position.row === 'front'))
        return asTargets(enemy.filter(unit => unit.position.column === column && unit.position.row === 'front'))
      }
      case 'crossEnemy': return asTargets(enemy.filter(unit => unit.position.column === 1 || unit.position.row === 'back'))
      case 'ownFrontNeighbor': return asTargets(own.filter(unit => source?.position.row === 'back' &&
        unit.position.column === column && unit.position.row === 'front'))
      case 'neighborOfTarget':
      case 'adjacentToTarget': {
        const unit = targetArea ?? findUnit(game, chosen?.id)
        return unit ? asTargets(game.players[unit.owner].units.filter(candidate => candidate.position.row === row &&
          Math.abs(candidate.position.column - column) === 1 || to === 'adjacentToTarget' &&
          candidate.position.row !== row && candidate.position.column === column)) : []
      }
      default: throw new Error('未知の効果対象: ' + to)
    }
  }

  function applyTo(effect, target, skillUses, context = {}) {
    const unit = target.kind === 'unit' ? findUnit(game, target.id) : null
    const victim = unit ?? (target.kind === 'leader' ? game.players[target.seat] : null)
    if (!victim) return
    const boost = (effect.boost ?? 0) * skillUses

    switch (effect.id) {
      case 'damage': {
        const attacker = game.players[context.seat]
        const spellBonus = context.spell ? (attacker.spellBonus ?? 0) + attacker.units.reduce((total, unit) =>
          total + (canUseAbilities(unit) ? cards[unit.card].spellDamage ?? 0 : 0), 0)
          + occupiedTerrainCount(game, context.seat, 'circle') : 0
        if (!context.spell || (!unit || !has(unit, 'RESIST_SPELL')) && game.turn > (victim.spellGuardThrough ?? -1)) {
          const dealt = dealDamage(target, effect.amount + boost + spellBonus)
          if (dealt && unit && unit.hp <= 0 && context.spell) {
            for (const ally of attacker.units) trigger(ally, 'ON_SPELL_KILL', target)
          }
          return dealt
        }
        break
      }
      case 'heal': {
        if (victim.hp <= 0) break
        const owner = unit?.owner ?? target.seat
        const reversed = game.players[owner].healReversedThrough === game.turn || game.players[other(owner)].units
          .some(unit => unit.hp > 0 && canUseAbilities(unit) && cards[unit.card].reverseHealing)
        if (reversed) {
          dealDamage(target, effect.amount)
          break
        }
        const healing = Math.min(effect.amount, (unit?.maxHp ?? rules.leaderHp) - victim.hp)
        victim.hp += healing
        emit(game, 'heal', 'HPを' + healing + '回復', { target, value: healing, destination: effectAnchor(game, target) })
        if (healing > 0) {
          if (effect.drawForEach) draw(game, context.seat, 1)
          for (const ally of game.players[owner].units) {
            trigger(ally, 'ON_ALLY_HEAL', target)
            if (target.kind === 'leader') trigger(ally, 'ON_LEADER_HEAL', target)
          }
          if (game.players[owner].weapon) trigger(game.players[owner].weapon, 'ON_ALLY_HEAL', target)
        }
        break
      }
      case 'buff':
        if (unit) {
          unit.attack += effect.attack + boost
          unit.maxHp += effect.hp
          unit.hp += effect.hp
          if (effect.temporary) unit.temporaryAttack = (unit.temporaryAttack ?? 0) + effect.attack + boost
          emit(game, 'ability', displayName(unit) + 'を強化', { target })
        }
        break
      case 'setAttack':
        if (unit) {
          unit.attack = effect.fromHp ? unit.hp : effect.amount
          unit.temporaryAttack = 0
        }
        break
      case 'setHp':
        if (unit) unit.hp = unit.maxHp = effect.amount
        break
      case 'multiplyAttack':
        if (unit) {
          unit.attack *= effect.amount
          unit.temporaryAttack = (unit.temporaryAttack ?? 0) * effect.amount
        }
        break
      case 'grant':
        if (unit) {
          const grants = unit.grants ??= []
          if (!grants.includes(effect.keyword)) grants.push(effect.keyword)
          if (effect.keyword === 'CHARGE' && unit.summonedTurn === game.turn && unit.attacks === 2 &&
              !cards[unit.card].keywords.includes('CHARGE') && !unit.revealed) unit.attacks = 0
        }
        break
      case 'freeze':
        victim.blockAttackThrough = game.turn + ((unit?.owner ?? target.seat) === game.active ? 2 : 1)
        break
      case 'timedUnitState':
        if (unit) unit[effect.state] = game.turn + effect.turns
        break
      case 'return':
        if (unit) {
          const owner = game.players[unit.owner]
          owner.units = owner.units.filter(candidate => candidate.id !== unit.id)
          addToHand(game, unit.owner, { id: unit.id, card: unit.card }, true)
          emit(game, 'withdraw', displayName(unit) + 'が手札に戻った', { seat: unit.owner, id: unit.id, position: unit.position })
        }
        break
      case 'borrow':
        if (unit && context.position && !at(game, context.seat, context.position)) {
          const owner = game.players[unit.owner]
          owner.units = owner.units.filter(candidate => candidate.id !== unit.id)
          unit.borrowed = { owner: unit.owner, position: unit.position }
          unit.owner = context.seat
          unit.position = context.position
          unit.attacks = 0
          game.players[context.seat].units.push(unit)
          emit(game, 'move', displayName(unit) + 'が味方陣営に加わった', { seat: unit.owner, id: unit.id, position: unit.position })
          third.enter(unit)
        }
        break
      case 'grantAbility':
        if (unit) (unit.extraAbilities ??= []).push(effect.ability)
        break
      case 'transform':
        if (unit) {
          const replacement = effect.card ?? (effect.fromChosen && findUnit(game, context.chosen?.id)?.card) ??
            pick(catalog.filter(card => card.kind === 'unit' && collectible(card) &&
              card.cost === cards[unit.card].cost + effect.delta))?.id
          if (replacement) {
            const owner = game.players[unit.owner]
            const replaced = cards[replacement]
            owner.units[owner.units.indexOf(unit)] = {
              id: unit.id, card: replacement, owner: unit.owner, position: unit.position,
              attack: replaced.attack, hp: replaced.hp, maxHp: replaced.hp,
              attacks: unit.attacks, summonedTurn: unit.summonedTurn, revealed: false, statuses: [],
            }
            if (replaced.apathy) game.players[other(unit.owner)].tension = 0
            emit(game, 'transform', displayName(unit) + 'が' + replaced.name + 'に変身', { target })
          }
        }
        break
      case 'status':
        if (unit && !unit.statuses.includes(effect.status)) {
          unit.statuses.push(effect.status)
          emit(game, 'ability', displayName(unit) + 'に「' + names[effect.status] + '」', { target })
        }
        break
      case 'move':
        if (unit) {
          const position = { row: effect.row, column: unit.position.column }
          if (!at(game, unit.owner, position)) {
            third.move(unit, position)
          }
        }
        break
      case 'moveDown':
      case 'moveCenter':
        if (unit) {
          const position = { row: unit.position.row, column: effect.id === 'moveCenter' ? 1 : unit.position.column + 1 }
          if (position.column < 3 && !at(game, unit.owner, position)) {
            third.move(unit, position)
          }
        }
        break
      case 'moveOpposite':
      case 'moveAligned':
        if (unit && context.source) {
          const sourcePosition = context.source.position
          const row = effect.id === 'moveOpposite' ? 'front' : sourcePosition.row === 'front' ? 'back' : 'front'
          const position = { row, column: sourcePosition.column }
          if (!at(game, unit.owner, position)) {
            third.move(unit, position)
          }
        }
        break
      case 'swapRank':
        if (unit) {
          const from = unit.position
          const position = { row: from.row === 'front' ? 'back' : 'front', column: from.column }
          const neighbor = at(game, unit.owner, position)
          unit.position = position
          if (neighbor) {
            neighbor.position = from
            third.afterMove(neighbor)
          }
          third.afterMove(unit)
        }
        break
      case 'exile':
        if (unit) {
          const player = game.players[unit.owner]
          player.units = player.units.filter(candidate => candidate.id !== unit.id)
          game.exiled.push({ id: unit.id, card: unit.card })
          emit(game, 'exile', displayName(unit) + 'を除外', { seat: unit.owner, id: unit.id, position: unit.position, card: unit.card })
        }
        break
      case 'destroy':
        if (unit && (effect.maxAttack === undefined || attackValue(game, unit) <= effect.maxAttack)) unit.hp = 0
        break
      default: throw new Error('未知の対象効果: ' + effect.id)
    }
  }

  const pick = pool => pool.length ? pool[random(game, pool.length)] : undefined

  function condition(kind, value, context) {
    const { seat, source, chosen } = context
    const player = game.players[seat]
    const opponent = game.players[other(seat)]
    switch (kind) {
      case 'ownHpAtLeast': return player.hp >= value
      case 'ownHpAtMost': return player.hp <= value
      case 'enemyUnitsAtLeast': return opponent.units.length >= value
      case 'enemyHandAtLeast': return opponent.hand.length >= value
      case 'enemyHandAtMost': return opponent.hand.length <= value
      case 'ownHandAtLeast': return player.hand.length >= value
      case 'sourceRow': return source?.position?.row === value
      case 'sourceColumn': return source?.position?.column === value
      case 'backCenter': return source?.position?.row === 'back' && source.position.column === 1
      case 'afterTension': return context.tension === value
      case 'leaderTarget': return chosen?.kind === 'leader'
      case 'unitTarget': return chosen?.kind === 'unit'
      case 'costAtMost': return context.cost <= value
      case 'noOtherAllies': return player.units.every(unit => unit.id === source?.id)
      case 'enemyIce': return opponent.units.some(unit => unit.card === 'token-frost-block')
      case 'summonedTerrain': return value === true ? Boolean(context.summonedTerrain) : context.summonedTerrain === value
      case 'sourceTerrain': return source && terrainAt(game, source.owner, source.position) === value
      case 'sourceWounded': return source?.hp < source?.maxHp
      case 'leaderPowerAtLeast': return leaderPower(game, seat) >= value
      case 'topCostAtLeast': return player.deck.length && cardCost(player.deck[0], player.skillUses) >= value
      case 'topCostBelow': return player.deck.length && cardCost(player.deck[0], player.skillUses) < value
      case 'practiceTurn': return source?.summonedTurn === game.turn && source.createdByAction !== context.actionId
      case 'sameColumn': return findUnit(game, chosen?.id)?.position.column === source?.position?.column
      case 'topParity': return player.deck.length && cards[player.deck[0].card].cost % 2 === value
      case 'lastDrawOdd': return Boolean(context.lastDrew && cards[context.lastDrew].cost % 2)
      case 'chosenWounded': {
        const unit = findUnit(game, chosen?.id)
        return unit && unit.hp < unit.maxHp
      }
      default: throw new Error('未知の効果条件: ' + kind)
    }
  }

  function amountFrom(key, context) {
    const player = game.players[context.seat]
    switch (key) {
      case 'tension': return player.tension
      case 'enemyUnits': return game.players[other(context.seat)].units.length
      case 'otherAllies': return player.units.filter(unit => unit.id !== context.source?.id).length
      case 'sourceAttack': return context.source ? attackValue(game, context.source) : 0
      case 'damageDealt': return context.dealt ?? 0
      case 'leaderAttack': return leaderPower(game, context.seat)
      case 'leaderAttackTotal': return player.leaderAttackTotal ?? 0
      case 'dragons': return [...player.units, ...player.hand].filter(unit =>
        unit.id !== context.source?.id && cards[unit.card].family === 'dragon').length
      case 'overflow': return context.overflow ?? 0
      case 'summonedCost': return cards[findUnit(game, context.chosen?.id)?.card]?.cost ?? 0
      case 'spellsUsed': return player.spellsUsed ?? 0
      case 'priorSpellsThisTurn': return Math.max(0, (player.turnSpells ?? 0) - 1)
      case 'terrainCount': return terrainCount(game, context.seat)
      case 'allyUnits': return player.units.length
      case 'unitsMoved': return player.unitsMoved ?? 0
      default: throw new Error('未知の参照値: ' + key)
    }
  }

  function applyEffect(effect, context) {
    const { seat, source } = context
    const player = game.players[seat]
    const enemy = other(seat)
    const skillUses = player.skillUses ?? 0
    if (effect.when && !condition(...effect.when, context)) {
      for (const alternate of effect.otherwise ?? []) applyEffect(alternate, context)
      return
    }
    if (effect.from) {
      const value = amountFrom(effect.from, context) * (effect.multiplier ?? 1)
      effect = { ...effect, amount: (effect.amount ?? 0) + value }
      if (effect.id === 'buff') {
        effect.attack += effect.scaleHpOnly ? 0 : value
        effect.hp += effect.scaleHp || effect.scaleHpOnly ? value : 0
      }
    }
    if (third.apply(effect, context)) return
    switch (effect.id) {
      case 'draw':
        context.lastDrew = player.deck[0]?.card
        draw(game, seat, effect.amount)
        break
      case 'enemyDraw': draw(game, other(seat), effect.amount); break
      case 'nothing': break
      case 'drawOdd': {
        const top = player.deck[0]
        if (top && cardCost(top, skillUses) % 2) draw(game, seat, 1)
        break
      }
      case 'discountTop': {
        const top = player.deck[0]
        if (top) top.discount = (top.discount ?? 0) + effect.amount
        break
      }
      case 'drawTopCopy': {
        const top = player.deck[0]
        if (top) {
          draw(game, seat, 1)
          if (!orbCards.includes(top.card)) addToHand(game, seat, { ...top, id: game.nextId++ }, true)
        }
        break
      }
      case 'duelTop': {
        const own = player.deck.shift()
        const otherCard = game.players[enemy].deck.shift()
        if (own && otherCard) {
          const difference = cardCost(own, skillUses) - cardCost(otherCard, game.players[enemy].skillUses)
          if (difference) damage(game, leaderTarget(difference > 0 ? seat : enemy), effect.amount + effect.boost * skillUses)
        }
        if (own) player.deck.splice(random(game, player.deck.length + 1), 0, own)
        const opposingDeck = game.players[enemy].deck
        if (otherCard) opposingDeck.splice(random(game, opposingDeck.length + 1), 0, otherCard)
        break
      }
      case 'upgradeHand': {
        const order = ['unlabeled', 'common', 'rare', 'superRare', 'legendary']
        player.hand = player.hand.map(instance => {
          const current = cards[instance.card]
          const rarity = order[Math.min(4, order.indexOf(current.rarity) + 1)]
          const next = pick(catalog.filter(card => collectible(card) && card.id !== current.id && card.rarity === rarity))
          return next ? createInstance(game, next.id) : instance
        })
        break
      }
      case 'peek': {
        const mode = effect.mode
        const instances = mode === 'handToDeck' ? player.hand :
          mode === 'usedSpellToDeck' ? (player.spellLog ?? []).filter(card => !orbCards.includes(card)).map(card => ({ card })) :
            player.deck.splice(0, effect.amount ?? 2)
        if (instances.length) {
          const labels = mode === 'topOrBottom' ? ['山札の一番上に戻す', '山札の一番下に移動'] :
            instances.map(instance => cards[instance.card].name)
          game.pending = { seat, mode, instances, labels }
        }
        break
      }
      case 'recoverFallen': {
        const fallen = (player.fallen ?? []).filter(id => id !== effect.except && matchesCard(cards[id], effect.filter))
        for (let count = 0; count < (effect.amount ?? 1) && fallen.length; count++) {
          const index = random(game, fallen.length)
          addCard(seat, fallen.splice(index, 1)[0])
        }
        break
      }
      case 'drawMatching': {
        for (let count = 0; count < (effect.amount ?? 1); count++) {
          const instance = pick(player.deck.filter(instance => matchesCard(cards[instance.card], effect.filter)))
          if (!instance) break
          player.deck.splice(player.deck.indexOf(instance), 1)
          addToHand(game, seat, instance, false)
        }
        break
      }
      case 'summonMatching': {
        const instance = pick(player.deck.filter(instance => matchesCard(cards[instance.card], effect.filter)))
        const position = openPositions(game, seat)[0]
        if (position && instance) {
          player.deck.splice(player.deck.indexOf(instance), 1)
          summon(seat, instance, position)
        }
        break
      }
      case 'summonPool': {
        const filter = { ...effect.filter }
        if (effect.boost) filter.cost += effect.boost * skillUses
        const definition = pick(catalog.filter(card => collectible(card) && matchesCard(card, filter)))
        const position = openPositions(game, seat)[0]
        if (definition && position) summon(seat, createInstance(game, definition.id), position)
        break
      }
      case 'bothDraw':
        draw(game, seat, effect.amount)
        draw(game, enemy, effect.amount)
        break
      case 'drawForTension':
        draw(game, seat, player.tension)
        draw(game, enemy, game.players[enemy].tension)
        break
      case 'drawActive': draw(game, game.active, effect.amount); break
      case 'copyChosen': {
        const card = findUnit(game, context.chosen?.id)?.card
        if (card) addCard(seat, card)
        break
      }
      case 'chance': {
        const outcome = random(game, 100) < effect.probability ? effect.success : effect.failure
        if (outcome) applyEffect(outcome, context)
        break
      }
      case 'destroyRandomSpaces': {
        const sample = [...positions]
        shuffle(game, sample)
        for (const position of sample.slice(0, effect.amount)) {
          const unit = at(game, enemy, position)
          if (unit) unit.hp = 0
        }
        break
      }
      case 'scatterSpaces': {
        const lane = positions.filter(position => position.column === context.position?.column)
        for (let count = 0; lane.length && count < effect.amount; count++) {
          const unit = at(game, enemy, pick(lane))
          if (unit?.hp > 0) dealDamage(unitTarget(unit.id), 1)
        }
        break
      }
      case 'hitAndSummon': {
        const victim = findUnit(game, context.chosen?.id)
        if (!victim) break
        applyTo(effectToDamage(effect), context.chosen, skillUses, context)
        if (victim.hp <= 0) applyEffect({ id: 'summon', card: effect.card, amount: effect.count }, context)
        break
      }
      case 'healByKills': {
        let killed = 0
        for (const target of targets(effect.to, context)) {
          const unit = findUnit(game, target.id)
          if (unit) {
            dealDamage(target, effect.amount)
            if (unit.hp <= 0) killed++
          }
        }
        if (killed) applyTo({ id: 'heal', amount: killed * effect.multiplier }, leaderTarget(seat), skillUses, context)
        break
      }
      case 'repeatDamage': {
        for (let index = 0; index < effect.times; index++) {
          const list = targets(effect.to, context).filter(target => target.kind !== 'unit' || findUnit(game, target.id)?.hp > 0)
          const target = pick(list)
          if (!target) break
          applyTo({ id: 'damage', amount: effect.amount }, target, skillUses, context)
        }
        break
      }
      case 'randomFromHand':
        for (const side of [seat, enemy]) {
          const hand = game.players[side].hand
          const instance = pick(hand.filter(candidate => cards[candidate.card].kind === 'unit'))
          const position = pick(openPositions(game, side))
          if (instance && position) {
            hand.splice(hand.indexOf(instance), 1)
            summon(side, instance, position)
          }
        }
        break
      case 'copySpellEffect': {
        const spell = cards[context.spellCard]
        if (!spell) break
        const allies = effect.others ? player.units.filter(ally => ally.id !== source.id) : [source]
        for (const ally of allies) for (const outcome of spell.effects.filter(outcome => outcome.to === 'chosen')) {
          applyEffect(outcome, { seat, chosen: unitTarget(ally.id), spell: spell.id })
        }
        break
      }
      case 'generateMatching': {
        const pool = catalog.filter(card => collectible(card) && matchesCard(card, effect.filter))
        for (let count = 0; count < effect.amount + (effect.boost ?? 0) * skillUses && pool.length; count++) {
          addCard(effect.enemy ? enemy : seat, pick(pool).id)
        }
        break
      }
      case 'resurrect': {
        let pool = player.fallen.filter(id => matchesCard(cards[id], effect.filter))
        if (effect.highest && pool.length) {
          const cost = Math.max(...pool.map(id => cards[id].cost))
          pool = pool.filter(id => cards[id].cost === cost)
        }
        for (let count = 0; count < (effect.amount ?? 1) + (effect.boost ?? 0) * skillUses; count++) {
          const position = context.position && count === 0 ? context.position : openPositions(game, seat)[0]
          const id = pick(pool)
          if (!position || !id) break
          pool.splice(pool.indexOf(id), 1)
          summon(seat, createInstance(game, id), position)
        }
        break
      }
      case 'changeTension': {
        const sides = effect.both ? [seat, enemy] : [effect.enemy ? enemy : seat]
        for (const side of sides) {
          if (effect.amount >= 0) gainTension(side, effect.amount)
          else game.players[side].tension = Math.max(0, game.players[side].tension + effect.amount)
        }
        break
      }
      case 'wearWeapon': wearWeapon(effect.enemy ? enemy : seat, effect.amount); break
      case 'awakening':
        player.awakenedLeader = true
        equip(seat, createInstance(game, effect.weapon))
        emit(game, 'ability', '語り手の奥義が「黒薔薇の焔嵐」に変化', { seat })
        break
      case 'destroyWeapon': {
        const side = effect.enemy ? enemy : seat
        const weapon = game.players[side].weapon
        if (weapon) wearWeapon(side, weapon.durability)
        break
      }
      case 'equip': equip(seat, createInstance(game, effect.card)); break
      case 'buffWeapon':
        if (player.weapon) {
          player.weapon.attack += effect.attack
          player.weapon.durability += effect.hp
          if (effect.temporary) player.weapon.temporaryAttack = (player.weapon.temporaryAttack ?? 0) + effect.attack
        }
        break
      case 'stealWeapon': {
        const weapon = game.players[enemy].weapon
        if (weapon) {
          game.players[enemy].weapon = null
          addToHand(game, seat, { id: weapon.id, card: weapon.card }, true)
        }
        break
      }
      case 'enemyMpLoss': game.players[enemy].nextMpLoss = (game.players[enemy].nextMpLoss ?? 0) + effect.amount; break
      case 'blockSkill': game.players[enemy].blockSkillThrough = game.turn + 1; break
      case 'blockBack': game.players[enemy].blockBackThrough = game.turn + 1; break
      case 'forceLeaderAttack': player.forceLeaderAttackThrough = game.turn + 1; break
      case 'spellTax':
        game.players[enemy].spellTax = effect.amount
        game.players[enemy].spellTaxThrough = game.turn + 1
        break
      case 'spellGuard':
        for (const ally of [player, ...player.units]) ally.spellGuardThrough = game.turn + 1
        break
      case 'turnDiscount': player.turnDiscount = (player.turnDiscount ?? 0) + effect.amount; break
      case 'nextDiscount': {
        const key = effect.kind === 'unit' ? 'nextUnitDiscount' : 'nextSpellDiscount'
        player[key] = (player[key] ?? 0) + effect.amount
        break
      }
      case 'discountMatching':
        for (const instance of [...player.hand, ...player.deck].filter(item => matchesCard(cards[item.card], effect.filter))) {
          instance.discount = (instance.discount ?? 0) + effect.amount
        }
        break
      case 'copyNextSpell': player.copyNextSpell = true; break
      case 'spellBonus': player.spellBonus = (player.spellBonus ?? 0) + effect.amount; break
      case 'setFortune':
        if (effect.mode === 'temporaryBoth') {
          if ((player.bothFortunesThisTurn || player.fortune === 'both') && effect.repeatTension) {
            gainTension(seat, effect.repeatTension)
          }
          player.bothFortunesThisTurn = true
        } else if (effect.mode === 'next') player.nextFortune = true
        else if (player.fortune === effect.mode && effect.repeatTension) gainTension(seat, effect.repeatTension)
        else if (player.fortune !== 'both' || effect.mode === 'both') player.fortune = effect.mode
        break
      case 'healWounded': {
        const wounded = player.units.filter(unit => unit.hp < unit.maxHp && (!effect.other || unit !== source)).map(unit => unitTarget(unit.id))
        if (player.hp < rules.leaderHp) wounded.push(leaderTarget(seat))
        if (wounded.length) applyTo({ id: 'heal', amount: effect.amount }, wounded[random(game, wounded.length)], skillUses)
        break
      }
      case 'randomHits': {
        const enemy = other(seat)
        const hits = effect.amount + (effect.boost ?? 0) * skillUses
        for (let count = 0; count < hits && game.players[enemy].hp > 0; count++) {
          const targets = [leaderTarget(enemy), ...game.players[enemy].units.filter(unit => unit.hp > 0).map(unit => unitTarget(unit.id))]
          applyTo({ id: 'damage', amount: 1 }, pick(targets), skillUses, context)
        }
        break
      }
      case 'generate': addCard(effect.enemy ? enemy : seat, effect.card); break
      case 'putTop': game.players[effect.enemy ? enemy : seat].deck.unshift(createInstance(game, effect.card)); break
      case 'moveBackEnemy': {
        const unit = pick(game.players[enemy].units.filter(unit => unit.position.row === 'back'))
        const position = pick(openPositions(game, enemy).filter(position => position.row === 'front'))
        if (unit && position) third.move(unit, position)
        break
      }
      case 'generateRandom':
        for (let i = 0; i < effect.amount; i++) {
          const card = effect.cards[random(game, effect.cards.length)]
          addToHand(game, seat, createInstance(game, card), true)
        }
        break
      case 'drawDiscountedSpell': {
        const matches = player.deck.flatMap((instance, index) => cards[instance.card].kind === 'spell' ? [index] : [])
        if (matches.length) {
          const [instance] = player.deck.splice(matches[random(game, matches.length)], 1)
          instance.discount = (instance.discount ?? 0) + effect.amount
          addToHand(game, seat, instance, false)
        } else {
          addToHand(game, seat, createInstance(game, effect.fallback), true)
        }
        break
      }
      case 'randomEffect': enqueue([effect.options[random(game, effect.options.length)]], context); break
      case 'discard':
        for (let count = 0; count < effect.amount && player.hand.length; count++) {
          const [instance] = player.hand.splice(random(game, player.hand.length), 1)
          player.graveyard.push(instance)
          emit(game, 'discard', cards[instance.card].name + 'を破棄', { seat, card: instance.card })
          if (cards[instance.card].returnAfterDiscard) third.schedule(seat, instance.card)
        }
        break
      case 'discardUnits':
        for (const instance of player.hand.filter(item => cards[item.card].kind === 'unit')) {
          player.hand.splice(player.hand.indexOf(instance), 1)
          player.graveyard.push(instance)
          emit(game, 'discard', cards[instance.card].name + 'を破棄', { seat, card: instance.card })
          if (cards[instance.card].returnAfterDiscard) third.schedule(seat, instance.card)
        }
        break
      case 'tension': gainTension(seat, effect.amount); break
      case 'leaderPower':
        player.leaderAttack += effect.amount
        player.leaderPierce ||= effect.pierce
        player.leaderNeighbors ||= effect.neighbors
        emit(game, 'ability', '味方リーダーの攻撃力+' + effect.amount, { seat })
        break
      case 'leaderArmor': {
        const amount = effect.amount + (effect.boost ?? 0) * skillUses
        const key = effect.temporary ? 'temporaryArmor' : 'leaderArmor'
        player[key] = (player[key] ?? 0) + amount
        emit(game, 'ability', '味方リーダーの被ダメージ-' + amount, { seat, value: amount })
        break
      }
      case 'mp': {
        const recovered = Math.max(0, Math.min(effect.amount, player.maxMp - player.mp))
        player.mp += recovered
        if (recovered > 0) emit(game, 'mp', 'MPを' + recovered + '回復', { seat, value: recovered })
        break
      }
      case 'temporaryMp': {
        const gained = Math.min(effect.amount, rules.maxMp - player.mp)
        player.mp += gained
        if (gained > 0) emit(game, 'mp', 'このターンのMPが' + gained + '増加', { seat, value: gained })
        break
      }
      case 'ramp': {
        for (const side of effect.both ? [seat, enemy] : [seat]) {
          const recipient = game.players[side]
          const gained = Math.min(effect.amount, rules.maxMp - recipient.maxMp)
          recipient.maxMp += gained
          if (gained > 0) emit(game, 'mp', '最大MPが' + recipient.maxMp + 'に上昇', { seat: side, value: recipient.maxMp })
        }
        break
      }
      case 'summon': {
        const side = effect.enemy ? enemy : seat
        const free = openPositions(game, side)
        let spaces
        if (effect.at === 'source') spaces = free.filter(pos => samePosition(pos, source?.position))
        else if (effect.at === 'chosen') spaces = free.filter(pos => samePosition(pos, context.position))
        else if (effect.at === 'ranks') spaces = free.filter(pos => pos.column === source?.position.column)
        else if (effect.at === 'vertical') spaces = free.filter(pos =>
          pos.row === source?.position.row && Math.abs(pos.column - source.position.column) === 1)
        else {
          const preferred = free.find(pos => samePosition(pos, source?.position))
          spaces = preferred ? [preferred, ...free.filter(pos => pos !== preferred)] : free
        }
        if (effect.random) shuffle(game, spaces)
        const count = (effect.amount ?? 1) + (effect.boost ?? 0) * skillUses
        for (const position of spaces.slice(0, count)) {
          if (effect.card === 'self' && !source) break
          const instance = createInstance(game, effect.card === 'self' ? source.card : effect.card)
          if (effect.decoy) instance.decoyId = source.decoyId
          summon(side, instance, position, undefined, undefined, effect.triggerSummon, undefined, undefined,
            effect.stats ?? (instance.card === 'token-practice-beast' ? { createdByAction: context.actionId } : undefined))
          if (effect.copy) {
            const copy = game.players[side].units.at(-1)
            const { id, owner, summonedTurn, attacks } = copy
            Object.assign(copy, structuredClone(source), { id, owner, position, summonedTurn, attacks })
          }
        }
        break
      }
      case 'tensionSummon': {
        const count = player.tension
        player.tension = 0
        applyEffect({ id: 'summon', amount: count, card: effect.card }, context)
        break
      }
      case 'combine': {
        const partner = player.units.find(unit => unit.card === effect.partner)
        if (source && partner && player.units.includes(source)) {
          player.units = player.units.filter(unit => unit !== partner && unit !== source)
          summon(seat, createInstance(game, effect.card), source.position)
        }
        break
      }
      case 'swapAllEnemies': {
        for (const unit of game.players[enemy].units) {
          third.move(unit, { ...unit.position, row: unit.position.row === 'front' ? 'back' : 'front' })
        }
        break
      }
      default:
        {
          const list = targets(effect.to, context).filter(target => {
            const unit = target.kind === 'unit' && findUnit(game, target.id)
            return (!effect.filter || !unit || matchesCard(cards[unit.card], effect.filter)) &&
              (!effect.requiresKeyword || unit && has(unit, effect.requiresKeyword)) &&
              (!effect.exceptCard || unit?.card !== effect.exceptCard) &&
              (!effect.attackedLeader || unit?.lastLeaderAttackTurn === game.turn - 1) &&
              (!effect.wounded || unit?.hp < unit?.maxHp)
          })
          const amount = effect.randomTargets
          if (amount) shuffle(game, list)
          for (const target of amount ? list.slice(0, amount) : list) applyTo(effect, target, skillUses, context)
        }
    }
  }

  function settle() {
    if (game.pending) return
    sweep()
    while (cursor < queue.length) {
      const { context, effects, label } = queue[cursor++]
      const origin = context.source?.position ? unitAnchor(context.source) : context.source ?
        { kind: 'leader', seat: context.seat, card: context.source.card } : context.effectSource
      if (label) emit(game, 'ability', label, { seat: context.seat, id: context.source?.id, source: origin, triggered: true })
      for (const [index, effect] of effects.entries()) {
        if (++steps > rules.effectLimit) throw new Error('効果の処理上限に達しました')
        const first = game.events.length
        applyEffect(effect, context)
        sweep()
        for (let cursor = first; origin && cursor < game.events.length; cursor++) {
          const event = game.events[cursor]
          if (event.privateTo === undefined) event.source ??= origin
        }
        if (game.pending) {
          const remaining = effects.slice(index + 1)
          game.effectBacklog = remaining.length ? [{ context, effects: remaining }, ...queue.slice(cursor)] : queue.slice(cursor)
          return
        }
      }
    }
  }

  const third = stageEffects(game, { emit, enqueue, trigger, damage: dealDamage, createInstance, addCard, addToHand,
    summon, applyEffect, applyTo, pick, shuffle, random, sweep })
  return { enqueue, trigger, summon, equip, wearWeapon, addCard, fortune, gainTension, settle, returnBorrowed, decide, redirectTarget,
    damage: dealDamage, recoverScheduled: third.recoverScheduled }
}

const effectToDamage = ({ amount }) => ({ id: 'damage', amount })
const collectible = card => card.packId !== 'generated' && card.packId !== 'prototype'

function matchesCard(card, filter = {}) {
  return card && Object.entries(filter).every(([key, value]) => {
    if (key === 'maxCost') return card.cost <= value
    if (key === 'minCost') return card.cost >= value
    return card[key] === value
  })
}

