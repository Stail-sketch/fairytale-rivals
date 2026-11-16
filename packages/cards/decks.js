import { deckIssue } from '../engine/index.js'
import { leaders, prototypeDeck } from './index.js'

export const deckStorageKey = 'fairytale-rivals.decks.v1'
export const savedDeckPrefix = 'fairytale-rivals.decks.v2.'
const classOrder = Object.keys(leaders)

export const starterDecks = Object.freeze({
  mage: Object.freeze({
    name: '夢時計の魔法',
    summary: '軽い特技で敵を除き、火術師を育てて流星で盤面を取り返す。',
    cards: Object.freeze([
      'FT-0001', 'FT-0001', 'FT-0002', 'FT-0002', 'FT-0003', 'FT-0003',
      'FT-0010', 'FT-0013', 'ember-whelp', 'FT-0015', 'twig-guard', 'FT-0011',
      'page-sprite', 'page-sprite', 'FT-0025', 'mist-cat', 'bell-familiar', 'FT-0043',
      'FT-0012', 'FT-0021', 'FT-0040', 'cheer', 'FT-0028', 'ink', 'poison', 'veil',
      'FT-0037', 'FT-0050', 'storm', 'exile',
    ]),
  }),
  priest: Object.freeze({
    name: '眠り森の守り',
    summary: '前衛で味方を守り、回復を薔薇園の守護獣の強化につなぐ。',
    cards: Object.freeze([
      'FT-0004', 'FT-0004', 'FT-0005', 'FT-0005', 'FT-0006', 'FT-0006',
      'FT-0010', 'FT-0014', 'twig-guard', 'FT-0017', 'FT-0011', 'brass-squire',
      'page-sprite', 'FT-0012', 'FT-0032', 'lantern-ghost', 'choir-siren', 'choir-siren',
      'FT-0019', 'dawn-deer', 'FT-0044', 'FT-0023', 'dew', 'FT-0057', 'blessing', 'FT-0052',
      'cheer', 'FT-0059', 'retreat', 'FT-0024',
    ]),
  }),
  swordsman: Object.freeze({
    name: '黒薔薇の契約',
    summary: '契約で最大MPを伸ばし、古竜と大型ユニットを先に展開する。',
    cards: Object.freeze([
      'FT-0007', 'FT-0007', 'FT-0008', 'FT-0008', 'FT-0009',
      'FT-0010', 'FT-0013', 'twig-guard', 'ember-whelp', 'FT-0011', 'FT-0039',
      'page-sprite', 'FT-0033', 'sugar-bomb', 'needle-knight', 'FT-0031', 'FT-0012',
      'FT-0034', 'FT-0020', 'honey-bear', 'FT-0044', 'FT-0042', 'spark', 'dew',
      'cheer', 'cheer', 'blessing', 'FT-0037', 'FT-0045', 'exile',
    ]),
  }),
})

const commonStarter = Object.freeze(prototypeDeck.map(card => ({
  'moon-hare': 'FT-0010', 'brass-squire': 'FT-0011', 'steel-beetle': 'FT-0012', 'lake-scout': 'FT-0025',
  'mist-cat': 'FT-0030', 'thorn-owl': 'FT-0043', 'twin-fox': 'FT-0041', 'night-dragon': 'FT-0044',
})[card] ?? card))

const classCards = {
  warrior: { ink: 'FT-0049', 'bell-familiar': 'FT-0055' },
  fighter: { cheer: 'FT-0051', spark: 'FT-0047', 'bell-familiar': 'FT-0038' },
  merchant: { veil: 'FT-0053', storm: 'FT-0046' },
  seer: { 'bell-familiar': 'FT-0054', 'page-sprite': 'FT-0058', storm: 'FT-0060' },
}
const classStarters = Object.fromEntries(Object.entries(classCards).map(([leader, swaps]) =>
  [leader, Object.freeze(commonStarter.map(card => swaps[card] ?? card))]))

export function starterLineup(leader, solo = true) {
  return { leader, deck: solo ? starterDecks[leader]?.cards ?? classStarters[leader] ?? commonStarter : prototypeDeck }
}

const cpuCardSwaps = {
  warrior: { spark: 'FT-0507', 'FT-0049': 'FT-0511' },
  mage: { 'mist-cat': 'FT-0516', ink: 'FT-0523' },
  fighter: { ink: 'FT-0527', 'FT-0047': 'FT-0526' },
  priest: { dew: 'FT-0537', blessing: 'FT-0538' },
  merchant: { crossroads: 'FT-0545', 'FT-0046': 'FT-0554' },
  seer: { crossroads: 'FT-0557', 'honey-bear': 'FT-0558' },
  swordsman: { spark: 'FT-0568', 'FT-0045': 'FT-0565' },
}

export function cpuLineup(leader) {
  const { deck } = starterLineup(leader)
  return { leader, deck: deck.map(card => cpuCardSwaps[leader]?.[card] ?? card) }
}

export function createDeckCollection(storage) {
  const legacyIds = classOrder.map(leader => 'legacy-' + leader)

  function read(key) {
    try {
      return JSON.parse(storage.getItem(key) ?? 'null')
    } catch { return null }
  }

  function validDeck(deck, leader) {
    return typeof leader === 'string' && Array.isArray(deck) && deck.every(id => typeof id === 'string')
      && !deckIssue(deck, leader)
  }

  function get(id) {
    if (!legacyIds.includes(id) && !/^[a-f0-9]{32}$/.test(id)) return null
    const saved = read(savedDeckPrefix + id)
    if (saved && typeof saved.name === 'string' && saved.name.trim() && validDeck(saved.deck, saved.leader)
        && Number.isFinite(saved.created)) return { ...saved, id }
    if (!legacyIds.includes(id)) return null
    const leader = id.slice('legacy-'.length)
    const deck = read(deckStorageKey + '.' + leader)
    if (!validDeck(deck, leader)) return null
    return { id, leader, name: starterDecks[leader]?.name ?? leaders[leader].job + 'デッキ', deck, created: 0 }
  }

  function list(leader) {
    const ids = new Set(legacyIds)
    try {
      for (const key of storage.keys()) if (key.startsWith(savedDeckPrefix)) ids.add(key.slice(savedDeckPrefix.length))
    } catch { /* Existing legacy saves can still be loaded. */ }
    return [...ids].map(get).filter(deck => deck && (!leader || deck.leader === leader))
      .sort((a, b) => classOrder.indexOf(a.leader) - classOrder.indexOf(b.leader)
        || a.created - b.created || a.id.localeCompare(b.id))
  }

  return {
    get, list,
    initialize(initialDecks) {
      for (const { id, leader, name, deck } of initialDecks) {
        if (!/^[a-f0-9]{32}$/.test(id) || !validDeck(deck, leader)) continue
        const installed = 'fairytale-rivals.initial-deck.' + id
        try {
          if (storage.getItem(installed) !== null) continue
          const existing = list(leader)
          const sorted = [...deck].sort()
          const duplicate = existing.some(record => record.name === name &&
            [...record.deck].sort().every((card, index) => card === sorted[index]))
          if (!duplicate && !get(id)) {
            const created = Math.max(Date.now(), (existing.at(-1)?.created ?? 0) + 1)
            storage.setItem(savedDeckPrefix + id, JSON.stringify({ leader, name, deck, created }))
          }
          storage.setItem(installed, '1')
        } catch { /* A writable browser store can retry on the next load. */ }
      }
    },
    save({ id, leader, name, deck }) {
      name = typeof name === 'string' ? name.trim() : ''
      if (!name) return { ok: false, issue: 'デッキ名を入力してください。' }
      if (Array.isArray(deck) && deck.some(card => typeof card !== 'string')) {
        return { ok: false, issue: 'デッキに未知のカードがあります。' }
      }
      const issue = deckIssue(deck, leader)
      if (issue) return { ok: false, issue }
      const current = id ? get(id) : null
      if (id && current?.leader !== leader) return { ok: false, issue: '保存するデッキが見つかりません。' }
      id ??= Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
      const created = current?.created ?? Math.max(Date.now(), (list(leader).at(-1)?.created ?? 0) + 1)
      const record = { id, leader, name, deck: [...deck], created }
      try {
        storage.setItem(savedDeckPrefix + id, JSON.stringify(record))
        return { ok: true, deck: record }
      } catch {
        return { ok: false, issue: 'ブラウザーに保存できませんでした。変更は編成画面に残っています。' }
      }
    },
    remove(id) {
      if (!get(id)) return { ok: true }
      try {
        const key = savedDeckPrefix + id
        const hasSaved = storage.getItem(key) != null
        // Remove the legacy copy first so it cannot reappear after removing the renamed deck.
        if (legacyIds.includes(id)) storage.removeItem(deckStorageKey + '.' + id.slice('legacy-'.length))
        if (hasSaved) storage.removeItem(key)
        return { ok: true }
      } catch {
        return { ok: false, issue: 'デッキを削除できませんでした。' }
      }
    },
  }
}
