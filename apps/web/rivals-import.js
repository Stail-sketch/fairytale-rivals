
import { cards, catalog, leaders } from '../../packages/cards/index.js'
import { rules } from '../../packages/engine/index.js'
import { createCardSearch } from './card-search.js'
import { originalCardNames } from './original-card-names.js'
import { scanDeckImage } from './rivals-screenshot.js'

const searchCards = createCardSearch(catalog.filter(card => card.packId !== 'generated'))
const originals = id => originalCardNames[id]?.[0] ?? cards[id].name

const localButton = (name, caption) => `<button type="button" data-op="${name}" class="icon-button">${caption}</button>`

export function createScreenshotImport() {
  let operation = 0
  let state
  reset()

  function reset() {
    operation++
    state = {
      working: false, error: '', name: 'スクショ取り込みデッキ', leader: '', chosen: -1, query: '', slots: [],
    }
  }

  async function load(file, render) {
    if (!file) return
    const ticket = ++operation
    state.working = true
    state.error = ''
    state.slots = []
    state.chosen = -1
    render('#rivals-import-status')
    try {
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
      const { result, canvas } = await scanDeckImage(file)
      if (ticket !== operation) return
      if (!result) throw new Error('カードの並びを検出できませんでした。カード全体が入ったデッキ詳細の画像でお試しください。')
      state.slots = result.slots.map(slot => ({ ...slot, thumb: slot.empty ? '' : thumbnail(canvas, slot) }))
      state.chosen = -1
      const classes = new Set(state.slots.map(slot => cards[slot.id]?.classId).filter(id => id && id !== 'neutral'))
      state.leader = classes.size === 1 ? [...classes][0] : ''
      state.query = ''
    } catch (error) {
      if (ticket !== operation) return
      state.error = error instanceof Error ? error.message : '画像を読み取れませんでした。'
    } finally {
      if (ticket === operation) {
        state.working = false
        render('#rivals-import-status')
      }
    }
  }

  function thumbnail(source, { x, y, width, height }) {
    const canvas = document.createElement('canvas')
    canvas.width = 100
    canvas.height = 125
    canvas.getContext('2d').drawImage(source, x, y, width, height, 0, 0, 100, 125)
    return canvas.toDataURL('image/webp', .76)
  }

  function deckInfo() {
    const deck = state.slots.flatMap(slot => slot.id ? [slot.id] : [])
    const unknown = state.slots.filter(slot => !slot.empty && !slot.id).length
    const counts = new Map()
    for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1)
    const crossClass = state.leader && [...counts.keys()].filter(id => !['neutral', state.leader].includes(cards[id].classId))
    const overLimit = [...counts].filter(([id, count]) => count > rules.copyLimit[cards[id].rarity])
    const issue = crossClass?.length ? '選んだ職業で使用できないカードがあります。' :
      overLimit.length ? '同名枚数の上限を超えています。' : ''
    return { deck, unknown, counts, issue }
  }

  function suggestions() {
    const slot = state.slots[state.chosen]
    if (!slot) return []
    return state.query.trim() ? searchCards(state.query, () => true).slice(0, 9) : slot.guesses.map(guess => cards[guess.id])
  }

  function correction(art, escape) {
    const slot = state.slots[state.chosen]
    if (!slot) return ''
    return `<section class="rivals-correction" aria-labelledby="rivals-correction-title">
      ${slot.thumb ? `<img class="rivals-source-card" src="${slot.thumb}" alt="元画像のカード">` : ''}
      <div><h2 id="rivals-correction-title">${state.chosen + 1} 枚目を確認</h2>
        <label for="rivals-search">カードを検索</label>
        <input id="rivals-search" type="search" value="${escape(state.query)}" placeholder="原作名・童話戦記のカード名">
        <div id="rivals-suggestions">${suggestionButtons(art, escape)}</div>
        ${localButton('rivals-empty', 'この枠を空欄にする')}
        ${localButton('rivals-done', '一覧へ戻る')}
      </div>
    </section>`
  }

  function suggestionButtons(art, escape) {
    const options = suggestions()
    return options.length ? options.map(card => `<button type="button" class="secondary rivals-guess" data-rivals-match="${card.id}">
      <img src="${art(card.artId)}" alt=""><span><strong>${escape(originals(card.id))}</strong><small>${escape(card.name)}</small></span>
    </button>`).join('') : '<p>カード名で検索できます。</p>'
  }

  function review(art, escape) {
    if (!state.slots.length) return ''
    const { deck, unknown, counts, issue } = deckInfo()
    return `<section class="rivals-review" aria-labelledby="rivals-review-title">
      <h2 id="rivals-review-title">読み取り結果</h2>
      <p role="status" class="rivals-read-count">認識 ${deck.length} / ${rules.deckSize}枚 · ${counts.size}種類${unknown ? ' · 要確認 ' + unknown + '枚' : ''}</p>
      <div class="rivals-fields">
        <label>クラス<select id="rivals-leader"><option value="">選択してください</option>
          ${Object.entries(leaders).map(([id, leader]) => `<option value="${id}" ${state.leader === id ? 'selected' : ''}>${leader.job}</option>`).join('')}
        </select></label>
        <label>デッキ名<input id="rivals-name" autocomplete="off" value="${escape(state.name)}"></label>
      </div>
      <div class="rivals-slots">${state.slots.map((slot, index) => {
        const card = cards[slot.id]
        return `<button type="button" data-rivals-slot="${index}" data-rivals-card="${slot.id ?? ''}" class="rivals-slot ${card ? '' : slot.empty ? 'rivals-empty' : 'rivals-unread'}"
          aria-pressed="${state.chosen === index}" aria-label="${index + 1} 枚目 ${card ? escape(originals(card.id)) : slot.empty ? '空欄' : '要確認'}">
          ${card ? `<img src="${art(card.artId)}" loading="lazy" alt="">` : slot.thumb ?
            `<img src="${slot.thumb}" loading="lazy" alt="">` : '<span class="rivals-slot-blank" aria-hidden="true">＋</span>'}
          <span><strong>${card ? escape(originals(card.id)) : slot.empty ? '空欄' : '要確認'}</strong>
          ${card ? `<small>${escape(card.name)}</small>` : ''}</span>
        </button>`
      }).join('')}</div>
      ${correction(art, escape)}
      <p class="rivals-status" role="status">${issue || (unknown ? '「要確認」の枠を選ぶと、原作名で探して直せます。' : '')}</p>
      <button type="button" class="primary" data-op="rivals-apply" ${!deck.length || !state.leader || issue || state.working ? 'disabled' : ''}>
        ${deck.length < rules.deckSize ? '認識済みのカードで編成へ' : 'デッキ編成へ'}
      </button>
    </section>`
  }

  return {
    reset, load,
    view(art, escape) {
      return `<section class="rivals-import">
        <div class="rivals-upload" data-rivals-upload>
          <label for="rivals-file">スクリーンショットを選ぶ</label>
          <input type="file" id="rivals-file" accept="image/png,image/jpeg,image/webp,image/bmp">
          <p>ライバルズのデッキ詳細で、カードの絵が並んだ画面を貼り付けるか、画像をここにドロップできます。</p>
        </div>
        <p id="rivals-import-status" class="rivals-status" role="status" tabindex="-1">${state.working ? 'カードの絵柄を照合中…' : escape(state.error)}</p>
        ${review(art, escape)}
      </section>`
    },
    field(app, art, escape, node, render) {
      if (node.id === 'rivals-file') load(node.files[0], render)
      else if (node.id === 'rivals-leader') {
        state.leader = node.value
        render('#rivals-leader')
      } else if (node.id === 'rivals-name') state.name = node.value
      else if (node.id === 'rivals-search') {
        state.query = node.value
        app.querySelector('#rivals-suggestions').innerHTML = suggestionButtons(art, escape)
      }
    },
    handle(node, render, edit) {
      const { op, rivalsSlot, rivalsMatch } = node.dataset
      if (rivalsSlot !== undefined) {
        state.chosen = Number(rivalsSlot)
        state.query = ''
        render('#rivals-search')
      } else if (rivalsMatch || op === 'rivals-empty') {
        const slot = state.slots[state.chosen]
        if (!slot) return true
        const card = cards[rivalsMatch]
        slot.id = card?.id ?? null
        slot.empty = !card
        if (!state.leader && card && card.classId !== 'neutral') state.leader = card.classId
        const focus = `[data-rivals-slot="${state.chosen}"]`
        state.chosen = -1
        render(focus)
      } else if (op === 'rivals-done') {
        const focus = `[data-rivals-slot="${state.chosen}"]`
        state.chosen = -1
        render(focus)
      } else if (op === 'rivals-apply') {
        const { deck, issue } = deckInfo()
        if (!issue && deck.length && state.leader && !state.working) {
          edit({ leader: state.leader, name: state.name.trim() || 'スクショ取り込みデッキ', deck })
          reset()
          render('#deck-name')
        }
      } else return false
      return true
    },
  }
}

