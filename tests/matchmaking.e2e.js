import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createDevServer } from '../scripts/dev-server.js'
import { browserControl, eventually } from './browser-driver.js'

test('別ブラウザーで名前を保存し、デッキを保ったままランク対戦・再接続・フリー検索する',{timeout:60000},async t=>{
 const server=createDevServer();server.listen(0,'127.0.0.1');await once(server,'listening')
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve))})
 const temp=await realpath(tmpdir()),directory=await mkdtemp(join(temp,'fairytale-matchmaking-'))
 const open=await browserControl(t,directory)
 t.after(async()=>{const p=await realpath(directory);if(dirname(p)!==temp)throw new Error('Unexpected directory');await rm(p,{recursive:true,force:true,maxRetries:5,retryDelay:200})})
 const origin=process.env.FAIRYTALE_SERVER_URL??'http://127.0.0.1:'+server.address().port
 const a=await open(),b=await open()
 for(const [i,p] of [a,b].entries()){
  await p.viewport(1440,1000);await p.navigate(origin);await p.wait('#player-name')
  await p.evaluate(`(async()=>{const {createDeckCollection,starterLineup}=await import('/packages/cards/decks.js');const storage={keys:()=>Object.keys(localStorage),getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v),removeItem:k=>localStorage.removeItem(k)};const decks=createDeckCollection(storage);decks.save({name:'既存デッキ${i}',...starterLineup('mage')});window.__decksBefore=decks.backup();document.querySelector('#player-name').value='試験の語り手${i}';document.querySelector('#player-name-form').requestSubmit()})()`)
  await eventually(()=>p.evaluate('JSON.parse(localStorage.getItem("fairytale-player-v1")??"null")?.profile?.name'),'名前保存')
  assert(await p.evaluate(`(async()=>{const {createDeckCollection}=await import('/packages/cards/decks.js');return createDeckCollection({keys:()=>Object.keys(localStorage),getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v)}).backup()===window.__decksBefore})()`),'名前保存でデッキ不変')
  await p.click('[data-mode=ranked]');await p.click('[data-op=start]')
 }
 await a.wait('.mulligan');await b.wait('.mulligan')
 const reload=await a.evaluate('location.href');await a.navigate(reload);await a.wait('.mulligan')
 const first=await a.evaluate('Boolean(document.querySelector("[data-op=mulligan]"))')?a:b
 const second=first===a?b:a
 await first.click('[data-op=mulligan]');await second.click('[data-op=mulligan]')
 await a.wait('.battle');await b.wait('.battle');await a.wait('.online-clock')
 assert.match(await a.evaluate('document.querySelector(".battle").textContent'),/試験の語り手1/)
 await a.capture(new URL('../../work/matchmaking-battle.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))
 // Use the actual authenticated leave endpoint without a browser confirmation dialog.
 await a.evaluate(`(async()=>{const id=new URLSearchParams(location.search).get('room');const saved=JSON.parse(sessionStorage.getItem('fairytale-room.'+id));await fetch('/api/rooms/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+saved.token}})})()`)
 await a.wait('.online-result');await b.wait('.online-result')
 await eventually(()=>b.evaluate('document.querySelector(".online-result").textContent.includes("1016")'),'勝者のレート表示')
 await a.click('[data-op=home]');await a.wait('#player-name')
 assert.match(await a.evaluate('document.querySelector("[data-player-rank]").textContent'),/984/)
 await a.click('[data-mode=free]');await a.click('[data-op=start]');await a.wait('[data-op=cancel-search]')
 await a.click('[data-op=cancel-search]');await a.wait('[data-op=start]')
 await a.capture(new URL('../../work/matchmaking-home.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))
 assert.deepEqual(a.errors(),[]);assert.deepEqual(b.errors(),[])
})
