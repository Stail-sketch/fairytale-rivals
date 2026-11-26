import { BattleRoom, readRoomBody } from './room.js'
import { lobbyCode, normalizeRoomId } from '../packages/online-match/lobby.js'
export { BattleRoom }
export { Matchmaking } from './matchmaking.js'

const route = /^\/api\/rooms(?:\/([a-z0-9]+)(?:\/(join|actions))?)?$/
export const reply = (status, data) => new Response(data === undefined ? null : JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
})

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (['/api/players', '/api/players/me', '/api/matchmaking'].includes(url.pathname)) {
      return env.MATCHMAKING.get(env.MATCHMAKING.idFromName('global-v1')).fetch(request)
    }
    const match = route.exec(url.pathname)
    if (!match) return reply(404, { issue: 'この操作は利用できません。' })
    const [, id] = match
    if (!id) {
      if (request.method !== 'POST') return reply(405, { issue: 'この操作は利用できません。' })
      let data
      try { data = await readRoomBody(request.clone()) }
      catch (error) { return reply(error.status ?? 400, { issue: error.message }) }
      for (let attempt = 0; attempt < 4; attempt++) {
        const bytes = crypto.getRandomValues(new Uint8Array(16))
        const code = data.lobby === true ? lobbyCode(bytes.slice(0, 8)) : Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code))
        const internal = new URL(request.url)
        internal.pathname = '/create/' + code
        const response = await stub.fetch(new Request(internal, request.clone()))
        if (response.status !== 409) return response
      }
      return reply(503, { issue: '部屋を作成できませんでした。もう一度お試しください。' })
    }
    if (normalizeRoomId(id) !== id) return reply(404, { issue: 'この対戦部屋は終了したか、見つかりません。' })
    return env.ROOMS.get(env.ROOMS.idFromName(id)).fetch(request)
  },
}
