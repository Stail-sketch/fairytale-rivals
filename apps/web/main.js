import { cardCost, cards, leaders, names } from '../../packages/cards/index.js'
import { cpuLineup, createDeckCollection, starterDecks, starterLineup } from '../../packages/cards/decks.js'
import { chooseCpuAction } from '../../packages/cpu/index.js'
import { leaderTarget, samePosition, sameTarget, unitTarget } from '../../packages/engine/index.js'
import { definitionPowerRows, targetDamagePreview } from '../../packages/engine/power-preview.js'
import { leaderAttackBreakdown } from '../../packages/engine/targeting.js'
import { terrainKey, terrainName, terrainText } from '../../packages/engine/terrain.js'
import { createLocalMatch } from '../../packages/local-match/index.js'
import { changeLibraryFilter, library, refreshLibrary, selectLibraryCard, sourceLabels, switchLibraryTab } from './library.js'
import { createDeckEditor } from './deck-editor.js'
import { initialDecks } from '../../packages/cards/initial-decks.js'
import { retireRivalsExample } from './rivals-example.js'
import { createBattleAudio } from './battle-audio.js'
import { planBattlePresentation, positionPresentation, presentationLayer, reducedMotion, toggleBattleMotion } from './battle-presentation.js'
import { connectRoom, enterRoom, forgetRoom, inviteUrl, invitedRoom, onlineAvailable, rememberRoom, savedRoom } from './online.js'

const app = document.querySelector('#app')
const announcer = document.querySelector('#announcer')
const art = id => globalThis.fairytaleImages?.[id + '.webp'] ?? new URL('./assets/' + id + '.webp', import.meta.url).href
const seatName = seat => seat === 0 ? '先攻' : '後攻'
const rowName = row => row === 'front' ? names.FRONT_ROW : names.BACK_ROW
const classIds = ['warrior', 'mage', 'fighter', 'priest', 'merchant', 'seer', 'swordsman']
const initialLeaders = ['mage', 'priest']
const selectedLeaders = [...initialLeaders]
const selectedDecks = [null, null]
const deckStorage = {
  keys: () => Object.keys(localStorage),
  getItem: key => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: key => localStorage.removeItem(key),
}
const deckCollection = createDeckCollection(deckStorage)
retireRivalsExample(deckCollection, deckStorage)
deckCollection.initialize(initialDecks)
const initialDeckIds = new Set(initialDecks.map(deck => deck.id))
const deckEditor = createDeckEditor(deckCollection)
const battleAudio = createBattleAudio()

let match = null
let view = null
let selected = null
let lastInspection = null
let replacements = new Set()
let feedback = ''
let showRules = false
let showLibrary = false
let showDecks = false
let eventFloor = 0
let invite = invitedRoom()
let mode = invite ? 'friend' : 'cpu'
let room = null
let roomSeat = null
let roomVersion = -1
let roomUpdates = []
let roomConnection = 'connecting'
let roomBusy = false
let roomAction = null
let resigned = null
let cpuTimer = null
let cpuMoves = 0
let presentation = null
let presentationTimer = null
let handPress = null
let ignoreCardClickUntil = 0
let animatedView = null

const solo = () => mode === 'cpu'
const inMatch = () => match || room
const cpuTurn = () => solo() && view?.phase === 'battle' && view.active === 1
const waitingForFriend = () => room && (view?.decisionSeat ?? view?.active) !== roomSeat
const roomLocked = () => room && (roomBusy || roomConnection !== 'connected' || waitingForFriend())

const escape = value => String(value).replace(/[&<>"']/g, symbol => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[symbol])

function portrait(id) {
  return '<img class="portrait" src="' + art(id) + '" alt="">'
}

function colors(leader) {
  return ' style="--class:' + leader.color + ';--trim:' + leader.accent + '"'
}

function titlebar() {
  return `<header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true">✦</span>
    <span>童話戦記<small>PROJECT FAIRYTALE RIVALS</small></span></div>
    <div class="top-actions"><span class="local-label">${{ cpu: 'CPU対戦', local: 'ローカル対戦', friend: 'フレンド対戦' }[mode]}</span>
      ${view ? `<button type="button" data-op="sound" class="icon-button sound-button" aria-pressed="${battleAudio.enabled}">効果音</button>` : ''}
      <button type="button" data-op="rules" class="icon-button">ルール</button>
      ${inMatch() ? '<button type="button" data-op="home" class="icon-button">タイトル</button>' : ''}
    </div></header>`
}

function availableDecks(seat) {
  return solo() && seat === 1 ? [] : deckCollection.list(selectedLeaders[seat])
}

function chosenDeck(seat, decks = availableDecks(seat)) {
  return selectedDecks[seat] === null ? decks.find(deck => !initialDeckIds.has(deck.id)) : decks.find(deck => deck.id === selectedDecks[seat])
}

function battleLineup(seat) {
  const leader = selectedLeaders[seat]
  if (solo() && seat === 1) return cpuLineup(leader)
  const custom = chosenDeck(seat)
  return custom ? { leader, deck: custom.deck } : starterLineup(leader, mode !== 'local')
}

function chooseLeader(seat) {
  const id = selectedLeaders[seat]
  const leader = leaders[id]
  const deck = mode !== 'local' && starterDecks[id]
  const decks = availableDecks(seat)
  const custom = chosenDeck(seat, decks)
  const label = mode === 'friend' || (solo() && seat === 0) ? 'あなた' : solo() ? 'CPU' : seatName(seat)
  return `<div class="lineup"${colors(leader)}>
    <div class="lineup-portrait">${portrait(id)}<span class="crest" aria-hidden="true">${leader.sigil}</span></div>
    <div class="lineup-body">
      <label for="leader-${seat}">${label}の語り手</label>
      <select id="leader-${seat}" data-seat="${seat}">
        ${classIds.map(key => `<option value="${key}" ${id === key ? 'selected' : ''}>${leaders[key].name} · ${leaders[key].job}</option>`).join('')}
      </select>
      ${decks.length ? `<label class="lineup-deck" for="match-deck-${seat}">使用するデッキ</label>
        <select id="match-deck-${seat}" data-match-deck="${seat}">
          <option value="" ${custom ? '' : 'selected'}>${deck ? '構築済み · ' + deck.name : '基本デッキ'}</option>
          ${decks.map(item => `<option value="${item.id}" ${item.id === custom?.id ? 'selected' : ''}>${escape(item.name)}</option>`).join('')}
        </select>` : `<small title="${deck ? deck.summary : leader.strategy}">${deck ? deck.name + ' · ' + leader.strategy : leader.strategy}</small>`}
    </div>
    </div>`
}

function home() {
  const friend = mode === 'friend'
  const ready = !friend || onlineAvailable()
  const start = friend ? (invite ? '対戦に参加' : '部屋を作る') : solo() ? 'CPUと対戦する' : '対戦を始める'
  return `<main class="splash">
    <section class="intro" aria-labelledby="game-title">
      <div class="title-ornament" aria-hidden="true">◆ <span>✦</span> ◆</div>
      <h1 id="game-title">童話戦記</h1>
      <p class="subtitle">PROJECT FAIRYTALE RIVALS</p>
      <p class="tagline">物語をめくれ。運命を書き換えろ。</p>
      <div class="mode-switch" aria-label="対戦形式">
        <button class="secondary" data-mode="cpu" aria-pressed="${solo()}">CPU対戦</button>
        <button class="secondary" data-mode="local" aria-pressed="${mode === 'local'}">同じPCで2人</button>
        <button class="secondary" data-mode="friend" aria-pressed="${friend}">フレンド対戦</button>
      </div>
      <div class="lineups${friend ? ' single-lineup' : ''}">${chooseLeader(0)}${friend ? '' : `<span class="versus">VS</span>${chooseLeader(1)}`}</div>
      ${friend ? `<p class="room-status" role="status">${escape(feedback || (ready
        ? invite ? '語り手を選ぶと、招待された部屋に参加します。' : '部屋を作って、招待URLを友達に送れます。'
        : 'フレンド対戦は対戦サーバーのURLから開いてください。'))}</p>` : ''}
      <button class="primary start" data-op="start" ${!ready || roomBusy ? 'disabled' : ''}>${roomBusy ? '接続中…' : start} <span aria-hidden="true">›</span></button>
      <div class="title-tools">
        <button class="secondary browse-cards" type="button" data-op="library">カードライブラリ</button>
        <button class="secondary browse-cards" type="button" data-op="decks">デッキ編集</button>
      </div>
    </section>
  </main>`
}

function roomLobby() {
  const closed = roomConnection === 'closed'
  return `<main class="ceremony"><section class="modal room-lobby">
    <h1>フレンド対戦</h1>
    <p class="room-status" role="status">${escape(feedback || (roomConnection === 'connected'
      ? '友達の参加を待っています。' : '対戦サーバーに接続しています。'))}</p>
    ${closed ? '' : `<label for="invite-url">招待URL</label>
      <div class="invite-share"><input id="invite-url" value="${escape(inviteUrl(room.id))}" readonly>
        <button class="secondary" data-op="copy-invite">URLをコピー</button></div>
      ${['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ? '<p class="local-invite">このPC内で試遊できる招待URLです。</p>' : ''}
      <p class="room-copy-status" role="status"></p>`}
    <button class="secondary" data-op="home" ${roomBusy ? 'disabled' : ''}>${closed ? 'タイトルへ' : '部屋を閉じる'}</button>
  </section></main>`
}

function cardFace(card, full = false, cost = card.cost) {
  return `<span class="cost ${cost < card.cost ? 'discounted' : ''}" title="${cost < card.cost ? '元のコスト ' + card.cost : 'コスト'}">${cost}</span>
    <img class="card-art" src="${art(card.artId)}" alt="">
    <span class="card-name">${card.name}</span>
    ${full ? `<span class="card-text">${card.description}</span>` : ''}
    ${card.kind === 'spell' ? '<span class="spell-type">特技</span>' :
      `<span class="unit-stats" title="${card.kind === 'weapon' ? '武器の攻撃力・耐久力' : '攻撃力・HP'}"><span>${card.attack}</span><span>${card.hp}</span></span>`}`
}

function targetEnabled(target) {
  if (selected?.legal.choices && selected.choice === undefined) return false
  if (selected?.legal.handChoices?.length && selected.handChoice === undefined) return false
  if (selected?.legal.positions && !selected.position) return false
  return selected?.legal.targets?.some(value => sameTarget(value, target))
}

function placementAt(seat, position) {
  if (!selected || (selected.legal.choices && selected.choice === undefined) ||
      (selected.legal.handChoices?.length && selected.handChoice === undefined)) return
  const spaces = selected.position ? selected.legal.extraPositions : selected.legal.positions
  const fallback = selected.legal.positionSeat ?? view.active
  return spaces?.find(space => (space.seat ?? fallback) === seat && samePosition(space, position) &&
    (space.seat !== undefined || !selected.position || !samePosition(selected.position, space)))
}

function flashes(target, id) {
  const events = animatedView === view ? [] : view.events.filter(event => event.seq > eventFloor)
  const attack = events.some(event => event.type === 'attack' && event.id === id && id !== undefined)
  const summon = events.some(event => event.type === 'summon' && event.id === id)
  const hit = events.filter(event => event.type === 'damage' && sameTarget(event.target, target))
  const heal = events.filter(event => event.type === 'heal' && sameTarget(event.target, target))
  const amount = hit.reduce((sum, event) => sum + event.value, 0)
  const restored = heal.reduce((sum, event) => sum + event.value, 0)
  return {
    cls: [attack && 'strike', summon && 'arrival', amount && 'hit', restored && 'heal'].filter(Boolean).join(' '),
    label: amount ? `<span class="delta">−${amount}</span>` : restored ? `<span class="delta good">+${restored}</span>` : '',
  }
}

function leaderPanel(seat, enemy) {
  const player = view.players[seat]
  const leader = leaders[player.leader]
  const target = leaderTarget(seat)
  const flash = flashes(target)
  const ready = !enemy && view.legal?.leaderAttack.enabled
  const striking = animatedView !== view && view.events.some(event => event.seq > eventFloor && event.type === 'leaderAttack' && event.seat === seat)
  return `<aside class="leader-panel ${enemy ? 'opponent' : ''} ${seat === view.active ? 'active-side' : ''}" data-side="${seat}"${colors(leader)}>
    <button class="leader-target ${targetEnabled(target) ? 'targetable' : ''} ${ready ? 'ready' : ''} ${selected?.type === 'leaderAttack' && seat === view.active ? 'chosen' : ''} ${striking ? 'strike' : ''} ${flash.cls}"
      data-leader="${seat}" aria-label="${seatName(seat)}リーダー ${leader.name} HP ${Math.max(0, player.hp)}${ready ? ' 攻撃可能' : ''}"
      title="${ready ? 'クリックしてリーダーで攻撃' : leader.motif}">
      ${portrait(player.leader)}<span class="crest" aria-hidden="true">${leader.sigil}</span>
      ${player.leaderPower > 0 ? `<span class="leader-power">⚔ ${player.leaderPower}</span>` : ''}
      <span class="leader-hp">${Math.max(0, player.hp)}</span>${flash.label}
    </button>
    <div class="leader-identity"><small>${enemy ? (solo() ? 'CPU' : '相手') : 'あなた'} · ${seatName(seat)} · ${leader.job}</small><strong>${leader.name}</strong></div>
    <div class="resources">
      <span data-mp="${seat}" title="現在のMP（このターン限りの追加分を含む）と最大MP"><b class="mp-icon">MP</b> <strong>${player.mp}/${player.maxMp}</strong></span>
      <span data-draw-pile="${seat}" title="山札の残り"><i aria-hidden="true">▤</i> 山札 <strong>${player.deckCount}</strong></span>
      ${player.weapon ? `<span title="${cards[player.weapon.card].name}">武器 <strong>${player.weapon.attack}/${player.weapon.durability}</strong></span>` : ''}
      ${enemy ? `<span data-hand-count="${seat}" title="相手の手札枚数">手札 <strong>${player.handCount}</strong></span>` : ''}
    </div>
    <div class="tension ${animatedView !== view && view.events.some(event => event.seq > eventFloor && event.type === 'focus' && event.seat === seat) ? 'glow' : ''}">
      <span title="${names.TENSION}">熱量</span>
      <div class="diamonds" aria-label="熱量 ${player.tension}/3">${[1, 2, 3].map(i => `<i class="${i <= player.tension ? 'filled' : ''}"></i>`).join('')}</div>
    </div>
  </aside>`
}

function square(seat, row, column) {
  const position = { row, column }
  const unit = view.players[seat].units.find(value => samePosition(value.position, position))
  const ready = unit && view.legal?.attack[unit.id]?.enabled
  const chosenPosition = seat === (selected?.position?.seat ?? selected?.legal.positionSeat ?? view.active)
    && samePosition(selected?.position, position)
  const playable = placementAt(seat, position)
  const stage = view.players[seat].terrain?.[terrainKey(position)]
  const stageLabel = stage && terrainName(stage)
  const death = animatedView !== view && view.events.findLast(event => event.seq > eventFloor && (event.type === 'death' || event.type === 'exile')
    && event.seat === seat && samePosition(event.position, { row, column }))
  const target = unit && unitTarget(unit.id)
  const flash = unit || death ? flashes(target ?? unitTarget(death.id), unit?.id) : { cls: '', label: '' }
  const card = unit && cards[unit.card]
  const index = column + 1
  const status = unit ? [...unit.statuses, ...[...new Set([...card.keywords, ...unit.grants ?? []])].filter(
    keyword => !unit.statuses.includes('SILENCE') && !(keyword === 'STEALTH' && unit.revealed),
  )].map(id => names[id]).join('・') : ''
  const classes = [unit ? 'occupied' : 'empty', ready && 'ready', playable && 'targetable', chosenPosition && 'chosen',
    target && targetEnabled(target) && 'targetable', selected?.id === unit?.id && unit && 'chosen', !unit && death && 'departure', flash.cls]
  const attack = unit && (view.players[seat].boardAttack?.[unit.id] ?? unit.attack)
  const label = seatName(seat) + ' ' + rowName(row) + ' ' + index + (unit ? ' ' + card.name + ' ' + attack + '/' + unit.hp : ' 空き') +
    (ready ? ' 攻撃可能' : '')
  const tooltip = unit ? card.name + '｜' + card.description : label
  return `<button class="slot ${classes.filter(Boolean).join(' ')}" data-slot="${seat}:${row}:${column}"
    ${stageLabel ? `data-terrain="${stage}"` : ''}
    ${unit ? `data-unit="${unit.id}" data-card="${unit.card}" draggable="${Boolean(ready)}" aria-keyshortcuts="I"` : ''}
    aria-label="${label}${stageLabel ? ' · ' + stageLabel : ''}" title="${escape(tooltip + (stageLabel ? '｜' + stageLabel + ' · ' + (terrainText[stage] ?? '六色で特殊勝利') : ''))}">
    ${unit ? `<img src="${art(card.artId)}" alt=""><span class="board-name">${card.name}</span>
      ${ready ? '<span class="ready-mark" aria-label="攻撃可能">⚔</span>' : ''}
      ${status ? `<span class="status-dot" title="${status}">✦</span><span class="sr-only">${status}</span>` : ''}
      <span class="unit-stats"><span class="${attack !== card.attack ? 'changed-stat' : ''}" title="攻撃力">${attack}</span><span class="${unit.hp < unit.maxHp ? 'wounded-stat' : ''}" title="HP">${unit.hp}</span></span>` :
      stageLabel ? '' : `<span class="empty-symbol" aria-hidden="true">${playable ? '+' : '◇'}</span>`}${flash.label}
    ${stageLabel ? `<span class="slot-stage" aria-hidden="true">${stageLabel}</span>` : ''}
  </button>`
}

function field(seat, enemy) {
  const rows = enemy ? ['front', 'back'] : ['back', 'front']
  return `<div class="formation ${enemy ? 'enemy-formation' : 'ally-formation'}" aria-label="${enemy ? '相手' : '味方'}の盤面">
    ${rows.map(row => `<div class="formation-rank" data-rank="${row}"><span class="row-tag">${rowName(row)}</span>
      ${[0, 1, 2].map(column => square(seat, row, column)).join('')}</div>`).join('')}
  </div>`
}

function hand(player) {
  const total = player.hand.length
  return `<div class="hand" aria-label="あなたの手札" style="--total:${total}">
    ${player.hand.map((instance, index) => {
      const card = cards[instance.card]
      const legal = view.legal?.play[instance.id]
      const cost = view.legal?.play[instance.id]?.cost ?? cardCost(instance, player.skillUses)
      const offset = index - (total - 1) / 2
      return `<button class="hand-card ${selected?.id === instance.id ? 'chosen' : ''} ${legal && !legal.enabled ? 'unaffordable' : ''}"
        style="--tilt:${offset * 2.5}deg;--drop:${Math.abs(offset) * 3}px"
        data-hand="${instance.id}" data-card="${card.id}" data-cost="${cost}" aria-keyshortcuts="I" draggable="${Boolean(legal?.enabled)}" ${legal ? '' : 'aria-disabled="true"'}
        aria-label="${escape(card.name)} MP ${cost}" title="${escape(legal?.reason ?? card.description)}">${cardFace(card, false, cost)}</button>`
    }).join('') || '<span class="hand-empty">手札はありません</span>'}
    </div>`
}

const battleSeat = () => room ? roomSeat : solo() ? 0 : view.active
const signedModifier = amount => (amount < 0 ? '－' : '＋') + Math.abs(amount)

function powerFormula({ base, modifiers, value, suffix = '' }) {
  return (modifiers.length ? base + modifiers.map(modifier => ' ' + signedModifier(modifier.amount)).join('') +
    ' ＝ ' + value : String(value)) + suffix
}

function powerDetails(rows) {
  return rows.length ? `<ul class="power-details">${rows.map(row => `<li>
    ${row.group ? `<small class="power-group">${escape(row.group)}</small>` : ''}
    <span>${escape(row.label)}</span> <strong>${powerFormula(row)}</strong>
    ${row.modifiers.length ? `<small class="power-sources">${row.modifiers.map(modifier =>
      escape(modifier.label) + ' ' + signedModifier(modifier.amount)).join(' ／ ')}</small>` : ''}
  </li>`).join('')}</ul>` : ''
}

function cardPower(card, { node, cost, action } = {}) {
  const unitId = Number(node?.dataset.unit ?? (action?.type === 'attack' ? action.id : undefined))
  const source = view.players.flatMap(player => player.units).find(unit => unit.id === unitId)
  const handInstance = Number(node?.dataset.hand ?? node?.dataset.replace ?? (action?.type === 'play' ? action.id : undefined))
  const choice = action ?? (selected?.id === handInstance ? selected : undefined)
  return definitionPowerRows(view, source?.owner ?? battleSeat(), card, {
    source, cost, handInstance, choice: choice?.choice, chosen: choice?.target,
  })
}

function skillDetail(seat, target) {
  const player = view.players[seat]
  const skill = player.skill ?? leaders[player.leader].skill
  const options = selected?.type === 'skill' && seat === battleSeat() ? selected : null
  const numbers = definitionPowerRows(view, seat, skill, { skill: true, chosen: target ?? options?.target, choice: options?.choice })
  if (player.leaderPower) numbers.push({ label: 'リーダーの攻撃力', ...leaderAttackBreakdown(view, seat) })
  return `<div class="inspector-copy">
    <small>${escape(leaders[player.leader].name)} · ${names.TENSION_SKILL}</small>
    <h2>${escape(skill.name)}</h2><p class="inspector-effect">${escape(skill.description)}</p>
    ${powerDetails(numbers)}
  </div>`
}

const keywordDetails = {
  CHARGE: '登場したターンから攻撃できます。',
  GUARD: '前衛にいる間、敵の通常攻撃の対象を、この能力を持つ前衛に限定します。',
  AIM: '前衛防護・守りの陣・騎士の誓いを無視して攻撃できます。',
  PIERCE: '前衛を攻撃すると、正面の後衛にも同じ攻撃力でダメージを与えます。',
  DOUBLE_ATTACK: '1ターンに2回攻撃できます。',
  STEALTH: '攻撃するまで敵の単体効果や通常攻撃の対象になりません。',
  METAL_BODY: '1～3ダメージを受けるとき、1ダメージになります。',
  CHEER: '手札から使うと、味方リーダーの熱量が1上がります。',
  FINISHER: '味方リーダーの熱量が最大のときに使えます。使用すると熱量をすべて消費します。',
  VULNERABLE: '受けるダメージが2倍になります。',
  UNTARGETABLE: '単体効果の対象として選べません。',
  DARK_CLOAK: '受けるダメージを防ぎます。',
  RESIST_SPELL: '特技からのダメージを防ぎます。',
  SUPER_PIERCE: 'ユニットを攻撃すると、同じ列の敵と敵リーダーにもダメージを与えます。',
}

function cardDetail(card, cost = card.cost, node, action) {
  const type = { unit: 'ユニット', spell: '特技', weapon: '武器' }[card.kind]
  const stats = card.kind === 'spell' ? '' : `<span class="inspector-stat">攻撃力 ${card.attack}</span><span class="inspector-stat">${card.kind === 'unit' ? 'HP' : '耐久'} ${card.hp}</span>`
  const unitId = Number(node?.dataset.unit)
  const unit = node?.dataset.unit && view.players.flatMap(player => player.units).find(unit => unit.id === unitId)
  const keys = [...new Set([...card.keywords, ...(unit?.grants ?? [])])]
  const current = node ? liveCardDetails(node) : []
  const power = cardPower(card, { node, cost, action })
  return `<article class="inspector-card">
    <div class="inspector-art"><img src="${art(card.artId)}" alt=""></div>
    <div class="inspector-copy">
      <h2>${escape(card.name)}</h2>
      <small>${card.classId === 'neutral' ? '共通' : leaders[card.classId].job} · ${type}${card.species ? ' · ' + escape(card.species) : ''} · ${escape(sourceLabels[card.packId] ?? '')}</small>
      <div class="inspector-stats"><span class="inspector-stat inspector-cost">${cost} MP</span>${stats}</div>
      <p class="inspector-effect">${escape(card.description || '効果なし')}</p>
      ${powerDetails(power)}
      ${keys.map(id => keywordDetails[id] ? `<div class="inspector-keyword"><strong>${names[id]}</strong><span>${keywordDetails[id]}</span></div>` : '').join('')}
      ${current.length ? `<ul class="inspector-current">${current.map(line => '<li>' + escape(line) + '</li>').join('')}</ul>` : ''}
    </div>
  </article>`
}

function defaultDetail(target) {
  const card = cards[selected?.card]
  if (selected?.type === 'skill' || selected?.type === 'leaderAttack') return skillDetail(battleSeat(), target)
  return card ? cardDetail(card, selected.cost, undefined, target ? { ...selected, target } : selected) :
    '<p class="inspector-hint">カードにカーソルを合わせると、効果と能力を表示します。</p>'
}

function detailPanel() {
  return `<aside class="detail-panel" id="detail" aria-label="カードと奥義の詳細"${selected ? ' data-inspecting="true"' : ''}>${defaultDetail()}</aside>`
}

const logCard = event => event && cards[event.card ?? event.source?.card]

function battleLog() {
  const publicEvents = view.events.filter(event => event.privateTo === undefined && event.type !== 'handAdded')
  const last = publicEvents.slice(-64).reverse()
  const lastPlay = publicEvents.findLast(event => event.played)
  if (lastPlay && !last.includes(lastPlay)) last.push(lastPlay)
  const open = app.querySelector('.battle-log')?.open
  return `<details class="battle-log"${open ? ' open' : ''}>
    <summary class="icon-button">対戦記録</summary>
    <ol class="events">${last.map(event => {
      const card = logCard(event)
      const located = event.position || event.destination || event.source?.position || event.target?.kind === 'leader'
      return `<li>${card || located ? `<button type="button" class="log-card" data-log-event="${event.seq}" ${card ? `data-log-card="${card.id}" title="${escape(card.name)}の詳細を開く"` : 'title="盤面の位置を示す"'}>${escape(event.text)}</button>` : escape(event.text)}</li>`
    }).join('')}</ol>
  </details>`
}

function openCardDetail(card, cost, focusBack, details = [], power = []) {
  if (document.querySelector('.battle-card-dialog[open]')) return
  const dialog = document.createElement('dialog')
  dialog.className = 'battle-card-dialog'
  dialog.setAttribute('aria-labelledby', 'battle-card-title')
  dialog.innerHTML = `<div class="log-card-preview">
    <img src="${art(card.artId)}" alt="">
    <div class="log-card-description"><h2 id="battle-card-title">${escape(card.name)}</h2>
      <span>MP ${cost ?? card.cost}</span>
      <p>${escape(card.description)}</p>
      ${powerDetails(power)}
      ${details.length ? '<ul class="card-current-stats">' + details.map(line => '<li>' + escape(line) + '</li>').join('') + '</ul>' : ''}</div>
    <form method="dialog"><button class="secondary" autofocus>閉じる</button></form>
  </div>`
  function close() {
    if (!dialog.isConnected) return
    dialog.remove()
    focusBack()?.focus({ preventScroll: true })
  }
  dialog.addEventListener('close', close, { once: true })
  dialog.addEventListener('submit', event => {
    event.preventDefault()
    dialog.close()
    close()
  })
  document.body.append(dialog)
  dialog.showModal()
}

function highlightLogEvent(seq) {
  for (const node of app.querySelectorAll('.log-location')) node.classList.remove('log-location')
  const event = view?.events.find(event => event.seq === seq && event.privateTo === undefined)
  if (!event) return
  for (const anchor of [event.source, event.destination ?? (event.position ? event : event.target)]) {
    if (anchor?.position) {
      const { seat, position, id } = anchor
      const node = app.querySelector(`[data-slot="${seat}:${position.row}:${position.column}"]`)
      if (node && (id === undefined || !node.dataset.unit || node.dataset.unit === String(id))) node.classList.add('log-location')
    } else if (anchor?.kind === 'leader') app.querySelector(`[data-leader="${anchor.seat}"]`)?.classList.add('log-location')
  }
}

function inspectLogCard(seq) {
  const event = view.events.find(event => event.seq === seq && event.privateTo === undefined)
  const card = logCard(event)
  highlightLogEvent(seq)
  if (!card) return
  openCardDetail(card, event.cost, () => app.querySelector(`[data-log-event="${seq}"]`) ?? app.querySelector('.battle-log summary'))
}

function liveCardDetails(node) {
  const card = cards[node.dataset.card]
  if (!card) return []
  const [seat, row, column] = node.dataset.slot?.split(':') ?? []
  const player = view?.players[Number(seat)]
  const unit = player?.units.find(unit => unit.id === Number(node.dataset.unit))
  if (!unit) return node.dataset.cost && Number(node.dataset.cost) !== card.cost ? ['基本MP ' + card.cost] : []
  const attack = player.boardAttack?.[unit.id] ?? unit.attack
  const stage = player.terrain?.[terrainKey({ row, column })]
  const states = unit.statuses.map(id => names[id]).filter(Boolean)
  return [
    '攻撃力 ' + attack + (attack !== card.attack ? '（基本 ' + card.attack + '）' : ''),
    'HP ' + unit.hp + '/' + unit.maxHp + (unit.maxHp !== card.hp ? '（基本最大HP ' + card.hp + '）' : ''),
    ...(stage ? [terrainName(stage) + ' · ' + (terrainText[stage] ?? '六色で特殊勝利')] : []),
    ...(states.length ? [states.join('・')] : []),
  ]
}

const inspectableCard = node => node?.closest?.('.battle [data-hand], .battle [data-unit], .mulligan [data-replace]')

function inspectLiveCard(node) {
  if (!node?.isConnected || !view || presentation) return
  const card = cards[node.dataset.card]
  if (!card) return
  const { hand, replace, unit, cost } = node.dataset
  const selector = hand !== undefined ? `[data-hand="${hand}"]` : replace !== undefined ?
    `[data-replace="${replace}"]` : `[data-unit="${unit}"]`
  openCardDetail(card, cost, () => app.querySelector(selector) ?? app.querySelector('.battle'),
    liveCardDetails(node), cardPower(card, { node, cost: cost === undefined ? undefined : Number(cost) }))
}

function clearAttackPreview() {
  const preview = app.querySelector('#attack-preview')
  if (preview) {
    if (preview.dataset.targetPower) {
      delete preview.dataset.targetPower
      app.querySelector('#detail').innerHTML = defaultDetail()
    }
    preview.textContent = ''
  }
  for (const node of app.querySelectorAll('.preview-protector')) node.classList.remove('preview-protector')
  app.querySelector('.battle')?.classList.remove('previewing')
}

function showActionPreview(node) {
  if (!selected || !node || presentation) return clearAttackPreview()
  const unitId = node.dataset.unit === undefined ? undefined : Number(node.dataset.unit)
  if (selected.type === 'skill' || selected.type === 'play') {
    const target = unitId !== undefined ? unitTarget(unitId) :
      node.dataset.leader !== undefined ? leaderTarget(Number(node.dataset.leader)) : null
    if (!target || !targetEnabled(target)) return clearAttackPreview()
    const output = app.querySelector('#attack-preview')
    const key = target.kind === 'unit' ? 'unit-' + target.id : 'leader-' + target.seat
    if (output.dataset.targetPower === key) return
    output.dataset.targetPower = key
    app.querySelector('#detail').innerHTML = defaultDetail(target)
    const skill = selected.type === 'skill'
    const definition = skill ? view.players[battleSeat()].skill : cards[selected.card]
    const preview = targetDamagePreview(view, battleSeat(), definition, target, { choice: selected.choice, cost: selected.cost, skill })
    output.textContent = preview ? `ダメージ見込み ${preview.value} · 対象の残りHP ${preview.hp}` : ''
    app.querySelector('.battle')?.classList.toggle('previewing', Boolean(preview))
    return
  }
  if (!selected.legal.forecasts) return clearAttackPreview()
  const enemy = node.dataset.leader === String(1 - view.active) || node.dataset.slot?.startsWith((1 - view.active) + ':')
  if (!enemy || unitId === undefined && node.dataset.leader === undefined) return clearAttackPreview()
  const target = unitId === undefined ? leaderTarget(1 - view.active) : unitTarget(unitId)
  const forecast = selected.legal.forecasts.find(forecast => sameTarget(forecast.target, target))
  const { guards, covered, wall } = selected.legal.protection
  let message = forecast?.note
  let protectors
  if (forecast?.damage !== undefined) {
    message = `戦闘で ${forecast.damage} ダメージ · 相手 HP ${forecast.hp}` +
      (unitId === undefined ? '' : ` · 反撃 ${forecast.retaliation} · 攻撃側 HP ${forecast.attackerHp}`)
  } else if (!forecast) {
    protectors = guards ?? (unitId === undefined ? wall : covered?.[unitId] === undefined ? undefined : [covered[unitId]])
    if (protectors) message = guards ? '騎士の誓いで守られています' : unitId === undefined ?
      '守りの陣でリーダーが守られています' : '同じ列の前衛が守っています'
  }
  clearAttackPreview()
  if (!message) return
  app.querySelector('#attack-preview').textContent = message
  app.querySelector('.battle').classList.add('previewing')
  for (const id of protectors ?? []) app.querySelector(`[data-unit="${id}"]`)?.classList.add('preview-protector')
}

function playResourceMotion() {
  if (!view || animatedView === view) return
  const previous = animatedView
  animatedView = view
  const dealing = app.querySelector('[data-deal-seat]')
  if (dealing && (previous?.phase !== 'mulligan' || previous.active !== view.active)) {
    for (const [index, card] of [...dealing.children].entries()) {
      card.style.setProperty('--deal-order', index)
      card.classList.add('initial-deal')
    }
    battleAudio.play('draw')
  }
  if (view.phase !== 'battle') return
  const events = view.events.filter(event => event.seq > eventFloor)
  const turn = events.findLast(event => event.type === 'turn')
  if (turn) {
    app.querySelector(`[data-mp="${turn.seat}"]`)?.classList.add('mp-refresh')
    app.querySelector(`[data-side="${turn.seat}"]`)?.classList.add('turn-arrival')
    battleAudio.play('turn')
  }
  const added = events.filter(event => event.type === 'handAdded')
  if (added.length) {
    for (const event of events.filter(event => event.type === 'draw' || event.type === 'generate')) {
      const card = app.querySelector(`[data-hand="${event.id}"]`)
      const pile = app.querySelector(`[data-draw-pile="${event.seat}"]`)
      if (!card || !pile) continue
      const from = pile.getBoundingClientRect()
      const to = card.getBoundingClientRect()
      card.style.setProperty('--draw-x', from.x + from.width / 2 - to.x - to.width / 2 + 'px')
      card.style.setProperty('--draw-y', from.y + from.height / 2 - to.y - to.height / 2 + 'px')
      card.classList.add('just-drawn')
    }
    for (const seat of new Set(added.map(event => event.seat))) {
      app.querySelector(`[data-draw-pile="${seat}"]`)?.classList.add('pile-draw')
      app.querySelector(`[data-hand-count="${seat}"]`)?.classList.add('pile-draw')
    }
    if (!turn) battleAudio.play('draw')
  }
}

function skillControls(own) {
  const player = view.players[own]
  const skill = player.skill ?? leaders[player.leader].skill
  const focusCost = view.legal?.focus.cost ?? 1
  return `<div class="skill-controls">
      <button class="secondary" data-op="focus" ${view.legal?.focus.enabled ? '' : 'disabled'} title="${view.legal?.focus.reason ?? focusCost + 'MPを支払う'}">熱量をためる <small>${focusCost} MP</small></button>
      <button class="secondary skill-button" data-op="skill" ${view.legal?.skill.enabled ? '' : 'disabled'}
        aria-describedby="skill-description"><small>${names.TENSION_SKILL}</small>${escape(skill.name)}</button>
      <p class="skill-description" id="skill-description">${escape(skill.description)}</p>
  </div>`
}

function instruction() {
  if (cpuTurn()) return 'CPUが行動中'
  if (feedback) return feedback
  if (waitingForFriend()) return '相手が行動中'
  if (selected?.legal.choices && selected.choice === undefined) return '効果を選んでください'
  if (selected?.legal.handChoices?.length && selected.handChoice === undefined) return '効果を使う手札を選択'
  if (selected?.legal.positions && !selected.position) return selected.card && cards[selected.card].kind === 'unit'
    ? '光っているマスに召喚' : '光っているマスから指定'
  if (selected?.legal.extraPositions && !selected.extraPosition) return '効果を使うマスを選択'
  if (selected?.legal.columns && selected.column === undefined) return '効果をかける列を選択'
  if (selected?.legal.targets) return '光っている対象を選択'
  if (view.legal?.leaderAttack.enabled && !selected) return '自分のリーダーを選んで攻撃'
  if (selected?.type === 'play' || selected?.type === 'skill') return '効果を確認して使用'
  return 'カードやユニットを選択'
}

function selectionBar() {
  if (view.pending) return `<div class="selection-bar"><span>選択を確定してください</span>
    ${view.pending.cards.map(id => `<small>${cards[id].name}</small>`).join('')}
    ${view.pending.labels.map((label, index) => `<button class="secondary" data-decision="${index}">${escape(label)}</button>`).join('')}
  </div>`
  const choice = selected?.choice === undefined && selected?.legal.choices
  const hands = selected?.handChoice === undefined && selected?.legal.handChoices?.length
    ? view.players[view.active].hand.filter(instance => selected.legal.handChoices.includes(instance.id)) : []
  const columns = selected?.position && selected.column === undefined && selected.legal.columns
  const confirm = selected && !choice && !hands.length && !selected.legal.positions && !selected.legal.targets
  return `<div class="selection-bar"><span>${escape(instruction())}</span>
    ${choice ? choice.map((label, index) => `<button class="secondary" data-choice="${index}">${label}</button>`).join('') : ''}
    ${hands.map(instance => `<button class="secondary" data-hand-choice="${instance.id}">${cards[instance.card].name}</button>`).join('')}
    ${columns ? columns.map(column => `<button class="secondary" data-effect-column="${column}">${column + 1}列目</button>`).join('') : ''}
    ${confirm ? '<button class="secondary" data-op="confirm">使用する</button>' : ''}
    ${selected ? '<button data-op="cancel" class="icon-button">取消</button>' : ''}
  </div>`
}

function battlefield() {
  const own = battleSeat()
  const enemy = 1 - own
  const locked = presentation || roomLocked()
  const latestAction = view.events.findLast(event => event.seq > eventFloor
    && event.privateTo === undefined && !['handAdded', 'mulligan', 'turn'].includes(event.type))
  return `<main class="battle${reducedMotion() ? ' short-motion' : ''}" style="--ally-light:${leaders[view.players[own].leader].accent};--enemy-light:${leaders[view.players[enemy].leader].accent}" tabindex="-1">
    <div class="battle-layout"><div class="battle-core">
    <div class="battle-heading"><span>綴りの大競技会</span><span class="turn-label">第 ${view.turn} ターン</span><div class="battle-tools"><button class="icon-button" data-op="motion" aria-pressed="${reducedMotion()}" ${matchMedia('(prefers-reduced-motion: reduce)').matches ? 'disabled title="端末の設定に合わせて短縮しています"' : ''}>短い演出</button>${battleLog()}</div></div>
    <div class="battle-grid" data-active-side="${view.active === own ? 'ally' : 'enemy'}" aria-label="対戦盤面"${locked ? ' inert' : ''}>
      ${leaderPanel(own, false)}
      <div class="board">
        ${field(own, false)}<div class="board-rule" aria-hidden="true">${[1, 2, 3].map(lane => `<span class="lane-mark">${lane}</span>`).join('')}</div>${field(enemy, true)}
      </div>
      ${leaderPanel(enemy, true)}
      ${presentationLayer(presentation, art, escape)}
    </div>
    <div class="battle-message"><span class="last-action">${latestAction && !selected && !feedback ? escape(latestAction.text) : ''}</span><output id="attack-preview" aria-live="polite"></output></div>
    <section class="tray"${locked ? ' inert' : ''}>
      ${skillControls(own)}
      <div class="hand-zone">${selectionBar()}${hand(view.players[own])}</div>
      <div class="turn-controls">
        <button class="primary end" data-op="end" ${cpuTurn() || locked || (room && view.pending) ? 'disabled' : ''}>ターン終了 <span aria-hidden="true">›</span></button>
      </div>
    </section>
    </div>${detailPanel()}</div>
  </main>`
}

function mulligan() {
  if (waitingForFriend()) return `<main class="ceremony"><section class="modal mulligan">
    <h1>手札交換</h1><p role="status">${escape(feedback || '相手の手札交換を待っています。')}</p>
  </section></main>`
  const player = view.players[view.active]
  const size = player.hand.length
  return `<main class="ceremony"><section class="modal mulligan">
    <p class="modal-kicker">${seatName(view.active)} · ${leaders[player.leader].name}</p>
    <h1>手札交換</h1><p>引き直すカードを選んでください。</p>
    <span class="mulligan-pile" title="山札 残り${player.deckCount}枚">▤ <span>山札</span></span>
    <div class="mulligan-cards" data-deal-seat="${view.active}" aria-label="交換するカード">
      ${player.hand.map(instance => `<button class="large-card ${replacements.has(instance.id) ? 'chosen' : ''}" data-replace="${instance.id}" data-card="${instance.card}" aria-keyshortcuts="I"
          aria-pressed="${replacements.has(instance.id)}" aria-label="${cards[instance.card].name}" ${roomLocked() ? 'disabled' : ''}>
        ${cardFace(cards[instance.card], true)}</button>`).join('')}
    </div>
    ${room && feedback ? `<p role="status">${escape(feedback)}</p>` : ''}
    <button class="primary" data-op="mulligan" ${roomLocked() ? 'disabled' : ''}>手札を確定 (${replacements.size}/${size} 交換)</button>
  </section></main>`
}

function decisivePlay() {
  if (resigned !== null || view.winner === 'draw') return ''
  const event = view.events.findLast(event => event.type === 'specialVictory' ||
    (event.type === 'damage' && event.value > 0 && sameTarget(event.target, leaderTarget(1 - view.winner))))
  const card = logCard(event)
  if (!event) return ''
  return `<div class="decisive-play${card ? '' : ' text-only'}">${card ? `<img src="${art(card.artId)}" alt="">` : ''}
    <div><small>決着の一手</small><strong>${escape(card?.name ?? event.text)}</strong>
    ${card && event.type === 'damage' ? `<small>${event.value} ダメージ</small>` : ''}</div></div>`
}

function results() {
  const draw = view.winner === 'draw'
  const winner = draw ? null : view.players[view.winner]
  const result = draw ? '引き分け' : (room ? (view.winner === roomSeat ? 'あなた' : '相手')
    : solo() ? (view.winner === 0 ? 'あなた' : 'CPU') : seatName(view.winner)) + 'の勝利'
  return `<main class="ceremony"><section class="modal result">
    ${winner ? portrait(winner.leader) : '<div class="title-ornament" aria-hidden="true">✦</div>'}
    <p class="modal-kicker">対戦結果 · 第 ${view.turn} ターン</p><h1>${result}</h1>
    ${view.specialVictory !== undefined ? '<p>六彩の暁鳥の特殊勝利</p>' : ''}
    ${resigned !== null ? `<p>${resigned === roomSeat ? 'あなた' : '相手'}が対戦を終了しました。</p>` : ''}
    ${winner ? `<p>${leaders[winner.leader].name}</p>` : ''}
    ${decisivePlay()}
    <div class="result-hp">${view.players.map((p, i) => `<span>${seatName(i)} HP <b>${Math.max(p.hp, 0)}</b></span>`).join('')}</div>
    <div class="result-actions">${battleLog()}<button class="secondary" data-op="replay">対戦ログを保存</button><button class="primary" data-op="home">タイトルへ</button></div>
  </section></main>`
}

function rulesModal() {
  if (!showRules) return ''
  return `<dialog id="rules-dialog" aria-labelledby="rule-title"><h2 id="rule-title">対戦ルール</h2>
    <ul><li>CPU対戦では相手の手札交換とターンが自動で進みます。同じPCで2人対戦するときは、ターン終了で次の手札を表示します。</li>
    <li>カードを選んでマスや対象をクリックします。カードや攻撃可能なユニットはドラッグでも操作できます。</li>
    <li>前衛防護は同列の後衛を守り、3列を埋めると守りの陣でリーダーを守ります。騎士の誓いはユニットの攻撃を引きつけます。</li>
    <li>1MPで熱量をため、熱量が3になると語り手の奥義を使えます。相手リーダーのHPを0にすると勝利です。</li></ul>
    <p>カード・奥義の数値と一部の裁定は試遊用の暫定仕様です。</p>
    <button class="primary" data-op="close-rules">閉じる</button></dialog>`
}

function render(focusOn = null) {
  const scroll = app.querySelector('.events')?.scrollTop
  const surface = !inMatch() ? (showDecks ? deckEditor.view(art, escape) : showLibrary ? library(art) : home())
    : !view ? roomLobby() : view.phase === 'finished' && !presentation ? results() :
    view.phase === 'mulligan' ? mulligan() : battlefield()
  app.innerHTML = titlebar() + surface + rulesModal()
  if (lastInspection && !selected && matchMedia('(min-width: 1160px)').matches) {
    const node = app.querySelector(lastInspection)
    if (node) inspectNode(node)
  }
  if (presentation) positionPresentation(app, presentation)
  playResourceMotion()
  const events = app.querySelector('.events')
  if (events && scroll) events.scrollTop = scroll
  if (showLibrary) refreshLibrary(app, art)
  if (showDecks) deckEditor.refresh(app, art)
  if (showRules) {
    const dialog = document.querySelector('#rules-dialog')
    dialog.showModal()
    dialog.addEventListener('cancel', event => {
      event.preventDefault()
      showRules = false
      render('[data-op="rules"]')
    })
  }
  if (focusOn && !showRules && !document.querySelector('.battle-card-dialog[open]')) {
    app.querySelector(focusOn)?.focus({ preventScroll: true })
  }
}

function readView() {
  const publicView = match.view()
  return publicView.phase === 'finished' ? publicView : match.view(solo() ? 0 : publicView.active)
}

function scheduleCpu() {
  if (!cpuTurn() || presentation || cpuTimer !== null) return
  const currentMatch = match
  cpuTimer = setTimeout(() => {
    cpuTimer = null
    if (currentMatch !== match || !cpuTurn()) return
    const action = cpuMoves++ < 36 ? chooseCpuAction(match.view(1), 1) : { type: 'end' }
    if (!execute(action ?? { type: 'end' }, 1) && action?.type !== 'end') execute({ type: 'end' }, 1)
  }, cpuMoves === 0 ? 340 : 250)
}

function finishAction(action) {
  presentation = null
  presentationTimer = null
  const announcement = view.events.findLast(event => event.seq > eventFloor
    && event.privateTo === undefined && event.type !== 'handAdded')
  announcer.textContent = announcement?.text ?? ''
  if (view.phase === 'finished') render('.result [data-op="home"]')
  else if (view.phase === 'mulligan') render('[data-replace]')
  else render(!cpuTurn() && (action.type === 'end' || action.type === 'mulligan') ? '.battle' : null)
  scheduleCpu()
  const update = roomUpdates.shift()
  if (update) receiveRoom(update)
}

function playPresentation(scene, next, action) {
  function impact() {
    view = next
    if (scene.impactCue) battleAudio.play(scene.impactCue)
    if (scene.decisive) {
      presentation.beat = 'finish'
      render()
      battleAudio.play(scene.phoenix ? 'phoenix' : 'finish')
      presentationTimer = setTimeout(() => finishAction(action), scene.finishMs)
    } else finishAction(action)
  }
  function approach() {
    presentation.beat = 'approach'
    render()
    presentationTimer = setTimeout(impact, scene.approachMs)
  }
  presentation = { scene, beat: 'reveal' }
  if (scene.revealMs) {
    render()
    if (scene.skill) battleAudio.play(scene.skill.leader)
    presentationTimer = setTimeout(approach, scene.revealMs)
  } else approach()
}

function presentAction(next, action, events, opponent) {
  eventFloor = view.events.at(-1)?.seq ?? 0
  selected = null
  feedback = ''
  replacements.clear()
  const scene = view.phase === 'battle' && planBattlePresentation(view, next, events, opponent)
  if (scene) playPresentation(scene, next, action)
  else {
    view = next
    finishAction(action)
  }
}

function receiveRoom(update) {
  if (presentation) {
    roomUpdates.push(update)
    if (roomUpdates.length > 8) roomUpdates = [update]
    return
  }
  const sequential = update.version === roomVersion + 1
  if (roomAction && update.version > roomAction.version) {
    roomAction = null
    roomBusy = false
  }
  roomVersion = update.version
  if (update.phase === 'closed') {
    roomConnection = 'closed'
    feedback = '対戦部屋が閉じられました。'
    render()
    return
  }
  if (update.phase === 'waiting') {
    render('#invite-url')
    return
  }
  roomSeat = update.seat
  resigned = update.resigned ?? null
  if (view && sequential && update.last) {
    const { seat, type, events } = update.last
    presentAction(update.view, { type }, events, seat !== roomSeat)
    return
  }
  view = update.view
  eventFloor = view.events.at(-1)?.seq ?? 0
  selected = null
  replacements.clear()
  feedback = ''
  finishAction({ type: 'mulligan' })
}

function openRoom(session) {
  mode = 'friend'
  invite = session.id
  room = connectRoom(session, receiveRoom, (status, issue) => {
    roomConnection = status
    feedback = issue ?? (status === 'reconnecting' ? '通信が切れました。再接続しています…' : '')
    if (feedback) announcer.textContent = feedback
    if (!presentation) render()
  })
  rememberRoom(session)
  render()
  room.start()
}

async function startFriendMatch() {
  if (roomBusy || !onlineAvailable()) return
  roomBusy = true
  feedback = ''
  render()
  try {
    const session = await enterRoom(invite, battleLineup(0))
    roomBusy = false
    openRoom(session)
  } catch (error) {
    roomBusy = false
    feedback = error.status ? error.message : '対戦サーバーに接続できません。'
    render('[data-op="start"]')
  }
}

async function sendRoomAction(action) {
  const current = room
  const request = { version: roomVersion }
  roomAction = request
  battleAudio.unlock()
  roomBusy = true
  render()
  try {
    await current.act(request.version, action)
  } catch (error) {
    if (room === current && roomAction === request) {
      feedback = error.status ? error.message : '対戦操作を送信できませんでした。'
      announcer.textContent = feedback
    }
  } finally {
    if (room === current && roomAction === request) {
      roomAction = null
      roomBusy = false
      if (!presentation) render()
    }
  }
}

function execute(action, actor = solo() ? 0 : view.active) {
  if (presentation || roomLocked()) return false
  if (room) {
    sendRoomAction(action)
    return true
  }
  const result = match.act(actor, action)
  if (!result.ok) {
    eventFloor = view.events.at(-1)?.seq ?? 0
    feedback = result.issue
    announcer.textContent = result.issue
    render()
    return false
  }
  if (solo() && action.type === 'mulligan') {
    const cpuMulligan = chooseCpuAction(match.view(1), 1)
    match.act(1, cpuMulligan)
  }
  if (action.type === 'end') cpuMoves = 0
  presentAction(readView(), action, result.events, solo() && actor === 1)
  return true
}

function select(type, id, drawUi = true) {
  if (!view.legal) return
  const legal = type === 'skill' || type === 'leaderAttack' ? view.legal[type] : view.legal[type][id]
  feedback = legal?.enabled ? '' : legal?.reason ?? '対象を選択できません'
  const player = view.players[view.active]
  const instance = type === 'play' ? player.hand.find(item => item.id === id)
    : type === 'attack' ? player.units.find(unit => unit.id === id) : undefined
  const cost = instance && type === 'play' ? legal?.cost ?? cardCost(instance, player.skillUses) : undefined
  selected = legal?.enabled ? { type, id, legal, card: instance?.card, cost } : null
  if (type === 'skill' && selected && !legal.targets && !legal.positions && !legal.choices) {
    execute({ type })
    return
  }
  if (feedback) announcer.textContent = feedback
  if (drawUi) render(type === 'play' ? '[data-hand="' + id + '"]' :
    type === 'attack' ? '[data-unit="' + id + '"]' :
      type === 'leaderAttack' ? '[data-leader="' + view.active + '"]' : '[data-op="skill"]')
}

function hit(node) {
  if (!view.legal) return
  if (node.dataset.leader !== undefined) {
    const target = leaderTarget(Number(node.dataset.leader))
    if (targetEnabled(target)) completeSelection({ target })
    else if (!selected && target.seat === view.active && view.legal.leaderAttack.enabled) select('leaderAttack')
    return
  }
  const [seat, row, column] = node.dataset.slot.split(':')
  const pos = { row, column: Number(column) }
  const target = unitTarget(Number(node.dataset.unit))
  if (targetEnabled(target)) {
    completeSelection({ target })
    return
  }
  const space = placementAt(Number(seat), pos)
  if (space) {
    completeSelection(selected.position ? { extraPosition: space } : { position: space })
    return
  }
  if (Number(seat) === view.active && node.dataset.unit) select('attack', target.id)
}

function completeSelection(choice) {
  Object.assign(selected, choice)
  const { type, id, legal, position, target, choice: branch, column, extraPosition, handChoice } = selected
  if (legal.positions && !position || legal.targets && !target || legal.choices && branch === undefined ||
      legal.columns && column === undefined || legal.extraPositions && !extraPosition ||
      legal.handChoices?.length && handChoice === undefined) {
    render('.targetable')
    return
  }
  execute({ type, id, position, target, choice: branch, column, extraPosition, handChoice })
}

function exportReplay() {
  const replay = room ? { winner: view.winner, resigned, events: view.events.filter(event => event.privateTo === undefined) }
    : match.exportReplay()
  const blob = new Blob([JSON.stringify(replay, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'fairytale-replay.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function copyInvite() {
  const input = app.querySelector('#invite-url')
  const status = app.querySelector('.room-copy-status')
  if (!input || !status) return
  try {
    await navigator.clipboard.writeText(input.value)
    status.textContent = '招待URLをコピーしました。'
  } catch {
    input.focus()
    input.select()
    status.textContent = '選択したURLをコピーして送ってください。'
  }
}

function returnHome() {
  clearTimeout(cpuTimer)
  clearTimeout(presentationTimer)
  cpuTimer = presentationTimer = presentation = null
  room?.stop()
  if (invite) forgetRoom(invite)
  match = view = selected = room = invite = roomSeat = resigned = null
  lastInspection = null
  animatedView = null
  roomVersion = -1
  roomAction = null
  roomUpdates = []
  roomConnection = 'connecting'
  roomBusy = false
  feedback = ''
  replacements.clear()
  render('[data-op="start"]')
}

async function leaveMatch() {
  if (view && view.phase !== 'finished' && !window.confirm(room
    ? '対戦を終了してタイトルへ戻りますか？ 退出すると相手の勝利になります。'
    : 'この対戦を終了してタイトルへ戻りますか？')) return
  const current = room
  if (current && view?.phase !== 'finished' && roomConnection !== 'closed') {
    try { await current.leave() } catch (error) {
      if (room !== current) return
      if (![403, 404].includes(error.status)) {
        if (!window.confirm('通信が切れているため退出を通知できません。タイトルへ戻りますか？')) return
      }
    }
  }
  if (room === current) returnHome()
}

app.addEventListener('change', event => {
  if (showDecks && deckEditor.importField(app, art, escape, event.target, render, 'change')) return
  if (showDecks && event.target.matches('select[data-deck-filter]')) {
    deckEditor.filter(app, art, event.target)
    return
  }
  if (showLibrary && event.target.matches('select[data-library-filter]')) {
    changeLibraryFilter(app, art, event.target)
    return
  }
  if (event.target.matches('select[data-match-deck]')) {
    selectedDecks[Number(event.target.dataset.matchDeck)] = event.target.value
    return
  }
  const select = event.target.closest('select[data-seat]')
  if (!select) return
  const seat = Number(select.dataset.seat)
  if (selectedLeaders[seat] !== select.value) selectedDecks[seat] = null
  selectedLeaders[seat] = select.value
  render('#' + select.id)
})

app.addEventListener('input', event => {
  if (showDecks && deckEditor.importField(app, art, escape, event.target, render, 'input')) return
  if (showLibrary && event.target.matches('input[data-library-filter]')) changeLibraryFilter(app, art, event.target)
  if (showDecks && event.target.matches('input[data-deck-filter]')) deckEditor.filter(app, art, event.target)
  if (showDecks && event.target.id === 'deck-name') deckEditor.rename(app, event.target.value)
})

document.addEventListener('paste', event => {
  const image = [...(event.clipboardData?.files ?? [])].find(file => file.type.startsWith('image/'))
  if (showDecks && image && deckEditor.importImage(image, render)) event.preventDefault()
})

app.addEventListener('dragover', event => {
  if (showDecks && event.target.closest('[data-rivals-upload]') && event.dataTransfer.types.includes('Files')) event.preventDefault()
})
app.addEventListener('drop', event => {
  if (!showDecks || !event.target.closest('[data-rivals-upload]')) return
  event.preventDefault()
  deckEditor.importImage(event.dataTransfer.files[0], render)
})

app.addEventListener('click', event => {
  const node = event.target.closest('button')
  if (!node) return
  if ((presentation || roomLocked()) && node.closest('.battle-grid, .tray, .mulligan')) return
  if (event.detail > 0 && inspectableCard(node) && performance.now() < ignoreCardClickUntil) {
    ignoreCardClickUntil = 0
    return
  }
  if (node.dataset.logEvent !== undefined) {
    inspectLogCard(Number(node.dataset.logEvent))
    return
  }
  const { op, hand, replace, slot, leader, choice, mode: nextMode, libraryCard, libraryTab } = node.dataset
  if (node.dataset.decision !== undefined) {
    execute({ type: 'decide', choice: Number(node.dataset.decision) })
    return
  }
  if (node.dataset.effectColumn !== undefined) {
    completeSelection({ column: Number(node.dataset.effectColumn) })
    return
  }
  if (node.dataset.handChoice !== undefined) {
    completeSelection({ handChoice: Number(node.dataset.handChoice) })
    return
  }
  if (showDecks && node.closest('.deck-view') && deckEditor.handle(app, art, escape, node, render)) return
  if (libraryCard && showLibrary) {
    selectLibraryCard(app, art, libraryCard)
    return
  }
  if (libraryTab && showLibrary) {
    switchLibraryTab(libraryTab)
    render('[data-library-tab="' + libraryTab + '"]')
    return
  }
  if (nextMode && !inMatch() && !roomBusy) {
    mode = nextMode
    feedback = ''
    render('[data-mode="' + mode + '"]')
    return
  }
  if (hand !== undefined) select('play', Number(hand))
  if (replace !== undefined) {
    const id = Number(replace)
    if (replacements.has(id)) replacements.delete(id)
    else replacements.add(id)
    render('[data-replace="' + id + '"]')
  }
  if (slot || leader !== undefined) hit(node)
  if (choice !== undefined) completeSelection({ choice: Number(choice) })
  switch (op) {
    case 'library': showLibrary = true; render('.library-view'); break
    case 'close-library': showLibrary = false; render('[data-op="library"]'); break
    case 'decks': deckEditor.open(); showDecks = true; render('.deck-view'); break
    case 'close-decks': showDecks = false; render('[data-op="decks"]'); break
    case 'rules': showRules = true; render(); break
    case 'close-rules': showRules = false; render('[data-op="rules"]'); break
    case 'motion': toggleBattleMotion(); if (!presentation) render('[data-op="motion"]'); break
    case 'sound':
      battleAudio.toggle()
      node.setAttribute('aria-pressed', battleAudio.enabled)
      break
    case 'start':
      battleAudio.unlock()
      if (mode === 'friend') {
        startFriendMatch()
        break
      }
      match = createLocalMatch({
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
        lineups: [battleLineup(0), battleLineup(1)],
      })
      eventFloor = 0
      cpuMoves = 0
      view = readView()
      render('[data-replace]')
      break
    case 'home': leaveMatch(); break
    case 'copy-invite': copyInvite(); break
    case 'mulligan':
      showMulliganReturns(node)
      execute({ type: 'mulligan', replace: [...replacements] })
      break
    case 'focus': execute({ type: 'focus' }); break
    case 'skill': select('skill'); break
    case 'end': execute({ type: 'end' }); break
    case 'cancel': selected = null; feedback = ''; render(); break
    case 'confirm': execute({ type: selected.type, id: selected.id }); break
    case 'replay': exportReplay(); break
  }
})

function showMulliganReturns(destination) {
  const end = (app.querySelector('.mulligan-pile') ?? destination).getBoundingClientRect()
  for (const [index, card] of [...app.querySelectorAll('.mulligan [data-replace].chosen')].entries()) {
    const start = card.getBoundingClientRect()
    const back = document.createElement('i')
    back.className = 'returning-card'
    back.setAttribute('aria-hidden', 'true')
    Object.assign(back.style, { left: start.left + 'px', top: start.top + 'px', width: start.width + 'px', height: start.height + 'px' })
    document.body.append(back)
    const travel = `translate(${end.x + end.width / 2 - start.x - start.width / 2}px, ${end.y + end.height / 2 - start.y - start.height / 2}px)`
    const animation = back.animate([
      { transform: 'rotateY(82deg) scale(.85)', opacity: .64 },
      { transform: travel + ' rotateY(0) scale(.2)', opacity: 0 },
    ], { duration: reducedMotion() ? 75 : 255, delay: reducedMotion() ? 0 : index * 22, easing: 'ease-in', fill: 'both' })
    animation.finished.then(() => back.remove(), () => back.remove())
  }
  if (replacements.size) battleAudio.play('draw')
}

const inspectSelector = '[data-hand], [data-unit], [data-terrain], [data-leader], [data-op="skill"], #skill-description'

function inspectNode(node) {
  const panel = app.querySelector('#detail')
  if (!panel || !node) return
  const card = cards[node?.dataset.card]
  const { hand, unit, slot, leader, terrain } = node.dataset
  if (card) {
    panel.innerHTML = cardDetail(card, node.dataset.cost === undefined ? undefined : Number(node.dataset.cost), node)
    lastInspection = hand !== undefined ? `[data-hand="${hand}"]` : `[data-unit="${unit}"]`
  } else if (terrain) {
    panel.innerHTML = `<div class="inspector-copy"><h2>${escape(terrainName(terrain))}</h2>
      <p class="inspector-effect">${escape(terrainText[terrain] ?? '6色の種晶で特殊勝利')}</p></div>`
    lastInspection = `[data-slot="${slot}"][data-terrain]`
  } else {
    panel.innerHTML = skillDetail(leader === undefined ? battleSeat() : Number(leader))
    lastInspection = leader === undefined ? '#skill-description' : `[data-leader="${leader}"]`
  }
  panel.dataset.inspecting = 'true'
}

function inspect(event) {
  const entry = event.target.closest('[data-log-event]')
  if (entry && !entry.contains(event.relatedTarget)) highlightLogEvent(Number(entry.dataset.logEvent))
  const target = event.target.closest('[data-slot], [data-leader]')
  if (target?.contains(event.relatedTarget)) return
  if (view?.phase === 'battle') showActionPreview(target)
  if (target?.classList.contains('targetable') && ['play', 'skill'].includes(selected?.type)) return
  const node = event.target.closest(inspectSelector)
  if (node && !node.contains(event.relatedTarget)) inspectNode(node)
}

app.addEventListener('pointerover', inspect)
app.addEventListener('focusin', inspect)
function leaveInspector(event) {
  const inspected = event.target.closest(inspectSelector)
  if (!inspected || inspected.contains(event.relatedTarget) || matchMedia('(min-width: 1160px)').matches) return
  const panel = app.querySelector('#detail')
  if (panel) {
    if (!selected) delete panel.dataset.inspecting
    panel.innerHTML = defaultDetail()
  }
}

app.addEventListener('focusout', event => {
  if (event.target.closest('[data-log-event]')) highlightLogEvent()
  if (event.target.closest('[data-slot], [data-leader]')) clearAttackPreview()
  leaveInspector(event)
})
app.addEventListener('pointerout', event => {
  const entry = event.target.closest('[data-log-event]')
  if (entry && !entry.contains(event.relatedTarget)) highlightLogEvent()
  const target = event.target.closest('[data-slot], [data-leader]')
  if (target && !target.contains(event.relatedTarget)) clearAttackPreview()
  leaveInspector(event)
})

function cancelCardPress() {
  if (handPress) clearTimeout(handPress.timer)
  handPress = null
}

app.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || presentation) return
  const node = inspectableCard(event.target)
  if (!node) return
  cancelCardPress()
  ignoreCardClickUntil = 0
  const timer = setTimeout(() => {
    if (!node.isConnected) return
    ignoreCardClickUntil = performance.now() + 650
    inspectLiveCard(node)
  }, 440)
  handPress = { timer, pointer: event.pointerId, x: event.clientX, y: event.clientY }
})

app.addEventListener('pointermove', event => {
  if (handPress?.pointer === event.pointerId &&
      Math.hypot(event.clientX - handPress.x, event.clientY - handPress.y) > 9) cancelCardPress()
})

for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, cancelCardPress)

app.addEventListener('contextmenu', event => {
  const node = inspectableCard(event.target)
  if (!node || presentation) return
  event.preventDefault()
  cancelCardPress()
  inspectLiveCard(node)
})

app.addEventListener('dragstart', event => {
  cancelCardPress()
  if (presentation || roomLocked()) { event.preventDefault(); return }
  const node = event.target.closest('[draggable="true"]')
  if (!node) return
  const type = node.dataset.hand ? 'play' : 'attack'
  select(type, Number(node.dataset.hand ?? node.dataset.unit), false)
  if (!selected) { event.preventDefault(); return }
  event.dataTransfer.setData('text/plain', type)
  event.dataTransfer.effectAllowed = 'move'
  for (const square of app.querySelectorAll('[data-slot], [data-leader]')) {
    const [seat, row, column] = square.dataset.slot?.split(':') ?? []
    const target = square.dataset.leader !== undefined ? leaderTarget(Number(square.dataset.leader)) : unitTarget(Number(square.dataset.unit))
    if (targetEnabled(target) || placementAt(Number(seat), { row, column: Number(column) })) square.classList.add('targetable')
  }
  const bar = app.querySelector('.selection-bar span')
  if (bar) bar.textContent = instruction()
})

app.addEventListener('dragover', event => {
  if (!selected) return
  if (event.target.closest('.targetable')) event.preventDefault()
  showActionPreview(event.target.closest('[data-slot], [data-leader]'))
})

app.addEventListener('drop', event => {
  const node = event.target.closest('.targetable')
  if (!node || !selected) return
  event.preventDefault()
  hit(node)
})

app.addEventListener('dragend', () => {
  if (selected) render()
})

document.addEventListener('keydown', event => {
  const card = event.key.toLowerCase() === 'i' && !event.altKey && !event.ctrlKey && !event.metaKey && inspectableCard(event.target)
  if (card && !showRules) {
    event.preventDefault()
    inspectLiveCard(card)
  }
  if (event.key === 'Escape' && !showRules && selected && !document.querySelector('.battle-card-dialog[open]')) {
    selected = null
    feedback = ''
    render()
  }
})

const saved = savedRoom(invite)
if (saved && onlineAvailable()) openRoom(saved)
else render()

