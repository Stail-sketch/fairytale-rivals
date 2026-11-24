import { names, terrains } from '../../packages/cards/names.js'
import { terrainText } from '../../packages/engine/terrain.js'

const termNames = { ...names, ...terrains }

export const termDetails = {
  CHARGE: '登場したターンから攻撃できます。',
  GUARD: '前衛にいる間、敵の通常攻撃の対象を、この能力を持つ前衛に限定します。',
  AIM: '前衛防護・守りの陣・騎士の誓いを無視して攻撃できます。',
  PIERCE: '前衛を攻撃すると、正面の後衛にも同じ攻撃力でダメージを与えます。',
  DOUBLE_ATTACK: '1ターンに2回攻撃できます。',
  STEALTH: '攻撃するまで敵の単体効果や通常攻撃の対象になりません。',
  METAL_BODY: '1〜3ダメージを受けるとき、1ダメージになります。',
  HARD_METAL_BODY: '1〜5ダメージを受けるとき、1ダメージになります。味方の常在型能力で鋼の身から強化される場合もあります。',
  STORY_BADGE: '手札から使うとリーダーに残る効果です。発動元が場を離れても続き、同じ刻印は重複します。刻印を消す効果で1つずつ解除されます。',
  BLOCK: '同じ列の前衛が、後衛のユニットを敵の通常攻撃から守ります。',
  WALL: '3列すべてに味方ユニットがいる間、敵の通常攻撃からリーダーを守ります。',
  FRONT_ROW: '両陣営が向かい合う、戦場の中央寄りの列です。',
  BACK_ROW: '自分のリーダーに近い、戦場の外側の列です。',
  TERRAIN: 'マスに付与される効果です。効果は舞台の種類ごとに異なります。',
  MOVE: '場にいるユニットが別のマスに移動します。',
  ON_SUMMON: 'カードを手札から場に出したときに発動する能力です。',
  ON_DEATH: 'ユニットが倒され、場から墓地に移るときに発動する能力です。',
  ON_ATTACK: 'ユニットが攻撃するとき、戦闘ダメージを与える前に発動する能力です。',
  POISON: '自分・相手のどちらのターン終了時にも1ダメージを受けます。',
  SILENCE: 'ユニットの能力が無効になります。',
  INVULNERABLE: '効果が続く間、受けるダメージを防ぎます。',
  EXILE: 'カードを対戦から取り除きます。除外されたユニットは墓地に入らず、退場時の能力も発動しません。',
  TENSION: 'リーダーが持つ熱量です。3になると語り手の奥義を使えるようになります。',
  TENSION_SKILL: '熱量が3のときに使える、リーダーごとの能力です。使用すると熱量をすべて消費します。',
  TENSION_LINK: '味方リーダーの熱量が1上がるたびに、この能力が発動します。',
  SKILL_LINK: '味方リーダーが奥義を使い、その効果を解決したあとに発動します。',
  SKILL_BOOST: 'この対戦で味方リーダーが奥義を使った回数に応じて、カードに書かれた数値が変化します。',
  CHEER: '手札から使うと、味方リーダーの熱量が1上がります。',
  FINISHER: '味方リーダーの熱量が最大のときに使えます。使用すると熱量をすべて消費します。',
  FORTUNE: 'カードに書かれた2つの効果のうち1つがランダムで発動します。未来視では効果を選べ、未来の統合では両方が発動します。',
  FORTUNE_CHOOSE: '運命の分岐で発動する効果を選べます。継続するものと、次の運命の分岐1回に適用されるものがあります。',
  FORTUNE_BOTH: '運命の分岐の両方の効果が発動します。継続するものと、そのターンに適用されるものがあります。',
  CHOICE: '提示された候補から、発動したい効果を選びます。',
  VULNERABLE: '受けるダメージが2倍になります。',
  UNTARGETABLE: '単体効果の対象として選べません。',
  DARK_CLOAK: '受けるダメージを防ぎます。',
  RESIST_SPELL: '特技からのダメージを防ぎます。',
  SUPER_PIERCE: 'ユニットを攻撃すると、同じ列の敵と敵リーダーにもダメージを与えます。',
  ...terrainText,
}

export const escapeText = value => String(value).replace(/[&<>"']/g, symbol => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[symbol])

const keysByName = new Map(Object.keys(termDetails).map(id => [termNames[id], id]))
const phrases = [...keysByName.keys()].filter(name => name !== names.CHOICE && name !== names.FRONT_ROW && name !== names.BACK_ROW)
  .sort((a, b) => b.length - a.length).join('|')
const pattern = new RegExp('(' + phrases + '|「[^」]+」)', 'g')

export function termLink(id, suffix = '') {
  return `<button type="button" class="term-link" data-term="${id}" aria-haspopup="dialog">${escapeText(termNames[id])}${escapeText(suffix)}</button>`
}

export function termText(value) {
  return String(value).split(pattern).map(part => {
    if (keysByName.has(part)) return termLink(keysByName.get(part))
    if (part.startsWith('「') && part.endsWith('」') && keysByName.has(part.slice(1, -1))) {
      return '「' + termLink(keysByName.get(part.slice(1, -1))) + '」'
    }
    return escapeText(part)
  }).join('')
}

export function handleTermLink(event) {
  const link = event.target.closest('[data-term]')
  if (!link || !Object.hasOwn(termDetails, link.dataset.term) || document.querySelector('.term-dialog[open]')) return
  event.preventDefault()
  event.stopPropagation()
  link.dataset.termOpen = ''
  const dialog = document.createElement('dialog')
  dialog.className = 'term-dialog'
  dialog.setAttribute('aria-labelledby', 'term-dialog-title')
  dialog.innerHTML = `<h2 id="term-dialog-title">${escapeText(termNames[link.dataset.term])}</h2>
    <p>${escapeText(termDetails[link.dataset.term])}</p>
    <form method="dialog"><button class="secondary" autofocus>閉じる</button></form>`
  function close() {
    if (!dialog.isConnected) return
    dialog.remove()
    if (link.isConnected) {
      link.focus({ preventScroll: true })
      delete link.dataset.termOpen
    }
    else document.querySelector('#detail')?.focus({ preventScroll: true })
  }
  dialog.addEventListener('close', close, { once: true })
  dialog.addEventListener('submit', event => { event.preventDefault(); dialog.close(); close() })
  document.body.append(dialog)
  dialog.showModal()
}
