import { originalCardNames } from './original-card-names.js'
import { familyNames } from '../../packages/cards/index.js'

export const rarityLabels = {
  common: 'ノーマル', rare: 'レア', superRare: 'スーパーレア', legendary: 'レジェンド', unlabeled: 'ベーシック',
}

function normalize(value) {
  return value.normalize('NFKC').toLocaleLowerCase('ja').trim()
    .replace(/[ぁ-ゖ]/gu, letter => String.fromCharCode(letter.charCodeAt(0) + 0x60))
}

export function createCardSearch(orderedCards, extraFields = () => []) {
  const entries = orderedCards.map(card => {
    const originalNames = originalCardNames[card.id] ?? []
    return {
      card,
      names: [card.name, ...originalNames].map(normalize),
      text: normalize([card.name, card.description, familyNames[card.family], ...extraFields(card), ...originalNames].filter(Boolean).join(' ')),
    }
  })

  return (input, eligible) => {
    const query = normalize(input)
    const exact = []
    const partial = []
    for (const { card, names, text } of entries) {
      if (!eligible(card) || (query && !text.includes(query))) continue
      if (query && names.includes(query)) exact.push(card)
      else partial.push(card)
    }
    return exact.concat(partial)
  }
}
