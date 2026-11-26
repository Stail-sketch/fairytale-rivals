import test from 'node:test'
import assert from 'node:assert/strict'
import { developmentWorker } from '../packages/online-match/development-worker.js'
import { starterLineup, createDeckCollection } from '../packages/cards/decks.js'
import { createPlayerProfile, profileKey } from '../apps/web/player-profile.js'
import { chooseCpuAction } from '../packages/cpu/index.js'

function client(t) {
  const api = developmentWorker(); t.after(() => api.close())
  const request = async (path, credential, method = 'GET', body) => {
    const response = await api.fetch(new Request('https://game.example' + path, { method,
      headers: { ...(credential ? { Authorization: 'Bearer ' + credential } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined }))
    return { status: response.status, data: response.status === 204 ? null : await response.json() }
  }
  const register = async name => { const result = await request('/api/players', null, 'POST', { name }); assert.equal(result.status,201); return result.data }
  const queue = (p, mode = 'ranked') => request('/api/matchmaking',p.credential,'POST',{mode,lineup:starterLineup('mage')})
  const state = session => request('/api/rooms/' + session.id, session.token)
  return { api, request, register, queue, state,
    async pair(mode = 'ranked', names = ['アリス使い', '森の語り手']) {
      const a = await register(names[0]), b = await register(names[1])
      assert.equal((await queue(a,mode)).data.phase,'searching')
      const second = await queue(b,mode); assert.equal(second.data.phase,'matched')
      const first = await request('/api/matchmaking',a.credential)
      return { a,b, first:first.data.session, second:second.data.session }
    } }
}

test('名前保存と変更は既存の全デッキを保ち、認証情報は専用キーだけに書く',async t=>{
 const c=client(t), map=new Map(), storage={ keys:()=>map.keys(),getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k) }
 const decks=createDeckCollection(storage);decks.save({name:'そのまま残すデッキ',...starterLineup('mage')})
 const before=new Map(map), saved=decks.backup()
 const profile=createPlayerProfile(storage,(url,options)=>c.api.fetch(new Request('https://game.example'+url,options)))
 await profile.saveName('物語の主');const id=profile.profile.id
 await profile.saveName('新しい名前')
 assert.equal(profile.profile.id,id);assert.equal(decks.backup(),saved)
 for(const [key,value] of before)assert.equal(map.get(key),value)
 assert.equal(map.size,before.size+1);assert(map.has(profileKey))
 const reloaded=createPlayerProfile(storage,(url,options)=>c.api.fetch(new Request('https://game.example'+url,options)))
 await reloaded.refresh();assert.equal(reloaded.profile.name,'新しい名前')
})

test('ランク・フリーの待機列を分け、自分自身と対戦せずキャンセルできる',async t=>{
 const c=client(t),a=await c.register('A'),b=await c.register('B')
 assert.equal((await c.queue(a)).data.phase,'searching')
 assert.equal((await c.queue(a)).data.phase,'searching')
 assert.equal((await c.queue(b,'free')).data.phase,'searching')
 assert.equal((await c.request('/api/matchmaking',a.credential,'DELETE')).data.phase,'idle')
 assert.equal((await c.request('/api/matchmaking',a.credential)).data.phase,'idle')
 const hub=c.api.env.MATCHMAKING.entries.get('global-v1').instance
 const queue=await hub.ctx.storage.get('queue');queue[0].touched=0;await hub.ctx.storage.put('queue',queue)
 assert.equal((await c.request('/api/matchmaking',b.credential)).data.phase,'idle')
})

test('同名でも別IDで対戦し、投了結果はサーバーで一度だけランクへ反映する',async t=>{
 const c=client(t), {a,b,first,second}=await c.pair('ranked',['同じ名前','同じ名前'])
 assert.notEqual(a.profile.id,b.profile.id);assert.equal(first.id,second.id);assert.notEqual(first.token,second.token)
 const state=(await c.state(first)).data
 assert.deepEqual(state.online.players,['同じ名前','同じ名前']);assert.deepEqual(state.view.players[1-state.seat].hand,[])
 assert(!JSON.stringify(state).includes(second.token));assert.equal(state.view.phase,'mulligan')
 await c.request('/api/rooms/'+first.id,first.token,'DELETE')
 const loser=(await c.request('/api/players/me',a.credential)).data.profile
 const winner=(await c.request('/api/players/me',b.credential)).data.profile
 assert.equal(loser.rating,984);assert.equal(loser.losses,1);assert.equal(winner.rating,1016);assert.equal(winner.wins,1)
 const final=(await c.state(first)).data;assert.equal(final.online.result.id,a.profile.id);assert.equal(final.online.result.change,-16)
 await c.request('/api/rooms/'+first.id,first.token,'DELETE');await c.state(second)
 assert.equal((await c.request('/api/players/me',b.credential)).data.profile.wins,1)
 assert.equal((await c.request('/api/matchmaking',a.credential)).data.phase,'idle')
})

test('フリーマッチでは投了してもランクとランク戦績が変わらない',async t=>{
 const c=client(t),{a,b,first}=await c.pair('free')
 await c.request('/api/rooms/'+first.id,first.token,'DELETE')
 for(const p of [a,b])assert.deepEqual((await c.request('/api/players/me',p.credential)).data.profile,p.profile)
})

test('不正認証・未知カード・結果偽装・内部URLの呼び出しを拒否する',async t=>{
 const c=client(t),p=await c.register('本物')
 assert.equal((await c.request('/api/players/me',p.credential.slice(0,-1)+'x')).status,403)
 assert.equal((await c.request('/api/matchmaking')).status,403)
 assert.equal((await c.request('/api/matchmaking',p.credential,'POST',{mode:'ranked',lineup:{leader:'mage',deck:Array(30).fill('unknown')}})).status,400)
 assert.equal((await c.request('/api/internal/result',p.credential,'POST',{winner:0})).status,404)
 assert.equal((await c.request('/api/rooms/create-match/abcd',p.credential,'POST',{})).status,404)
 await c.request('/api/players/me',p.credential,'POST',{name:'変更',rating:99999,wins:999})
 assert.equal((await c.request('/api/players/me',p.credential)).data.profile.rating,1000)
 for(const name of ['', 'a'.repeat(21),'名前\n改行','名前\u202e'])assert.equal((await c.request('/api/players',null,'POST',{name})).status,400)
})

test('対戦中の再検索は同じ部屋へ復帰し、時間切れは負けとして一度だけ記録する',async t=>{
 const c=client(t),{a,b,first}=await c.pair()
 assert.deepEqual((await c.queue(a,'free')).data.session,first)
 const room=c.api.env.ROOMS.entries.get(first.id).instance
 const before=(await c.state(first)).data
 room.room.deadline=0
 const after=(await c.state(first)).data
 assert.equal(after.view.phase,'finished');assert.equal(after.resigned,before.view.active)
 const loser=after.resigned===after.seat?a:b
 assert.equal((await c.request('/api/players/me',loser.credential)).data.profile.losses,1)
 await c.state(first)
 assert.equal((await c.request('/api/players/me',loser.credential)).data.profile.losses,1)
})

test('通常のカードバトルでの決着もランクに反映し、再起動後に同じ結果を保持する',async t=>{
 const c=client(t),{a,b,first,second}=await c.pair()
 const initial=(await c.state(first)).data
 const sessions=initial.seat===0?[first,second]:[second,first]
 let final
 for(let i=0;i<600;i++){
   const current=(await c.state(first)).data
   if(current.view.phase==='finished'){final=current;break}
   const actor=current.view.decisionSeat??current.view.active
   const own=(await c.state(sessions[actor])).data
   const action=own.view.phase==='mulligan'?{type:'mulligan',replace:[]}:chooseCpuAction(own.view,actor)
   const result=await c.request('/api/rooms/'+first.id+'/actions',sessions[actor].token,'POST',{version:own.version,action})
   assert.equal(result.status,200,JSON.stringify(result.data))
 }
 assert(final,'対戦が決着する')
 const entry=c.api.env.ROOMS.entries.get(first.id), Old=entry.instance.constructor
 entry.instance=new Old(entry.instance.ctx,c.api.env)
 assert.deepEqual((await c.state(first)).data,final)
 const profiles=await Promise.all([a,b].map(async p=>(await c.request('/api/players/me',p.credential)).data.profile))
 assert.equal(profiles.reduce((n,p)=>n+p.wins+p.losses+p.draws,0),2)
})

test('部屋作成や結果保存の通信失敗から復旧し、成績の二重加算を防ぐ',async t=>{
 const c=client(t), a=await c.register('A'),b=await c.register('B')
 await c.queue(a)
 const getRoom=c.api.env.ROOMS.get
 c.api.env.ROOMS.get=()=>({fetch:async()=>new Response('{}',{status:503})})
 assert.equal((await c.queue(b)).status,503)
 c.api.env.ROOMS.get=getRoom
 const hubEntry=c.api.env.MATCHMAKING.entries.get('global-v1'),Hub=hubEntry.instance.constructor
 hubEntry.instance=new Hub(hubEntry.instance.ctx,c.api.env)
 const resumed=(await c.request('/api/matchmaking',a.credential)).data
 assert.equal(resumed.phase,'matched')
 const session=resumed.session, getHub=c.api.env.MATCHMAKING.get
 let failed=true
 c.api.env.MATCHMAKING.get=id=>{
  const stub=getHub(id)
  return {fetch:async request=>{const response=await stub.fetch(request);if(failed&&new URL(request.url).pathname==='/internal/result'){failed=false;throw new Error('lost response')}return response}}
 }
 await c.request('/api/rooms/'+session.id,session.token,'DELETE')
 const final=(await c.state(session)).data
 assert.equal(final.online.result.change,-16)
 assert.equal((await c.request('/api/players/me',a.credential)).data.profile.losses,1)
 assert.equal((await c.request('/api/players/me',b.credential)).data.profile.wins,1)
})

test('フレンドロビーと対戦の名前表示には相手の秘密情報を含めない',async t=>{
 const c=client(t)
 const host=(await c.request('/api/rooms',null,'POST',{lobby:true,name:'友達A'})).data
 const guest=(await c.request('/api/rooms/'+host.id+'/join',null,'POST',{lobby:true,name:'友達B'})).data
 let state=(await c.state(host)).data
 assert.equal(state.lobby.host.name,'友達A');assert.equal(state.lobby.guest.name,'友達B')
 for(const p of [host,guest]){
  const result=await c.request('/api/rooms/'+host.id+'/actions',p.token,'POST',{version:state.version,action:{type:'lobby-ready',ready:true,lineup:starterLineup('mage')}})
  state=result.data
 }
 const started=(await c.request('/api/rooms/'+host.id+'/actions',host.token,'POST',{version:state.version,action:{type:'lobby-start'}})).data
 assert.deepEqual(new Set(started.players),new Set(['友達A','友達B']))
 assert(!JSON.stringify(started).includes(guest.token));assert(!started.online)
})
