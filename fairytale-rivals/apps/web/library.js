import { cards, catalog, leaders, names } from '../../packages/cards/index.js'
import { createCardSearch, rarityLabels } from './card-search.js'

const jobLabel = id => leaders[id]?.job ?? '共通'
const typeLabel = card => ({ unit: 'ユニット', spell: '特技', weapon: '武器' })[card.kind]
export const sourceLabels = {
  prototype: '検証用', basic: 'ベーシック対応', standard: '第1弾対応', 'set-2': '第2弾対応', 'set-3': '第3弾対応', generated: '効果で生成',
}
const catalogByCost = [...catalog].sort((a, b) => a.cost - b.cost)
const searchCards = createCardSearch(catalogByCost, card => [card.id, jobLabel(card.classId), card.origin])
const state = { tab: 'cards', query: '', job: '', kind: '', rarity: '', source: '', selected: null }

function options(items, selected) {
  return items.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('')
}

export const rarityOptions = selected => options([['', 'すべて'], ...Object.entries(rarityLabels)], selected)

function cardGrid(cardsToShow, art) {
  return cardsToShow.map(card => `<button class="catalog-card" type="button" data-library-card="${card.id}"
    aria-pressed="${state.selected === card.id}" style="--card-accent:${leaders[card.classId]?.accent ?? '#d9bb82'}">
    <img src="${art(card.artId)}" alt="" loading="lazy">
    <span class="cost">${card.cost}</span>
    <strong>${card.name}</strong>
    <span class="catalog-card-meta">${jobLabel(card.classId)} · ${card.kind === 'unit' ? card.attack + '/' + card.hp : typeLabel(card)}</span>
  </button>`).join('')
}

function cardDetails(card, art) {
  if (!card) return ''
  return `<img class="catalog-detail-art" src="${art(card.artId)}" alt="">
    <div class="catalog-detail-body"><p class="catalog-detail-class">${jobLabel(card.classId)} · ${typeLabel(card)}</p>
    <h2>${card.name}</h2>
    <div class="catalog-stats"><span>MP <b>${card.cost}</b></span>
      ${card.kind !== 'spell' ? `<span>攻撃 <b>${card.attack}</b></span><span>${card.kind === 'weapon' ? '耐久' : 'HP'} <b>${card.hp}</b></span>` : ''}</div>
    <p class="catalog-effect">${card.description}</p>
    <dl>
      <dt>収録</dt><dd>${sourceLabels[card.packId]}</dd>
      <dt>レアリティ</dt><dd>${rarityLabels[card.rarity]}</dd>
      ${card.species ? `<dt>種族</dt><dd>${card.species}</dd>` : ''}
      ${card.origin ? `<dt>入手元</dt><dd>${card.origin}</dd>` : ''}
    </dl></div>`
}

function matches() {
  return searchCards(state.query, card =>
    (!state.job || card.classId === state.job) && (!state.kind || card.kind === state.kind) &&
    (!state.rarity || card.rarity === state.rarity) && (!state.source || card.packId === state.source))
}

function skills(art) {
  return `<div class="catalog-skills">${Object.entries(leaders).map(([id, leader]) => `<article class="catalog-skill"
    style="--card-accent:${leader.accent}">
    <img src="${art(id)}" alt=""><div>
      <p>${leader.job} · ${leader.name}</p>
      <h2>${leader.skill.name}</h2>
      <p>${leader.skill.description}</p>
    </div></article>`).join('')}</div>`
}

export function library(art) {
  const cardTab = state.tab === 'cards'
  return `<main class="library-view" tabindex="-1">
    <header class="library-heading"><h1>カードライブラリ</h1><button data-op="close-library" class="icon-button">タイトルへ戻る</button></header>
    <div class="library-tabs" aria-label="表示する内容">
      <button class="secondary" type="button" data-library-tab="cards" aria-pressed="${cardTab}">カード</button>
      <button class="secondary" type="button" data-library-tab="skills" aria-pressed="${!cardTab}">${names.TENSION_SKILL}</button>
    </div>
    ${cardTab ? `<div class="library-filters">
      <label class="library-search">検索<input type="search" data-library-filter="query" placeholder="カード名・原作名・効果"></label>
      <label>職業<select data-library-filter="job">${options([['', 'すべて'], ['neutral', '共通'], ...Object.entries(leaders).map(([id, leader]) => [id, leader.job])], state.job)}</select></label>
      <label>種類<select data-library-filter="kind">${options([['', 'すべて'], ['unit', 'ユニット'], ['spell', '特技'], ['weapon', '武器']], state.kind)}</select></label>
      <label>レアリティ<select data-library-filter="rarity">${rarityOptions(state.rarity)}</select></label>
      <label>収録<select data-library-filter="source">${options([['', 'すべて'], ...Object.entries(sourceLabels)], state.source)}</select></label>
    </div>
    <p class="catalog-count" id="catalog-count" aria-live="polite"></p>
    <div class="library-content">
      <div id="catalog-grid" class="catalog-grid"></div>
      <aside id="catalog-detail" class="catalog-detail" aria-label="カード詳細"></aside>
    </div>` : skills(art)}
  </main>`
}

export function refreshLibrary(app, art) {
  const grid = app.querySelector('#catalog-grid')
  if (!grid) return
  const results = matches()
  if (!results.some(card => card.id === state.selected)) state.selected = results[0]?.id ?? null
  const input = app.querySelector('[data-library-filter="query"]')
  if (input.value !== state.query) input.value = state.query
  app.querySelector('#catalog-count').textContent = results.length + '件'
  grid.innerHTML = results.length ? cardGrid(results, art) : '<p class="catalog-empty">該当するカードはありません。</p>'
  app.querySelector('#catalog-detail').innerHTML = cardDetails(cards[state.selected], art)
}

export function changeLibraryFilter(app, art, field) {
  if (field.dataset.libraryFilter === 'query' && state.query !== field.value) state.selected = null
  state[field.dataset.libraryFilter] = field.value
  refreshLibrary(app, art)
}

export function selectLibraryCard(app, art, id) {
  state.selected = id
  for (const button of app.querySelectorAll('[data-library-card]')) {
    button.setAttribute('aria-pressed', String(button.dataset.libraryCard === id))
  }
  app.querySelector('#catalog-detail').innerHTML = cardDetails(cards[id], art)
}

export function switchLibraryTab(tab) {
  state.tab = tab
}
