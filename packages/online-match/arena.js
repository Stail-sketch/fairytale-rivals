import { createArenaSchedule, createDraft, draftAction, draftView } from '../arena/index.js'

export function initializeArena(room, seed) {
  if (!room.lobby) throw Object.assign(new Error('闘技場はロビーから開始してください。'), { status: 400 })
  room.arena = { schedule: createArenaSchedule(seed) }
  room.host.draft = createDraft(seed ^ 0x42ab9c, room.arena.schedule)
  if (room.guest) room.guest.draft = createDraft(seed ^ 0xab9834, room.arena.schedule)
  for (const player of [room.host, room.guest]) {
    if (!player) continue
    player.lineup = null
    player.draftVersion = room.version
    player.readyVersion = room.version + 1
  }
}
export function joinArena(room, seed) {
  if (room.arena) room.guest.draft = createDraft(seed, room.arena.schedule)
}
export function arenaSnapshot(room, player) {
  return room.arena ? { draft: draftView(player.draft) } : undefined
}
export function updateArena(room, player, version, action, random) {
  if (!Number.isSafeInteger(version) || version < (player.draftVersion ?? 0) || version > room.version) {
    throw Object.assign(new Error('ピックの状態が更新されました。'), { status: 409 })
  }
  if (action.type === 'arena-reset') {
    if (player !== room.host) throw Object.assign(new Error('作り直せるのはホストです。'), { status: 403 })
    if (version !== room.version) throw Object.assign(new Error('ロビーの状態が更新されました。'), { status: 409 })
    initializeArena(room, random()[1])
    for (const member of [room.host, room.guest]) if (member) member.draftVersion = room.version + 1
    return
  }
  draftAction(player.draft, action)
  player.draftVersion = room.version + 1
}
