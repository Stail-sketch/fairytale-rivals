import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createDevServer } from '../scripts/dev-server.js'
import { browserControl, eventually } from './browser-driver.js'

test('ホーム・対戦準備・フレンドロビーを行き来し、プロフィールと既存デッキを保つ',{timeout:60000},async t=>{
 const server=createDevServer();server.listen(0,'127.0.0.1');await once(server,'listening')
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve))})
 const temp=await realpath(tmpdir()),directory=await mkdtemp(join(temp,'fairytale-menu-'))
 const open=await browserControl(t,directory)
 t.after(async()=>{const p=await realpath(directory);if(dirname(p)!==temp)throw new Error('Unexpected directory');await rm(p,{recursive:true,force:true,maxRetries:5,retryDelay:200})})
 const origin=process.env.FAIRYTALE_SERVER_URL??'http://127.0.0.1:'+server.address().port
 const a=await open(),b=await open()
 await a.viewport(1600,1000);await a.navigate(origin);await a.wait('.home-layout')
 assert.equal(await a.evaluate('Boolean(document.querySelector("#player-name"))'),false)
 await a.evaluate(`(async()=>{const {createDeckCollection,starterLineup}=await import('/packages/cards/decks.js');const storage={keys:()=>Object.keys(localStorage),getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v),removeItem:k=>localStorage.removeItem(k)};const c=createDeckCollection(storage);window.__deck=c.save({name:'夢時計の魔法・試験',...starterLineup('mage')}).deck;window.__before=c.backup()})()`)
 await a.click('[data-op=profile]');await a.wait('#profile-dialog[open]')
 await a.evaluate(`document.querySelector('#player-name').value='物語の主';document.querySelector('#player-name-form').requestSubmit()`)
 await eventually(()=>a.evaluate('!document.querySelector("#profile-dialog")'),'名前を保存してプロフィールを閉じる')
 await a.click('[data-op=pick-lineup]');await a.wait('.preparation-layout')
 await a.evaluate(`const select=document.querySelector('#match-deck-0');select.value=window.__deck.id;select.dispatchEvent(new Event('change',{bubbles:true}))`)
 assert.match(await a.evaluate('document.querySelector(".preparation-selected").textContent'),/夢時計の魔法・試験/)
 await a.click('[data-op=menu-home]');await a.wait('.home-layout')
 const screenshot=name=>new URL('../../work/menu-'+name+'.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')
 await a.capture(screenshot('home'))
 await a.viewport(390,844);await a.capture(screenshot('home-mobile'));assert(await a.evaluate('document.documentElement.scrollWidth<=innerWidth'),await a.evaluate('JSON.stringify([...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right})).slice(0,15))'))
 assert(await a.evaluate('document.querySelector(".brand").getBoundingClientRect().height<60'),'モバイルのヘッダーを横書きで表示')
 await a.capture(screenshot('home-mobile'));await a.viewport(1600,1000)
 await a.click('[data-op=prepare]');await a.click('[data-mode=ranked]');await a.capture(screenshot('prepare'))
 await a.viewport(390,844);assert(await a.evaluate('document.documentElement.scrollWidth<=innerWidth'),'対戦準備の横幅')
 await a.capture(screenshot('prepare-mobile'));await a.viewport(1600,1000)
 await a.click('[data-op=start]');await a.wait('.match-search');assert(await a.evaluate('Boolean(document.querySelector("[data-op=decks]:disabled"))'))
 await a.click('[data-op=cancel-search]');await a.wait('.preparation-layout')
 await a.click('[data-mode=friend]');await a.click('[data-op=start]');await a.wait('[data-lobby-member=host]')
 const id=await a.evaluate('document.querySelector("#lobby-id").value')
 await b.viewport(1600,1000);await b.navigate(origin);await b.click('[data-op=prepare]');await b.click('[data-mode=friend]')
 await b.evaluate(`document.querySelector('#lobby-id-input').value=${JSON.stringify(id)};document.querySelector('#lobby-join').requestSubmit()`)
 await b.wait('[data-lobby-member=guest]');await a.click('[data-op=lobby-ready]');await b.click('[data-op=lobby-ready]')
 await a.wait('[data-lobby-member=guest][data-ready=true]')
 assert.equal(await a.evaluate('document.querySelector("[data-op=lobby-start]").disabled'),false)
 assert.equal(await b.evaluate('document.querySelector(".lobby-members > section").dataset.lobbyMember'),'guest')
 await a.capture(screenshot('friend'))
 for(const [page,name] of [[a,'friend'],[b,'guest']]){
  await page.viewport(390,844)
  assert(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'ロビーがスマートフォン幅で横にはみ出さない')
  await page.capture(screenshot(name+'-mobile'))
 }
 assert(await a.evaluate(`(async()=>{const {createDeckCollection}=await import('/packages/cards/decks.js');return createDeckCollection({keys:()=>Object.keys(localStorage),getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v)}).backup()===window.__before})()`),'既存デッキ保持')
 await a.evaluate(`(async()=>{const id=new URLSearchParams(location.search).get('room');const s=JSON.parse(sessionStorage.getItem('fairytale-room.'+id));await fetch('/api/rooms/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+s.token}})})()`)
 assert.deepEqual(a.errors(),[]);assert.deepEqual(b.errors(),[])
})
