import { cards, leaders } from '../../packages/cards/index.js'
import { rules } from '../../packages/engine/index.js'
import { originalCardNames } from './original-card-names.js'

const types = { unit: 'ユニット', spell: '特技', weapon: '武器' }
const lastCostGroup = 7

function statsSummary(deckCards) {
  const costCounts = Array.from({ length: lastCostGroup + 1 }, () => 0)
  const typeCounts = { unit: 0, spell: 0, weapon: 0 }
  for (const card of deckCards) {
    costCounts[Math.min(lastCostGroup, card.cost)]++
    typeCounts[card.kind]++
  }
  const peak = Math.max(1, ...costCounts)
  return `<footer class="deck-overview-summary">
    <section aria-labelledby="overview-cost-title">
      <h3 id="overview-cost-title">MP別の枚数</h3>
      <ol class="deck-overview-costs">${costCounts.map((count, cost) => {
        const label = cost === lastCostGroup ? cost + '+' : cost
        return `<li data-cost-group="${cost}" data-amount="${count}" aria-label="MP ${label}、${count}枚">
          <b>${count}</b><div class="deck-overview-column" aria-hidden="true"><i style="--fill:${count / peak * 100}%"></i></div>
          <small>${label}</small></li>`
      }).join('')}</ol>
    </section>
    <section aria-labelledby="overview-type-title">
      <h3 id="overview-type-title">カードの内訳</h3>
      <dl class="deck-overview-types">${Object.entries(types).map(([kind, label]) =>
        `<div><dt>${label}</dt><dd data-type-amount="${kind}">${typeCounts[kind]}枚</dd></div>`).join('')}</dl>
    </section>
  </footer>`
}

function slot(card, art, escape) {
  if (!card) return '<span class="deck-overview-card overview-empty" aria-hidden="true"></span>'
  const stats = card.kind === 'spell' ? types.spell : card.attack + '/' + card.hp
  return `<button type="button" class="deck-overview-card" data-overview-card="${card.id}" data-kind="${card.kind}"
    aria-pressed="false" aria-label="${escape(card.name)}、${card.cost} MP、${types[card.kind]}" title="${escape(card.name)}">
    <img src="${art(card.artId)}" alt=""><span class="cost">${card.cost}</span>
    <span class="overview-card-caption"><strong>${escape(card.name)}</strong><small>${card.kind === 'weapon' ? '武器 ' : ''}${stats}</small></span>
  </button>`
}

export function openDeckOverview(panel, deck, trigger, art, escape, compareCards) {
  if (!deck || panel.querySelector('.deck-overview[open]')) return
  const leader = leaders[deck.leader]
  const entries = deck.deck.map(id => cards[id]).sort(compareCards)
  const dialog = document.createElement('dialog')
  dialog.className = 'deck-overview'
  dialog.style.setProperty('--overview-accent', leader.accent)
  dialog.setAttribute('aria-labelledby', 'deck-overview-title')
  dialog.innerHTML = `<header class="deck-overview-header">
    <img src="${art(deck.leader)}" alt="">
    <div><p>${leader.job} · ${escape(leader.name)}</p><h2 id="deck-overview-title">${escape(deck.name.trim() || 'デッキ全体')}</h2></div>
    <strong class="deck-overview-total">${entries.length} / ${rules.deckSize}枚</strong>
    <form method="dialog"><button type="submit" class="icon-button" autofocus>閉じる</button></form>
  </header>
  <div class="deck-overview-grid" aria-label="デッキのカード">
    ${Array.from({ length: rules.deckSize }, (_, index) => slot(entries[index], art, escape)).join('')}
  </div>
  ${statsSummary(entries)}
  <aside class="deck-overview-detail" aria-live="polite" hidden></aside>`
  const detail = dialog.querySelector('.deck-overview-detail')
  let chosen
  dialog.addEventListener('click', event => {
    const node = event.target.closest('[data-overview-card]')
    if (!node) return
    const card = cards[node.dataset.overviewCard]
    chosen?.setAttribute('aria-pressed', 'false')
    const closeDetail = chosen === node
    chosen = closeDetail ? null : node
    if (closeDetail) {
      detail.hidden = true
      detail.replaceChildren()
      return
    }
    node.setAttribute('aria-pressed', 'true')
    const original = originalCardNames[card.id]?.[0]
    detail.innerHTML = `<img src="${art(card.artId)}" alt=""><div>
      <h3>${escape(card.name)}</h3><small>${card.cost} MP · ${types[card.kind]}${original ? ' · 原作 ' + escape(original) : ''}</small>
      <p>${escape(card.description || '効果なし')}</p></div>`
    detail.hidden = false
    detail.scrollIntoView({ block: 'nearest' })
  })
  function close() {
    if (!dialog.isConnected) return
    dialog.remove()
    trigger.focus({ preventScroll: true })
  }
  dialog.addEventListener('close', close, { once: true })
  dialog.addEventListener('submit', event => {
    event.preventDefault()
    dialog.close()
    close()
  })
  panel.append(dialog)
  dialog.showModal()
}

