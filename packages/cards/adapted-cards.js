import { archivedStats } from './archived-stats.js'
import { basicCards } from './sets/basic.js'
import { standardNeutral } from './sets/standard-neutral.js'
import { standardJobs } from './sets/standard-jobs.js'
import { secondCards } from './sets/second.js'
import { thirdCards } from './sets/third.js'
import { fourthCards } from './sets/fourth.js'

export const adaptedId = number => 'FT-' + String(number).padStart(4, '0')

export function define(number, name, description, options = {}) {
  const [cost, attack, hp, classId, kind, rarity, packId] = archivedStats[number]
  const id = adaptedId(number)
  return {
    id, name, description, cost, attack, hp, kind, classId, rarity, packId, artId: 'card-' + id,
    species: null, target: null, choice: null, effects: [], abilities: [], keywords: [],
    implementation: 'implemented', tests: 'covered', ...options,
  }
}

export const trigger = (name, ...effects) => ({ trigger: name, effects })
export const when = (kind, value, effect, otherwise) => ({ ...effect, when: [kind, value], otherwise })
export const hit = (amount, to = 'chosen') => ({ id: 'damage', amount, to })
export const mend = (amount, to = 'chosen') => ({ id: 'heal', amount, to })
export const grow = (attack, hp = 0, to = 'self') => ({ id: 'buff', attack, hp, to })
export const key = (keyword, to = 'self') => ({ id: 'grant', keyword, to })
export const remove = (to = 'chosen') => ({ id: 'destroy', to })
export const draw = (amount = 1) => ({ id: 'draw', amount })
export const heat = (amount = 1) => ({ id: 'tension', amount })
export const summon = (card, options = {}) => ({ id: 'summon', card: typeof card === 'number' ? adaptedId(card) : card, ...options })
export const power = amount => ({ id: 'leaderPower', amount })
export const temporary = effect => ({ ...effect, temporary: true })
export const martial = (amount = 1) => ({ id: 'generateRandom', amount, cards: ['token-fist', 'token-kick', 'token-breath'] })
export const tool = (amount = 1) => ({ id: 'generateRandom', amount, cards: ['token-power', 'token-life', 'token-fortune'] })
export const option = (label, ...effects) => ({ label, effects })
export const placed = (side = 'own', empty = false) => ({ place: { side, empty } })

export function defineSet({ units, spells, weapons }) {
  return [
    ...units.map(([id, name, species, description, options]) => define(id, name, description, { species, ...options })),
    ...spells.map(([id, name, description, effects, target = null, options]) => define(id, name, description, { effects, target, ...options })),
    ...weapons.map(([id, name, description, options]) => define(id, name, description, options)),
  ]
}

export function adaptedCards() {
  const syntax = { trigger, when, hit, mend, grow, key, remove, draw, heat, summon, power, temporary, martial, tool, option, placed }
  return [...[basicCards(syntax), standardNeutral(syntax), standardJobs(syntax), secondCards(syntax)].flatMap(defineSet),
    ...thirdCards(define, syntax), ...fourthCards()]
}
