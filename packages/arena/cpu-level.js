import { cards } from '../cards/index.js'

export function arenaCpuLevel(wins = 0) {
  wins = Number.isFinite(wins) ? Math.max(0, Math.floor(wins)) : 0
  return { level: Math.min(wins + 1, 11), label: wins < 3 ? '入門' : wins < 6 ? '標準' : wins < 10 ? '熟練' : '達人',
    quality: Math.min(wins / 10, 1), synergy: Math.max(0, Math.min((wins - 3) / 7, 1)) }
}

// A draft heuristic, not a change to card statistics or battle AI information.
export function arenaCardQuality(card) {
  const effects = [...(card.effects ?? []), ...(card.abilities ?? []).flatMap(ability => ability.effects ?? [])]
  const utility = effects.reduce((sum, effect) => sum + ({ damage: 1, heal: .45, draw: 1.2,
    buff: .8, summon: 1.8, destroy: 2.5, silence: 1, ramp: 1.8, generate: .7 }[effect.id] ?? .6)
    * Math.min(4, Math.max(1, Number(effect.amount) || 1)), 0)
  const body = card.kind === 'unit' ? ((card.attack + card.hp) - card.cost * 2) * .3
    : card.kind === 'weapon' ? card.attack * card.hp * .3 - card.cost * .3 : -card.cost * .3
  return body + utility * .35 + (card.keywords?.length ?? 0) * .6
}

export function cpuDraftChoices(draft, difficulty) {
  const deck = draft.deck.map(id => cards[id])
  let choices = [...draft.choices]
  // Keep early opponents playable; difficulty does not come from deliberately broken mana curves.
  const expensive = deck.filter(card => card.cost >= 5).length
  if (expensive >= 7 && choices.some(id => cards[id].cost < 5)) choices = choices.filter(id => cards[id].cost < 5)
  const units = deck.filter(card => card.kind === 'unit').length
  if (deck.length >= 8 && units < deck.length * .6 && choices.some(id => cards[id].kind === 'unit')) {
    choices = choices.filter(id => cards[id].kind === 'unit')
  }
  const score = id => {
    const card = cards[id]
    const shared = deck.reduce((sum, other) => sum + (card.keywords ?? []).filter(key => other.keywords?.includes(key)).length
      + (card.abilities ?? []).filter(ability => other.abilities?.some(a => a.trigger === ability.trigger)).length, 0)
    return arenaCardQuality(card) + difficulty.synergy * Math.min(shared, 8) * .2
  }
  choices.sort((a, b) => score(a) - score(b) || a.localeCompare(b))
  // Low ranks favor modest cards; each win smoothly increases the weight of the strongest candidate.
  const weights = choices.map((_, i) => choices.length === 1 ? 1 :
    1 + 8 * ((1 - difficulty.quality) * (1 - i / (choices.length - 1)) + difficulty.quality * i / (choices.length - 1)))
  return { choices, weights }
}
