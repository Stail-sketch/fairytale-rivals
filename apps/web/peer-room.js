import { roomSnapshot } from '../../packages/online-match/room-snapshot.js'
import { leaveRoom, lobbyCode, startRoomMatch, updateRoom, validatedLineup } from '../../packages/online-match/lobby.js'

const active = new Map()
const protocol = 'fairytale-room-v1'
const idPattern = /^[a-f0-9]{32}$/
const timeoutMs = 12000
let loadingPeer

const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)),
  byte => byte.toString(16).padStart(2, '0')).join('')
const roomPeerId = id => 'fairytale-' + id
const error = (message, status) => Object.assign(new Error(message), { status })
const unavailable = '対戦の接続先が見つかりません。招待した人がこの部屋を開いているか確認してください。'

function loadPeer() {
  loadingPeer ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = import.meta.url.startsWith('blob:')
      ? new URL('./apps/web/vendor/peerjs-1.5.5.min.js', location.href).href
      : new URL('./vendor/peerjs-1.5.5.min.js', import.meta.url).href
    script.onload = () => globalThis.Peer ? resolve(globalThis.Peer) : reject(error('対戦通信を読み込めませんでした。', 503))
    script.onerror = () => reject(error('対戦通信を読み込めませんでした。', 503))
    document.head.append(script)
  }).catch(issue => {
    loadingPeer = undefined
    throw issue
  })
  return loadingPeer
}

async function openPeer(id) {
  const Peer = await loadPeer()
  const peer = new Peer(id)
  return new Promise((resolve, reject) => {
    const fail = issue => {
      clearTimeout(timer)
      peer.destroy()
      reject(issue)
    }
    const onError = issue => fail(issue?.type === 'unavailable-id' ?
      error('同じロビーIDが使われています。', 409) : error('対戦接続サービスに接続できませんでした。', 503))
    const timer = setTimeout(onError, timeoutMs)
    peer.once('error', onError)
    peer.once('open', () => {
      clearTimeout(timer)
      peer.off('error', onError)
      resolve(peer)
    })
  })
}

function readMessage(raw) {
  if (typeof raw !== 'string' || raw.length > 600000) return null
  try {
    const data = JSON.parse(raw)
    return data?.protocol === protocol ? data : null
  } catch { return null }
}

function send(link, data) {
  if (link.open) link.send(JSON.stringify({ protocol, ...data }))
}

const randomSeats = () => {
  const numbers = crypto.getRandomValues(new Uint32Array(2))
  return [numbers[0] % 2, numbers[1]]
}

function hostRoom(peer, session, lineup, lobby) {
  const room = { version: 0, lobby, host: { lineup }, guest: null, match: null }
  const waiting = new Set()
  let link
  let update = () => {}
  let status = () => {}

  function publish(last) {
    room.version++
    room.last = last
    update(roomSnapshot(room, room.host))
    if (link) send(link, { kind: 'state', state: roomSnapshot(room, room.guest) })
  }

  function join(token, guestLineup, joining) {
    if (!idPattern.test(token)) throw error('参加情報が不正です。', 403)
    if (room.closed) throw error(unavailable, 404)
    if (room.guest) {
      if (room.guest.token !== token) throw error('この部屋にはすでに2人が参加しています。', 409)
      return false
    }
    if (!joining) throw error(unavailable, 404)
    room.guest = { token, lineup: room.lobby ? null : validatedLineup(guestLineup) }
    if (!room.lobby) startRoomMatch(room, ...randomSeats())
    return true
  }

  peer.on('error', () => {})
  let retrySignal
  peer.on('disconnected', () => {
    clearTimeout(retrySignal)
    retrySignal = setTimeout(() => { if (peer.disconnected && !peer.destroyed) peer.reconnect() }, 1200)
  })
  peer.on('connection', incoming => {
    if (waiting.size >= 4) {
      incoming.close()
      return
    }
    waiting.add(incoming)
    let authorized = false
    const deadline = setTimeout(() => { if (!authorized) incoming.close() }, timeoutMs)
    incoming.on('close', () => {
      waiting.delete(incoming)
      clearTimeout(deadline)
      if (link === incoming) {
        link = null
        if (!room.finished || (room.lobby && room.resultVersion !== undefined)) {
          status('reconnecting', '友達の再接続を待っています。')
        }
      }
    })
    incoming.on('data', raw => {
      const message = readMessage(raw)
      if (!message || !Number.isSafeInteger(message.request)) return
      try {
        if (message.kind === 'join' || message.kind === 'resume') {
          const started = join(message.token, message.lineup, message.kind === 'join')
          authorized = true
          waiting.delete(incoming)
          clearTimeout(deadline)
          const old = link
          link = incoming
          if (old && old !== incoming) old.close()
          status('connected')
          if (started) publish()
        } else if (!authorized || link !== incoming) throw error('この部屋の対戦権限がありません。', 403)
        else if (message.kind === 'act') publish(updateRoom(room, room.guest, message.version, message.action, randomSeats))
        else if (message.kind === 'leave') {
          const guest = room.guest
          if (leaveRoom(room, guest)) {
            if (!room.guest) link = null
            publish()
          }
          send(incoming, { kind: 'reply', request: message.request, state: roomSnapshot(room, guest) })
          return
        }
        send(incoming, { kind: 'reply', request: message.request, state: roomSnapshot(room, room.guest) })
      } catch (issue) {
        send(incoming, { kind: 'reply', request: message.request, issue: issue.message, status: issue.status ?? 500 })
      }
    })
  })

  return {
    start(onUpdate, onStatus) {
      update = onUpdate
      status = onStatus
      status('connected')
      update(roomSnapshot(room, room.host))
    },
    async act(version, action) {
      if (['lobby-start', 'rematch'].includes(action.type) && !link?.open) throw error('友達の再接続を待っています。', 409)
      publish(updateRoom(room, room.host, version, action, randomSeats))
    },
    async leave() {
      if (!leaveRoom(room, room.host)) return
      publish()
      await new Promise(resolve => setTimeout(resolve, 120))
    },
    stop() {
      clearTimeout(retrySignal)
      peer.destroy()
      active.delete(session.id)
    },
  }
}

async function guestLink(session, lineup, joining = false) {
  const peer = await openPeer(roomPeerId(randomId()))
  let update
  let lost
  return new Promise((resolve, reject) => {
    const link = peer.connect(roomPeerId(session.id), { reliable: true })
    const pending = new Map()
    let counter = 0
    let ready = false
    let stopped = false
    let buffered
    const deadline = setTimeout(() => fail(error(unavailable, 404)), timeoutMs)

    function fail(issue) {
      if (stopped) return
      stopped = true
      clearTimeout(deadline)
      for (const request of pending.values()) {
        clearTimeout(request.timer)
        request.reject(issue)
      }
      pending.clear()
      peer.destroy()
      if (ready) lost?.()
      else reject(issue)
    }

    function request(data) {
      if (stopped || !link?.open) return Promise.reject(error('対戦に再接続してください。', 503))
      const id = ++counter
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => fail(error('相手から応答がありません。再接続します。', 503)), timeoutMs)
        pending.set(id, { timer, resolve, reject })
        send(link, { ...data, request: id })
      })
    }

    function accept(state) {
      if (!state || (buffered && state.version <= buffered.version)) return
      buffered = state
      update?.(state)
    }

    peer.on('error', () => { if (!ready) fail(error(unavailable, 404)) })
    link.on('error', () => fail(error(unavailable, 503)))
    link.on('close', () => fail(error(unavailable, 503)))
    link.on('data', raw => {
      const message = readMessage(raw)
      if (!message) return
      if (message.kind === 'state') accept(message.state)
      if (message.kind !== 'reply') return
      const result = pending.get(message.request)
      if (!result) return
      pending.delete(message.request)
      clearTimeout(result.timer)
      if (message.issue) result.reject(error(message.issue, message.status))
      else {
        accept(message.state)
        result.resolve()
      }
    })

    link.on('open', async () => {
      try {
        await request({ kind: joining ? 'join' : 'resume', token: session.token, lineup })
        clearTimeout(deadline)
        ready = true
        resolve({
          start(onUpdate, onDisconnect) {
            update = onUpdate
            lost = onDisconnect
            if (buffered) update(buffered)
          },
          request,
          stop() {
            lost = null
            fail(error('接続を終了しました。', 503))
          },
        })
      } catch (issue) { fail(issue) }
    })
  })
}

export async function enterPeerRoom(id, lineup, lobby) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const roomId = id ?? (lobby ? lobbyCode(crypto.getRandomValues(new Uint8Array(8))) : randomId())
    const session = { id: roomId, token: randomId(), transport: 'peer', role: id ? 'guest' : 'host' }
    try {
      const endpoint = id ? await guestLink(session, lineup, true) :
        hostRoom(await openPeer(roomPeerId(roomId)), session, lineup, lobby)
      active.set(roomId, endpoint)
      return session
    } catch (issue) {
      if (id || !lobby || issue.status !== 409 || attempt === 3) throw issue
    }
  }
}

export function connectPeerRoom(session, update, status) {
  let endpoint = active.get(session.id)
  if (session.role === 'host') {
    return {
      id: session.id,
      start: () => endpoint ? endpoint.start(update, status) : status('closed', 'ホストのページを再読み込みしたため、部屋が閉じました。'),
      act: (version, action) => endpoint.act(version, action),
      leave: () => endpoint?.leave(),
      stop: () => endpoint?.stop(),
    }
  }

  let stopped = false
  let roomClosed = false
  let lastVersion = -1
  let missedHost = 0
  let timer
  function reconnect() {
    if (stopped || roomClosed) return
    endpoint = null
    status('reconnecting')
    timer = setTimeout(resume, 1100)
  }
  function start(link) {
    missedHost = 0
    status('connected')
    link.start(state => {
      if (state.version <= lastVersion) return
      lastVersion = state.version
      roomClosed = state.phase === 'closed'
      update(state)
    }, reconnect)
  }
  async function resume() {
    if (stopped) return
    try {
      const next = await guestLink(session)
      if (stopped) return next.stop()
      endpoint = next
      start(endpoint)
    } catch (issue) {
      if (stopped) return
      if (issue.status === 404) missedHost++
      if ([403, 409].includes(issue.status) || missedHost >= 3) status('closed', issue.message)
      else reconnect()
    }
  }
  return {
    id: session.id,
    start: () => endpoint ? start(endpoint) : resume(),
    act: (version, action) => endpoint?.request({ kind: 'act', version, action }) ??
      Promise.reject(error('対戦に再接続してください。', 503)),
    leave: () => endpoint?.request({ kind: 'leave' }) ?? Promise.reject(error('対戦に再接続してください。', 503)),
    stop() {
      stopped = true
      clearTimeout(timer)
      endpoint?.stop()
      active.delete(session.id)
    },
  }
}
