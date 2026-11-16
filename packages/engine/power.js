import { names } from '../cards/names.js'

export const awakeningBonus = (amount, skillUses) => (amount ?? 0) * (skillUses ?? 0)

export function breakdown(base, value, bonuses, remainder = '強化・弱体化') {
  const modifiers = Object.entries(bonuses).filter(([, amount]) => amount)
    .map(([label, amount]) => ({ label, amount }))
  const difference = value - base - modifiers.reduce((total, modifier) => total + modifier.amount, 0)
  if (difference) modifiers.push({ label: remainder, amount: difference })
  return { base, modifiers, value }
}

export function addModifier(bonuses, label, amount) {
  if (bonuses && amount) bonuses[label] = (bonuses[label] ?? 0) + amount
}

export function recordPower(target, stat, label, amount, temporary = false) {
  if (!label || !amount) return
  const changes = temporary ? (target.temporaryPower ??= {}) : (target.powerChanges ??= {})
  addModifier(changes[stat] ??= {}, label, amount)
}

export function powerChanges(target, stat) {
  const bonuses = { ...target.powerChanges?.[stat] }
  for (const [label, amount] of Object.entries(target.temporaryPower?.[stat] ?? {})) addModifier(bonuses, label, amount)
  return bonuses
}

export function entryModifiers(card, player, stat) {
  const bonuses = {}
  addModifier(bonuses, names.SKILL_BOOST, awakeningBonus(card.boost?.[stat], player.skillUses))
  if (card.id === 'token-rose-knight') addModifier(bonuses, '茨の騎士の強化', player.knightBuff ?? 0)
  return bonuses
}

export function entryPower(card, player, stat) {
  const bonuses = entryModifiers(card, player, stat)
  const base = card[stat]
  return breakdown(base, base + Object.values(bonuses).reduce((total, amount) => total + amount, 0), bonuses)
}
