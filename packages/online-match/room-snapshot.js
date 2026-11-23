import { lobbySnapshot } from './lobby.js'
import { arenaSnapshot } from './arena.js'

export function roomSnapshot(room, player) {
  if (room.closed) return { version: room.version, phase: 'closed' }
  if (room.lobby && !room.match) return { version: room.version, phase: 'lobby', lobby: lobbySnapshot(room, player),
    ...(room.arena ? { arena: arenaSnapshot(room, player) } : {}) }
  if (!room.match) return { version: room.version, phase: 'waiting' }
  const view = room.match.view(player.seat)
  const lastPlay = view.events.findLast(event => event.played)
  view.events = view.events.slice(-100)
  if (lastPlay && !view.events.includes(lastPlay)) view.events.unshift(lastPlay)
  if (room.resigned !== undefined) {
    view.phase = 'finished'
    view.winner = 1 - room.resigned
    view.pending = view.legal = null
    for (const side of view.players) side.hand = []
  }
  return {
    version: room.version, phase: 'playing', seat: player.seat, view,
    last: room.last, resigned: room.resigned,
    ...(room.lobby && room.resultVersion !== undefined ? {
      result: { rematch: Boolean(player.rematch), opponentRematch: Boolean((player === room.host ? room.guest : room.host).rematch) },
    } : {}),
  }
}
