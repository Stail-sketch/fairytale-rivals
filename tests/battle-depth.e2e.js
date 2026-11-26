import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createDevServer } from '../scripts/dev-server.js'
import { browserControl, eventually } from './browser-driver.js'

test('ローカルの立体盤面で実際に攻撃・召喚・ターン交代し、従来表示とデータを保つ',{timeout:45000},async t=>{
 const server=createDevServer();server.listen(0,'127.0.0.1');await once(server,'listening')
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve))})
 const temp=await realpath(tmpdir()),directory=await mkdtemp(join(temp,'fairytale-depth-'))
 const open=await browserControl(t,directory)
 t.after(async()=>{const p=await realpath(directory);if(dirname(p)!==temp)throw new Error('Unexpected directory');await rm(p,{recursive:true,force:true,maxRetries:5,retryDelay:200})})
 const p=await open(),origin=process.env.FAIRYTALE_PREVIEW_TEST_URL??'http://127.0.0.1:'+server.address().port
 assert(['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname),'試遊試験はローカルでのみ実行する')
 await p.viewport(1600,1000);await p.navigate(origin);await p.wait('[data-op=prepare]')
 assert.equal(await p.evaluate('Boolean(document.querySelector("[data-op=preview-demo]"))'),false)
 await p.evaluate(`(async()=>{const {createDeckCollection,starterLineup}=await import('/packages/cards/decks.js');const storage={keys:()=>Object.keys(localStorage),getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v),removeItem:k=>localStorage.removeItem(k)};const collection=createDeckCollection(storage);collection.save({name:'絶対に残すデッキ',...starterLineup('mage')});sessionStorage.setItem('depth-decks-before',collection.backup())})()`)
 await p.navigate(origin+'/?battlePreview=depth&demo=1');await p.wait('.battle-depth .unit-actor')
 const loaded='[...document.querySelectorAll(".standing-art")].length===8&&[...document.querySelectorAll(".standing-art")].every(i=>i.complete&&i.naturalWidth>0)'
 await eventually(()=>p.evaluate(loaded),'背景ありのユニット画像のロード')
 assert.equal(await p.evaluate('document.querySelectorAll(".slot").length'),12)
 assert.equal(await p.evaluate('document.querySelectorAll("[data-unit-art=cutout]").length'),0)
 assert.equal(await p.evaluate('document.querySelectorAll("[data-unit-art=portrait]").length'),8)
 const capture=name=>p.capture(new URL('../../work/depth-'+name+'.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))
 await capture('board')
 const rarity=await p.evaluate('({common:getComputedStyle(document.querySelector("[data-slot=\\"0:front:0\\"] .standing-art")).borderColor,legend:getComputedStyle(document.querySelector("[data-slot=\\"0:back:1\\"] .standing-art")).borderColor})')
 assert.notEqual(rarity.common,rarity.legend,'レアリティの枠を区別する')
 await p.tap('[data-slot="0:front:2"] [data-status-info=GUARD]')
 await p.wait('.emblem-dialog[open]')
 assert.equal(await p.evaluate('document.querySelector("#emblem-dialog-title").textContent'),'騎士の誓い')
 assert.equal(await p.evaluate('Boolean(document.querySelector(".slot.chosen"))'),false,'効果マークを押しても攻撃を選択しない')
 await p.click('.emblem-dialog button')
 await p.click('[data-op=emblem-guide]');await p.wait('.emblem-dialog .rarity-guide')
 await p.click('.emblem-dialog button')
 await p.evaluate(`(()=>{window.__unitAnimations=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.matches('.unit-actor'))window.__unitAnimations.push({actor:true,duration:options.duration});return animate.call(this,frames,options)}})()`)
 await p.tap('[data-slot="0:front:0"]');await p.tap('[data-slot="1:front:0"]')
 await p.wait('[data-slot="0:front:0"] .wounded-stat')
 assert.equal(await p.evaluate('document.querySelector("[data-slot=\\"0:front:0\\"] .unit-stats span:last-child").textContent'),'1')
 assert(await p.evaluate('window.__unitAnimations.some(a=>a.duration===135)'),'攻撃のテンポは135msを維持')
 await p.click('[data-hand][data-card=ember-whelp]');await p.tap('[data-slot="0:back:0"]')
 await p.wait('[data-slot="0:back:0"][data-card=ember-whelp]')
 await p.click('[data-slot="0:back:0"]');await p.click('[data-op=cancel]')
 const stats='[...document.querySelectorAll("[data-slot][data-unit]")].map(n=>[n.dataset.unit,n.dataset.card,n.querySelector(".unit-stats").textContent]).sort()'
 const before=await p.evaluate(stats)
 await p.click('[data-op=depth]');assert.equal(await p.evaluate('Boolean(document.querySelector(".battle-depth"))'),false)
 assert.deepEqual(await p.evaluate(stats),before)
 await capture('classic')
 await p.click('[data-op=depth]');await p.wait('.battle-depth')
 await p.click('[data-op=motion]');await p.wait('.battle-depth.short-motion')
 assert(await p.evaluate('[...document.querySelectorAll(".standing-art")].every(n=>getComputedStyle(n).animationName==="none")'),'短縮時は待機モーションを止める')
 await p.click('[data-op=motion]')
 await p.click('[data-op=end]')
 if(await p.evaluate('Boolean(document.querySelector("#end-turn-dialog[open]"))'))await p.click('#end-turn-form [value=end]')
 await p.wait('.battle-depth [data-side="1"].active-side')
 assert.equal(await p.evaluate('document.querySelector(".ally-formation [data-card=night-dragon] .unit-stage").style.getPropertyValue("--unit-facing")'),'1')
 await p.viewport(390,844);assert(await p.evaluate('document.documentElement.scrollWidth<=innerWidth'),'狭い画面も横にはみ出さない')
 assert(await p.evaluate('document.querySelector(".turn-label").getBoundingClientRect().height<40'),'ターン表示を縦折り返しにしない')
 await capture('mobile')
 await p.viewport(1600,1000);await p.click('[data-op=preview-demo]')
 await eventually(()=>p.evaluate('document.querySelector("[data-slot=\\"0:front:0\\"] .unit-stats span:last-child")?.textContent==="3"'),'試遊盤面を初期状態へリセット')
 assert.equal(await p.evaluate('document.querySelector("[data-slot=\\"0:front:0\\"] .unit-stats span:last-child").textContent'),'3')
 assert(await p.evaluate(`(async()=>{const {createDeckCollection}=await import('/packages/cards/decks.js');return createDeckCollection({keys:()=>Object.keys(localStorage),getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v)}).backup()===sessionStorage.getItem('depth-decks-before')})()`),'保存済みデッキは変化しない')
 assert.deepEqual(p.errors(),[])
})
