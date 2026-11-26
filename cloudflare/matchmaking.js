import { readRoomBody } from './room.js'
import { roomError, validatedLineup, validatedPlayerName as playerName } from '../packages/online-match/lobby.js'

const randomId = () => crypto.randomUUID().replaceAll('-', '')
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), n => n.toString(16).padStart(2, '0')).join('')
const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
export const rankName = rating => rating < 1100 ? 'ブロンズ' : rating < 1250 ? 'シルバー' : rating < 1450 ? 'ゴールド' : rating < 1700 ? 'プラチナ' : 'レジェンド'
const publicProfile = p => ({ id: p.id, name: p.name, rating: p.rating, rank: rankName(p.rating), wins: p.wins, losses: p.losses, draws: p.draws })

// A single coordinator serializes queue pairing and server-authoritative results.
export class Matchmaking {
  constructor(ctx, env) { this.ctx = ctx; this.env = env }
  async authenticate(request) {
    const [, id, token] = /^Bearer ([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(request.headers.get('authorization') ?? '') ?? []
    const p = id && await this.ctx.storage.get('player:' + id)
    if (!p || p.secret !== await digest(token)) throw roomError(403, 'プレイヤー認証を確認してください。保存情報を削除せず再接続してください。')
    return p
  }
  async queue() {
    const queue = await this.ctx.storage.get('queue') ?? []
    return queue.filter(t => Date.now() - t.touched < 45_000)
  }
  async form(match) {
    const body = { matchmaking: match }
    const response = await this.env.ROOMS.get(this.env.ROOMS.idFromName(match.id)).fetch(new Request('https://internal/create-match/' + match.id, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }))
    if (!response.ok) throw roomError(503, '対戦の準備中です。もう一度接続してください。')
    match.formed = true
    await this.ctx.storage.put('match:' + match.id, match)
  }
  session(match, id) {
    const player = match.players.find(p => p.id === id)
    return { id: match.id, token: player.roomToken, mode: match.mode }
  }
  async settle(data) {
    const match = await this.ctx.storage.get('match:' + data.id)
    if (!match) throw roomError(404, '対戦記録が見つかりません。')
    if (!['draw', 0, 1].includes(data.winner)) throw roomError(400, '勝敗が不正です。')
    if (match.result) return match.result
    const profiles = await Promise.all(match.players.map(p => this.ctx.storage.get('player:' + p.id)))
    const scores = data.winner === 'draw' ? [.5, .5] : match.players.map(p => p.seat === data.winner ? 1 : 0)
    const delta = match.mode === 'ranked' ? Math.round(32 * (scores[0] - 1 / (1 + 10 ** ((profiles[1].rating - profiles[0].rating) / 400)))) : 0
    const result = profiles.map((p, i) => {
      const previous = p.rating
      if (match.mode === 'ranked') {
        p.rating = Math.max(0, p.rating + (i ? -delta : delta))
        p[scores[i] === 1 ? 'wins' : scores[i] === 0 ? 'losses' : 'draws']++
      }
      if (p.active === match.id) p.active = null
      return { id: p.id, previous, change: p.rating - previous, ...publicProfile(p) }
    })
    match.result = result
    match.players = match.players.map(p => ({ id: p.id, seat: p.seat }))
    await this.ctx.storage.transaction(async storage => {
      for (const p of profiles) await storage.put('player:' + p.id, p)
      await storage.put('match:' + match.id, match)
    })
    return result
  }
  async handle(request) {
    const path = new URL(request.url).pathname
    const data = request.method === 'POST' ? await readRoomBody(request) : null
    // This route is not forwarded by the public Worker.
    if (path === '/internal/result' && request.method === 'POST') return reply(200, await this.settle(data))
    if (path === '/api/players' && request.method === 'POST') {
      const name = playerName(data.name)
      const key = 'register:' + (request.headers.get('cf-connecting-ip') ?? 'local') + ':' + Math.floor(Date.now() / 3_600_000)
      const count = await this.ctx.storage.get(key) ?? 0
      if (count >= 20) throw roomError(429, '登録が続いています。時間をおいてお試しください。')
      const id = randomId(), token = randomId() + randomId()
      const p = { id, secret: await digest(token), name, rating: 1000, wins: 0, losses: 0, draws: 0 }
      await this.ctx.storage.transaction(async storage => {
        await storage.put('player:' + id, p); await storage.put(key, count + 1)
      })
      return reply(201, { credential: id + '.' + token, profile: publicProfile(p) })
    }
    const p = await this.authenticate(request)
    if (path === '/api/players/me') {
      if (request.method === 'POST') {
        p.name = playerName(data.name)
        await this.ctx.storage.put('player:' + p.id, p)
      } else if (request.method !== 'GET') throw roomError(405, 'この操作は利用できません。')
      return reply(200, { profile: publicProfile(p) })
    }
    if (path !== '/api/matchmaking' || !['GET', 'POST', 'DELETE'].includes(request.method)) throw roomError(404, 'この操作は利用できません。')
    if (p.active) {
      const match = await this.ctx.storage.get('match:' + p.active)
      if (match && !match.result) {
        if (!match.formed) await this.form(match)
        return reply(200, { phase: 'matched', session: this.session(match, p.id), profile: publicProfile(p) })
      }
    }
    let queue = await this.queue()
    let ticket = queue.find(t => t.id === p.id)
    if (request.method === 'DELETE') {
      await this.ctx.storage.put('queue', queue.filter(t => t.id !== p.id))
      return reply(200, { phase: 'idle', profile: publicProfile(p) })
    }
    if (request.method === 'POST') {
      if (!['ranked', 'free'].includes(data.mode)) throw roomError(400, '対戦形式を選んでください。')
      const lineup = validatedLineup(data.lineup)
      ticket = { id: p.id, name: p.name, rating: p.rating, mode: data.mode, lineup, since: ticket?.since ?? Date.now(), touched: Date.now() }
      queue = queue.filter(t => t.id !== p.id)
      if (queue.length >= 128) throw roomError(503, '対戦受付が混み合っています。')
      queue.push(ticket)
    } else if (ticket) ticket.touched = Date.now()
    if (!ticket) return reply(200, { phase: 'idle', profile: publicProfile(p) })
    const other = queue.find(t => t.id !== p.id && t.mode === ticket.mode &&
      (t.mode === 'free' || Math.abs(t.rating - ticket.rating) <= 200 + Math.max(Date.now() - t.since, Date.now() - ticket.since) / 1000 * 8))
    if (other) {
      const second = await this.ctx.storage.get('player:' + other.id)
      const seat = crypto.getRandomValues(new Uint8Array(1))[0] & 1
      const match = { id: randomId(), mode: ticket.mode, seed: crypto.getRandomValues(new Uint32Array(1))[0],
        players: [ticket, other].map((t, i) => ({ id: t.id, name: t.name, lineup: t.lineup, seat: i ? 1 - seat : seat, roomToken: randomId() + randomId() })) }
      p.active = second.active = match.id
      await this.ctx.storage.transaction(async storage => {
        await storage.put('match:' + match.id, match)
        await storage.put('player:' + p.id, p); await storage.put('player:' + second.id, second)
        await storage.put('queue', queue.filter(t => ![p.id, second.id].includes(t.id)))
      })
      await this.form(match)
      return reply(200, { phase: 'matched', session: this.session(match, p.id), profile: publicProfile(p) })
    }
    await this.ctx.storage.put('queue', queue)
    return reply(200, { phase: 'searching', since: ticket.since, mode: ticket.mode, profile: publicProfile(p) })
  }
  async fetch(request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      try { return await this.handle(request) }
      catch (error) { if (!error.status) console.error('Matchmaking:', error.message); return reply(error.status ?? 500, { issue: error.status ? error.message : '対戦受付に接続できませんでした。' }) }
    })
  }
}
