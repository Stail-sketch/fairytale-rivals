import { cards } from '../cards/index.js'
import { leaderTarget, other, positions, samePosition, unitTarget } from './rules.js'
import { occupiedTerrainCount, terrainAt } from './terrain.js'

export const allUnits = game => game.players.flatMap(player => player.units)
export const at = (game, seat, position) =>
  game.players[seat].units.find(unit => samePosition(unit.position, position))
export const canUseAbilities = unit => !unit.statuses?.includes('SILENCE')
export const has = (unit, keyword, game) => canUseAbilities(unit) &&
  (cards[unit.card].keywords.includes(keyword) || unit.grants?.includes(keyword) ||
    (keyword === 'AIM' && cards[unit.card].healthyAim && game?.players[unit.owner].hp >= 20))
export const hidden = unit => has(unit, 'STEALTH') && !unit.revealed
export const attackLimit = unit => has(unit, 'DOUBLE_ATTACK') ? 2 : 1
export const openPositions = (game, seat) => positions.filter(position => !at(game, seat, position))
export const opposingApathy = (game, seat) => game.players[other(seat)].units.some(unit =>
  unit.hp > 0 && canUseAbilities(unit) && cards[unit.card].apathy)

export function leaderPower(game, seat) {
  const player = game.players[seat]
  const auras = player.units.filter(canUseAbilities).map(unit => cards[unit.card])
  const bonus = auras.reduce((total, card) => total +
    (player.weapon ? card.weaponAttack ?? 0 : 0) +
    (game.active === seat && card.leaderAttackAura ?
      (player.hp <= 15 ? card.leaderAttackAura.low : card.leaderAttackAura.normal) : 0), 0)
  return Math.max(0, player.leaderAttack + (player.weapon
    ? player.weapon.attack + occupiedTerrainCount(game, seat, 'sword') : 0) + bonus)
}

export function attackValue(game, unit) {
  const card = cards[unit.card]
  let value = unit.attack
  if (canUseAbilities(unit)) {
    if (card.healthyAim && game.players[unit.owner].hp >= 20) value += 2
    if (card.attackInRow?.row === unit.position.row &&
        (card.attackInRow.column === undefined || card.attackInRow.column === unit.position.column)) {
      value += card.attackInRow.amount
    }
    if (card.scaledAttack) value += (game.players[unit.owner][card.scaledAttack] ?? 0)
  }
  if (card.fallenFamily && canUseAbilities(unit)) value += game.players[unit.owner].fallen
    .filter(id => cards[id].family === card.fallenFamily).length
  for (const { aura, provider } of aurasFor(game, unit, 'attackAura')) {
    value = aura.fromHp ? unit.hp : value + (aura.amount ?? 0) + (aura.boost ?? 0) * game.players[provider.owner].skillUses
  }
  return terrainAt(game, unit.owner, unit.position) === 'blessing' ? Math.max(0, unit.hp) : Math.max(0, value)
}

export function aurasFor(game, unit, type) {
  return allUnits(game).flatMap(provider => {
    const aura = cards[provider.card][type]
    if (!aura || provider.id === unit.id || provider.hp <= 0 || !canUseAbilities(provider)) return []
    if (provider.owner !== unit.owner && !aura.enemy) return []
    if (aura.sourceRow && provider.position.row !== aura.sourceRow) return []
    if (aura.targetRow && unit.position.row !== aura.targetRow) return []
    if (aura.position === 'ranks' && provider.position.column !== unit.position.column) return []
    if (aura.position === 'neighbors' && (provider.position.row !== unit.position.row ||
      Math.abs(provider.position.column - unit.position.column) !== 1)) return []
    if (aura.family && cards[unit.card].family !== aura.family) return []
    if (aura.keyword && !has(unit, aura.keyword, game)) return []
    return [{ aura, provider }]
  })
}

export function leaderTargets(game, seat) {
  return attackOptions(game, seat, game.players[seat].weapon).targets
}

export function effectTargets(game, seat, definition) {
  const { target, effects, targetFilter: filter } = definition
  if (!target) return undefined
  let units = allUnits(game).filter(unit => {
    if (unit.owner === seat && !['allyUnit', 'ally', 'anyUnit', 'anyCharacter'].includes(target)) return false
    if (unit.owner !== seat && (['allyUnit', 'ally'].includes(target) || hidden(unit))) return false
    if (has(unit, 'UNTARGETABLE')) return false
    if (filter?.row && unit.position.row !== filter.row) return false
    if (filter?.maxAttack !== undefined && attackValue(game, unit) > filter.maxAttack) return false
    if (filter?.atMostSummonAttack && attackValue(game, unit) >
      definition.attack + (definition.boost?.attack ?? 0) * game.players[seat].skillUses) return false
    if (filter?.minAttack !== undefined && attackValue(game, unit) < filter.minAttack) return false
    if (filter?.maxHp !== undefined && unit.hp > filter.maxHp) return false
    if (filter?.attackAtMostHeat && attackValue(game, unit) > game.players[seat].tension) return false
    if (filter?.keyword && !has(unit, filter.keyword)) return false
    if (filter?.family && cards[unit.card].family !== filter.family) return false
    if (filter?.affectedByIce && !game.players[unit.owner].units.some(ice => ice.card === 'token-frost-block' &&
      ((ice.position.row === unit.position.row && Math.abs(ice.position.column - unit.position.column) === 1) ||
        (ice.position.row !== unit.position.row && ice.position.column === unit.position.column)))) return false
    if (filter?.otherRankFree && at(game, unit.owner, { ...unit.position, row: unit.position.row === 'front' ? 'back' : 'front' })) return false
    if (filter?.lowerSpace && (unit.position.column === 2 ||
      at(game, unit.owner, { ...unit.position, column: unit.position.column + 1 }))) return false
    return true
  })
  for (const effect of effects) {
    if (effect.id === 'move' && effect.to === 'chosen') {
      units = units.filter(unit => unit.position.row !== effect.row && !at(game, unit.owner, {
        row: effect.row, column: unit.position.column,
      }))
    }
  }
  const targets = units.map(unit => unitTarget(unit.id))
  if (target === 'enemy' || target === 'anyCharacter') targets.push(leaderTarget(other(seat)))
  if (target === 'ally' || target === 'anyCharacter') targets.push(leaderTarget(seat))
  return targets
}

export function attackTargets(game, seat, attacker) {
  return attackOptions(game, seat, attacker).targets
}

export function attackOptions(game, seat, attacker) {
  const enemy = other(seat)
  if (game.players[enemy].forceLeaderAttackThrough >= game.turn) return { targets: [leaderTarget(enemy)] }
  if (attacker?.position && cards[attacker.card].requiresOpposite && canUseAbilities(attacker) &&
      !game.players[enemy].units.some(unit => unit.position.column === attacker.position.column)) return { targets: [] }
  const visible = game.players[enemy].units.filter(unit => !hidden(unit))
  if (attacker && has(attacker, 'AIM', game)) return { targets: [...visible.map(unit => unitTarget(unit.id)), leaderTarget(enemy)] }

  const front = new Map(visible.filter(unit => unit.position.row === 'front').map(unit => [unit.position.column, unit.id]))
  const exposed = visible.filter(unit => unit.position.row === 'front' || !front.has(unit.position.column))
  const guards = exposed.filter(unit => unit.position.row === 'front' && has(unit, 'GUARD'))
  if (guards.length) return { targets: guards.map(unit => unitTarget(unit.id)), guards: guards.map(unit => unit.id) }

  const targets = exposed.map(unit => unitTarget(unit.id))
  const covered = Object.fromEntries(visible.filter(unit => !exposed.includes(unit)).map(unit => [unit.id, front.get(unit.position.column)]))
  const walled = new Set(visible.map(unit => unit.position.column)).size === 3
  if (!walled) targets.push(leaderTarget(enemy))
  return { targets, covered, wall: walled ? exposed.map(unit => unit.id) : undefined }
}

