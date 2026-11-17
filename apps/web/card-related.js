import { cards } from '../../packages/cards/index.js'
import { orbCards } from '../../packages/engine/terrain.js'
import { escapeText, termText } from './card-terms.js'

const outputs = {
  generate: '手札に加える', generateRandom: '手札に加える候補', summon: '場に出す',
  tensionSummon: '場に出す', hitAndSummon: '場に出す', hitSpawn: '場に出す',
  burnTreasure: '場に出す',
  combine: '場に出す', equip: '装備する', awakening: '装備する', transform: '変身先',
  putTop: '山札に置く', drawDiscountedSpell: '特技がないとき',
}

export function relatedCards(definition) {
  const related = new Map()
  const add = (id, label) => {
    if (id !== definition.id && Object.hasOwn(cards, id) && !related.has(id)) related.set(id, label)
  }
  function visit(effect) {
    if (!effect?.id) return
    if (effect.id === 'seedOrbs') orbCards.forEach(id => add(id, '山札に置く'))
    if (effect.id === 'combine') add(effect.partner, '合体に必要')
    const label = outputs[effect.id]
    if (label) {
      if (effect.id === 'generateRandom') effect.cards.forEach(id => add(id, label))
      else add(effect.card ?? effect.weapon ?? effect.fallback, label)
    }
    for (const child of [effect.effect, effect.success, effect.failure].filter(Boolean)) visit(child)
    for (const child of [...(effect.otherwise ?? []), ...(effect.options ?? []), ...(effect.ability?.effects ?? [])]) visit(child)
  }
  for (const effect of [...definition.effects, ...[...(definition.abilities ?? []), ...(definition.choice ?? []),
    ...(definition.fortune ?? [])].flatMap(option => option.effects)]) visit(effect)
  return [...related].map(([id, label]) => ({ card: cards[id], label }))
}

function details(card) {
  const type = { unit: 'ユニット', spell: '特技', weapon: '武器' }[card.kind]
  const stats = card.kind === 'spell' ? '' : ' · 攻撃力 ' + card.attack + (card.kind === 'weapon' ? ' · 耐久 ' : ' · HP ') + card.hp
  return `<div><strong>${escapeText(card.name)}</strong><small>${card.cost} MP · ${type}${stats}</small>
    <p>${termText(card.description || '効果なし')}</p></div>`
}

export function relatedPreview(definition, art) {
  const related = relatedCards(definition)
  if (!related.length) return ''
  return `<section class="related-cards" aria-label="関連カード">
    <p class="related-heading">関連カード</p>
    ${related.map(({ card, label }) => `<article class="related-card">
      <img src="${art(card.artId)}" alt="" loading="lazy"><div><span class="related-label">${label}</span>${details(card)}</div>
    </article>`).join('')}
  </section>`
}
