import { lobbySnapshot } from './lobby.js'

export function roomSnapshot(room, player) {
  if (room.lobby && !room.match && !room.closed) return { version: room.version, phase: 'lobby', lobby: lobbySnapshot(room, player) }
  if (!room.match) return { version: room.version, phase: room.closed ? 'closed' : 'waiting' }
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
  }
}
