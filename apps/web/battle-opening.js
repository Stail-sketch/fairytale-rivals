import { leaders } from '../../packages/cards/index.js'
import { escapeText } from './card-terms.js'
import { sceneryAttributes } from './battle-scenery.js'

export const openingTiming = short => short ? { reveal: 260, finish: 850 } : { reveal: 1450, finish: 3250 }

export function battleOpening(view, opening, ownSeat, art) {
  const seats = [ownSeat, 1 - ownSeat], revealed = opening.stage === 'result'
  return `<main class="battle-opening ceremony${opening.short ? ' opening-short' : ''}" ${revealed ? sceneryAttributes(view.bgmId,art) : ''} data-opening-stage="${opening.stage}" aria-label="先攻・後攻の発表">
    <div class="opening-atmosphere" aria-hidden="true"><div class="opening-orbit"></div><div class="opening-orbit orbit-inner"></div>${Array.from({length:18},(_,i)=>`<i style="--i:${i};--x:${(i*37+11)%100}%;--y:${(i*23+7)%90}%"></i>`).join('')}</div>
    <header class="opening-heading"><small>THE STORY BEGINS</small><p class="opening-caption" role="status">${revealed ? '運命は、ここに記された' : '運命の頁が開く'}</p><span>✧ ─────── ✦ ─────── ✧</span></header>
    <div class="opening-leaders">${seats.map((seat,side)=>{
      const leader=leaders[view.players[seat].leader]
      return `<section class="opening-leader opening-side-${side}" style="--opening-accent:${leader.accent}">
        <div class="opening-portrait"><span class="opening-halo" aria-hidden="true"></span><img src="${art(view.players[seat].leader)}" alt=""><span class="opening-sigil" aria-hidden="true">${leader.sigil}</span><span class="opening-portrait-sweep" aria-hidden="true"></span></div>
        <small>${side===0?'あなた':'相手'} · ${leader.job}</small><h1>${escapeText(leader.name)}</h1>
        <div class="opening-role${revealed?' revealed':''}" data-opening-seat="${seat}">${revealed ? seat===(view.firstSeat??0)?'先攻':'後攻':'✦'}</div>
      </section>`
    }).join('')}</div>
    <div class="opening-book-scene" aria-hidden="true"><div class="opening-book-light"></div><div class="opening-book"><div class="opening-book-spine"></div><div class="opening-page opening-page-left"><span>✦</span></div><div class="opening-page opening-page-right"><span>✧</span></div><div class="opening-turning-page page-one"></div><div class="opening-turning-page page-two"></div><div class="opening-cover"><span>童話戦記</span><b>✦</b><small>CHRONICLE OF FATE</small></div></div><span class="opening-vs">VS</span><span class="opening-book-caption">${revealed?'THE FATE IS SEALED':'READING YOUR DESTINY'}</span></div>
    <div class="opening-reveal-flash" aria-hidden="true"></div><p class="opening-bottom">${revealed?'それぞれの物語が、動き出す':'ふたつの物語が、ここで出会う'}<span>${revealed?'手札交換へ':'先攻・後攻を決定中'}</span></p>
  </main>`
}
