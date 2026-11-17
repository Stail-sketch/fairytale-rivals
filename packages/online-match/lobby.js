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

export function updateLobby(room, player, version, action, random) {
  if (!action || typeof action !== 'object') throw roomError(400, 'ロビーの操作を読み取れません。')
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
  const [seat, seed] = random()
  startRoomMatch(room, seat, seed)
}

export function startRoomMatch(room, guestSeat, seed) {
  room.guest.seat = guestSeat
  room.host.seat = 1 - guestSeat
  room.match = createLocalMatch({
    seed, lineups: [room.host, room.guest].sort((a, b) => a.seat - b.seat).map(player => player.lineup),
  })
}
