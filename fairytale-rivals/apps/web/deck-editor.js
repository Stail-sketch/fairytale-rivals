import { cards, catalog, leaders } from '../../packages/cards/index.js'
import { rules } from '../../packages/engine/index.js'
import { starterLineup } from '../../packages/cards/decks.js'
import { createCardSearch } from './card-search.js'
import { rarityOptions, sourceLabels } from './library.js'
import { createScreenshotImport } from './rivals-import.js'
import { openDeckOverview } from './deck-overview.js'

const pageSize = 9
const byCost = (a, b) => a.cost - b.cost || a.name.localeCompare(b.name, 'ja')
const available = catalog.filter(card => card.packId !== 'generated').sort(byCost)
const searchCards = createCardSearch(available)

function cardRow(card, art, count, add, disabled = false) {
  const limit = rules.copyLimit[card.rarity]
  const stats = card.kind === 'spell' ? '特技' : (card.kind === 'weapon' ? '武器 ' : '') + card.attack + '/' + card.hp
  return `<article class="deck-card">
    <div class="deck-card-art"><img src="${art(card.artId)}" loading="lazy" alt=""><span aria-hidden="true" class="cost">${card.cost}</span></div>
    <div class="deck-card-copy"><strong class="deck-card-name">${card.name}</strong>
      <span class="deck-card-stats">${add ? `<span class="sr-only">${card.cost} MP </span>` : card.cost + ' MP · '}${stats}</span>
      <p class="deck-card-effect">${card.description || '効果なし'}</p></div>
    <button type="button" class="icon-button deck-adjust" data-deck-${add ? 'add' : 'remove'}="${card.id}" ${disabled ? 'disabled' : ''}
      aria-label="${card.name}を${add ? '追加' : '取り除く'}">${add ? '+' : '−'} <span>${count}${add ? '/' + limit : ''}</span></button>
  </article>`
}

function heading(title, actions) {
  return `<header class="library-heading"><h1>${title}</h1><div class="deck-nav">${actions}</div></header>`
}

const listButton = '<button type="button" data-op="deck-list" class="icon-button">デッキ一覧へ</button>'

export function createDeckEditor(collection) {
  let screen = 'list'
  let page = 0
  let baseline
  let draft
  let query = ''
  let pack = ''
  let rarity = ''
  let message = ''
  let listMessage = ''
  const screenshot = createScreenshotImport()

  function dirty() {
    return draft.name !== baseline.name || draft.deck.length !== baseline.deck.length ||
      draft.deck.some((id, index) => id !== baseline.deck[index])
  }

  function edit(deck) {
    baseline = deck
    draft = { ...deck }
    query = pack = rarity = message = ''
    screen = 'edit'
  }

  function listView(art, escape) {
    const decks = collection.list()
    const pages = Math.max(1, Math.ceil(decks.length / pageSize))
    page = Math.min(page, pages - 1)
    return heading('デッキ一覧', `<button type="button" data-op="close-decks" class="icon-button">タイトルへ戻る</button>
      <button type="button" data-op="rivals-import" class="icon-button">スクショから作成</button>
      <button type="button" data-op="new-deck" class="primary">＋ 新規作成</button>`) +
      (listMessage ? `<p id="deck-list-status" role="status" tabindex="-1">${escape(listMessage)}</p>` : '') +
      (decks.length ? `<div class="deck-grid">${decks.slice(page * pageSize, (page + 1) * pageSize).map(deck => {
        const leader = leaders[deck.leader]
        return `<article class="deck-tile" style="--deck-accent:${leader.accent}">
          <button type="button" class="saved-deck" data-deck-open="${deck.id}">
            <img src="${art(deck.leader)}" alt=""><span><strong>${escape(deck.name)}</strong><small>${leader.job} · ${leader.name}</small></span>
          </button>
          <div class="deck-tile-actions">
            <button type="button" class="icon-button deck-overview-button" data-deck-overview="${deck.id}" aria-label="${escape(deck.name)}の全体表示">全体表示</button>
            <button type="button" class="icon-button deck-delete" data-deck-delete="${deck.id}" aria-label="${escape(deck.name)}を削除">削除</button>
          </div>
        </article>`
      }).join('')}</div>` : '<p class="deck-empty">保存済みのデッキはありません。</p>') +
      (pages > 1 ? `<nav class="deck-pages" aria-label="デッキ一覧のページ">
        <button type="button" class="secondary" data-deck-page="-1" ${page === 0 ? 'disabled' : ''}>前のページ</button>
        <span aria-live="polite">${page + 1} / ${pages}</span>
        <button type="button" class="secondary" data-deck-page="1" ${page === pages - 1 ? 'disabled' : ''}>次のページ</button>
      </nav>` : '')
  }

  function classesView(art) {
    return heading('クラスを選ぶ', listButton) + `<div class="deck-class-grid">${Object.entries(leaders).map(([id, leader]) =>
      `<button type="button" class="deck-class" data-deck-class="${id}" style="--deck-accent:${leader.accent}">
        <img src="${art(id)}" alt=""><strong>${leader.job}</strong><small>${leader.name}</small>
      </button>`).join('')}</div>`
  }

  function editorView(art, escape) {
    const leader = leaders[draft.leader]
    return `${heading('デッキ編成', listButton + '<button type="button" data-op="deck-overview" class="icon-button">全体表示</button>')}
      <div class="deck-columns">
        <section aria-labelledby="deck-pool-title">
          <h2 id="deck-pool-title">追加できるカード <span id="deck-pool-size"></span></h2>
          <div class="library-filters deck-filters">
            <label>検索<input type="search" data-deck-filter="query" value="${escape(query)}" placeholder="カード名・原作名・効果"></label>
            <label>レアリティ<select data-deck-filter="rarity">${rarityOptions(rarity)}</select></label>
            <label>収録<select data-deck-filter="pack"><option value="">すべて</option>
              ${Object.entries(sourceLabels).filter(([id]) => id !== 'generated').map(([id, title]) =>
                `<option value="${id}" ${id === pack ? 'selected' : ''}>${title}</option>`).join('')}</select></label>
          </div>
          <div class="deck-scroll deck-pool" id="deck-pool"></div>
        </section>
        <section aria-labelledby="deck-list-title" class="deck-current">
          <div class="deck-identity" style="--deck-accent:${leader.accent}">
            <img src="${art(draft.leader)}" alt="">
            <div><span>${leader.job} · ${leader.name}</span>
              <label for="deck-name">デッキ名</label>
              <input id="deck-name" value="${escape(draft.name)}" autocomplete="off" required>
            </div>
          </div>
          <h2 id="deck-list-title">デッキ <span id="deck-size"></span></h2>
          <div class="deck-scroll deck-list" id="deck-list"></div>
          <footer class="deck-footer">
            <p id="deck-status" role="status" tabindex="-1"></p>
            ${draft.id ? '' : '<button class="secondary" type="button" data-op="seed-deck">おすすめで編成</button>'}
            <button class="secondary" type="button" data-op="discard-deck">変更を取り消す</button>
            <button class="primary" type="button" data-op="save-deck">保存</button>
          </footer>
        </section>
      </div>`
  }

  function updateStatus(app) {
    const unsaved = dirty()
    const ready = draft.deck.length === rules.deckSize && Boolean(draft.name.trim())
    app.querySelector('[data-op="save-deck"]').disabled = !unsaved || !ready
    app.querySelector('[data-op="discard-deck"]').disabled = !unsaved
    const seed = app.querySelector('[data-op="seed-deck"]')
    if (seed) seed.disabled = draft.deck.length > 0
    app.querySelector('#deck-status').textContent = message || (unsaved ? '未保存の変更があります。' : '')
  }

  function refresh(app, art) {
    if (screen !== 'edit') return
    const { leader, deck } = draft
    const counts = new Map()
    for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1)
    const candidates = searchCards(query, card => (card.classId === 'neutral' || card.classId === leader)
      && (!pack || card.packId === pack) && (!rarity || card.rarity === rarity))
    const list = app.querySelector('#deck-list')
    const pool = app.querySelector('#deck-pool')
    const listPosition = list.scrollTop
    const poolPosition = pool.scrollTop
    list.innerHTML = counts.size ? [...counts.keys()].map(id => cards[id]).sort(byCost)
      .map(card => cardRow(card, art, counts.get(card.id), false)).join('') :
      '<p class="catalog-empty">カードを追加してください。</p>'
    pool.innerHTML = candidates.length ? candidates.map(card => {
      const count = counts.get(card.id) ?? 0
      return cardRow(card, art, count, true, deck.length >= rules.deckSize || count >= rules.copyLimit[card.rarity])
    }).join('') : '<p class="catalog-empty">該当するカードはありません。</p>'
    list.scrollTop = listPosition
    pool.scrollTop = poolPosition
    app.querySelector('#deck-size').textContent = deck.length + ' / ' + rules.deckSize + '枚'
    app.querySelector('#deck-pool-size').textContent = candidates.length + '件'
    updateStatus(app)
  }

  function adjust(app, art, add, id) {
    const card = cards[id]
    if (!card || card.packId === 'generated' || (card.classId !== 'neutral' && card.classId !== draft.leader)) return
    const next = [...draft.deck]
    if (add) {
      if (next.length >= rules.deckSize || next.filter(value => value === id).length >= rules.copyLimit[card.rarity]) return
      next.push(id)
    } else {
      const index = next.indexOf(id)
      if (index === -1) return
      next.splice(index, 1)
    }
    draft.deck = next
    message = ''
    refresh(app, art)
    const focus = app.querySelector(`[data-deck-${add ? 'add' : 'remove'}="${id}"]:enabled`) ??
      app.querySelector('[data-op="save-deck"]:enabled') ?? app.querySelector('[data-deck-filter="query"]')
    focus.focus({ preventScroll: true })
  }

  return {
    open() {
      page = 0
      listMessage = ''
      screenshot.reset()
      screen = 'list'
    },
    view(art, escape) {
      const contents = screen === 'list' ? listView(art, escape) : screen === 'class' ? classesView(art) :
        screen === 'import' ? heading('スクショからデッキ作成', listButton) + screenshot.view(art, escape) : editorView(art, escape)
      return `<main class="library-view deck-view" tabindex="-1">${contents}</main>`
    },
    refresh,
    importField(app, art, escape, node, render, type) {
      if (screen !== 'import' || !node.id.startsWith('rivals-')) return false
      const onChange = node.id === 'rivals-file' || node.id === 'rivals-leader'
      if (onChange === (type === 'change')) screenshot.field(app, art, escape, node, render)
      return true
    },
    importImage(file, render) {
      if (screen !== 'import' || !file) return false
      screenshot.load(file, render)
      return true
    },
    filter(app, art, field) {
      if (field.dataset.deckFilter === 'pack') pack = field.value
      if (field.dataset.deckFilter === 'rarity') rarity = field.value
      if (field.dataset.deckFilter === 'query') query = field.value
      app.querySelector('#deck-pool').scrollTop = 0
      refresh(app, art)
    },
    rename(app, value) {
      draft.name = value
      message = ''
      updateStatus(app)
    },
    handle(app, art, escape, node, render) {
      const { op, deckOpen, deckDelete, deckClass, deckPage, deckAdd, deckRemove, deckOverview } = node.dataset
      if (screen === 'import' && screenshot.handle(node, render, imported => {
        edit({ ...imported, deck: [] })
        draft.deck = imported.deck
      })) return true
      if (deckOverview || op === 'deck-overview' && screen === 'edit') {
        const deck = deckOverview ? collection.get(deckOverview) : draft
        openDeckOverview(app.querySelector('.deck-view'), deck, node, art, escape, byCost)
      } else if (deckPage !== undefined) {
        page += Number(deckPage)
        listMessage = ''
        render('[data-deck-open]')
      } else if (deckOpen) {
        const deck = collection.get(deckOpen)
        if (deck) edit(deck)
        render('#deck-name')
      } else if (deckDelete) {
        const deck = collection.get(deckDelete)
        if (deck && !window.confirm(`「${deck.name}」を削除しますか？`)) return true
        const result = collection.remove(deckDelete)
        listMessage = result.ok ? `「${deck?.name ?? '選択したデッキ'}」を削除しました。` : result.issue
        render('#deck-list-status')
      } else if (deckClass) {
        edit({ leader: deckClass, name: leaders[deckClass].job + 'デッキ', deck: [] })
        render('#deck-name')
      } else if (deckAdd || deckRemove) {
        adjust(app, art, Boolean(deckAdd), deckAdd ?? deckRemove)
      } else if (op === 'new-deck') {
        screen = 'class'
        render('[data-deck-class]')
      } else if (op === 'rivals-import') {
        screenshot.reset()
        screen = 'import'
        render('#rivals-file')
      } else if (op === 'deck-list') {
        if (screen === 'edit' && dirty() && !window.confirm('変更を破棄してデッキ一覧へ戻りますか？')) return true
        listMessage = ''
        screenshot.reset()
        screen = 'list'
        render('.deck-view')
      } else if (op === 'seed-deck') {
        if (!draft.deck.length) draft.deck = starterLineup(draft.leader).deck
        refresh(app, art)
        app.querySelector('[data-op="save-deck"]:enabled')?.focus({ preventScroll: true })
      } else if (op === 'save-deck') {
        const result = collection.save(draft)
        if (result.ok) {
          baseline = result.deck
          draft = { ...baseline }
          page = Math.max(0, Math.floor(collection.list().findIndex(deck => deck.id === draft.id) / pageSize))
        }
        message = result.ok ? 'デッキを保存しました。' : result.issue
        render('#deck-status')
      } else if (op === 'discard-deck') {
        draft = { ...baseline }
        message = ''
        render('#deck-name')
      } else return false
      return true
    },
  }
}
