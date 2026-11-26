import { createLocalMatch } from '../packages/local-match/index.js'
import { initializeArena, joinArena } from '../packages/online-match/arena.js'
import { leaveRoom, roomError, startRoomMatch, updateRoom, validatedLineup, validatedPlayerName } from '../packages/online-match/lobby.js'
import { roomSnapshot } from '../packages/online-match/room-snapshot.js'

const missing = 'この対戦部屋は終了したか、見つかりません。'
const limit = 12 * 1024
const minute = 60_000
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
const random = () => {
  const values = crypto.getRandomValues(new Uint32Array(2))
  return [values[0] % 2, values[1]]
}
const reply = (status, data) => new Response(data === undefined ? null : JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
})
function encode(room) {
  const { match, ...rest } = room
  return structuredClone({ ...rest, state: match?.exportState() ?? null })
}
function decode({ state, ...rest }) {
  return { ...structuredClone(rest), match: state ? createLocalMatch(state.config, state.game) : null }
}
export async function readRoomBody(request) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw roomError(415, 'JSONで送信してください。')
  const reader = request.body?.getReader()
  const chunks = []
  let size = 0
  if (reader) {
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > limit) { void reader.cancel().catch(() => {}); throw roomError(413, '送信データが大きすぎます。') }
        chunks.push(value)
      }
    } finally { reader.releaseLock() }
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes))
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error()
    return data
  } catch { throw roomError(400, '送信データを読み取れません。') }
}

// One serialized, persistently stored room per Durable Object. No process-local global room map.
export class BattleRoom {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
    this.waiters = new Set()
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get('room')
      this.room = stored ? decode(stored) : null
    })
  }

  async commit(room, changed = true) {
    room.touched = Date.now()
    room.expires = room.touched + (room.match && !room.finished ? 120 : 30) * minute
    await this.ctx.storage.transaction(async storage => {
      await storage.put('room', encode(room))
      await storage.setAlarm(room.online && !room.finished ? Math.min(room.expires, room.deadline) : room.expires)
    })
    this.room = room
    if (changed) for (const send of [...this.waiters]) send()
  }

  player(room, auth) {
    const player = [room.host, room.guest].find(entry => entry && auth === 'Bearer ' + entry.token)
    if (!player) throw roomError(403, 'この部屋の対戦権限がありません。')
    return player
  }

  snapshot(auth) {
    if (!this.room || this.room.expires <= Date.now()) return reply(404, { issue: missing })
    // A closed room is sent to already-authenticated pollers so their client exits cleanly.
    return reply(200, roomSnapshot(this.room, this.player(this.room, auth)))
  }

  wait(auth, version, signal) {
    if (this.room.version !== version || this.room.closed) return this.snapshot(auth)
    if (signal.aborted) return reply(204)
    if (this.waiters.size >= 6) throw roomError(429, '別のタブを閉じてから接続してください。')
    return new Promise(resolve => {
      const release = response => {
        clearTimeout(timer)
        signal.removeEventListener('abort', aborted)
        this.waiters.delete(send)
        resolve(response)
      }
      const send = () => {
        try { release(this.snapshot(auth)) }
        catch (error) { release(reply(error.status ?? 500, { issue: error.status ? error.message : '対戦通信に失敗しました。' })) }
      }
      const aborted = () => release(reply(204))
      const timer = setTimeout(aborted, 20_000)
      signal.addEventListener('abort', aborted, { once: true })
      this.waiters.add(send)
    })
  }

  async handle(request, data) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/create-match/') && request.method === 'POST') {
      if (this.room) return reply(200, { ok: true })
      const m = data.matchmaking
      const [host, guest] = m.players.map(p => ({ profileId: p.id, token: p.roomToken, name: p.name, seat: p.seat, lineup: validatedLineup(p.lineup) }))
      const room = { host, guest, lobby: false, version: 0, online: { id: m.id, mode: m.mode },
        deadline: Date.now() + 90_000,
        match: createLocalMatch({ seed: m.seed, lineups: [host, guest].sort((a,b) => a.seat-b.seat).map(p => p.lineup) }) }
      await this.commit(room, false)
      return reply(201, { ok: true })
    }
    if (url.pathname.startsWith('/create/') && request.method === 'POST') {
      if (this.room && this.room.expires > Date.now()) throw roomError(409, '部屋がすでに存在します。')
      const lobby = data.lobby === true
      const room = { lobby, host: { token: token(), lineup: lobby ? null : validatedLineup(data), ...(data.name === undefined ? {} : { name: validatedPlayerName(data.name) }) }, guest: null, version: 0 }
      if (data.arena === true) initializeArena(room, random()[1])
      await this.commit(room, false)
      return reply(201, { id: url.pathname.slice('/create/'.length), token: room.host.token })
    }
    if (!this.room || this.room.closed || this.room.expires <= Date.now()) throw roomError(404, missing)
    const room = decode(encode(this.room))
    const operation = url.pathname.split('/')[4]
    if (operation === 'join' && request.method === 'POST') {
      const lineup = room.lobby ? null : validatedLineup(data)
      if (room.guest) throw roomError(409, 'この部屋にはすでに2人が参加しています。')
      room.guest = { token: token(), lineup, ...(data.name === undefined ? {} : { name: validatedPlayerName(data.name) }) }
      joinArena(room, random()[1])
      if (!room.lobby) startRoomMatch(room, ...random())
      room.version++
      room.last = undefined
      await this.commit(room)
      return reply(201, { id: url.pathname.split('/')[3], token: room.guest.token })
    }
    const auth = request.headers.get('authorization')
    const player = this.player(room, auth)
    if (!operation && request.method === 'GET') {
      // Connected players keep their lobby alive without a storage write on every poll.
      if (Date.now() - room.touched > 5 * minute) await this.commit(room, false)
      if (Number(url.searchParams.get('since') ?? -1) === room.version) return { wait: room.version, auth }
      return reply(200, roomSnapshot(room, player))
    }
    if (!operation && request.method === 'DELETE') {
      if (leaveRoom(room, player)) {
        room.version++
        room.last = undefined
        await this.commit(room)
      }
      return reply(204)
    }
    if (operation === 'actions' && request.method === 'POST') {
      const turn = room.match?.view(player.seat)
      room.last = updateRoom(room, player, data.version, data.action, random)
      const next = room.match?.view(player.seat)
      if (room.online && (turn?.active !== next?.active || turn?.turn !== next?.turn || turn?.decisionSeat !== next?.decisionSeat || turn?.phase !== next?.phase)) room.deadline = Date.now() + 90_000
      room.version++
      await this.commit(room)
      return reply(200, roomSnapshot(room, player))
    }
    throw roomError(405, 'この操作は利用できません。')
  }

  async fetch(request) {
    try {
      await this.ready
      const data = request.method === 'POST' ? await readRoomBody(request) : null
      // Never hold the concurrency gate while waiting for the opponent's next action.
      const response = await this.ctx.blockConcurrencyWhile(async () => {
        try {
          await this.expireTurn()
          await this.settleResult()
          const result = await this.handle(request, data)
          await this.settleResult()
          // Include the persisted rating receipt in the response to the finishing action.
          if (this.room?.online && this.room.finished && result instanceof Response && result.status === 200) {
            const auth = request.headers.get('authorization')
            if (auth) return this.snapshot(auth)
          }
          return result
        }
        catch (error) {
          if (!error.status) console.error('Room request failed:', error.message)
          return reply(error.status ?? 500, { issue: error.status ? error.message : '対戦通信に失敗しました。' })
        }
      })
      return response instanceof Response ? response : await this.wait(response.auth, response.wait, request.signal)
    } catch (error) {
      if (!error.status) console.error('Room request failed:', error.message)
      return reply(error.status ?? 500, { issue: error.status ? error.message : '対戦通信に失敗しました。' })
    }
  }

  async alarm() {
    await this.ready
    await this.ctx.blockConcurrencyWhile(async () => {
      await this.expireTurn()
      await this.settleResult()
      if (this.room?.online && this.room.finished && !this.room.online.result) return
      if (this.room?.expires > Date.now()) return this.ctx.storage.setAlarm(this.room.online && !this.room.finished ? Math.min(this.room.expires, this.room.deadline) : this.room.expires)
      await this.ctx.storage.deleteAll()
      this.room = null
      for (const send of [...this.waiters]) send()
    })
  }

  async expireTurn() {
    const room = this.room
    if (!room?.online || room.finished || room.deadline > Date.now()) return
    const view = room.match.view(0)
    room.resigned = view.decisionSeat ?? view.active
    room.finished = true
    room.version++
    room.last = undefined
    await this.commit(room)
  }

  async settleResult() {
    const room = this.room
    if (!room?.online || !room.finished || room.online.result) return
    const winner = room.resigned === undefined ? room.match.view(0).winner : 1 - room.resigned
    try {
      const response = await this.env.MATCHMAKING.get(this.env.MATCHMAKING.idFromName('global-v1')).fetch(new Request('https://internal/internal/result', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: room.online.id, winner }),
      }))
      if (!response.ok) throw new Error('settlement pending')
      room.online.result = await response.json()
      room.version++
      await this.commit(room)
    } catch {
      // Keep the durable result for an idempotent retry; never trust a client win report.
      await this.ctx.storage.setAlarm(Date.now() + 5000)
    }
  }
}
