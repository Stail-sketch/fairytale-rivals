import { randomBytes, randomInt } from 'node:crypto'
import { roomSnapshot } from './room-snapshot.js'
import { lobbyCode, normalizeRoomId, startRoomMatch, updateLobby, validatedLineup } from './lobby.js'

const route = /^\/api\/rooms(?:\/([a-z0-9]+)(?:\/(join|actions))?)?$/
const limit = 12 * 1024
const minute = 60_000
const token = () => randomBytes(32).toString('hex')
const missingRoom = 'この対戦部屋は終了したか、見つかりません。'

class RequestError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function reply(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(data === undefined ? undefined : JSON.stringify(data))
}

async function json(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
    throw new RequestError(415, 'JSONで送信してください。')
  }
  let length = 0
  const chunks = []
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    length += chunk.length
    if (length > limit) {
      req.resume()
      throw new RequestError(413, '送信データが大きすぎます。')
    }
    chunks.push(chunk)
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    return parsed
  } catch {
    throw new RequestError(400, '送信データを読み取れません。')
  }
}

function publish(room, last) {
  room.version++
  room.last = last
  room.touched = Date.now()
  for (const waiter of room.waiters) waiter.send()
}

function wait(room, player, res) {
  if (room.waiters.size >= 6) throw new RequestError(429, '別のタブを閉じてから接続してください。')
  const waiter = {
    send() {
      release()
      reply(res, 200, roomSnapshot(room, player))
    },
    expire() {
      release()
      reply(res, 404, { issue: missingRoom })
    },
  }
  function release() {
    clearTimeout(timeout)
    room.waiters.delete(waiter)
  }
  const timeout = setTimeout(() => {
    release()
    reply(res, 204)
  }, 20_000).unref()
  res.once('close', release)
  room.waiters.add(waiter)
}

export function createRoomApi() {
  const rooms = new Map()

  async function handle(req, res, url) {
    const match = route.exec(url.pathname)
    if (!match) throw new RequestError(404, 'この操作は利用できません。')
    const [, id, operation] = match
    if (id && normalizeRoomId(id) !== id) throw new RequestError(404, missingRoom)
    for (const [key, room] of rooms) {
      const expires = room.match && !room.finished ? 120 * minute : 30 * minute
      if (Date.now() - room.touched <= expires) continue
      for (const waiter of room.waiters) waiter.expire()
      rooms.delete(key)
    }
    if (!id && req.method === 'POST') {
      const data = await json(req)
      const lobby = data.lobby === true
      const deck = lobby ? null : validatedLineup(data)
      if (rooms.size >= 128) throw new RequestError(503, '対戦部屋が混み合っています。')
      let id
      do { id = lobby ? lobbyCode(randomBytes(8)) : randomBytes(16).toString('hex') } while (rooms.has(id))
      const host = { token: token(), lineup: deck }
      rooms.set(id, { lobby, host, guest: null, version: 0, waiters: new Set(), touched: Date.now() })
      return reply(res, 201, { id, token: host.token })
    }

    const room = rooms.get(id)
    if (!room || room.closed) throw new RequestError(404, missingRoom)
    if (operation === 'join' && req.method === 'POST') {
      const data = await json(req)
      const deck = room.lobby ? null : validatedLineup(data)
      if (room.closed || !rooms.has(id)) throw new RequestError(404, 'この対戦部屋は終了しました。')
      if (room.guest) throw new RequestError(409, 'この部屋にはすでに2人が参加しています。')
      const guest = { lineup: deck, token: token() }
      room.guest = guest
      if (!room.lobby) startRoomMatch(room, randomInt(2), randomBytes(4).readUInt32LE())
      publish(room)
      return reply(res, 201, { id, token: guest.token })
    }

    const player = [room.host, room.guest].find(entry => entry && req.headers.authorization === 'Bearer ' + entry.token)
    if (!player) throw new RequestError(403, 'この部屋の対戦権限がありません。')
    if (!operation && req.method === 'GET') {
      if (Number(url.searchParams.get('since') ?? -1) === room.version && !room.finished) return wait(room, player, res)
      return reply(res, 200, roomSnapshot(room, player))
    }
    if (!operation && req.method === 'DELETE') {
      if (!room.match && room.lobby && player === room.guest) room.guest = null
      else if (!room.match) room.closed = true
      else if (!room.finished) {
        room.resigned = player.seat
        room.finished = true
      } else return reply(res, 204)
      publish(room)
      return reply(res, 204)
    }
    if (operation === 'actions' && req.method === 'POST') {
      const { version, action } = await json(req)
      if (!rooms.has(id) || room.closed) throw new RequestError(404, missingRoom)
      if (player !== room.host && player !== room.guest) throw new RequestError(403, 'この部屋の対戦権限がありません。')
      if (room.lobby && !room.match) {
        updateLobby(room, player, version, action, () => [randomInt(2), randomBytes(4).readUInt32LE()])
        publish(room)
        return reply(res, 200, roomSnapshot(room, player))
      }
      if (!room.match || room.finished) throw new RequestError(409, '対戦中の部屋で操作してください。')
      if (version !== room.version) throw new RequestError(409, '盤面が更新されました。表示を確認してください。')
      const result = room.match.act(player.seat, action)
      if (!result.ok) throw new RequestError(422, result.issue)
      room.finished = result.events.some(event => event.type === 'finish')
      publish(room, { seat: player.seat, type: action.type, events: result.events })
      return reply(res, 200, roomSnapshot(room, player))
    }
    throw new RequestError(405, 'この操作は利用できません。')
  }

  return (req, res, url) => handle(req, res, url).catch(error => {
    if (res.destroyed) return
    if (!error.status) console.error(error)
    reply(res, error.status ?? 500, { issue: error.status ? error.message : '対戦通信に失敗しました。' })
  })
}
