import { cardCost, cards, familyNames, leaders, names } from '../../packages/cards/index.js'
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
import { planBattlePresentation, positionBattleImpact, positionPresentation, presentationLayer, reducedMotion, toggleBattleMotion } from './battle-presentation.js'
import { battlePortrait } from './battle-skill-presentation.js'
import { statusDescriptions, statusVisuals } from './battle-status.js'
import { connectRoom, enterRoom, forgetRoom, inviteUrl, invitedRoom, onlineAvailable, rememberRoom, savedRoom } from './online.js'
import { escapeText as escape, handleTermLink, termDetails, termLink, termText } from './card-terms.js'
import { relatedPreview } from './card-related.js'
import { fortuneStatus } from './fortune-status.js'
import { isLobbyCode, normalizeRoomId, visibleLobbyCode } from '../../packages/online-match/lobby.js'
import { arenaCpuLevel, autoDraft, draftAction, rarityLabels } from '../../packages/arena/index.js'
import { arenaDetails, arenaDraftScreen, arenaMenu, arenaSeed, createArenaStore, localDraftView } from './arena.js'
import { battleOpening, openingTiming } from './battle-opening.js'
import { preloadBattleVfx } from './battle-vfx.js'
import { createBattleHistory, renderBattleLog, renderRecentHistory } from './battle-history.js'
import { createMusicLibrary } from './music-library.js'
import { createPlayerProfile } from './player-profile.js'
import { menuHome, menuPreparation, menuSearch, menuShell } from './menu-ui.js'
import { depthEnabled, depthPreviewAvailable, standingUnit, toggleBattleDepth } from './battle-depth.js'
import { showEmblemGuide, showEmblemInfo } from './battle-emblems.js'

const app = document.querySelector('#app')
const announcer = document.querySelector('#announcer')
const art = id => globalThis.fairytaleImages?.[id + '.webp'] ?? new URL('./assets/' + id + '.webp', import.meta.url).href
const seatName = seat => seat === (view?.firstSeat ?? 0) ? '先攻' : '後攻'
const drawFirstSeat = () => crypto.getRandomValues(new Uint8Array(1))[0] & 1
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
const battleHistory = createBattleHistory()
const musicLibrary = createMusicLibrary({ art, volume: () => battleAudio.volume('bgm'),
  setVolume: value => battleAudio.setVolume('bgm', value),
  onOpen: () => battleAudio.setScene('off'), onClose: () => syncBattleMusic() })
const arenaStore = createArenaStore(deckStorage)
const playerProfile = createPlayerProfile(deckStorage)
let onlineMatch = null
let roomPlayerNames = null
let searching = false
let searchTimer = null
let profileBusy = false
let showProfile = false
let pickerOpen = false
let menuPage = new URLSearchParams(location.search).has('room') ? 'battle' : 'home'
let searchSince = Date.now()
let showArena = null
let arenaChoice = null
let arenaBattle = false
let roomArena = null

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
let roomLobbyState = null
let roomResult = null
let lobbyInput = ''
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
let opening = null
const openingSeen = new Set()
const openingTimers = new Set()
let presentationTimer = null
let handPress = null
let ignoreCardClickUntil = 0
let animatedView = null
let turnNotice = null
let previewDemo = false

const solo = () => mode === 'cpu'
const publicMatch = () => ['ranked', 'free'].includes(mode)
const inMatch = () => match || room
const cpuTurn = () => solo() && view?.phase === 'battle' && view.active === 1
const waitingForFriend = () => room && (view?.decisionSeat ?? view?.active) !== roomSeat
const roomLocked = () => room && (roomBusy || roomConnection !== 'connected' || waitingForFriend())
const cardInspectionOnly = () => view?.phase === 'battle' &&
  (presentation || roomLocked() || view.active !== battleSeat() || !view.legal)
const turnNoticeMs = 1700

function portrait(id) {
  return '<img class="portrait" src="' + art(id) + '" alt="">'
}

function colors(leader) {
  return ' style="--class:' + leader.color + ';--trim:' + leader.accent + '"'
}

function audioControls(open) {
  return `<section class="audio-mixer" id="audio-mixer" aria-label="音量設定"${open ? '' : ' hidden'}>
    ${[['bgm', 'BGM'], ['se', '効果音']].map(([channel, label]) => {
      const value = battleAudio.volume(channel)
      return `<div class="audio-channel">
        <label for="volume-${channel}">${label}</label><output for="volume-${channel}" data-volume-value="${channel}">${value}%</output>
        <input id="volume-${channel}" data-volume="${channel}" type="range" min="0" max="100" value="${value}">
      </div>`
    }).join('')}
  </section>`
}

function titlebar(mixerOpen) {
  return `<header class="topbar${!view ? ' menu-topbar' : ''}"><div class="brand"><span class="brand-mark" aria-hidden="true">✦</span>
    <span>童話戦記<small>PROJECT FAIRYTALE RIVALS</small></span></div>
    ${!view ? `<button class="profile-chip" data-op="profile" ${room || searching ? 'disabled' : ''}><img src="${art(selectedLeaders[0])}" alt=""><span>${escape(playerProfile.profile?.name ?? '名前を設定')}<small>${playerProfile.profile ? playerProfile.profile.rank + ' · ' + playerProfile.profile.rating + ' RP' : 'ゲストプレイヤー'}</small></span><b aria-hidden="true">✎</b></button>` : ''}
    <div class="top-actions"><span class="local-label">${showArena || arenaBattle || roomArena ? '物語の闘技場' : { cpu: 'CPU対戦', local: 'ローカル対戦', friend: 'フレンド対戦', ranked: 'ランクマッチ', free: 'フリーマッチ' }[mode]}</span>
      <button type="button" data-op="sound" class="icon-button sound-button" aria-pressed="${battleAudio.enabled}">効果音</button>
      <button type="button" data-op="audio-mixer" class="icon-button" aria-expanded="${Boolean(mixerOpen)}" aria-controls="audio-mixer">音量</button>
      <button type="button" data-op="rules" class="icon-button">ルール</button>
      ${depthPreviewAvailable && !room ? `<button class="icon-button" data-op="preview-demo" ${searching || roomBusy ? 'disabled' : ''}>${previewDemo ? '試遊盤面をリセット' : '試遊盤面を開く'}</button>` : ''}
      ${onlineMatch && view?.phase !== 'finished' ? '<span class="online-clock" role="timer" aria-label="操作の残り時間"></span>' : ''}
      ${!inMatch() ? `<button type="button" data-op="music" class="icon-button" ${searching ? 'disabled' : ''}>音楽室 ♪</button>` : ''}
      ${inMatch() ? `<button type="button" data-op="home" class="icon-button">${arenaBattle ? '保存して中断' : 'タイトル'}</button>` : ''}
    </div>${audioControls(mixerOpen)}</header>`
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

function chooseLeader(seat, locked = false) {
  const id = selectedLeaders[seat]
  const leader = leaders[id]
  const deck = mode !== 'local' && starterDecks[id]
  const decks = availableDecks(seat)
  const custom = chosenDeck(seat, decks)
  const label = mode === 'friend' || publicMatch() || (solo() && seat === 0) ? 'あなた' : solo() ? 'CPU' : seatName(seat)
  return `<div class="lineup"${colors(leader)}>
    <div class="lineup-portrait">${portrait(id)}<span class="crest" aria-hidden="true">${leader.sigil}</span></div>
    <div class="lineup-body">
      <label for="leader-${seat}">${label}の語り手</label>
      <select id="leader-${seat}" data-seat="${seat}"${locked ? ' disabled' : ''}>
        ${classIds.map(key => `<option value="${key}" ${id === key ? 'selected' : ''}>${leaders[key].name} · ${leaders[key].job}</option>`).join('')}
      </select>
      ${decks.length ? `<label class="lineup-deck" for="match-deck-${seat}">使用するデッキ</label>
        <select id="match-deck-${seat}" data-match-deck="${seat}"${locked ? ' disabled' : ''}>
          <option value="" ${custom ? '' : 'selected'}>${deck ? '構築済み · ' + deck.name : '基本デッキ'}</option>
          ${decks.map(item => `<option value="${item.id}" ${item.id === custom?.id ? 'selected' : ''}>${escape(item.name)}</option>`).join('')}
        </select>` : `<small title="${deck ? deck.summary : leader.strategy}">${deck ? deck.name + ' · ' + leader.strategy : leader.strategy}</small>`}
    </div>
    </div>`
}

function selectedMenuDeck() {
  const leader = selectedLeaders[0]
  const custom = chosenDeck(0)
  return custom ?? { name: mode === 'local' ? '基本デッキ' : starterDecks[leader]?.name ?? '基本デッキ', ...battleLineup(0) }
}

function home() {
  const props = { art, leader: selectedLeaders[0], deck: selectedMenuDeck(), profile: playerProfile.profile, feedback }
  if (searching) return menuSearch({ ...props, mode, since: searchSince })
  if (menuPage === 'home' && !invite) return menuHome(props)
  const friend = mode === 'friend'
  const legacyInvite = invite && !isLobbyCode(invite)
  const ready = !(friend || publicMatch()) || onlineAvailable()
  const friendJoin = !invite ? `<form class="lobby-join" id="lobby-join"><label for="lobby-id-input">ロビーIDで合流</label>
    <div class="invite-share"><input id="lobby-id-input" name="lobby" placeholder="XXXX-XXXX" value="${escape(lobbyInput)}" maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false" required>
    <button type="submit" class="secondary" ${!ready || roomBusy ? 'disabled' : ''}>ロビーIDで参加</button></div></form>` : ''
  return menuPreparation({ ...props, mode, chooseLeader, ready, busy: roomBusy || profileBusy, friendJoin, legacyInvite, pickerOpen,
    startLabel: publicMatch() ? '対戦相手を探す' : friend ? invite ? legacyInvite ? '対戦に参加' : 'ロビーに参加' : 'ロビーを作る' : solo() ? 'CPUと対戦する' : '対戦を始める' })
}

function roomLobby() {
  const closed = roomConnection === 'closed', lobby = !closed && roomLobbyState
  const ownRole = lobby?.role ?? 'host', host = ownRole === 'host', mine = lobby?.[ownRole]
  const locked = roomBusy || roomConnection !== 'connected'
  const status = closed ? 'このロビーは閉じられました。' : !lobby?.guest.joined ? 'ロビーIDを伝えて、友達を招待しましょう。' : lobby.host.ready && lobby.guest.ready ? '二人の準備ができました。対戦を始めましょう。' : 'デッキを選び、準備OKを押してください。'
  const member = role => {
    const own = role === ownRole, data = lobby?.[role] ?? { joined: own, ready: false }
    const leaderId = own && !data.ready ? selectedLeaders[0] : data.leader
    const leader = leaders[leaderId]
    return `<section class="lobby-member lobby-station" ${lobby ? 'data-lobby-member' : 'data-connecting-member'}="${role}" data-ready="${data.ready}">
      <div class="lobby-station-art">${leader ? `<img src="${art(leaderId)}" alt="${leader.name}">` : '<span class="empty-player" aria-hidden="true">✧</span>'}</div>
      <div class="lobby-station-body"><small class="menu-eyebrow">${own ? 'YOU' : 'FRIEND'}</small><h2>${escape(data.name ?? (own ? playerProfile.profile?.name ?? 'あなた' : data.joined ? 'フレンド' : '参加を待っています'))}</h2>
      <p>${own ? 'あなた' : data.joined ? 'フレンド' : 'ロビーIDで合流できます'}</p>${leader ? `<p>${leader.sigil} ${leader.job}</p>` : ''}
      ${own && !roomArena ? `<p class="lobby-deck-name">${escape(selectedMenuDeck().name)}</p>` : ''}
      <span class="lobby-ready-badge">${data.joined ? data.ready ? '✓ 準備OK' : roomArena ? `ピック ${data.picked ?? 0} / 30` : 'デッキ選択中' : '参加待ち'}</span>
      ${own && lobby && !roomArena ? `<details class="lineup-picker" ${pickerOpen ? 'open' : ''}><summary>デッキを変更</summary>${chooseLeader(0, data.ready || locked)}</details>` : ''}</div></section>`
  }
  return menuShell(`<section class="friend-room room-lobby"><header class="menu-page-heading"><div><small class="menu-eyebrow">FRIEND LOBBY</small><h1>${roomArena ? 'フレンド闘技場' : 'フレンドロビー'}</h1></div><button class="secondary" data-op="home" ${roomBusy ? 'disabled' : ''}>${closed ? 'ホームへ' : '退出'}</button></header>
    ${closed ? '' : `<div class="room-sharing">${isLobbyCode(room.id) ? `<div class="invite-share lobby-code"><label for="lobby-id">ロビーID</label><input id="lobby-id" value="${visibleLobbyCode(room.id)}" readonly><button class="secondary" data-op="copy-lobby-id">コピー</button></div>` : ''}<button class="secondary" data-op="copy-invite">招待URLをコピー</button><details class="invite-url-details"><summary>招待URLを表示</summary><div class="invite-share"><input id="invite-url" value="${escape(inviteUrl(room.id))}" readonly aria-label="招待URL"></div></details></div><p class="room-copy-status" role="status"></p>`}
    <p class="room-status" role="status">${escape(feedback || (locked && !closed ? '対戦サーバーに接続しています…' : status))}</p>
    ${closed ? '' : `<div class="lobby-members">${member(ownRole)}<span class="lobby-versus" aria-hidden="true">VS</span>${member(host ? 'guest' : 'host')}</div>`}
    ${lobby && roomArena ? `<div class="arena-lobby-summary"><p>今回の配分：${Object.entries(roomArena.draft.allocation).map(([key,n])=>`${rarityLabels[key]} ${n}枚`).join(' · ')}</p><button class="secondary" data-op="arena-friend-pick" ${locked ? 'disabled' : ''}>${mine.complete ? 'ピックしたデッキを見る' : 'ピックを始める・続ける'}</button>${host ? `<button class="secondary" data-op="arena-reset" ${locked ? 'disabled' : ''}>二人のピックを作り直す</button>` : ''}</div>` : ''}
    ${lobby ? `<div class="lobby-actions"><button class="secondary lobby-ready-button" data-op="lobby-ready" ${locked || (roomArena && !mine.complete) ? 'disabled' : ''}>${mine.ready ? '準備を解除' : '準備OK'}</button>${host ? `<button class="primary menu-primary" data-op="lobby-start" ${locked || !lobby.host.ready || !lobby.guest.ready ? 'disabled' : ''}>対戦開始 <span aria-hidden="true">›</span></button>` : `<p>${mine.ready ? 'ホストの対戦開始を待っています。' : '準備ができたら、準備OKを押しましょう。'}</p>`}</div>` : ''}
  </section>`, 'battle', true)
}

function profileModal() {
  if (!showProfile) return ''
  return `<dialog class="menu-dialog" id="profile-dialog" aria-labelledby="profile-title"><div class="menu-dialog-heading"><div><small class="menu-eyebrow">PLAYER PROFILE</small><h2 id="profile-title">${playerProfile.registered ? 'プロフィール' : '名前を決めよう'}</h2></div><button class="secondary" data-op="close-profile" aria-label="閉じる" ${profileBusy ? 'disabled' : ''}>×</button></div>
    <p>あなたの名前で、新しい物語を始めましょう。</p><form id="player-name-form"><label for="player-name">プレイヤー名</label><div class="invite-share"><input id="player-name" name="name" value="${escape(playerProfile.profile?.name ?? '')}" maxlength="40" placeholder="20文字まで" required ${profileBusy ? 'disabled' : ''}><button class="primary" ${profileBusy ? 'disabled' : ''}>${profileBusy ? '保存中…' : '保存する'}</button></div></form>
    <p class="menu-feedback" role="status">${escape(feedback)}</p><small>名前を変えても保存済みデッキ・ランクは引き継がれます。成績はこのブラウザーの認証情報で管理します。</small></dialog>`
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

function flashes(target, events, id) {
  const summon = events.some(event => event.type === 'summon' && event.id === id)
  const hit = events.filter(event => event.type === 'damage' && sameTarget(event.target, target))
  const heal = events.filter(event => event.type === 'heal' && sameTarget(event.target, target))
  const amount = hit.reduce((sum, event) => sum + event.value, 0)
  const restored = heal.reduce((sum, event) => sum + event.value, 0)
  return {
    cls: [summon && 'arrival', amount && 'hit', restored && 'heal'].filter(Boolean).join(' '),
    label: amount ? `<span class="delta">−${amount}</span>` : restored ? `<span class="delta good">+${restored}</span>` : '',
  }
}

function leaderPanel(seat, enemy, events) {
  const player = view.players[seat]
  const leader = leaders[player.leader]
  const weapon = player.weapon
  const weaponName = weapon ? cards[weapon.card].name : ''
  const target = leaderTarget(seat)
  const flash = flashes(target, events)
  const status = statusVisuals(view, animatedView, seat, null, null, events, depthEnabled())
  const awakened = player.awakenedLeader && events.length > 0 && !animatedView?.players[seat].awakenedLeader
  const current = status.labels
  const ready = !enemy && view.legal?.leaderAttack.enabled
  const skill = player.skill ?? leader.skill
  const fortune = fortuneStatus(player)
  return `<aside class="leader-panel ${enemy ? 'opponent' : ''} ${seat === view.active ? 'active-side' : ''}" data-side="${seat}"${colors(leader)}>
    <button class="leader-target ${targetEnabled(target) ? 'targetable' : ''} ${ready ? 'ready' : ''} ${selected?.type === 'leaderAttack' && seat === view.active ? 'chosen' : ''} ${flash.cls} ${status.cls}${awakened ? ' leader-awakening' : ''}"
      data-leader="${seat}" aria-label="${seatName(seat)}リーダー ${leader.name}${player.awakenedLeader ? '（覚醒）' : ''} HP ${Math.max(0, player.hp)}${weapon ? ' 武器耐久 ' + weapon.durability : ''}${ready ? ' 攻撃可能' : ''}${current.length ? ' · ' + current.join('・') : ''}"
      title="${ready ? 'クリックしてリーダーで攻撃' : leader.motif}">
      ${portrait(battlePortrait(player))}<span class="crest" aria-hidden="true">${leader.sigil}</span>
      ${player.leaderPower > 0 || weapon ? `<span class="leader-combat-stats">
        <span class="leader-power">⚔ ${player.leaderPower}</span>
        ${weapon ? `<span class="leader-durability" data-inspect-weapon="${seat}" title="${escape(weaponName)}">耐久 ${weapon.durability}</span>` : ''}
      </span>` : ''}
      <span class="leader-hp">${Math.max(0, player.hp)}</span>${flash.label}${status.markup}
    </button>
    <div class="leader-identity"><small>${escape(roomPlayerNames?.[seat] ?? (enemy ? (solo() ? 'CPU' : '相手') : playerProfile.profile?.name ?? 'あなた'))} · ${seatName(seat)} · ${leader.job}</small><strong>${leader.name}</strong></div>
    ${arenaBattle && enemy && arenaStore.run.match?.config.arenaCpu ? `<small class="arena-cpu-badge" data-arena-cpu-level>CPU Lv.${arenaStore.run.match.config.arenaCpu.level} · ${arenaStore.run.match.config.arenaCpu.label}</small>` : ''}
    ${enemy ? `<button class="opponent-skill" type="button" data-inspect-skill="${seat}" aria-haspopup="dialog">
      <small>奥義</small><strong>${escape(skill.name)}</strong></button>` : ''}
    <div class="resources">
      <span data-mp="${seat}" title="現在のMP（このターン限りの追加分を含む）と最大MP"><b class="mp-icon">MP</b> <strong>${player.mp}/${player.maxMp}</strong></span>
      <span data-draw-pile="${seat}" title="山札の残り"><i aria-hidden="true">▤</i> 山札 <strong>${player.deckCount}</strong></span>
      ${weapon ? `<button type="button" class="equipped-weapon" data-inspect-weapon="${seat}"
        aria-label="${escape(weaponName)}の詳細">${escape(weaponName)}</button>` : ''}
      ${enemy ? `<span data-hand-count="${seat}" title="相手の手札枚数">手札 <strong>${player.handCount}</strong></span>` : ''}
    </div>
    <div class="tension ${events.some(event => event.type === 'focus' && event.seat === seat) ? 'glow' : ''}">
      <span title="${names.TENSION}">熱量</span>
      <div class="diamonds" aria-label="熱量 ${player.tension}/3">${[1, 2, 3].map(i => `<i class="${i <= player.tension ? 'filled' : ''}"></i>`).join('')}</div>
    </div>
    ${fortune ? `<div class="fortune-badge" data-fortune-state="${fortune.state}">
      ${termLink(fortune.term)}<small>${fortune.duration}</small></div>` : ''}
    ${player.badges?.length ? `<button class="story-badge-summary" type="button" data-inspect-badges="${seat}" aria-haspopup="dialog">✦ 物語の刻印 <strong>${player.badges.length}</strong></button>` : ''}
  </aside>`
}

function square(seat, row, column, events) {
  const position = { row, column }
  const unit = view.players[seat].units.find(value => samePosition(value.position, position))
  const inspectionOnly = cardInspectionOnly()
  const ready = unit && !inspectionOnly && view.legal?.attack[unit.id]?.enabled
  const chosenPosition = seat === (selected?.position?.seat ?? selected?.legal.positionSeat ?? view.active)
    && samePosition(selected?.position, position)
  const playable = placementAt(seat, position)
  const stage = view.players[seat].terrain?.[terrainKey(position)]
  const stageLabel = stage && terrainName(stage)
  const death = events.findLast(event => (event.type === 'death' || event.type === 'exile')
    && event.seat === seat && samePosition(event.position, { row, column }))
  const target = unit && unitTarget(unit.id)
  const flash = unit || death ? flashes(target ?? unitTarget(death.id), events, unit?.id) : { cls: '', label: '' }
  const card = unit && cards[unit.card]
  const display = unit && statusVisuals(view, animatedView, seat, unit, card, events, depthEnabled())
  const index = column + 1
  const activeStatuses = display?.labels ?? []
  const classes = [unit ? 'occupied' : 'empty', ready && 'ready', playable && 'targetable', chosenPosition && 'chosen',
    target && targetEnabled(target) && 'targetable', selected?.id === unit?.id && unit && 'chosen', !unit && death && 'departure', flash.cls, display?.cls]
  const attack = unit && (view.players[seat].boardAttack?.[unit.id] ?? unit.attack)
  const label = seatName(seat) + ' ' + rowName(row) + ' ' + index + (unit ? ' ' + card.name + ' ' + attack + '/' + unit.hp : ' 空き') +
    (ready ? ' 攻撃可能' : '') + (activeStatuses.length ? ' · ' + activeStatuses.join('・') : '')
  const tooltip = unit ? card.name + '｜' + card.description : label
  return `<button class="slot ${classes.filter(Boolean).join(' ')}" data-slot="${seat}:${row}:${column}"
    ${stageLabel ? `data-terrain="${stage}"` : ''}
    ${unit ? `data-unit="${unit.id}" data-card="${unit.card}" style="--unit-lane:${column}" draggable="${Boolean(ready)}" aria-keyshortcuts="I"
      ${inspectionOnly ? 'aria-haspopup="dialog"' : ''}` : ''}
    aria-label="${label}${stageLabel ? ' · ' + stageLabel : ''}" title="${escape(tooltip + (stageLabel ? '｜' + stageLabel + ' · ' + (terrainText[stage] ?? '六色で特殊勝利') : ''))}">
    ${unit ? `${depthEnabled() ? standingUnit(card,art,seat !== battleSeat(),unit.id) : `<img src="${art(card.artId)}" alt="">`}<span class="board-name">${card.name}</span>${display.markup}
      ${ready ? '<span class="ready-mark" aria-label="攻撃可能">⚔</span>' : ''}
      <span class="unit-stats"><span class="${attack !== card.attack ? 'changed-stat' : ''}" title="攻撃力">${attack}</span><span class="${unit.hp < unit.maxHp ? 'wounded-stat' : ''}" title="HP">${unit.hp}</span></span>` :
      stageLabel ? '' : `<span class="empty-symbol" aria-hidden="true">${playable ? '+' : '◇'}</span>`}${flash.label}
    ${stageLabel ? `<span class="slot-stage" aria-hidden="true">${stageLabel}</span>` : ''}
  </button>`
}

function field(seat, enemy, events) {
  const rows = enemy ? ['front', 'back'] : ['back', 'front']
  return `<div class="formation ${enemy ? 'enemy-formation' : 'ally-formation'}" aria-label="${enemy ? '相手' : '味方'}の盤面">
    ${rows.map(row => `<div class="formation-rank" data-rank="${row}"><span class="row-tag">${rowName(row)}</span>
      ${[0, 1, 2].map(column => square(seat, row, column, events)).join('')}</div>`).join('')}
  </div>`
}

function hand(player) {
  const total = player.hand.length
  const inspectionOnly = cardInspectionOnly()
  return `<div class="hand" aria-label="あなたの手札" style="--total:${total}">
    ${player.hand.map((instance, index) => {
      const card = cards[instance.card]
      const legal = view.legal?.play[instance.id]
      const cost = view.legal?.play[instance.id]?.cost ?? cardCost(instance, player.skillUses)
      const offset = index - (total - 1) / 2
      return `<button class="hand-card ${selected?.id === instance.id ? 'chosen' : ''} ${legal && !legal.enabled ? 'unaffordable' : ''}"
        style="--tilt:${offset * 2.5}deg;--drop:${Math.abs(offset) * 3}px"
        data-hand="${instance.id}" data-card="${card.id}" data-cost="${cost}" data-rarity="${card.rarity ?? 'unlabeled'}" aria-keyshortcuts="I"
        draggable="${Boolean(!inspectionOnly && legal?.enabled)}" ${inspectionOnly ? 'aria-haspopup="dialog"' : ''}
        aria-label="${escape(card.name)} MP ${cost}" title="${escape((!inspectionOnly && legal?.reason) || card.description)}">${cardFace(card, false, cost)}</button>`
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
    ${row.group ? `<small class="power-group">${termText(row.group)}</small>` : ''}
    <span>${escape(row.label)}</span> <strong>${powerFormula(row)}</strong>
    ${row.modifiers.length ? `<small class="power-sources">${row.modifiers.map(modifier =>
      termText(modifier.label) + ' ' + signedModifier(modifier.amount)).join(' ／ ')}</small>` : ''}
  </li>`).join('')}</ul>` : ''
}

function cardPower(card, { node, cost, action } = {}) {
  const unitId = Number(node?.dataset.unit ?? (action?.type === 'attack' ? action.id : undefined))
  const equipped = view.players[Number(node?.dataset.inspectWeapon)]?.weapon
  const source = equipped ?? view.players.flatMap(player => player.units).find(unit => unit.id === unitId)
  const handInstance = Number(node?.dataset.hand ?? node?.dataset.replace ?? (action?.type === 'play' ? action.id : undefined))
  const choice = action ?? (selected?.id === handInstance ? selected : undefined)
  return definitionPowerRows(view, source?.owner ?? battleSeat(), card, {
    source, cost, handInstance, choice: choice?.choice, chosen: choice?.target,
  })
}

function skillTarget(skill) {
  if (skill.place?.side === 'enemy') return '指定した敵の前衛か後衛と、敵リーダー'
  if (skill.target === 'enemy') return '敵リーダーか敵ユニット1体'
  if (skill.effects.some(effect => effect.to === 'allies')) return '味方リーダーと味方ユニット全員'
  if (skill.effects.some(effect => effect.id === 'summon')) return '味方陣の空きマス'
  if (skill.effects.some(effect => effect.id === 'fourth' && effect.operation === 'mummy')) return '味方陣の空きマス'
  if (skill.effects.some(effect => effect.id === 'leaderPower')) return '味方リーダー'
  return '自分の手札'
}

function skillDetail(seat, target, labelled = false) {
  const player = view.players[seat]
  const skill = player.skill ?? leaders[player.leader].skill
  const options = selected?.type === 'skill' && seat === battleSeat() ? selected : null
  const numbers = definitionPowerRows(view, seat, skill, { skill: true, chosen: target ?? options?.target, choice: options?.choice })
  if (player.leaderPower) numbers.push({ label: 'リーダーの攻撃力', ...leaderAttackBreakdown(view, seat) })
  const current = statusDescriptions(player, view)
  return `<div class="inspector-copy">
    <small>${escape(leaders[player.leader].name)} · ${names.TENSION_SKILL}</small>
    <h2${labelled ? ' id="battle-card-title"' : ''}>${escape(skill.name)}</h2><p class="inspector-effect">${termText(skill.description)}</p>
    <small class="skill-target-label">対象 · ${skillTarget(skill)}</small>
    ${powerDetails(numbers)}
    ${current.length ? `<p class="inspector-effect">${current.map(termText).join('・')}</p>` : ''}
    ${relatedPreview(skill, art)}
  </div>`
}

function cardDetail(card, cost = card.cost, node, action) {
  const type = { unit: 'ユニット', spell: '特技', weapon: '武器' }[card.kind]
  const weapon = view.players[Number(node?.dataset.inspectWeapon)]?.weapon
  const stats = card.kind === 'spell' ? '' : `<span class="inspector-stat">攻撃力 ${weapon?.attack ?? card.attack}</span>
    <span class="inspector-stat">${card.kind === 'unit' ? 'HP' : '耐久'} ${weapon?.durability ?? card.hp}</span>`
  const unitId = Number(node?.dataset.unit)
  const unit = node?.dataset.unit && view.players.flatMap(player => player.units).find(unit => unit.id === unitId)
  const keys = [...new Set([...card.keywords, ...(unit?.grants ?? [])])]
  const current = node ? liveCardDetails(node) : []
  const power = cardPower(card, { node, cost, action })
  return `<article class="inspector-card">
    <div class="inspector-art"><img src="${art(card.artId)}" alt=""></div>
    <div class="inspector-copy">
      <h2>${escape(card.name)}</h2>
      <small>${card.classId === 'neutral' ? '共通' : leaders[card.classId].job} · ${type}${card.species ? ' · ' + escape(card.species) : ''}${familyNames[card.family] ? ' · ' + familyNames[card.family] : ''} · ${escape(sourceLabels[card.packId] ?? '')}</small>
      <div class="inspector-stats"><span class="inspector-stat inspector-cost">${cost} MP</span>${stats}</div>
      <p class="inspector-effect">${termText(card.description || '効果なし')}</p>
      ${powerDetails(power)}
      ${keys.map(id => termDetails[id] ? `<div class="inspector-keyword"><strong>${termLink(id)}</strong><span>${termDetails[id]}</span></div>` : '').join('')}
      ${current.length ? `<ul class="inspector-current">${current.map(line => '<li>' + termText(line) + '</li>').join('')}</ul>` : ''}
      ${relatedPreview(card, art)}
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
  return `<aside class="detail-panel" id="detail" tabindex="-1" aria-label="カードと奥義の詳細"${selected ? ' data-inspecting="true"' : ''}>${defaultDetail()}</aside>`
}

function badgeDetails(seat, labelled = false) {
  const badges = view.players[seat].badges ?? []
  const counts = new Map()
  for (const badge of badges) counts.set(badge.card, (counts.get(badge.card) ?? 0) + 1)
  return `<div class="inspector-copy"><h2${labelled ? ' id="battle-card-title"' : ''}>物語の刻印 · ${badges.length}</h2>
    <p>${termText('発動元が場を離れても続く、物語の刻印です。同じ刻印は重複します。')}</p>
    ${[...counts].map(([id, count]) => `<article class="active-story-badge"><img src="${art(cards[id].artId)}" alt=""><div><strong>${escape(cards[id].name)} ×${count}</strong><p>${termText(cards[id].description)}</p></div></article>`).join('')}</div>`
}

const logCard = event => battleHistory.card(event)
const historyOptions = () => ({ art, ownSeat: room ? roomSeat : solo() ? 0 : null, firstSeat: view.firstSeat ?? 0 })

function recentHistory() {
  return renderRecentHistory(battleHistory.turns(view), { ...historyOptions(), open: app.querySelector('.recent-history')?.open })
}

function battleLog() {
  const previous = app.querySelector('.battle-log')
  const turnState = new Map([...previous?.querySelectorAll('[data-log-turn]') ?? []].map(node => [node.dataset.logTurn, node.open]))
  const expandedActions = new Set([...previous?.querySelectorAll('[data-log-action][open]') ?? []].map(node => node.dataset.logAction))
  return renderBattleLog(battleHistory.turns(view), { ...historyOptions(), open: previous?.open, turnState, expandedActions })
}

function openCardDetail(card, cost, focusBack, details = [], power = []) {
  openBattleDetail(`<div class="log-card-preview">
    <img src="${art(card.artId)}" alt="">
    <div class="log-card-description"><h2 id="battle-card-title">${escape(card.name)}</h2>
      <span>MP ${cost ?? card.cost}</span>
      <p>${termText(card.description)}</p>
      ${powerDetails(power)}
      ${details.length ? '<ul class="card-current-stats">' + details.map(line => '<li>' + termText(line) + '</li>').join('') + '</ul>' : ''}
      ${relatedPreview(card, art)}</div>
    </div>`, focusBack)
}

function openBattleDetail(content, focusBack) {
  if (document.querySelector('.battle-card-dialog[open]')) return
  const dialog = document.createElement('dialog')
  dialog.className = 'battle-card-dialog'
  dialog.setAttribute('aria-labelledby', 'battle-card-title')
  dialog.innerHTML = content + '<form method="dialog" class="detail-dialog-actions"><button class="secondary" autofocus>閉じる</button></form>'
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
  const event = battleHistory.event(seq)
  if (!event) return
  for (const anchor of [event.source, event.destination ?? (event.position ? event : event.target)]) {
    if (anchor?.position) {
      const { seat, position, id } = anchor
      const node = app.querySelector(`[data-slot="${seat}:${position.row}:${position.column}"]`)
      if (node && (id === undefined || !node.dataset.unit || node.dataset.unit === String(id))) node.classList.add('log-location')
    } else if (anchor?.kind === 'leader') app.querySelector(`[data-leader="${anchor.seat}"]`)?.classList.add('log-location')
  }
}

function inspectLogCard(seq, origin) {
  const event = battleHistory.event(seq)
  const card = logCard(event)
  highlightLogEvent(seq)
  if (!card) return
  openCardDetail(card, event.cost, () => origin?.isConnected ? origin :
    [...app.querySelectorAll(`[data-log-event="${seq}"]`)].find(node => node.getClientRects().length) ?? app.querySelector('.battle-log summary'))
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
  const states = unit.statuses.filter(id => id !== 'INVULNERABLE').map(id => names[id]).filter(Boolean)
  return [
    '攻撃力 ' + attack + (attack !== card.attack ? '（基本 ' + card.attack + '）' : ''),
    'HP ' + unit.hp + '/' + unit.maxHp + (unit.maxHp !== card.hp ? '（基本最大HP ' + card.hp + '）' : ''),
    ...(stage ? [terrainName(stage) + ' · ' + (terrainText[stage] ?? '六色で特殊勝利')] : []),
    ...statusDescriptions(unit, view, card),
    ...(states.length ? [states.join('・')] : []),
  ]
}

const inspectableCard = node => node?.closest?.('.battle [data-hand], .battle [data-unit], .mulligan [data-replace]')

function liveCardSelector({ dataset: { hand, replace, unit } }) {
  if (hand !== undefined) return `[data-hand="${hand}"]`
  if (replace !== undefined) return `[data-replace="${replace}"]`
  return `[data-unit="${unit}"]`
}

function inspectLiveCard(node) {
  if (!node?.isConnected || !view) return
  const card = cards[node.dataset.card]
  if (!card) return
  const selector = liveCardSelector(node)
  const { cost } = node.dataset
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
  if (!view || opening || animatedView === view) return
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
  const heat = events.findLast(event => event.type === 'focus')
  if (heat) battleAudio.play(heat.value >= 3 ? 'focus-ready' : 'focus-charge')
  const turn = events.findLast(event => event.type === 'turn')
  if (turn) {
    app.querySelector(`[data-mp="${turn.seat}"]`)?.classList.add('mp-refresh')
    app.querySelector(`[data-side="${turn.seat}"]`)?.classList.add('turn-arrival')
    const incoming = turn.seat === battleSeat()
    turnNotice = {
      incoming,
      text: room || solo() ? (incoming ? 'あなたのターン' : '相手のターン') : turn.text,
      startedAt: performance.now(),
    }
    battleAudio.play(incoming ? 'turn-in' : 'turn-out')
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

function renderTurnNotice() {
  if (view?.phase !== 'battle') turnNotice = null
  if (!turnNotice) return
  const elapsed = performance.now() - turnNotice.startedAt
  if (elapsed >= turnNoticeMs) return
  const anchor = app.querySelector('.board')
  if (!anchor) return
  const notice = document.createElement('span')
  notice.className = 'turn-notice'
  notice.dataset.direction = turnNotice.incoming ? 'incoming' : 'outgoing'
  notice.setAttribute('aria-hidden', 'true')
  notice.textContent = turnNotice.text
  notice.style.setProperty('--turn-notice-duration', turnNoticeMs + 'ms')
  notice.style.animationDelay = -elapsed + 'ms'
  notice.addEventListener('animationend', () => notice.remove(), { once: true })
  if (depthEnabled()) {
    const container = anchor.closest('.battle-grid')
    // Keep announcements flat and centered over the projected board, rather than tilting the text.
    container.append(notice)
    positionTurnNotice()
  } else anchor.append(notice)
}

function positionTurnNotice() {
  const container = app.querySelector('.battle-grid')
  const notice = container?.querySelector(':scope > .turn-notice')
  const board = container?.querySelector('.board')
  if (!notice || !board) return
  const bounds = board.getBoundingClientRect(), origin = container.getBoundingClientRect()
  notice.style.left = bounds.left + bounds.width / 2 - origin.left + 'px'
  notice.style.top = bounds.top + bounds.height / 2 - origin.top + 'px'
  notice.style.width = Math.min(bounds.width - 12,560) + 'px'
}
window.addEventListener('resize',positionTurnNotice)

function skillControls(own) {
  const player = view.players[own]
  const skill = player.skill ?? leaders[player.leader].skill
  const skillArt = art('action-skill-' + (player.awakenedLeader ? 'awakened' : player.leader))
  const focusCost = view.legal?.focus.cost ?? 1
  const locked = cardInspectionOnly()
  return `<div class="skill-controls">
      <button class="secondary battle-action focus-button" data-op="focus" ${!locked && view.legal?.focus.enabled ? '' : 'disabled'} title="${view.legal?.focus.reason ?? focusCost + 'MPを支払う'}">
        <img src="${art('action-focus')}" alt=""><span><strong>熱量をためる</strong><small>${focusCost} MP</small></span>
      </button>
      <button class="secondary battle-action skill-button" data-op="skill" ${!locked && view.legal?.skill.enabled ? '' : 'disabled'} aria-describedby="skill-description">
        <img src="${skillArt}" alt=""><span><small>${names.TENSION_SKILL}</small><strong>${escape(skill.name)}</strong></span>
      </button>
      <p class="skill-description" id="skill-description">${escape(skill.description)}</p>
  </div>`
}

function canEndTurn() {
  return view?.phase === 'battle' && view.active === battleSeat() && view.legal && view.decisionSeat == null &&
    !presentation && !roomLocked()
}

function requestEndTurn() {
  if (!canEndTurn()) return
  const { play, attack, leaderAttack, focus, skill } = view.legal
  const available = [
    Object.values(play).some(action => action.enabled) && '手札を使う',
    (leaderAttack.enabled || Object.values(attack).some(action => action.enabled)) && '攻撃',
    focus.enabled && '熱量をためる',
    skill.enabled && names.TENSION_SKILL,
  ].filter(Boolean)
  if (!available.length) {
    execute({ type: 'end' })
    return
  }
  const dialog = app.querySelector('#end-turn-dialog')
  dialog.querySelector('#end-turn-options').textContent = available.join('・')
  dialog.showModal()
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
  const events = animatedView === view ? [] : view.events.filter(event => event.seq > eventFloor)
  const latestAction = view.events.findLast(event => event.seq > eventFloor
    && event.privateTo === undefined && !['handAdded', 'mulligan', 'turn'].includes(event.type))
  return `<main class="battle${reducedMotion() ? ' short-motion' : ''}${depthEnabled() ? ' battle-depth' : ''}" style="--ally-light:${leaders[view.players[own].leader].accent};--enemy-light:${leaders[view.players[enemy].leader].accent}" tabindex="-1">
    <div class="battle-layout"><div class="battle-core">
    <div class="battle-heading"><span>${previewDemo ? 'ローカル試遊 · 両陣営を手動操作' : '綴りの大競技会'}</span><span class="turn-label">第 ${view.turn} ターン</span><div class="battle-tools"><button class="icon-button" data-op="depth" aria-pressed="${depthEnabled()}">立体盤面</button>${depthEnabled() ? '<button class="icon-button" data-op="emblem-guide">効果マーク</button>' : ''}<button class="icon-button" data-op="motion" aria-pressed="${reducedMotion()}" ${matchMedia('(prefers-reduced-motion: reduce)').matches ? 'disabled title="端末の設定に合わせて短縮しています"' : ''}>短い演出</button>${battleLog()}</div></div>
    <div class="battle-grid" data-active-side="${view.active === own ? 'ally' : 'enemy'}" aria-label="対戦盤面">
      ${leaderPanel(own, false, events)}
      <div class="board">
        ${field(own, false, events)}<div class="board-rule" aria-hidden="true">${[1, 2, 3].map(lane => `<span class="lane-mark">${lane}</span>`).join('')}</div>${field(enemy, true, events)}
      </div>
      ${leaderPanel(enemy, true, events)}
      ${presentationLayer(presentation, art, escape)}
    </div>
    <div class="battle-message"><span class="last-action">${latestAction && !selected && !feedback ? escape(latestAction.text) : ''}</span><output id="attack-preview" aria-live="polite"></output></div>
    <section class="tray">
      ${skillControls(own)}
      <div class="hand-zone">${selectionBar()}${hand(view.players[own])}</div>
      <div class="turn-controls">
        <button class="primary end" data-op="end" ${canEndTurn() ? '' : 'disabled'}>ターン終了 <span aria-hidden="true">›</span></button>
      </div>
    </section>
    </div>${recentHistory()}${detailPanel()}</div>
    <dialog id="end-turn-dialog" class="end-turn-dialog" role="alertdialog" aria-labelledby="end-turn-title"
      aria-describedby="end-turn-description end-turn-options">
      <h2 id="end-turn-title">まだ行動できます</h2>
      <p id="end-turn-options"></p>
      <p id="end-turn-description">ターンを終了しますか？</p>
      <form id="end-turn-form" method="dialog">
        <button class="secondary" value="cancel" autofocus>行動を続ける</button>
        <button class="primary" value="end">ターン終了</button>
      </form>
    </dialog>
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
  const locked = roomBusy || roomConnection !== 'connected'
  const status = feedback || (roomResult?.rematch ? '相手の再戦を待っています。' :
    roomResult?.opponentRematch ? '相手が再戦を希望しています。' : '')
  return `<main class="ceremony"><section class="modal result">
    ${winner ? portrait(battlePortrait(winner)) : '<div class="title-ornament" aria-hidden="true">✦</div>'}
    <p class="modal-kicker">対戦結果 · 第 ${view.turn} ターン</p><h1>${result}</h1>
    ${view.specialVictory !== undefined ? '<p>六彩の暁鳥の特殊勝利</p>' : ''}
    ${resigned !== null ? `<p>${resigned === roomSeat ? 'あなた' : '相手'}が対戦を終了しました。</p>` : ''}
    ${winner ? `<p>${leaders[winner.leader].name}</p>` : ''}
    ${onlineMatch ? `<p class="online-result">${onlineMatch.mode === 'ranked' ? onlineMatch.result ? `${escape(onlineMatch.result.rank)} · ${onlineMatch.result.rating} RP（${onlineMatch.result.change >= 0 ? '+' : ''}${onlineMatch.result.change}）` : 'ランク結果を確認中…' : 'フリーマッチ · ランク変動なし'}</p>` : ''}
    ${arenaBattle ? `<p class="arena-result-record">今回 ${arenaStore.run.wins} 勝 · 最高 ${arenaStore.best} 勝</p>
      <p>${arenaStore.run.ended ? '今回の挑戦は終了です。新しい物語に挑戦しましょう。' : draw ? '引き分けです。勝利数を保って次の対戦へ進めます。' : '同じピックデッキで次のCPUに挑戦できます。'}</p>
      ${!arenaStore.run.ended ? '<button class="primary" data-op="arena-next">次のCPUに挑む</button>' : ''}
      <button class="secondary" data-op="arena-battle-menu">闘技場へ戻る</button>
      <p class="arena-notice" role="status">${escape(arenaStore.issue)}</p>` : ''}
    ${decisivePlay()}
    <div class="result-hp">${view.players.map((p, i) => `<span>${seatName(i)} HP <b>${Math.max(p.hp, 0)}</b></span>`).join('')}</div>
    ${roomResult ? `<div class="result-actions">
      <button class="primary" data-op="rematch" ${locked || roomResult.rematch ? 'disabled' : ''}>再戦</button>
      <button class="secondary" data-op="return-lobby" ${locked ? 'disabled' : ''}>ロビーに戻る</button>
    </div>` : ''}
    ${room && status ? `<p class="room-status" role="status">${escape(status)}</p>` : ''}
    <div class="result-actions">${battleLog()}<button class="secondary" data-op="replay">対戦ログを保存</button>
      <button class="${roomResult ? 'secondary' : 'primary'}" data-op="home" ${roomBusy ? 'disabled' : ''}>タイトルへ</button></div>
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

function syncBattleMusic() {
  if (musicLibrary.isOpen) return battleAudio.setScene('off')
  if (!view || roomConnection === 'closed') return battleAudio.setScene(showArena || roomArena ? 'arena' : showDecks || showLibrary ? 'deck' : 'menu')
  if (opening?.stage === 'draw') return battleAudio.setScene('off')
  if (view.phase === 'mulligan') return battleAudio.setScene('battle', view.bgmId)
  if (view.phase === 'finished' && !presentation) {
    const seat = room ? roomSeat : solo() ? 0 : view.winner
    return battleAudio.setScene(view.winner === 'draw' ? 'draw' : view.winner === seat ? 'victory' : 'defeat')
  }
  battleAudio.setScene(view.players.some(player => player.hp <= 8) ? 'danger' : 'battle', view.bgmId)
}

function cancelOpening() {
  for (const timer of openingTimers) clearTimeout(timer)
  openingTimers.clear()
  opening = null
}

function ensureOpening() {
  if (!view || view.phase !== 'mulligan' || roomConnection === 'closed') { cancelOpening(); return }
  const id = view.matchId
  if (!id || opening?.id === id) return
  if (opening) cancelOpening()
  let seen = openingSeen.has(id)
  try { seen ||= sessionStorage.getItem('fairytale-opening.' + id) === 'seen' } catch { /* Optional storage. */ }
  if (seen) return
  openingSeen.add(id)
  try { sessionStorage.setItem('fairytale-opening.' + id, 'seen') } catch { /* Optional storage. */ }
  opening = { id, stage: 'draw', short: reducedMotion() }
  const timing = openingTiming(opening.short)
  battleAudio.play('opening-page')
  battleAudio.play('opening-suspense')
  const schedule = (callback, delay) => {
    const timer = setTimeout(() => { openingTimers.delete(timer); callback() }, delay)
    openingTimers.add(timer)
  }
  schedule(() => {
    if (opening?.id !== id || view?.matchId !== id) return
    opening.stage = 'result'
    render()
    battleAudio.play('opening-result')
    announcer.textContent = 'あなたは' + seatName(room ? roomSeat : 0) + 'です。'
  }, timing.reveal)
  schedule(() => {
    if (opening?.id !== id || view?.matchId !== id) return
    cancelOpening()
    render('[data-replace], [data-op="mulligan"]')
    scheduleCpu()
  }, timing.finish)
}

function render(focusOn = null) {
  if (view) battleHistory.update(view)
  ensureOpening()
  const scroll = app.querySelector('.events')?.scrollTop
  const oldLog = app.querySelector('.events')
  const anchor = scroll > 0 && [...oldLog.querySelectorAll('[data-history-action]')].find(node =>
    node.getBoundingClientRect().bottom > oldLog.getBoundingClientRect().top + 45)
  const anchorOffset = anchor && anchor.getBoundingClientRect().top - oldLog.getBoundingClientRect().top
  const mixerOpen = Boolean(app.querySelector('.audio-mixer:not([hidden])'))
  const volumeFocus = document.activeElement?.dataset.volume
  const arenaDraft = roomArena?.draft ?? (arenaStore.run ? localDraftView(arenaStore) : null)
  const surface = opening ? battleOpening(view, opening, room ? roomSeat : 0, art) : showArena === 'draft' && !view && arenaDraft ? arenaDraftScreen(arenaDraft, art, arenaChoice,
      feedback || (!room ? arenaStore.issue : ''), Boolean(room), Boolean(room && (roomBusy || roomConnection !== 'connected')))
    : !inMatch() ? (showArena === 'menu' ? arenaMenu(arenaStore, feedback) : showDecks ? deckEditor.view(art, escape) : showLibrary ? library(art) : home())
    : !view ? roomLobby() : view.phase === 'finished' && !presentation ? results() :
    view.phase === 'mulligan' ? mulligan() : battlefield()
  app.innerHTML = titlebar(mixerOpen) + surface + rulesModal() + profileModal()
  syncBattleMusic()
  if (lastInspection && !selected) {
    const node = app.querySelector(lastInspection)
    if (node) inspectNode(node)
  }
  if (presentation) positionPresentation(app, presentation)
  playResourceMotion()
  renderTurnNotice()
  const events = app.querySelector('.events')
  if (events && scroll) events.scrollTop = scroll
  if (events && anchor) {
    const preserved = events.querySelector(`[data-history-action="${anchor.dataset.historyAction}"]`)
    if (preserved) events.scrollTop += preserved.getBoundingClientRect().top - events.getBoundingClientRect().top - anchorOffset
  }
  if (showLibrary) refreshLibrary(app, art)
  if (showDecks) deckEditor.refresh(app, art)
  if (showProfile) {
    const dialog = app.querySelector('#profile-dialog')
    dialog.showModal()
    dialog.addEventListener('cancel', event => { event.preventDefault(); if (!profileBusy) { showProfile = false; feedback = ''; render('[data-op="profile"]') } })
  }
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
  } else if (mixerOpen && volumeFocus && !showRules) {
    app.querySelector(`[data-volume="${volumeFocus}"]`)?.focus({ preventScroll: true })
  }
}

function readView() {
  const publicView = match.view()
  return publicView.phase === 'finished' ? publicView : match.view(solo() ? 0 : publicView.active)
}

async function startDepthPreview() {
  if (!depthPreviewAvailable || room || searching || roomBusy) return
  cancelOpening()
  clearTimeout(cpuTimer)
  clearTimeout(presentationTimer)
  cpuTimer = presentationTimer = presentation = null
  try {
    const response = await fetch('/api/preview-match', { cache: 'no-store' })
    if (!response.ok) throw new Error('試遊盤面は npm run dev:preview で起動してください。')
    const { config, game } = await response.json()
    mode = 'local'
    previewDemo = true
    match = createLocalMatch(config,game)
    view = readView()
    showArena = null
    arenaBattle = false
    showLibrary = showDecks = showProfile = false
    selected = lastInspection = turnNotice = null
    animatedView = view
    replacements.clear()
    eventFloor = view.events.at(-1)?.seq ?? 0
    feedback = ''
    render('.battle')
  } catch (error) { feedback = error.message; render() }
}

function startArenaBattle() {
  const run = arenaStore.run
  if (!run || run.ended || run.draft.stage !== 'complete') return
  clearTimeout(cpuTimer)
  clearTimeout(presentationTimer)
  cpuTimer = presentationTimer = presentation = null
  mode = 'cpu'
  showArena = null
  arenaBattle = true
  if (run.match && !run.settled) match = createLocalMatch(run.match.config, run.match.game)
  else {
    const config = { seed: arenaSeed(), firstSeat: drawFirstSeat(), format: 'arena', arenaCpu: arenaCpuLevel(run.wins), lineups: [
      { leader: run.draft.leader, deck: [...run.draft.deck] },
      autoDraft(arenaSeed(), run.draft.schedule, run.wins),
    ] }
    match = createLocalMatch(config)
    run.settled = false
    arenaStore.saveMatch(match)
  }
  eventFloor = 0
  cpuMoves = 0
  selected = lastInspection = animatedView = null
  replacements.clear()
  feedback = ''
  view = readView()
  if (view.phase === 'mulligan' && view.active === 1) {
    match.act(1, chooseCpuAction(match.view(1), 1))
    arenaStore.saveMatch(match)
    view = readView()
  }
  render()
  scheduleCpu()
}

function handleArenaButton(node) {
  const { op, arenaChoice: choice, arenaInspect } = node.dataset
  if (choice !== undefined) {
    arenaChoice = choice
    render(`[data-arena-choice="${choice}"]`)
    return true
  }
  if (arenaInspect) {
    app.querySelector('#arena-card-detail').innerHTML = arenaDetails(arenaInspect, art)
    return true
  }
  if (!op?.startsWith('arena-')) return false
  switch (op) {
    case 'arena-open': showArena = 'menu'; feedback = ''; render(); break
    case 'arena-close': showArena = null; render(); break
    case 'arena-cpu-new':
      if (arenaStore.run && !arenaStore.run.ended && !window.confirm('現在の闘技場の挑戦を終了して、新しくピックしますか？')) break
      arenaStore.newRun()
      mode = 'cpu'
      arenaChoice = null
      showArena = 'draft'
      feedback = ''
      render()
      break
    case 'arena-resume':
      if (!arenaStore.run) break
      if (arenaStore.run.match) {
        if (arenaStore.run.settled) {
          arenaBattle = true
          mode = 'cpu'
          const saved = arenaStore.run.match
          match = createLocalMatch(saved.config, saved.game)
          view = readView()
          showArena = null
          render()
        } else startArenaBattle()
      } else { mode = 'cpu'; showArena = 'draft'; arenaChoice = null; feedback = ''; render() }
      break
    case 'arena-suspend': arenaStore.save(); showArena = 'menu'; render(); break
    case 'arena-friend-create': mode = 'friend'; startFriendMatch(null, true); break
    case 'arena-friend-pick': showArena = 'draft'; arenaChoice = null; render(); break
    case 'arena-lobby-back': showArena = null; render(); break
    case 'arena-reset':
      if (roomArena && !roomBusy && window.confirm('二人のピックを最初から作り直しますか？')) sendRoomAction({ type: 'arena-reset' })
      break
    case 'arena-confirm': {
      const draft = roomArena?.draft ?? (arenaStore.run ? localDraftView(arenaStore) : null)
      if (!draft || !draft.choices.includes(arenaChoice)) break
      const type = { class: 'arena-class', door: 'arena-door', card: 'arena-pick' }[draft.stage]
      if (!type) break
      const action = { type, choice: arenaChoice }
      if (room) { if (!roomBusy) { arenaChoice = null; sendRoomAction(action) } }
      else {
        draftAction(arenaStore.run.draft, action)
        arenaStore.save()
        arenaChoice = null
        render()
      }
      break
    }
    case 'arena-cpu-battle':
    case 'arena-next': startArenaBattle(); break
    case 'arena-battle-menu':
      arenaStore.saveMatch(match)
      returnHome()
      showArena = 'menu'
      render()
      break
  }
  return true
}

app.addEventListener('pointerover', event => {
  const node = event.target.closest('[data-arena-preview]')
  if (!node || node.contains(event.relatedTarget)) return
  const detail = app.querySelector('#arena-card-detail')
  if (detail) detail.innerHTML = arenaDetails(node.dataset.arenaPreview, art)
})
app.addEventListener('focusin', event => {
  const node = event.target.closest('[data-arena-preview]')
  const detail = app.querySelector('#arena-card-detail')
  if (node && detail) detail.innerHTML = arenaDetails(node.dataset.arenaPreview, art)
})

function scheduleCpu() {
  if (!cpuTurn() || presentation || opening || cpuTimer !== null) return
  const currentMatch = match
  cpuTimer = setTimeout(() => {
    cpuTimer = null
    if (currentMatch !== match || !cpuTurn()) return
    const action = cpuMoves++ < 36 ? chooseCpuAction(match.view(1), 1) : { type: 'end' }
    if (!execute(action ?? { type: 'end' }, 1) && action?.type !== 'end') execute({ type: 'end' }, 1)
  }, cpuMoves === 0 ? 340 : 250)
}

function showBattleImpact(scene) {
  const pan = positionBattleImpact(app, scene)
  if (scene.impactCue) battleAudio.play(scene.impactCue, pan)
  if (scene.strike?.legend && !scene.reduced && scene.impactCue !== 'guard') battleAudio.playLegendStrike(scene.strike.legend)
}

function finishAction(action, impact = null) {
  presentation = null
  presentationTimer = null
  const announcement = view.events.findLast(event => event.seq > eventFloor
    && event.privateTo === undefined && event.type !== 'handAdded')
  announcer.textContent = announcement?.text ?? ''
  if (view.phase === 'finished') render('.result [data-op="rematch"]:enabled, .result [data-op="return-lobby"]:enabled, .result [data-op="home"]')
  else if (view.phase === 'mulligan') render('[data-replace]')
  else render(!cpuTurn() && (action.type === 'end' || action.type === 'mulligan') ? '.battle' : null)
  if (impact) showBattleImpact(impact)
  scheduleCpu()
  const update = roomUpdates.shift()
  if (update) receiveRoom(update)
}

function playPresentation(scene, next, action) {
  function impact() {
    view = next
    if (scene.decisive) {
      presentation.beat = 'finish'
      render()
      showBattleImpact(scene)
      battleAudio.play(scene.phoenix ? 'phoenix' : 'finish')
      presentationTimer = setTimeout(() => finishAction(action), scene.finishMs)
    } else finishAction(action, scene)
  }
  function approach() {
    presentation.beat = 'approach'
    render()
    if (scene.strike && !scene.reduced) battleAudio.play('windup')
    presentationTimer = setTimeout(impact, scene.approachMs)
  }
  presentation = { scene, beat: 'reveal' }
  if (scene.revealMs) {
    render()
    if (scene.skill) battleAudio.playSkill(scene.skill.style)
    presentationTimer = setTimeout(approach, scene.revealMs)
  } else approach()
}

function presentAction(next, action, events, opponent) {
  if (['play', 'attack', 'leaderAttack', 'skill'].includes(action.type)) turnNotice = null
  battleHistory.mark(next.matchId, events, action, opponent ? 1 - battleSeat() : battleSeat())
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
  if (roomAction && !roomAction.lobby && update.version > roomAction.version) {
    roomAction = null
    roomBusy = false
  }
  roomVersion = update.version
  roomPlayerNames = update.players ?? null
  onlineMatch = update.online ?? onlineMatch
  if (onlineMatch?.result) {
    const { previous, change, ...profile } = onlineMatch.result
    try { playerProfile.accept(profile) } catch { feedback = '成績はサーバーに保存済みです。ブラウザーの保存容量を確認してください。' }
  }
  if (update.phase === 'closed') {
    roomLobbyState = null
    roomResult = null
    roomConnection = 'closed'
    feedback = '対戦部屋が閉じられました。'
    render()
    return
  }
  if (update.phase === 'lobby') {
    const previous = roomArena?.draft
    roomArena = update.arena ?? null
    if (JSON.stringify(previous?.choices) !== JSON.stringify(roomArena?.draft.choices)) arenaChoice = null
    const returned = view?.phase === 'finished'
    roomLobbyState = update.lobby
    roomResult = view = selected = lastInspection = animatedView = turnNotice = resigned = null
    eventFloor = 0
    replacements.clear()
    feedback = ''
    render(returned ? '[data-op="lobby-ready"]' : null)
    return
  }
  if (update.phase === 'waiting') {
    render('#invite-url')
    return
  }
  roomLobbyState = null
  showArena = null
  roomResult = update.result ?? null
  roomSeat = update.seat
  resigned = update.resigned ?? null
  // A persisted rating receipt advances the room version too; keep the final hit animation.
  const rankedFinish = view?.phase === 'battle' && update.view?.phase === 'finished' && update.online?.result && update.last?.events?.some(event => event.type === 'finish')
  if (view && (sequential || rankedFinish) && update.last) {
    const { seat, type, events } = update.last
    presentAction(update.view, { type }, events, seat !== roomSeat)
    return
  }
  if (view?.phase === 'finished' && update.view.phase !== 'finished') lastInspection = null
  view = update.view
  turnNotice = null
  eventFloor = view.events.at(-1)?.seq ?? 0
  selected = null
  replacements.clear()
  feedback = ''
  finishAction({ type: 'mulligan' })
}

function openRoom(session) {
  mode = session.mode ?? 'friend'
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

async function savePlayerName(name) {
  if (profileBusy || searching || roomBusy) return
  profileBusy = true
  feedback = ''
  render()
  try { await playerProfile.saveName(name); feedback = '名前を保存しました。'; showProfile = false }
  catch (error) { feedback = error.message }
  finally { profileBusy = false; render(showProfile ? '#player-name' : '[data-op="profile"]') }
}

function acceptSearch(data) {
  if (data.phase === 'matched') {
    searching = false
    clearTimeout(searchTimer)
    roomBusy = false
    feedback = ''
    if (room?.id === data.session.id) return true
    showRules = showLibrary = showDecks = false
    showProfile = false
    showArena = null
    musicLibrary.close()
    openRoom(data.session)
    return true
  }
  return false
}

async function pollSearch() {
  if (!searching || room) return
  try {
    const data = await playerProfile.queue()
    if (acceptSearch(data)) return
    if (data.phase === 'idle') { searching = false; feedback = '検索を終了しました。もう一度検索できます。'; render(); return }
  } catch (error) { feedback = error.message; render() }
  if (searching) searchTimer = setTimeout(pollSearch, 2000)
}

async function startPublicMatch() {
  if (searching || roomBusy) return
  if (!playerProfile.registered) { showProfile = true; feedback = 'オンライン対戦で使う名前を保存してください。'; render('#player-name'); return }
  roomBusy = true
  feedback = ''
  render()
  try {
    const data = await playerProfile.queue('POST', { mode, lineup: battleLineup(0) })
    if (acceptSearch(data)) return
    searching = true
    searchSince = data.since ?? Date.now()
    searchTimer = setTimeout(pollSearch, 2000)
  } catch (error) { feedback = error.message }
  finally { roomBusy = false; if (!room) render() }
}

async function cancelSearch() {
  if (roomBusy) return
  roomBusy = true
  clearTimeout(searchTimer)
  try {
    const data = await playerProfile.queue('DELETE')
    if (acceptSearch(data)) return // Pairing won the race: resume instead of abandoning an opponent.
    searching = false
    feedback = '検索をキャンセルしました。'
  } catch (error) { feedback = error.message; if (searching) searchTimer = setTimeout(pollSearch, 2000) }
  finally { roomBusy = false; if (!room) render() }
}

async function startFriendMatch(id = invite, arena = false) {
  if (roomBusy || !onlineAvailable()) return
  roomBusy = true
  feedback = ''
  render()
  try {
    const lobby = !id || isLobbyCode(id)
    const session = await enterRoom(id, lobby ? null : battleLineup(0), lobby, arena, playerProfile.profile?.name)
    showArena = null
    roomBusy = false
    openRoom(session)
  } catch (error) {
    roomBusy = false
    feedback = error.status ? error.message : '対戦サーバーに接続できません。'
    render(id && !invite ? '#lobby-id-input' : '[data-op="start"]')
  }
}

async function sendRoomAction(action) {
  const current = room
  const request = { version: roomVersion, lobby: Boolean(roomLobbyState) }
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
  if (opening) return false
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
  if (arenaBattle) arenaStore.saveMatch(match)
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

async function copyRoomField(selector, label) {
  const input = app.querySelector(selector)
  const status = app.querySelector('.room-copy-status')
  if (!input || !status) return
  try {
    await navigator.clipboard.writeText(input.value)
    status.textContent = label + 'をコピーしました。'
  } catch {
    const details = input.closest('details')
    if (details) details.open = true
    input.focus()
    input.select()
    status.textContent = '選択した' + label + 'をコピーして送ってください。'
  }
}

function returnHome() {
  cancelOpening()
  clearTimeout(cpuTimer)
  clearTimeout(presentationTimer)
  cpuTimer = presentationTimer = presentation = null
  room?.stop()
  if (invite) forgetRoom(invite)
  match = view = selected = room = invite = roomSeat = resigned = null
  roomLobbyState = roomResult = null
  menuPage = 'home'
  showProfile = false
  onlineMatch = null
  roomPlayerNames = null
  roomArena = null
  arenaBattle = false
  previewDemo = false
  showArena = null
  arenaChoice = null
  lobbyInput = ''
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
  if (playerProfile.registered) void playerProfile.refresh().then(() => { if (!inMatch() && !showProfile) render() }).catch(() => {})
}

async function leaveMatch() {
  if (arenaBattle) {
    arenaStore.saveMatch(match)
    returnHome()
    showArena = 'menu'
    render()
    return
  }
  if (view && view.phase !== 'finished' && !window.confirm(room
    ? '対戦を終了してタイトルへ戻りますか？ 退出すると相手の勝利になります。'
    : 'この対戦を終了してタイトルへ戻りますか？')) return
  const current = room
  if (current && (view?.phase !== 'finished' || roomResult) && roomConnection !== 'closed') {
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
  const picker = event.target.closest('.lineup-picker')
  if (picker) pickerOpen = picker.open
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
    render('#' + event.target.id)
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
  if (event.target.id === 'lobby-id-input') lobbyInput = event.target.value
  if (event.target.dataset.volume) {
    const channel = event.target.dataset.volume
    battleAudio.setVolume(channel, Number(event.target.value))
    updateVolumeControls()
    return
  }
  if (showDecks && deckEditor.importField(app, art, escape, event.target, render, 'input')) return
  if (showLibrary && event.target.matches('input[data-library-filter]')) changeLibraryFilter(app, art, event.target)
  if (showDecks && event.target.matches('input[data-deck-filter]')) deckEditor.filter(app, art, event.target)
  if (showDecks && event.target.id === 'deck-name') deckEditor.rename(app, event.target.value)
})

app.addEventListener('submit', event => {
  if (event.target.id === 'player-name-form') {
    event.preventDefault()
    savePlayerName(event.target.elements.name.value)
    return
  }
  if (event.target.id === 'arena-lobby-join') {
    event.preventDefault()
    const id = normalizeRoomId(event.target.elements.lobby.value)
    if (!id) { feedback = 'ロビーIDを確認してください。'; render(); return }
    mode = 'friend'
    startFriendMatch(id, true)
    return
  }
  if (event.target.id === 'end-turn-form') {
    event.preventDefault()
    event.target.closest('dialog').close()
    if (event.submitter?.value === 'end' && canEndTurn()) execute({ type: 'end' })
    return
  }
  if (event.target.id !== 'lobby-join') return
  event.preventDefault()
  lobbyInput = event.target.elements.lobby.value
  const id = normalizeRoomId(lobbyInput)
  if (!id) {
    feedback = 'ロビーIDを確認してください。'
    render('#lobby-id-input')
    return
  }
  battleAudio.unlock()
  startFriendMatch(id)
})
function updateVolumeControls() {
  for (const slider of app.querySelectorAll('input[data-volume]')) {
    const value = battleAudio.volume(slider.dataset.volume)
    slider.value = value
    app.querySelector(`[data-volume-value="${slider.dataset.volume}"]`).value = value + '%'
  }
  app.querySelector('[data-op="sound"]')?.setAttribute('aria-pressed', battleAudio.enabled)
}

function toggleAudioMixer() {
  const panel = app.querySelector('#audio-mixer')
  if (!panel) return
  const open = panel.hidden
  const button = app.querySelector('[data-op="audio-mixer"]')
  panel.hidden = !open
  button.setAttribute('aria-expanded', String(open))
  if (open) {
    battleAudio.unlock()
    panel.querySelector('input').focus({ preventScroll: true })
  } else button.focus({ preventScroll: true })
}

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
  const emblem = event.target.closest('[data-status-info]')
  if (emblem && depthEnabled()) {
    event.preventDefault()
    cancelCardPress()
    showEmblemInfo(emblem.dataset.statusInfo,emblem.title,emblem.closest('button'))
    return
  }
  const node = event.target.closest('button')
  if (!node) return
  if (handleArenaButton(node)) return
  if (node.dataset.inspectBadges !== undefined) {
    const seat = Number(node.dataset.inspectBadges)
    openBattleDetail(badgeDetails(seat, true), () => app.querySelector(`[data-inspect-badges="${seat}"]`))
    return
  }
  const card = inspectableCard(node)
  if (event.detail > 0 && card && performance.now() < ignoreCardClickUntil) {
    ignoreCardClickUntil = 0
    return
  }
  if (card && cardInspectionOnly()) {
    inspectLiveCard(card)
    return
  }
  if (node.dataset.inspectSkill !== undefined) {
    const seat = node.dataset.inspectSkill
    openBattleDetail(skillDetail(Number(seat), undefined, true), () => app.querySelector(`[data-inspect-skill="${seat}"]`))
    return
  }
  if (node.dataset.inspectWeapon !== undefined) {
    const weapon = view.players[Number(node.dataset.inspectWeapon)].weapon
    if (weapon) openCardDetail(cards[weapon.card], undefined,
      () => app.querySelector(`button[data-inspect-weapon="${node.dataset.inspectWeapon}"]`),
      ['攻撃力 ' + weapon.attack, '残り耐久 ' + weapon.durability])
    return
  }
  if ((presentation || roomLocked()) && node.closest('.battle-grid, .tray, .mulligan')) return
  if (node.dataset.logEvent !== undefined) {
    inspectLogCard(Number(node.dataset.logEvent), node)
    return
  }
  const { op, hand, replace, slot, leader, choice, mode: nextMode, libraryCard, libraryTab } = node.dataset
  if (searching && ['arena-open', 'library', 'decks', 'music'].includes(op)) return
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
  if (nextMode && !inMatch() && !roomBusy && !searching) {
    mode = nextMode
    menuPage = 'battle'
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
    case 'preview-demo': if (!presentation) startDepthPreview(); break
    case 'emblem-guide': showEmblemGuide(node); break
    case 'depth': if (!presentation) { toggleBattleDepth(); render('[data-op="depth"]') } break
    case 'profile': if (!inMatch() && !searching) { showProfile = true; feedback = ''; render('#player-name') } break
    case 'close-profile': if (!profileBusy) { showProfile = false; feedback = ''; render('[data-op="profile"]') } break
    case 'menu-home':
      if (!inMatch() && !searching && !roomBusy) { menuPage = 'home'; pickerOpen = false; showLibrary = showDecks = false; showArena = null; feedback = ''; render('[data-op="prepare"]') }
      break
    case 'prepare':
    case 'pick-lineup':
      if (!inMatch() && !searching && !roomBusy) { menuPage = 'battle'; pickerOpen = op === 'pick-lineup'; feedback = ''; render(pickerOpen ? '#leader-0' : '[data-op="start"]') }
      break
    case 'library': showLibrary = true; render('.library-view'); break
    case 'music': if (!inMatch()) musicLibrary.open(); break
    case 'close-library': showLibrary = false; render('[data-op="library"]'); break
    case 'decks': deckEditor.open(); showDecks = true; render('.deck-view'); break
    case 'close-decks': showDecks = false; render('[data-op="decks"]'); break
    case 'rules': showRules = true; render(); break
    case 'close-rules': showRules = false; render('[data-op="rules"]'); break
    case 'motion': toggleBattleMotion(); if (!presentation) render('[data-op="motion"]'); break
    case 'sound':
      battleAudio.toggle()
      updateVolumeControls()
      break
    case 'audio-mixer': toggleAudioMixer(); break
    case 'start':
      battleAudio.unlock()
      if (publicMatch()) { startPublicMatch(); break }
      if (mode === 'friend') {
        startFriendMatch()
        break
      }
      match = createLocalMatch({
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
        firstSeat: solo() ? drawFirstSeat() : 0,
        lineups: [battleLineup(0), battleLineup(1)],
      })
      eventFloor = 0
      cpuMoves = 0
      view = readView()
      render('[data-replace]')
      break
    case 'cancel-search': cancelSearch(); break
    case 'home': leaveMatch(); break
    case 'copy-invite': copyRoomField('#invite-url', '招待URL'); break
    case 'copy-lobby-id': copyRoomField('#lobby-id', 'ロビーID'); break
    case 'lobby-ready': {
      if (!roomLobbyState || roomBusy || roomConnection !== 'connected') break
      const ready = !roomLobbyState[roomLobbyState.role].ready
      sendRoomAction({ type: 'lobby-ready', ready, lineup: ready ? battleLineup(0) : undefined })
      break
    }
    case 'lobby-start':
      if (roomLobbyState && !roomBusy && roomConnection === 'connected') sendRoomAction({ type: 'lobby-start' })
      break
    case 'rematch':
    case 'return-lobby':
      if (roomResult && !roomBusy && roomConnection === 'connected') sendRoomAction({ type: op })
      break
    case 'mulligan':
      showMulliganReturns(node)
      execute({ type: 'mulligan', replace: [...replacements] })
      break
    case 'focus': execute({ type: 'focus' }); break
    case 'skill': select('skill'); break
    case 'end': requestEndTurn(); break
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

const inspectSelector = '[data-log-event][data-card], [data-hand], [data-unit], [data-terrain], [data-leader], [data-inspect-weapon], [data-inspect-skill], [data-inspect-badges], [data-op="skill"], #skill-description'

function inspectNode(node) {
  const panel = app.querySelector('#detail')
  if (!panel || !node) return
  const { hand, unit, slot, leader, terrain, inspectWeapon, inspectSkill, inspectBadges } = node.dataset
  const weapon = view.players[Number(inspectWeapon)]?.weapon
  const card = cards[weapon?.card ?? node.dataset.card]
  if (card) {
    panel.innerHTML = cardDetail(card, node.dataset.cost === undefined ? undefined : Number(node.dataset.cost), node)
    lastInspection = node.dataset.logEvent !== undefined ? `[data-log-event="${node.dataset.logEvent}"][data-card]` : weapon ? `[data-inspect-weapon="${inspectWeapon}"]` :
      hand !== undefined ? `[data-hand="${hand}"]` : `[data-unit="${unit}"]`
  } else if (terrain) {
    panel.innerHTML = `<div class="inspector-copy"><h2>${escape(terrainName(terrain))}</h2>
      <p class="inspector-effect">${escape(terrainText[terrain] ?? '6色の種晶で特殊勝利')}</p></div>`
    lastInspection = `[data-slot="${slot}"][data-terrain]`
  } else if (inspectBadges !== undefined) {
    panel.innerHTML = badgeDetails(Number(inspectBadges))
    lastInspection = `[data-inspect-badges="${inspectBadges}"]`
  } else if (inspectSkill !== undefined) {
    panel.innerHTML = skillDetail(Number(inspectSkill))
    lastInspection = `[data-inspect-skill="${inspectSkill}"]`
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
  if (view?.phase === 'battle' && !target?.contains(event.relatedTarget)) showActionPreview(target)
  if (target?.classList.contains('targetable') && ['play', 'skill'].includes(selected?.type)) return
  const node = event.target.closest(inspectSelector)
  if (node && !node.contains(event.relatedTarget)) inspectNode(node)
}

app.addEventListener('pointerover', inspect)
app.addEventListener('focusin', inspect)
document.addEventListener('click', handleTermLink, true)

app.addEventListener('focusout', event => {
  if (event.target.closest('[data-log-event]')) highlightLogEvent()
  if (event.target.closest('[data-slot], [data-leader]')) clearAttackPreview()
})
app.addEventListener('pointerout', event => {
  const entry = event.target.closest('[data-log-event]')
  if (entry && !entry.contains(event.relatedTarget)) highlightLogEvent()
  const target = event.target.closest('[data-slot], [data-leader]')
  if (target && !target.contains(event.relatedTarget)) clearAttackPreview()
})

function cancelCardPress() {
  if (handPress) clearTimeout(handPress.timer)
  handPress = null
}

app.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return
  if (event.target.closest('[data-status-info]')) return
  const node = inspectableCard(event.target)
  if (!node) return
  cancelCardPress()
  ignoreCardClickUntil = 0
  const selector = liveCardSelector(node)
  const timer = setTimeout(() => {
    const current = app.querySelector(selector)
    if (!current || current.dataset.card !== node.dataset.card) return
    ignoreCardClickUntil = performance.now() + 650
    inspectLiveCard(current)
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
  if (!node) return
  event.preventDefault()
  cancelCardPress()
  inspectLiveCard(node)
})

app.addEventListener('dragstart', event => {
  cancelCardPress()
  if (event.target.closest('[data-status-info]')) { event.preventDefault(); return }
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
  if (event.target.closest('.term-dialog, .end-turn-dialog')) return
  if (event.key === 'Escape' && event.target.closest('.audio-mixer, [data-op="audio-mixer"][aria-expanded="true"]')) {
    event.preventDefault()
    toggleAudioMixer()
    return
  }
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

preloadBattleVfx()
setInterval(() => {
  const clock = app.querySelector('.online-clock')
  if (clock && onlineMatch?.deadline) clock.textContent = `残り ${Math.max(0, Math.ceil((onlineMatch.deadline - Date.now()) / 1000))} 秒`
  const searchClock = app.querySelector('[data-search-since]')
  if (searchClock) { const seconds = Math.max(0, Math.floor((Date.now() - Number(searchClock.dataset.searchSince)) / 1000)); searchClock.textContent = `待機時間 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')}` }
}, 250)
const saved = savedRoom(invite)
document.addEventListener('click', battleAudio.unlock, { capture: true })
document.addEventListener('keydown', event => { if (!event.repeat) battleAudio.unlock() }, { capture: true })
if (saved && onlineAvailable()) {
  openRoom(saved)
} else {
  render()
  if (playerProfile.registered) {
    void playerProfile.queue().then(data => {
      if (inMatch() || searching || roomBusy) return
      if (acceptSearch(data)) return
      if (data.phase === 'searching') { mode = data.mode; menuPage = 'battle'; searchSince = data.since; searching = true; searchTimer = setTimeout(pollSearch, 2000) }
      if (!showProfile) render()
    }).catch(() => {})
  }
}
if (depthPreviewAvailable && new URLSearchParams(location.search).get('demo') === '1' && !saved) void startDepthPreview()

