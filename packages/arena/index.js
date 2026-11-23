import { cards, catalog, leaders } from '../cards/index.js'

export const arenaVersion = 1
export const rarityLabels = { common: 'ノーマル', rare: 'レア', superRare: 'スーパーレア', legendary: 'レジェンド' }
export const rarityRanges = { common: [12, 17], rare: [8, 12], superRare: [3, 5], legendary: [1, 3] }
export const arenaPool = catalog.filter(card => ['basic', 'standard', 'set-2', 'set-3'].includes(card.packId))
export const doors = {
  class: { name: '語り手の扉', text: '選んだクラスの専用カードが出やすい', icon: '✦', match: (c, leader) => c.classId === leader },
  unit: { name: '仲間の扉', text: 'ユニットが出やすい', icon: '♟', match: c => c.kind === 'unit' },
  magic: { name: '魔法の扉', text: '特技・武器が出やすい', icon: '✧', match: c => c.kind !== 'unit' },
  small: { name: '小さな冒険の扉', text: '0〜3MPのカードが出やすい', icon: '❧', match: c => c.cost <= 3 },
  great: { name: '大いなる物語の扉', text: '5MP以上のカードが出やすい', icon: '♜', match: c => c.cost >= 5 },
  common: { name: 'めぐり逢いの扉', text: '共通カードが出やすい', icon: '◇', match: c => c.classId === 'neutral' },
}
const fail = message => { throw Object.assign(new Error(message), { status: 422 }) }
function random(state, max) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0
  let value = state.rng
  value = Math.imul(value ^ value >>> 15, value | 1)
  value ^= value + Math.imul(value ^ value >>> 7, value | 61)
  return Math.floor(((value ^ value >>> 14) >>> 0) / 0x100000000 * max)
}
function shuffle(state, values) {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const j = random(state, i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function createArenaSchedule(seed) {
  const rng = { rng: seed >>> 0 }
  const valid = []
  for (let common = 12; common <= 17; common++) for (let rare = 8; rare <= 12; rare++)
    for (let superRare = 3; superRare <= 5; superRare++) for (let legendary = 1; legendary <= 3; legendary++) {
      if (common + rare + superRare + legendary === 30) valid.push({ common, rare, superRare, legendary })
    }
  const counts = valid[random(rng, valid.length)]
  return shuffle(rng, Object.entries(counts).flatMap(([rarity, count]) => Array(count).fill(rarity)))
}

export function createDraft(seed, schedule = createArenaSchedule(seed ^ 0x53f125)) {
  if (schedule.length !== 30 || schedule.some(r => !Object.hasOwn(rarityLabels, r))) fail('闘技場の配分が不正です。')
  const draft = { version: arenaVersion, rng: seed >>> 0, schedule: [...schedule], stage: 'class', deck: [], leader: null, door: null, history: [] }
  draft.choices = shuffle(draft, Object.keys(leaders)).slice(0, 3)
  return draft
}

function offerDoors(draft) {
  draft.stage = 'door'
  draft.choices = shuffle(draft, Object.keys(doors)).slice(0, 3)
}
function offerCards(draft) {
  const rarity = draft.schedule[draft.deck.length]
  const pool = arenaPool.filter(card => card.rarity === rarity && [draft.leader, 'neutral'].includes(card.classId))
  const choices = []
  const remaining = [...pool]
  while (choices.length < 3 && remaining.length) {
    const weights = remaining.map(card => doors[draft.door].match(card, draft.leader) ? 3 : 1)
    let roll = random(draft, weights.reduce((sum, n) => sum + n, 0))
    let index = 0
    while (roll >= weights[index]) roll -= weights[index++]
    choices.push(remaining.splice(index, 1)[0].id)
  }
  if (choices.length !== 3) fail('候補カードが足りません。')
  draft.stage = 'card'
  draft.choices = choices
}

export function draftAction(draft, action) {
  if (!action || !draft.choices.includes(action.choice)) fail('表示されている候補を選んでください。')
  const expected = { class: 'arena-class', door: 'arena-door', card: 'arena-pick' }[draft.stage]
  if (action.type !== expected) fail('ピックの状態が更新されました。')
  draft.history.push({ type: action.type, choice: action.choice })
  if (draft.stage === 'class') { draft.leader = action.choice; offerDoors(draft) }
  else if (draft.stage === 'door') { draft.door = action.choice; offerCards(draft) }
  else {
    draft.deck.push(action.choice)
    if (draft.deck.length === 30) { draft.stage = 'complete'; draft.choices = [] }
    else if (draft.deck.length % 5 === 0) offerDoors(draft)
    else offerCards(draft)
  }
  return draft
}

export function draftView(draft) {
  return structuredClone({ stage: draft.stage, leader: draft.leader, deck: draft.deck, door: draft.door,
    choices: draft.choices, rarity: draft.schedule[draft.deck.length],
    allocation: Object.fromEntries(Object.keys(rarityLabels).map(key => [key, draft.schedule.filter(r => r === key).length])) })
}

export function autoDraft(seed, schedule, strength = 0) {
  const draft = createDraft(seed, schedule)
  while (draft.stage !== 'complete') {
    let choice = draft.choices[0]
    if (draft.stage === 'card') {
      const counts = draft.deck.map(id => cards[id])
      const score = id => {
        const c = cards[id]
        const expensive = counts.filter(card => card.cost >= 5).length >= 8
        const needsUnits = counts.filter(card => card.kind === 'unit').length < draft.deck.length * .65
        return (c.kind === 'unit' ? (c.attack + c.hp) / Math.max(1, c.cost) + (needsUnits ? 2 : 0) : 1.3)
          + (c.description ? .8 : 0) - (expensive && c.cost >= 5 ? 3 : 0)
      }
      // Later opponents select for mana balance and board presence, without changing card stats.
      if (strength > 0) choice = [...draft.choices].sort((a, b) => score(b) - score(a))[0]
    }
    draftAction(draft, { type: { class: 'arena-class', door: 'arena-door', card: 'arena-pick' }[draft.stage], choice })
  }
  return { leader: draft.leader, deck: [...draft.deck] }
}
