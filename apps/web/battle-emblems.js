import { names } from '../../packages/cards/index.js'
import { escapeText as escape, termDetails } from './card-terms.js'
import { rarityLabels } from './card-search.js'

const shapes = {
  shield: '<path d="m12 3 7 3v6c0 5-7 9-7 9s-7-4-7-9V6l7-3Z"/><path d="m8 12 3 3 5-6"/>',
  star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z"/>',
  arrow: '<path d="M2 12h19m-7-7 7 7-7 7M6 6v12"/>',
  double: '<path d="m3 7 8 5-8 5m10-10 8 5-8 5"/>',
  bolt: '<path d="m14 2-9 12h6l-1 8 9-13h-6l1-7Z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  moon: '<path d="M17 3a9 9 0 1 0 4 14A9 9 0 0 1 17 3Z"/>',
  hex: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z"/><path d="m12 6 5 3v6l-5 3-5-3V9l5-3Z"/>',
  armor: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z"/><path d="M12 3v18M4 7l8 5 8-5M4 17l8-5 8 5"/>',
  ward: '<path d="m12 3 7 3v6c0 5-7 9-7 9s-7-4-7-9V6l7-3Z"/><path d="m12 7 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z"/>',
  superArrow: '<path d="M2 8h18m-5-5 5 5-5 5M2 16h18m-5-5 5 5-5 5"/>',
  drop: '<path d="M12 2C8 8 4 11 4 15a8 8 0 0 0 16 0c0-4-4-7-8-13Z"/><path d="M8 15h1m6 0h1m-7 4h6"/>',
  mute: '<path d="M4 4l16 16M8 4v12a4 4 0 0 0 8 0V9M5 11v5a7 7 0 0 0 12 5M12 22v-4"/>',
  up: '<path d="M12 21V3m-7 7 7-7 7 7M4 17h4m8 0h4"/>',
  break: '<path d="m12 3 7 3v7l-4 7-3-5-3 6-4-8V6l7-3Z"/>',
}
const specs = {
  INVULNERABLE: ['star','defense'], SPELL_WARD: ['ward','defense'], RESIST_SPELL: ['ward','defense'], DARK_CLOAK: ['moon','defense'],
  GUARD: ['shield','defense'], METAL_BODY: ['hex','defense'], HARD_METAL_BODY: ['armor','defense'],
  PIERCE: ['arrow','attack'], SUPER_PIERCE: ['superArrow','attack'], DOUBLE_ATTACK: ['double','attack'], CHARGE: ['bolt','attack'], AIM: ['eye','attack'],
  STEALTH: ['moon','stealth'], POISON: ['drop','debuff'], SILENCE: ['mute','debuff'], VULNERABLE: ['break','debuff'],
  UNTARGETABLE: ['eye','defense'], BUFF: ['up','buff'],
}
export const emblemIds = new Set(Object.keys(specs))
export const emblemName = id => id === 'SPELL_WARD' ? names.RESIST_SPELL : id === 'BUFF' ? '能力値の変化' : id === 'ALL' ? 'このユニットの効果' : names[id] ?? 'その他の効果'
export const emblemIcon = id => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[specs[id]?.[0] ?? 'star']}</svg>`
const priority = id => ['INVULNERABLE','SPELL_WARD','SILENCE','POISON','VULNERABLE','GUARD'].indexOf(id)
const order = id => priority(id) < 0 ? 20 : priority(id)

export function renderEmblems(states, unit) {
  const sorted = [...states].sort((a,b)=>order(a[0])-order(b[0]))
  const visible = sorted.slice(0, sorted.length > 6 ? 5 : 6)
  const badges = visible.map(([id,active,state,pulse])=>{
    const timed = id === 'INVULNERABLE' || id === 'SPELL_WARD'
    const granted = unit && [...(unit.grants ?? []),...(unit.badgeKeywords ?? [])].includes(id)
    const title = `${emblemName(id)}（${state}）${granted ? ' · 後から付与された能力' : ''}`
    return `<span class="ability-badge effect-emblem${pulse ? ' ability-pulse' : ''}" data-ability="${id}" data-active="${active}" data-effect-category="${specs[id]?.[1] ?? 'stealth'}" data-status-info="${id}" data-timed="${timed}" data-granted="${Boolean(granted)}" title="${escape(title)}" aria-label="${escape(title)}" role="img">${emblemIcon(id)}${timed ? '<i class="emblem-timer" aria-hidden="true">◷</i>' : ''}${granted ? '<i class="emblem-grant" aria-hidden="true">+</i>' : ''}</span>`
  }).join('')
  const overflow = sorted.length-visible.length
  return badges+(overflow ? `<span class="ability-badge effect-emblem effect-overflow" data-status-info="ALL" title="${escape(sorted.map(([id,,state])=>emblemName(id)+'：'+state).join('／'))}">+${overflow}</span>` : '')
}

function showDialog(content, anchor) {
  if (document.querySelector('.emblem-dialog[open]')) return
  const dialog=document.createElement('dialog')
  dialog.className='emblem-dialog term-dialog'
  dialog.setAttribute('aria-labelledby','emblem-dialog-title')
  dialog.innerHTML=content+'<form method="dialog"><button class="secondary" autofocus>閉じる</button></form>'
  const close=()=>{dialog.remove();if(anchor?.isConnected)anchor.focus({preventScroll:true});else document.querySelector('[data-op=emblem-guide]')?.focus({preventScroll:true})}
  dialog.addEventListener('close',close,{once:true})
  dialog.addEventListener('submit',event=>{event.preventDefault();dialog.close()})
  document.body.append(dialog);dialog.showModal()
}
export function showEmblemInfo(id,caption,anchor) {
  const description=termDetails[id] ?? (id==='BUFF' ? '元のカードに対して攻撃力や最大HPが変わっています。常在型能力・舞台などによる変化も含みます。' : '')
  showDialog(`<h2 id="emblem-dialog-title">${emblemName(id)}</h2><p>${escape(caption)}</p>${description ? `<p>${escape(description)}</p>` : ''}`,anchor)
}
export function showEmblemGuide(anchor) {
  showDialog(`<h2 id="emblem-dialog-title">効果マークとレアリティ</h2><p>マークにカーソルを合わせると名前と状態を表示し、クリックすると説明を開きます。</p><p>青＝防御、橙＝攻撃、赤＝不利な状態、緑＝能力値変化。</p><p>◷ は期限付き、＋は後から付与された能力。斜線付きの灰色は現在無効です。</p><div class="emblem-guide-list">${Object.keys(specs).map(id=>`<span data-effect-category="${specs[id][1]}">${emblemIcon(id)}<b>${emblemName(id)}</b></span>`).join('')}</div><div class="rarity-guide">${Object.entries(rarityLabels).map(([id,label])=>`<span data-rarity="${id}"><i aria-hidden="true"></i>${label}</span>`).join('')}</div>`,anchor)
}
