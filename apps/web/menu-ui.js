import { cards, leaders } from '../../packages/cards/index.js'
import { escapeText as escape } from './card-terms.js'

const icons = {
  home: '<path d="m3 11 9-8 9 8M6 10v11h5v-7h3v7h4V10"/>',
  battle: '<path d="m4 3 16 18M3 4l3-1 15 16-2 2L3 4Zm17-1L4 21m17-17-3-1L3 19l2 2L21 4ZM2 16l6 6m8-20 6 6"/>',
  arena: '<path d="M8 3h8v9c0 5-8 5-8 0V3Zm-1 2H3v4c0 4 5 4 5 4m9-8h4v4c0 4-5 4-5 4m-4 4v4m-5 0h10"/>',
  deck: '<rect x="5" y="3" width="13" height="18" rx="2"/><path d="m8 6 7 3-4 9-7-3m7-8 2 4-2 4-2-4 2-4Z"/>',
  library: '<path d="M12 5v16M2 4c4-1 7-1 10 1 3-2 6-2 10-1v15c-4-1-7-1-10 2-3-3-6-3-10-2V4Z"/>',
}
export const menuIcon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${icons[name] ?? icons.home}</svg>`
export function menuShell(content, active = 'home', locked = false) {
  const items = [['home','ホーム','menu-home'],['battle','対戦','prepare'],['arena','闘技場','arena-open'],['deck','デッキ','decks'],['library','カードライブラリ','library']]
  return `<main class="menu-scene"><div class="menu-shell"><nav class="menu-nav" aria-label="メインメニュー">
    <div class="menu-nav-crest" aria-hidden="true">✦<span>FAIRYTALE</span></div>
    ${items.map(([id,label,op])=>`<button type="button" data-op="${op}" ${locked ? 'disabled' : ''} ${active===id ? 'aria-current="page"' : ''}>${menuIcon(id)}<span>${label}</span></button>`).join('')}
    <span class="menu-nav-tail" aria-hidden="true">✧<i></i>物語をめくれ</span>
  </nav><section class="menu-content">${content}</section></div></main>`
}
export function rankEmblem(profile) {
  const rank=profile?.rank ?? 'ブロンズ', tone={ブロンズ:'#c38b65',シルバー:'#c2d5e7',ゴールド:'#edca72',プラチナ:'#80d7db',レジェンド:'#c79af0'}[rank] ?? '#c38b65'
  return `<div class="rank-emblem" style="--rank-metal:${tone}" aria-hidden="true"><svg viewBox="0 0 200 180" fill="none">
    <defs><linearGradient id="rank-shield" x1="50" y1="10" x2="150" y2="145" gradientUnits="userSpaceOnUse"><stop stop-color="#fff1ca"/><stop offset=".35" stop-color="${tone}"/><stop offset="1" stop-color="#49364a"/></linearGradient></defs>
    <path d="M58 144C20 119 26 77 31 57m111 87c38-25 32-67 27-87" stroke="${tone}" stroke-width="3"/>
    ${Array.from({length:6},(_,i)=>`<path d="M${45-i*2} ${134-i*13}q-22-1-22-19 20 0 22 19m${110+i*4} 0q22-1 22-19-20 0-22 19" fill="${tone}" opacity="${.65+i*.05}"/>`).join('')}
    <path d="m100 16 42 22-3 58c-2 23-25 38-39 46-14-8-37-23-39-46l-3-58 42-22Z" fill="url(#rank-shield)" stroke="#eed4aa" stroke-width="2"/>
    <path d="m100 28 30 16-2 49c-2 16-18 29-28 35-10-6-26-19-28-35l-2-49 30-16Z" stroke="#f6dfb6"/>
    <path d="m100 3 3 9 10 1-8 6 2 10-7-6-7 6 2-10-8-6 10-1 3-9Z" fill="#ffe8b2"/>
    <path d="m53 143 94 0-9 23H62l-9-23Z" fill="#302536" stroke="${tone}"/></svg><span>${rank}</span></div>`
}
export function rankPanel(profile) {
  return `<aside class="menu-rank"><small class="menu-eyebrow">RANK MATCH</small>${rankEmblem(profile)}
    <strong class="rank-points">${profile ? profile.rating : '—'} <small>RP</small></strong>
    <p class="rank-record" data-player-rank>${profile ? `${profile.wins}勝 <span>·</span> ${profile.losses}敗 <span>·</span> ${profile.draws}分` : '名前を設定して物語を始めよう'}</p>
    ${!profile ? '<button class="secondary" data-op="profile">名前を設定</button>' : ''}</aside>`
}
export function deckFan(deck, art) {
  const unique=[...new Set(deck.deck)].filter(id=>cards[id]).slice(0,5)
  return `<div class="menu-deck-fan" aria-hidden="true">${unique.map((id,i)=>`<span style="--fan:${i};--fan-count:${unique.length}"><img src="${art(cards[id].artId)}" alt=""></span>`).join('')}</div>`
}
export function deckStrip(deck, art, change = 'デッキを変更', locked = false) {
  return `<section class="menu-deck-strip" aria-label="使用デッキ">${menuIcon('deck')}<div><strong>${escape(deck.name)}</strong><small>${deck.deck.length} / 30 枚</small></div>${deckFan(deck,art)}<button class="secondary" data-op="pick-lineup" ${locked ? 'disabled' : ''}>${change}</button></section>`
}
export function menuHome({art,leader,deck,profile,feedback}) {
  const l=leaders[leader]
  return menuShell(`<div class="home-layout"><section class="menu-hero" style="--hero-color:${l.color};--hero-trim:${l.accent}">
    <div class="hero-orbit" aria-hidden="true"></div><div class="hero-illustration"><img src="${art(leader)}" alt="${l.name}"></div>
    <div class="hero-heading"><small class="menu-eyebrow">YOUR STORY BEGINS</small><h1>${l.name}</h1><p>${l.sigil} ${l.job}</p></div>
    <div class="hero-controls">${deckStrip(deck,art,'変更')}<button class="primary menu-primary" data-op="prepare">対戦する <span aria-hidden="true">›</span></button></div>
  </section><div class="home-aside">${rankPanel(profile)}<button class="menu-news" data-op="library"><small>✧ お知らせ</small><strong>第4弾 公開中</strong><span>物語の刻印が紡ぐ、新たな戦略。</span><b>カードを見る ↗</b></button><button class="menu-music secondary" data-op="music">♫ 音楽ライブラリ</button></div></div>
  ${feedback ? `<p class="menu-feedback" role="status">${escape(feedback)}</p>` : ''}`)
}
export function menuPreparation({art,leader,deck,profile,mode,feedback,chooseLeader,ready,busy,friendJoin,legacyInvite,startLabel,pickerOpen}) {
  const friend=mode==='friend', l=leaders[leader]
  const captions={ranked:['ランクマッチ','近いレートの相手と対戦。勝敗でRPが変わります。'],free:['フリーマッチ','ランクを気にせず、新しいデッキを試そう。'],cpu:['CPU対戦','語り手を選び、デッキの戦い方を磨こう。'],friend:['フレンド対戦','ロビーを作るか、IDを入力して友達と合流しよう。'],local:['同じPCで2人','一台のPCで手番を交代しながら対戦します。']}
  return menuShell(`<header class="menu-page-heading"><div><small class="menu-eyebrow">BATTLE PREPARATION</small><h1>対戦準備</h1></div><p>使うデッキを選んで、物語の舞台へ。</p></header>
    <div class="preparation-tabs mode-switch" aria-label="対戦形式">${[['ranked','ランク'],['free','フリー'],['cpu','CPU'],['friend','フレンド']].map(([id,label])=>`<button class="secondary" data-mode="${id}" aria-pressed="${mode===id}">${label}</button>`).join('')}</div>
    <div class="preparation-layout"><section class="preparation-deck"><div class="preparation-portrait"><img src="${art(leader)}" alt="${l.name}"><div><h2>${l.name}</h2><p>${l.sigil} ${l.job}</p></div></div>
      <div class="preparation-selected"><small class="menu-eyebrow">SELECTED DECK</small><h2>${escape(deck.name)}</h2><p>${deck.deck.length} / 30 枚</p>${deckFan(deck,art)}<details class="lineup-picker" ${pickerOpen ? 'open' : ''}><summary>デッキを変更</summary>${chooseLeader(0,busy)}</details></div>
    </section><aside class="preparation-info">${['ranked','free'].includes(mode) ? rankPanel(profile) : ''}
      <h2>${captions[mode][0]}</h2><p>${captions[mode][1]}</p>${['ranked','free'].includes(mode) ? '<small>手札交換・操作時間は90秒。<br>再接続して対戦へ戻れます。</small>' : ''}
      ${mode==='cpu'||mode==='local' ? `<div class="preparation-opponent">${chooseLeader(1,busy)}</div>` : ''}
    </aside></div>
    <p class="menu-feedback" role="status">${escape(feedback)}</p>
    <div class="preparation-actions"><button class="secondary" data-op="menu-home">戻る</button><button class="primary menu-primary start" data-op="start" ${!ready||busy ? 'disabled' : ''}>${busy ? '接続中…' : startLabel}<span aria-hidden="true">›</span></button><button class="secondary local-mode" data-mode="local" aria-pressed="${mode==='local'}">同じPCで2人</button></div>
    ${friend&&!legacyInvite ? friendJoin : ''}`, 'battle')
}
export function menuSearch({art,leader,deck,mode,feedback,since}) {
  return menuShell(`<section class="match-search"><small class="menu-eyebrow">${mode==='ranked'?'RANK MATCH':'FREE MATCH'}</small><h1>対戦相手を探しています</h1><p>同じ対戦形式で検索中のプレイヤーと対戦します。</p><div class="search-portrait"><img src="${art(leader)}" alt="${leaders[leader].name}"></div><h2>${leaders[leader].name}</h2><p>${escape(deck.name)}</p><span class="search-clock" role="timer" data-search-since="${since}">検索中…</span><p class="menu-feedback" role="status">${escape(feedback)}</p><button class="secondary" data-op="cancel-search">検索をキャンセル</button></section>`, 'battle', true)
}
