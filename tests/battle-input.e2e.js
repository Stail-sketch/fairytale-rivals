import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createDevServer } from '../scripts/dev-server.js'
import { browserControl } from './browser-driver.js'

test('立体カードの見えている絵と数値をクリックでき、連続選択で盤面を作り直さない',{timeout:45000},async t=>{
 const server=createDevServer();server.listen(0,'127.0.0.1');await once(server,'listening')
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve))})
 const temp=await realpath(tmpdir()),directory=await mkdtemp(join(temp,'fairytale-input-'))
 const open=await browserControl(t,directory)
 t.after(async()=>{const p=await realpath(directory);if(dirname(p)!==temp)throw new Error('Unexpected directory');await rm(p,{recursive:true,force:true,maxRetries:5,retryDelay:200})})
 const p=await open(),origin='http://127.0.0.1:'+server.address().port
 await p.viewport(1600,1000);await p.navigate(origin+'/?battlePreview=depth&demo=1');await p.wait('.unit-actor')
 const paintedHits=()=>p.evaluate(`(()=>{const misses=[];for(const image of document.querySelectorAll('.standing-art')){const r=image.getBoundingClientRect(),slot=image.closest('.slot');for(const x of [.25,.5,.75])for(const y of [.08,.4,.8]){const hit=document.elementFromPoint(r.x+r.width*x,r.y+r.height*y);if(hit?.closest('.slot')!==slot)misses.push({slot:slot.dataset.slot,x,y,hit:hit?.className})}}return misses})()`)
 assert.deepEqual(await paintedHits(),[],'見えるイラストとクリック判定が一致する')
 await p.evaluate('window.__stableBoard=document.querySelector(".board")')
 for(const position of ['0:front:0','0:back:1','0:front:2','0:back:2','0:front:0','0:back:1']) {
  const selector=`[data-slot="${position}"]`
  const point=await p.evaluate(`(()=>{const r=document.querySelector('${selector} .standing-art').getBoundingClientRect();return {x:r.x+r.width*.5,y:r.y+r.height*.15}})()`)
  await p.mouse({type:'mouseMoved',...point})
  await p.mouse({type:'mousePressed',button:'left',clickCount:1,...point})
  await p.mouse({type:'mouseReleased',button:'left',clickCount:1,...point})
  assert.equal(await p.evaluate(`document.querySelector('${selector}').classList.contains('chosen')`),true,'絵の上側へのクリックで即選択')
  assert(await p.evaluate('window.__stableBoard===document.querySelector(".board")'),'選択だけでは盤面DOMを交換しない')
 }
 await p.tap('[data-slot="0:front:0"] .standing-art')
 await p.tap('[data-slot="1:front:0"] .standing-art')
 await p.wait('[data-slot="1:front:0"] .wounded-stat')
 await p.click('[data-op=preview-demo]');await p.wait('[data-slot="0:front:0"] .standing-art')
 await p.viewport(390,844)
 assert.deepEqual(await paintedHits(),[],'スマホ幅でも浮いた絵をクリックできる')
 assert(await p.evaluate(`([...document.querySelectorAll('.unit-stats > span')].every(stat=>{const r=stat.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.slot')===stat.closest('.slot')}))`),'数値の上からも同じユニットを選べる')
 await p.tap('[data-slot="0:front:0"] .standing-art')
 assert(await p.evaluate('document.querySelector("[data-slot=\\"0:front:0\\"]").classList.contains("chosen")'))
 assert.deepEqual(p.errors(),[])
})
