import { connectPeerRoom, enterPeerRoom } from './peer-room.js'
import { normalizeRoomId } from '../../packages/online-match/lobby.js'

const base = '/api/rooms'
const sessionKey = id => 'fairytale-room.' + id
const directRoom = () => location.hostname.endsWith('.github.io') || new URLSearchParams(location.search).get('transport') === 'peer'
export const onlineAvailable = () => ['http:', 'https:'].includes(location.protocol) && (!directRoom() || Boolean(globalThis.RTCPeerConnection))

export function invitedRoom() {
  const id = new URLSearchParams(location.search).get('room')
  return normalizeRoomId(id)
}

export function inviteUrl(id) {
  const url = new URL(location.pathname, location.origin)
  url.searchParams.set('room', id)
  if (directRoom()) url.searchParams.set('transport', 'peer')
  return url.href
}

export function savedRoom(id) {
  if (!id) return null
  try {
    const stored = sessionStorage.getItem(sessionKey(id))
    if (!stored) return null
    const session = stored.startsWith('{') ? { ...JSON.parse(stored), id } : { id, token: stored }
    return directRoom() && session.transport !== 'peer' ? null : session
  } catch { return null }
}

export function rememberRoom({ id, ...session }) {
  try { sessionStorage.setItem(sessionKey(id), JSON.stringify(session)) } catch { /* The current tab can still play. */ }
  history.replaceState(null, '', inviteUrl(id))
}

export function forgetRoom(id) {
  try { sessionStorage.removeItem(sessionKey(id)) } catch { /* Storage is optional. */ }
  if (invitedRoom()) {
    const url = new URL(location.href)
    url.searchParams.delete('room')
    history.replaceState(null, '', url)
  }
}

async function request(path, { method = 'GET', body, token, signal, timeout = 12_000 } = {}) {
  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = 'Bearer ' + token
  if (body) headers['Content-Type'] = 'application/json'
  const deadline = AbortSignal.timeout(timeout)
  const response = await fetch(path, {
    method, headers, body: body && JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
  })
  if (response.status === 204) return null
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) throw Object.assign(
    new Error(result?.issue ?? '対戦サーバーに接続できません。'), { status: response.status },
  )
  return result
}

export function enterRoom(id, lineup, lobby = false) {
  if (directRoom()) return enterPeerRoom(id, lineup, lobby)
  return request(id ? `${base}/${id}/join` : base, { method: 'POST', body: lobby ? { lobby: true } : lineup })
}

export function connectRoom(session, update, connection) {
  if (session.transport === 'peer') return connectPeerRoom(session, update, connection)
  const path = base + '/' + session.id
  const controller = new AbortController()
  const { signal } = controller
  let received
  let status
  function report(next, message) {
    if (status === next) return
    status = next
    connection(next, message)
  }
  function accept(next) {
    if (signal.aborted || !next || next.version <= (received?.version ?? -1)) return
    received = next
    update(next)
  }
  async function poll() {
    while (!signal.aborted && received?.phase !== 'closed' && received?.view?.phase !== 'finished') {
      try {
        const next = await request(path + '?since=' + (received?.version ?? -1), {
          token: session.token, signal, timeout: 30_000,
        })
        if (signal.aborted) return
        report('connected')
        accept(next)
      } catch (error) {
        if (signal.aborted) return
        if ([403, 404].includes(error.status)) {
          report('closed', error.message)
          return
        }
        report('reconnecting')
        await new Promise(resolve => setTimeout(resolve, 1200))
      }
    }
  }
  return {
    id: session.id,
    start: poll,
    async act(version, action) {
      accept(await request(path + '/actions', {
        method: 'POST', body: { version, action }, token: session.token, signal,
      }))
    },
    leave: () => request(path, { method: 'DELETE', token: session.token, timeout: 5000 }),
    stop: () => controller.abort(),
  }
}
