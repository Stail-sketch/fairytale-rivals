import { deckIssue, rules } from '../engine/index.js'
import { createLocalMatch } from '../local-match/index.js'

const alphabet = 'abcdefghjklmnpqrstuvwxyz23456789'
const codePattern = /^[abcdefghjklmnpqrstuvwxyz23456789]{8}$/
const legacyPattern = /^[0-9a-f]{32}$/

export const roomError = (status, message) => Object.assign(new Error(message), { status })
export const isLobbyCode = id => codePattern.test(id ?? '')

export function normalizeRoomId(value) {
  const id = String(value ?? '').toLowerCase().replace(/[\s-]/g, '')
  return isLobbyCode(id) || legacyPattern.test(id) ? id : null
}

export const lobbyCode = bytes => Array.from(bytes, byte => alphabet[Math.floor(byte * alphabet.length / 256)]).join('')
export const visibleLobbyCode = id => (isLobbyCode(id) ? id.slice(0, 4) + '-' + id.slice(4) : id).toUpperCase()

export function validatedLineup(data) {
  const { leader, deck } = data ?? {}
  if (typeof leader !== 'string' || !Array.isArray(deck) || deck.length !== rules.deckSize ||
      deck.some(card => typeof card !== 'string')) {
    throw roomError(400, '語り手と30枚のデッキを指定してください。')
  }
  const issue = deckIssue(deck, leader)
  if (issue) throw roomError(400, issue)
  return { leader, deck: [...deck] }
}

export function lobbySnapshot(room, player) {
  const member = entry => ({ joined: Boolean(entry), ready: Boolean(entry?.lineup), leader: entry?.lineup?.leader })
  return { role: player === room.host ? 'host' : 'guest', host: member(room.host), guest: member(room.guest) }
}

function updateLobby(room, player, version, action, random) {
  const minimum = action.type === 'lobby-ready' ? player.readyVersion ?? 0 : room.version
  if (!Number.isSafeInteger(version) || version < minimum || version > room.version) {
    throw roomError(409, 'ロビーの状態が更新されました。')
  }
  if (action.type === 'lobby-ready') {
    if (typeof action.ready !== 'boolean') throw roomError(400, '準備状態が不正です。')
    player.lineup = action.ready ? validatedLineup(action.lineup) : null
    player.readyVersion = room.version + 1
    return
  }
  if (action.type !== 'lobby-start') throw roomError(409, '対戦を開始してから操作してください。')
  if (player !== room.host) throw roomError(403, '対戦を開始できるのはホストです。')
  if (!room.host.lineup || !room.guest?.lineup) throw roomError(409, '二人とも準備ができるまでお待ちください。')
  startRoomMatch(room, ...random())
}

function clearResult(room) {
  room.finished = false
  room.resigned = undefined
  room.resultVersion = undefined
  for (const player of [room.host, room.guest]) {
    if (player) player.rematch = false
  }
}

function returnToLobby(room) {
  room.match = null
  clearResult(room)
  for (const player of [room.host, room.guest]) {
    if (!player) continue
    player.lineup = null
    player.readyVersion = room.version + 1
  }
}

export function updateRoom(room, player, version, action, random) {
  if (room.closed) throw roomError(404, 'この対戦部屋は終了しました。')
  if (!action || typeof action !== 'object') throw roomError(400, '対戦の操作を読み取れません。')
  if (room.lobby && !room.match) return updateLobby(room, player, version, action, random)
  if (room.lobby && room.finished && room.resultVersion !== undefined) {
    if (!Number.isSafeInteger(version) || version < room.resultVersion || version > room.version) {
      throw roomError(409, '対戦結果が更新されました。')
    }
    if (action.type === 'return-lobby') return returnToLobby(room)
    if (action.type === 'rematch') {
      player.rematch = true
      if (room.host.rematch && room.guest.rematch) startRoomMatch(room, ...random())
      return
    }
  }
  if (!room.match || room.finished) throw roomError(409, '対戦中の部屋で操作してください。')
  if (version !== room.version) throw roomError(409, '盤面が更新されました。表示を確認してください。')
  const result = room.match.act(player.seat, action)
  if (!result.ok) throw roomError(422, result.issue)
  if (result.events.some(event => event.type === 'finish')) {
    room.finished = true
    room.resultVersion = room.version + 1
  }
  return { seat: player.seat, type: action.type, events: result.events }
}

export function leaveRoom(room, player) {
  if (room.closed) return false
  if (room.lobby && (!room.match || room.resultVersion !== undefined)) {
    if (player === room.host) room.closed = true
    else {
      room.guest = null
      if (room.match) returnToLobby(room)
    }
  } else if (!room.match) room.closed = true
  else if (!room.finished) {
    room.resigned = player.seat
    room.finished = true
  } else return false
  return true
}

export function startRoomMatch(room, guestSeat, seed) {
  clearResult(room)
  room.guest.seat = guestSeat
  room.host.seat = 1 - guestSeat
  room.match = createLocalMatch({
    seed, lineups: [room.host, room.guest].sort((a, b) => a.seat - b.seat).map(player => player.lineup),
  })
}
