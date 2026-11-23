import { cards, leaders } from '../../packages/cards/index.js'
import { arenaCpuLevel, createDraft, draftView, doors, rarityLabels } from '../../packages/arena/index.js'
import { escapeText as escape, termText } from './card-terms.js'
import { relatedPreview } from './card-related.js'

export const arenaStorageKey = 'fairytale-rivals.arena.v1'
const bestKey = 'fairytale-rivals.arena.best.v1'
export const arenaSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]

export function createArenaStore(storage) {
  let run = null
  let best = 0
  let issue = ''
  try {
    const saved = JSON.parse(storage.getItem(arenaStorageKey) ?? 'null')
    if (saved?.version === 1 && saved.draft?.version === 1 && Array.isArray(saved.draft.deck)) run = saved
    best = Math.max(0, Number(storage.getItem(bestKey)) || 0, run?.wins ?? 0)
  } catch { /* A new challenge is still available when storage is unavailable. */ }
  function persist() {
    try {
      storage.setItem(arenaStorageKey, JSON.stringify(run))
      storage.setItem(bestKey, String(best))
      issue = ''
    } catch { issue = 'ブラウザーに保存できません。このまま遊べますが、画面を閉じると続きが失われます。' }
  }
  return {
    get run() { return run }, get best() { return best }, get issue() { return issue },
    newRun() {
      run = { version: 1, draft: createDraft(arenaSeed()), wins: 0, ended: false, settled: false, match: null }
      persist()
      return run
    },
    save: persist,
    saveMatch(match) {
      if (!run) return
      run.match = match.exportState()
      if (run.match.game.phase === 'finished' && !run.settled) {
        run.settled = true
        if (run.match.game.winner === 0) run.wins++
        else if (run.match.game.winner !== 'draw') run.ended = true
        best = Math.max(best, run.wins)
      }
      persist()
    },
  }
}

export function arenaMenu(store, feedback) {
  const run = store.run
  const difficulty = run?.match && !run.settled ? run.match.config.arenaCpu : arenaCpuLevel(run?.wins ?? 0)
  return `<main class="arena-menu ceremony"><section class="modal">
    <p class="modal-kicker">扉を開き、自分だけの物語を編む</p><h1>物語の闘技場</h1>
    <p>3人の語り手から1人を選び、扉とカードを選んで30枚のデッキを作ります。</p>
    <div class="arena-mode-grid"><section><span class="arena-mode-icon">♜</span><h2>CPU勝ち抜き</h2>
      <p>ピックしたデッキで連戦。1敗するまで何勝できるか挑戦できます。</p>
      <p class="arena-record">最高記録 <b>${store.best}</b> 勝${run ? ` · 今回 <b>${run.wins}</b> 勝` : ''}</p>
      <p data-arena-cpu-level>${difficulty ? `CPU Lv.${difficulty.level} · ${difficulty.label}` : '進行中の対戦は以前のCPU設定です'}<br><small>0〜2勝：入門 ／ 3〜5勝：標準 ／ 6〜9勝：熟練 ／ 10勝以上：達人</small></p>
      ${run && !run.ended ? `<button class="primary" data-op="arena-resume">${run.match ? '対戦の続きから' : run.draft.stage === 'complete' ? '完成したデッキで挑戦' : 'ピックの続きから'}</button>` : ''}
      <button class="secondary" data-op="arena-cpu-new">新しくピックする</button></section>
      <section><span class="arena-mode-icon">⚔</span><h2>フレンド闘技場</h2>
      <p>同じレアリティ配分で、それぞれ別のデッキをピック。ロビーIDで友達と合流できます。</p>
      <button class="primary" data-op="arena-friend-create">闘技場ロビーを作る</button>
      <form id="arena-lobby-join"><label for="arena-lobby-id">友達のロビーID</label>
        <div class="invite-share"><input id="arena-lobby-id" name="lobby" required maxlength="40" placeholder="XXXX-XXXX" autocomplete="off" spellcheck="false">
          <button class="secondary" type="submit">参加</button></div></form></section></div>
    <p class="arena-notice" role="status">${escape(feedback || store.issue)}</p>
    <button class="secondary" data-op="arena-close">タイトルへ戻る</button>
  </section></main>`
}

export function arenaDetails(id, art) {
  const card = cards[id]
  if (!card) return '<p>候補を選ぶと効果の詳細を確認できます。</p>'
  return `<h2>${escape(card.name)}</h2><div class="arena-detail-stats"><span>${card.cost} MP</span>
    <span>${rarityLabels[card.rarity]}</span><span>${{ unit: 'ユニット', spell: '特技', weapon: '武器' }[card.kind]}</span>
    ${card.kind !== 'spell' ? `<span>攻撃力 ${card.attack}</span><span>${card.kind === 'weapon' ? '耐久' : 'HP'} ${card.hp}</span>` : ''}</div>
    <p>${termText(card.description || '効果なし')}</p>${relatedPreview(card, art)}
    <small>青い用語を押すと説明を表示できます。</small>`
}

function deckSummary(draft, art) {
  const counts = new Map()
  draft.deck.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1))
  const curve = Array(8).fill(0)
  const kinds = { unit: 0, spell: 0, weapon: 0 }
  for (const id of draft.deck) { curve[Math.min(7, cards[id].cost)]++; kinds[cards[id].kind]++ }
  const max = Math.max(1, ...curve)
  return `<aside class="arena-deck"><h2>ピック中のデッキ</h2><p>取得済み <b>${draft.deck.length}</b> 枚</p>
    <div class="arena-deck-list">${[...counts].sort(([a], [b]) => cards[a].cost - cards[b].cost || cards[a].name.localeCompare(cards[b].name, 'ja')).map(([id, count]) =>
      `<button type="button" data-arena-inspect="${id}" data-arena-preview="${id}"><img src="${art(cards[id].artId)}" alt="" loading="lazy">
        <span class="arena-row-cost">${cards[id].cost}</span><strong>${escape(cards[id].name)}</strong><span>×${count}</span></button>`).join('') || '<p class="arena-empty">選んだカードがここに並びます。</p>'}</div>
    <h3>MP分布</h3><div class="arena-curve">${curve.map((n, i) => `<div><span>${n}</span><i style="--bar:${n / max}"></i><small>${i === 7 ? '7+' : i}</small></div>`).join('')}</div>
    <div class="arena-kind-counts">${Object.entries(kinds).map(([kind, n]) => `<span>${{ unit: 'ユニット', spell: '特技', weapon: '武器' }[kind]}<b>${n}</b></span>`).join('')}</div>
  </aside>`
}

export function arenaDraftScreen(draft, art, selection, feedback, online = false, locked = false) {
  const stage = draft.stage
  const leader = leaders[draft.leader]
  const currentDoor = doors[draft.door]
  const title = { class: '語り手を選ぶ', door: '扉を選ぶ', card: 'カードピック', complete: 'デッキ完成' }[stage]
  const chosen = draft.choices.includes(selection) ? selection : null
  const allocation = Object.entries(draft.allocation).map(([key, n]) => `${rarityLabels[key]} ${n}枚`).join(' · ')
  const candidates = draft.choices.map(id => {
    if (stage === 'class') return `<button type="button" class="arena-choice arena-class ${chosen === id ? 'is-chosen' : ''}" data-arena-choice="${id}" aria-pressed="${chosen === id}"${locked ? ' disabled' : ''}>
      <img src="${art(id)}" alt=""><span>${leaders[id].job}</span><strong>${leaders[id].name}</strong><small>${leaders[id].strategy}</small></button>`
    if (stage === 'door') return `<button type="button" class="arena-choice arena-door ${chosen === id ? 'is-chosen' : ''}" data-arena-choice="${id}" data-door="${id}" aria-pressed="${chosen === id}"${locked ? ' disabled' : ''}>
      <span class="arena-door-arch"><i>${doors[id].icon}</i></span><strong>${doors[id].name}</strong><p>${doors[id].text}</p><small>次の5枚に有効 · 抽選の重み3倍</small></button>`
    const card = cards[id]
    return `<button type="button" class="arena-choice arena-card ${chosen === id ? 'is-chosen' : ''}" data-arena-choice="${id}" data-arena-preview="${id}" aria-pressed="${chosen === id}"${locked ? ' disabled' : ''}>
      <span class="arena-card-cost">${card.cost}</span><img src="${art(card.artId)}" alt="">
      <strong>${escape(card.name)}</strong><span class="arena-card-effect">${escape(card.description || '効果なし')}</span>
      <span class="arena-card-bottom"><small>${rarityLabels[card.rarity]}</small>${card.kind === 'spell' ? '<b>特技</b>' : `<b class="arena-atk">${card.attack}</b><b class="arena-hp">${card.hp}</b>`}</span></button>`
  }).join('')
  return `<main class="arena-screen" tabindex="-1"><header class="arena-heading"><div class="arena-leader">
      ${leader ? `<img src="${art(draft.leader)}" alt=""><div><strong>${leader.name}</strong><small>${leader.job}</small></div>` : '<div><strong>物語の闘技場</strong><small>あなたの語り手を選択</small></div>'}</div>
      <div class="arena-door-badge"><span>${currentDoor?.icon ?? '✦'}</span><div><strong>${stage === 'door' ? '次の扉を選択' : currentDoor?.name ?? '物語の始まり'}</strong><small>${currentDoor?.text ?? '同名カードの枚数制限なし'}</small></div></div>
      <div class="arena-progress"><strong>${stage === 'card' ? draft.deck.length + 1 + '枚目 / 30枚' : draft.deck.length + ' / 30枚'}</strong><small>${stage === 'card' ? `この扉：${draft.deck.length % 5 + 1} / 5 · ${rarityLabels[draft.rarity]}` : title}</small></div>
      <button type="button" class="secondary" data-op="${online ? 'arena-lobby-back' : 'arena-suspend'}">${online ? 'ロビーへ戻る' : '一時保存して戻る'}</button></header>
    <div class="arena-layout"><section class="arena-pick"><div class="arena-section-heading"><h1>${title}</h1><small>${stage === 'door' ? '異なる3つの扉から1つ選ぶ' : stage === 'class' ? 'ランダムな3人から1人を選ぶ' : stage === 'card' ? '3枚から1枚を選ぶ' : 'このデッキで物語を始めよう'}</small></div>
      ${stage === 'complete' ? `<div class="arena-complete"><span>✦</span><h2>30枚の物語が完成しました</h2><p>同名カードも、そのまま対戦で使用できます。</p></div>` : `<div class="arena-candidates">${candidates}</div>`}
      <footer class="arena-pick-footer"><section id="arena-card-detail" aria-label="カードの詳細">${stage === 'card' ? arenaDetails(chosen ?? draft.choices[0], art) :
        `<h2>${stage === 'class' && chosen ? leaders[chosen].name : stage === 'door' && chosen ? doors[chosen].name : title}</h2>
        <p>${stage === 'class' && chosen ? leaders[chosen].strategy : stage === 'door' && chosen ? doors[chosen].text + '。カード自体の性能やレアリティ配分は変わりません。' : '候補をクリックして選び、ボタンで確定してください。'}</p>`}</section>
      <div class="arena-confirm-area"><button type="button" class="primary" data-op="${stage === 'complete' ? online ? 'arena-lobby-back' : 'arena-cpu-battle' : 'arena-confirm'}"${(stage !== 'complete' && !chosen) || locked ? ' disabled' : ''}>
        ${stage === 'complete' ? online ? 'ロビーで準備する' : 'CPU勝ち抜きに挑戦' : { class: 'この語り手を選ぶ', door: 'この扉を開く', card: 'このカードを選ぶ' }[stage]}</button>
        <small>${locked ? 'サーバーに接続しています…' : '選択内容を確認して確定'}</small></div></footer>
      <p class="arena-notice" role="status">${escape(feedback)}</p><p class="arena-allocation">今回の配分：${allocation}</p>
    </section>${deckSummary(draft, art)}</div></main>`
}

export const localDraftView = store => draftView(store.run.draft)
