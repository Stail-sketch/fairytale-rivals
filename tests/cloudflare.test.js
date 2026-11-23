import assert from 'node:assert/strict'
import test from 'node:test'
import worker, { BattleRoom } from '../cloudflare/worker.js'
import { starterLineup, createDeckCollection } from '../packages/cards/decks.js'

function namespace() {
  const records = new Map()
  const instances = new Map()
  const alarms = new Map()
  return {
    idFromName: id => id,
    reboot: id => instances.delete(id),
    stored: id => structuredClone(records.get(id)),
    alarm: id => instances.get(id).alarm(),
    expire(id) { records.get(id).get('room').expires = 0; instances.delete(id) },
    get(id) {
      if (!records.has(id)) records.set(id, new Map())
      if (!instances.has(id)) {
        let queue = Promise.resolve()
        const storage = {
          get: async key => structuredClone(records.get(id).get(key)),
          setAlarm: async value => alarms.set(id, value),
          deleteAll: async () => records.set(id, new Map()),
          transaction: async callback => {
            const staged = structuredClone(records.get(id))
            let alarm
            await callback({ put: async (key, value) => staged.set(key, structuredClone(value)), setAlarm: async value => { alarm = value } })
            records.set(id, staged)
            alarms.set(id, alarm)
          },
        }
        instances.set(id, new BattleRoom({ storage, blockConcurrencyWhile(callback) {
          const next = queue.then(callback)
          queue = next.catch(() => {})
          return next
        } }))
      }
      return { fetch: request => instances.get(id).fetch(request) }
    },
  }
}

function client() {
  const rooms = namespace()
  const env = { ROOMS: rooms, ASSETS: { fetch: async () => new Response('game') } }
  const request = async (path = '', { method = 'GET', body, player, headers = {}, signal } = {}) => {
    const response = await worker.fetch(new Request('https://game.example/api/rooms' + path, {
      method, signal, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(player ? { Authorization: 'Bearer ' + player.token } : {}), ...headers },
    }), env)
    return { status: response.status, data: response.status === 204 ? null : await response.json() }
  }
  return { rooms, request,
    act: (player, version, action) => request('/' + player.id + '/actions', { method: 'POST', player, body: { version, action } }),
    state: player => request('/' + player.id, { player }),
    create: (body = { lobby: true }) => request('', { method: 'POST', body }),
    join: id => request('/' + id + '/join', { method: 'POST', body: { lobby: true } }),
  }
}

test('Cloudflareロビーはオブジェクトの再起動後も同じID・準備状態を保持する', async () => {
  const api = client()
  const created = await api.create()
  assert.equal(created.status, 201)
  const host = created.data
  const guest = (await api.join(host.id)).data
  const ready = leader => ({ type: 'lobby-ready', ready: true, lineup: starterLineup(leader) })
  const results = await Promise.all([api.act(host, 1, ready('mage')), api.act(guest, 1, ready('priest'))])
  assert.ok(results.every(result => result.status === 200))
  api.rooms.reboot(host.id)
  const lobby = (await api.state(host)).data
  assert.equal(lobby.version, 3)
  assert.deepEqual(lobby.lobby.guest, { joined: true, ready: true, leader: 'priest' })
  assert.equal(JSON.stringify(lobby).includes(host.token), false)
  assert.equal(JSON.stringify(lobby).includes('FT-'), false)
  assert.equal((await api.act(host, 3, { type: 'lobby-start' })).status, 200)
  const before = (await api.state(host)).data
  api.rooms.reboot(host.id)
  assert.deepEqual((await api.state(host)).data, before)
  assert.deepEqual(before.view.players[1 - before.seat].hand, [])
  const first = before.seat === 0 ? host : guest
  const second = first === host ? guest : host
  assert.equal((await api.act(first, 4, { type: 'mulligan', replace: [] })).status, 200)
  api.rooms.reboot(host.id)
  assert.equal((await api.act(second, 5, { type: 'mulligan', replace: [] })).status, 200)
  const concurrent = await Promise.all([api.act(first, 6, { type: 'end' }), api.act(first, 6, { type: 'end' })])
  assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409])
  api.rooms.reboot(host.id)
  assert.equal((await api.state(second)).data.view.active, 1)
})

test('Cloudflareの更新待ちは相手の操作を阻まず、退出・不正アクセスも反映する', async () => {
  const api = client()
  const host = (await api.create()).data
  assert.equal((await api.request('/' + host.id)).status, 403)
  const controller = new AbortController()
  const waiting = api.request('/' + host.id + '?since=0', { player: host, signal: controller.signal })
  try {
    const guest = (await api.join(host.id)).data
    assert.equal((await waiting).data.lobby.guest.joined, true)
    assert.equal((await api.join(host.id)).status, 409)
    assert.equal((await api.request('/' + host.id, { method: 'DELETE', player: guest })).status, 204)
    assert.equal((await api.state(guest)).status, 403)
    assert.equal((await api.state(host)).data.lobby.guest.joined, false)
    assert.equal((await api.request('/' + host.id, { method: 'DELETE', player: host })).status, 204)
    assert.equal((await api.join(host.id)).status, 404)
  } finally { controller.abort() }
})

test('Cloudflareは本文上限・入力・存在しないAPI・期限切れを検査する', async () => {
  const api = client()
  assert.equal((await api.create({ leader: 'mage', deck: [] })).status, 400)
  assert.equal((await api.create({ lobby: true, padding: 'x'.repeat(13_000) })).status, 413)
  assert.equal((await api.request('', { method: 'POST', body: {}, headers: { 'Content-Type': 'text/plain' } })).status, 415)
  assert.equal((await api.request('/create/hack', { method: 'POST', body: {} })).status, 404)
  const host = (await api.create()).data
  api.rooms.expire(host.id)
  assert.equal((await api.state(host)).status, 404)
  await api.rooms.alarm(host.id)
  assert.equal(api.rooms.stored(host.id).size, 0)
})

test('Cloudflare闘技場はピック途中の再起動から復元し、完成デッキだけで対戦できる', async () => {
  const api = client()
  const host = (await api.create({ lobby: true, arena: true })).data
  let state = (await api.state(host)).data
  assert.equal(state.arena.draft.stage, 'class')
  const chosen = state.arena.draft.choices[0]
  assert.equal((await api.act(host, state.version, { type: 'arena-class', choice: chosen })).status, 200)
  api.rooms.reboot(host.id)
  state = (await api.state(host)).data
  assert.equal(state.arena.draft.leader, chosen)
  const guest = (await api.join(host.id)).data
  const other = (await api.state(guest)).data
  assert.deepEqual(other.arena.draft.allocation, state.arena.draft.allocation)
  assert.equal(Object.hasOwn(other.lobby.host, 'choices'), false)
  assert.equal((await api.act(guest, other.version, { type: 'lobby-ready', ready: true })).status, 409)
  for (const player of [host, guest]) {
    state = (await api.state(player)).data
    while (state.arena.draft.stage !== 'complete') {
      const draft = state.arena.draft
      const result = await api.act(player, state.version, {
        type: { class: 'arena-class', door: 'arena-door', card: 'arena-pick' }[draft.stage], choice: draft.choices[0],
      })
      assert.equal(result.status, 200)
      state = result.data
    }
    api.rooms.reboot(host.id)
    const restored = (await api.state(player)).data
    assert.deepEqual(restored.arena.draft, state.arena.draft)
    assert.equal((await api.act(player, restored.version, { type: 'lobby-ready', ready: true, lineup: {} })).status, 200)
  }
  state = (await api.state(host)).data
  const started = await api.act(host, state.version, { type: 'lobby-start' })
  assert.equal(started.status, 200)
  assert.equal(started.data.view.phase, 'mulligan')
  assert.deepEqual(started.data.view.players[1 - started.data.seat].hand, [])
  api.rooms.reboot(host.id)
  assert.deepEqual((await api.state(host)).data, started.data)
})

function memoryStorage() {
  const map = new Map()
  return { map, keys: () => map.keys(), getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }
}

test('デッキ引き継ぎは名前・カード・作成順を保ち、重複やID衝突でも既存デッキを壊さない', () => {
  const source = createDeckCollection(memoryStorage())
  const first = source.save({ name: '私の夢時計', ...starterLineup('mage') }).deck
  source.save({ name: '森の仲間', ...starterLineup('priest') })
  const destination = createDeckCollection(memoryStorage())
  assert.deepEqual(destination.restore(source.backup()), { ok: true, added: 2, skipped: 0 })
  assert.deepEqual(destination.list(), source.list())
  assert.deepEqual(destination.restore(source.backup()), { ok: true, added: 0, skipped: 2 })
  const backup = JSON.parse(source.backup())
  backup.decks[0].name = '別の名前'
  assert.equal(destination.restore(JSON.stringify(backup)).added, 1)
  assert.equal(destination.get(first.id).name, first.name)
  assert.equal(destination.list().length, 3)
})

test('不正・容量不足のデッキ引き継ぎは既存デッキを保持し、途中追加を取り消す', () => {
  const source = createDeckCollection(memoryStorage())
  source.save({ name: '夢時計', ...starterLineup('mage') })
  source.save({ name: '森', ...starterLineup('priest') })
  const storage = memoryStorage()
  const destination = createDeckCollection(storage)
  assert.equal(destination.restore('bad').ok, false)
  const invalid = JSON.parse(source.backup())
  invalid.decks[1].deck = ['unknown']
  assert.equal(destination.restore(JSON.stringify(invalid)).ok, false)
  assert.equal(destination.list().length, 0)
  const put = storage.setItem
  let writes = 0
  storage.setItem = (key, value) => { if (++writes === 2) throw new Error('quota'); put(key, value) }
  assert.equal(destination.restore(source.backup()).ok, false)
  assert.equal(destination.list().length, 0)
})
