import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { starterLineup } from '../packages/cards/decks.js'
import { createDevServer } from '../scripts/dev-server.js'

async function roomClient(t) {
  const server = createDevServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => {
    server.closeAllConnections()
    return new Promise(resolve => server.close(resolve))
  })
  const base = `http://127.0.0.1:${server.address().port}/api/rooms`
  async function request(path = '', { method = 'GET', body, token, signal } = {}) {
    const headers = {}
    if (body) headers['Content-Type'] = 'application/json'
    if (token) headers.Authorization = 'Bearer ' + token
    const response = await fetch(base + path, { method, headers, body: body && JSON.stringify(body), signal })
    return { status: response.status, data: response.status === 204 ? undefined : await response.json() }
  }
  return {
    request,
    act: (player, version, action) => request('/' + player.id + '/actions', {
      method: 'POST', token: player.token, body: { version, action },
    }),
    state: (player, since = -1, signal) => request('/' + player.id + '?since=' + since, { token: player.token, signal }),
    leave: player => request('/' + player.id, { method: 'DELETE', token: player.token }),
    create: () => request('', { method: 'POST', body: starterLineup('mage', false) }),
    join: id => request('/' + id + '/join', { method: 'POST', body: starterLineup('priest', false) }),
  }
}

test('招待URLの二人だけで対戦を進め、手札を分離し、同じ操作の再送を防ぐ', async t => {
  const api = await roomClient(t)
  const created = await api.create()
  assert.equal(created.status, 201)
  const host = created.data
  assert.match(host.id, /^[a-f0-9]{32}$/)
  assert.equal((await api.request('/' + host.id)).status, 403)
  assert.deepEqual((await api.state(host)).data, { version: 0, phase: 'waiting' })
  const hostWaiting = api.state(host, 0)
  const joined = await api.join(host.id)
  assert.equal(joined.status, 201)
  const guest = joined.data
  assert.notEqual(host.token, guest.token)
  assert.equal((await api.join(host.id)).status, 409)
  const states = [(await hostWaiting).data, (await api.state(guest)).data]
  assert.deepEqual(states.map(state => state.version), [1, 1])
  for (const state of states) {
    const { seat, view } = state
    assert.equal(view.phase, 'mulligan')
    assert.equal(view.players[seat].hand.length, seat === 0 ? 3 : 4)
    assert.deepEqual(view.players[1 - seat].hand, [])
    assert.equal(Object.hasOwn(view, 'seed'), false)
    assert.equal(Object.hasOwn(view.players[1 - seat], 'deck'), false)
  }
  const [first, second] = states[0].seat === 0 ? [host, guest] : [guest, host]
  const mulligan = { type: 'mulligan', replace: [] }
  assert.equal((await api.act(second, 1, mulligan)).status, 422)
  const remote = api.state(second, 1)
  assert.equal((await api.act(first, 1, mulligan)).status, 200)
  assert.equal((await remote).data.view.active, 1)
  const started = (await api.act(second, 2, mulligan)).data
  assert.equal(started.view.phase, 'battle')
  assert.equal(started.view.legal, null)
  assert.ok(started.last.events.every(event => event.privateTo === undefined))
  assert.ok(started.view.events.every(event => event.privateTo === undefined || event.privateTo === 1))
  const turns = await Promise.all([api.act(first, 3, { type: 'end' }), api.act(first, 3, { type: 'end' })])
  assert.deepEqual(turns.map(result => result.status).sort(), [200, 409])
  const reconnected = (await api.state(second)).data
  assert.equal(reconnected.version, 4)
  assert.equal(reconnected.view.active, 1)
  assert.ok(reconnected.view.legal)
  const finish = api.state(first, 4)
  assert.equal((await api.leave(second)).status, 204)
  const ended = (await finish).data
  assert.equal(ended.resigned, 1)
  assert.equal(ended.view.phase, 'finished')
  assert.equal(ended.view.winner, 0)
  assert.equal((await api.act(first, ended.version, { type: 'end' })).status, 409)
})

test('未参加の部屋は閉じられ、デッキが不正なら入室できない', async t => {
  const api = await roomClient(t)
  const host = (await api.create()).data
  const bad = await api.request('/' + host.id + '/join', {
    method: 'POST', body: { leader: 'mage', deck: Array.from({ length: 30 }, () => ['spark']) },
  })
  assert.equal(bad.status, 400)
  assert.equal((await api.state(host)).data.phase, 'waiting')
  assert.equal((await api.leave(host)).status, 204)
  assert.equal((await api.join(host.id)).status, 404)
})

test('ロビーIDで入室し、両者の準備後にホストが対戦を開始できる', async t => {
  const api = await roomClient(t)
  const host = (await api.request('', { method: 'POST', body: { lobby: true } })).data
  assert.match(host.id, /^[a-z2-9]{8}$/)
  const join = () => api.request('/' + host.id + '/join', { method: 'POST', body: { lobby: true } })
  const guest = (await join()).data
  assert.equal((await join()).status, 409)
  assert.equal((await api.act(guest, 1, { type: 'lobby-start' })).status, 403)
  assert.equal((await api.act(host, 1, { type: 'lobby-start' })).status, 409)
  assert.equal((await api.act(guest, 1, { type: 'lobby-ready', ready: true, lineup: {} })).status, 400)
  assert.equal((await api.leave(guest)).status, 204)
  assert.equal((await api.state(host)).data.lobby.guest.joined, false)
  assert.equal((await api.state(guest)).status, 403)
  const replacement = (await join()).data
  const ready = leader => ({ type: 'lobby-ready', ready: true, lineup: starterLineup(leader) })
  const [guestReady, hostReady] = await Promise.all([
    api.act(replacement, 3, ready('priest')), api.act(host, 3, ready('mage')),
  ])
  assert.equal(guestReady.status, 200)
  assert.equal(hostReady.status, 200)
  const waiting = guestReady.data
  assert.equal(waiting.phase, 'lobby')
  assert.deepEqual(waiting.lobby.guest, { joined: true, ready: true, leader: 'priest' })
  assert.equal((await api.act(host, 3, ready('mage'))).status, 409)
  const started = (await api.act(host, 5, { type: 'lobby-start' })).data
  assert.equal(started.view.phase, 'mulligan')
  assert.equal(started.view.players[started.seat].leader, 'mage')
  assert.deepEqual(started.view.players[1 - started.seat].hand, [])
})

test('第3弾のカードで配置した舞台がフレンド対戦の両画面に反映される', async t => {
  const api = await roomClient(t)
  const safeCards = ['dew', 'cheer', 'storm', 'FT-0084', 'FT-0080', 'FT-0086', 'FT-0378',
    'FT-0379', 'FT-0387', 'FT-0395', 'FT-0396', 'FT-0397', 'FT-0511', 'FT-0369']
  const lineup = { leader: 'warrior', deck: ['FT-0507', ...safeCards].flatMap(id => [id, id]) }
  const created = await api.request('', { method: 'POST', body: lineup })
  assert.equal(created.status, 201)
  const warriorClient = created.data
  const opponent = (await api.join(warriorClient.id)).data
  const warriorSeat = (await api.state(warriorClient)).data.seat
  const clients = warriorSeat === 0 ? [warriorClient, opponent] : [opponent, warriorClient]
  let version = 1
  for (const client of clients) {
    const result = await api.act(client, version, { type: 'mulligan', replace: [] })
    assert.equal(result.status, 200)
    version = result.data.version
  }
  for (let turn = 0; turn < 54; turn++) {
    const actor = turn % 2
    const client = clients[actor]
    let { data: { view } } = await api.state(client)
    if (actor === warriorSeat) {
      while (!view.players[actor].hand.some(instance => instance.card === 'FT-0507')) {
        const filler = view.players[actor].hand.find(instance => view.legal.play[instance.id].enabled)
        if (!filler) break
        const position = view.legal.play[filler.id].positions?.[0]
        const played = await api.act(client, version, { type: 'play', id: filler.id, position })
        assert.equal(played.status, 200)
        version = played.data.version
        view = played.data.view
      }
    }
    const card = view.players[actor].hand.find(instance => instance.card === 'FT-0507')
    if (card && view.legal.play[card.id].enabled) {
      const position = view.legal.play[card.id].positions[0]
      const result = await api.act(client, version, { type: 'play', id: card.id, position })
      assert.equal(result.status, 200)
      const other = (await api.state(clients[1 - actor])).data
      assert.equal(other.version, result.data.version)
      assert.deepEqual(other.view.players[actor].terrain, { [position.row + ':' + position.column]: 'sword' })
      assert.deepEqual(other.view.players[actor].terrain, result.data.view.players[actor].terrain)
      assert.deepEqual(other.view.players[actor].hand, [])
      assert(other.view.events.some(event => event.type === 'terrain' && event.terrain === 'sword'))
      const passed = await api.act(client, other.version, { type: 'end' })
      assert.equal(passed.status, 200)
      const returned = await api.act(clients[1 - actor], passed.data.version, { type: 'end' })
      assert.equal(returned.status, 200)
      assert.equal(returned.data.view.legal, null, '操作側の予測を対戦相手へ送らない')
      const turn = (await api.state(client)).data.view
      const forecast = turn.legal.attack[card.id].forecasts.find(info => info.target.kind === 'leader')
      assert.equal(forecast.hp, 25 - forecast.damage)
      return
    }
    const result = await api.act(client, version, { type: 'end' })
    assert.equal(result.status, 200)
    version = result.data.version
  }
  assert.fail('第3弾カードを引いて使用できる')
})

