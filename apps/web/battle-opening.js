import { leaders } from '../../packages/cards/index.js'
import { escapeText } from './card-terms.js'

export const openingTiming = short => short ? { reveal: 260, finish: 700 } : { reveal: 1050, finish: 2100 }

export function battleOpening(view, opening, ownSeat, art) {
  const seats = [ownSeat, 1 - ownSeat]
  const revealed = opening.stage === 'result'
  return `<main class="battle-opening ceremony${opening.short ? ' opening-short' : ''}" data-opening-stage="${opening.stage}" aria-label="先攻・後攻の発表">
    <p class="opening-caption" role="status">${revealed ? '物語の幕が上がる' : '運命の頁が開く'}</p>
    <div class="opening-leaders">${seats.map((seat, side) => {
      const leader = leaders[view.players[seat].leader]
      return `<section class="opening-leader opening-side-${side}" style="--opening-accent:${leader.accent}">
        <img src="${art(view.players[seat].leader)}" alt=""><span class="opening-sigil">${leader.sigil}</span>
        <small>${side === 0 ? 'あなた' : '相手'} · ${leader.job}</small><h1>${escapeText(leader.name)}</h1>
        <div class="opening-role${revealed ? ' revealed' : ''}" data-opening-seat="${seat}">${revealed ? seat === (view.firstSeat ?? 0) ? '先攻' : '後攻' : '✦'}</div>
      </section>`
    }).join('')}</div>
    <div class="opening-book" aria-hidden="true"><div class="opening-cover"></div><div class="opening-page opening-page-left">✦</div><div class="opening-page opening-page-right">✦</div><span class="opening-vs">VS</span></div>
    <p class="opening-bottom">${revealed ? '手札交換へ' : 'ふたつの物語が、ここで出会う'}</p>
  </main>`
}
