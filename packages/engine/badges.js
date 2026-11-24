import { cards } from '../cards/index.js'
import { addModifier } from './power.js'

export const metalCard = card => card?.keywords?.some(key => key === 'METAL_BODY' || key === 'HARD_METAL_BODY')
export function badgeMatches(badge, card) {
  return (!badge.family || card.family === badge.family) && (!badge.metal || metalCard(card))
}

export function badgeAttack(player, card, bonuses) {
  let total = 0
  for (const badge of player.badges ?? []) {
    if (badge.event || !badgeMatches(badge, card)) continue
    total += badge.attack ?? 0
    addModifier(bonuses, '物語の刻印 · ' + cards[badge.card].name, badge.attack ?? 0)
  }
  return total
}

export function badgeDiscount(player, card) {
  return (player.badges ?? []).filter(badge => !badge.event && badgeMatches(badge, card))
    .reduce((total, badge) => total + (badge.discount ?? 0), 0)
}

// Badges belong to the leader, survive their source, stack independently, and are serialized as plain data.
export function syncBadgeStates(game) {
  for (const player of game.players) {
    for (const unit of player.units) {
      const active = (player.badges ?? []).filter(badge => !badge.event && badgeMatches(badge, cards[unit.card]))
      const hp = active.reduce((sum, badge) => sum + (badge.hp ?? 0), 0)
      const delta = hp - (unit.badgeHp ?? 0)
      if (unit.hp > 0 && delta) {
        unit.maxHp += delta
        unit.hp = Math.min(unit.maxHp, unit.hp + delta)
      }
      unit.badgeHp = hp
      const previous = unit.badgeKeywords ?? []
      unit.badgeKeywords = [...new Set(active.flatMap(badge => badge.keyword ? [badge.keyword] : []))]
      if (unit.summonedTurn === game.turn && unit.attacks === 2 && !unit.revealed &&
          unit.badgeKeywords.includes('CHARGE') && !previous.includes('CHARGE')) unit.attacks = 0
    }
  }
}

export function hardMetalActive(game, owner) {
  return game?.players[owner]?.units.some(unit => unit.hp > 0 && !unit.statuses?.includes('SILENCE') && cards[unit.card].hardMetalAura)
}
