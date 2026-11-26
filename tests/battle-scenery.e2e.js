import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createDevServer } from '../scripts/dev-server.js'
import { battlePreviewFixture } from '../scripts/battle-preview.js'
import { createDraft, draftAction } from '../packages/arena/index.js'
import { battleMusicIds } from '../packages/cards/battle-music.js'
import { browserControl, eventually } from './browser-driver.js'

test('参加していないキャラの曲も含め、実音源と背景が一致し、対戦中の切替・再読込でも保つ',{timeout:60000},async t=>{
 const server=createDevServer();server.listen(0,'127.0.0.1');await once(server,'listening')
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve))})
 const temp=await realpath(tmpdir()),directory=await mkdtemp(join(temp,'fairytale-scenery-'))
 const open=await browserControl(t,directory)
 t.after(async()=>{const p=await realpath(directory);if(dirname(p)!==temp)throw new Error('Unexpected directory');await rm(p,{recursive:true,force:true,maxRetries:5,retryDelay:200})})
 const p=await open(),origin=process.env.FAIRYTALE_SERVER_URL??'http://127.0.0.1:'+server.address().port
 await p.viewport(1600,1000)
 const draft=createDraft(521);draftAction(draft,{type:'arena-class',choice:draft.choices[0]})
 while(draft.stage!=='complete')draftAction(draft,{type:draft.stage==='door'?'arena-door':'arena-pick',choice:draft.choices[0]})
 for(const id of battleMusicIds) {
  const {config,game}=battlePreviewFixture();config.bgmId=game.bgmId=id
  const run={version:1,wins:0,ended:false,settled:false,draft,match:{config,game}}
  await p.navigate(origin);await p.wait('[data-op=arena-open]')
  await p.evaluate('localStorage.setItem("fairytale-rivals.arena.v1",'+JSON.stringify(JSON.stringify(run))+')')
  await p.navigate(origin);await p.wait('[data-op=arena-open]')
  await p.evaluate(`(()=>{const Native=window.Audio;window.__songs=[];window.Audio=function(url){const a=new Native(url);window.__songs.push(a);return a}})()`)
  await p.tap('[data-op=arena-open]');await p.tap('[data-op=arena-resume]');await p.wait('.battle-depth')
  assert.equal(await p.evaluate('document.querySelector(".battle").dataset.bgmScene'),id)
  await eventually(()=>p.evaluate(`window.__songs.at(-1)?.src.endsWith('bgm-${id}.ogg')`),'曲に対応する音源')
  await p.evaluate(`(async()=>{const image=new Image();image.src='/apps/web/assets/battle-scene-${id}.webp';await image.decode()})()`)
  const background=await p.evaluate('getComputedStyle(document.querySelector(".battle")).backgroundImage')
  assert(background.includes('battle-scene-'+id+'.webp'),'実際のCSS背景に選択した画像を使う')
  assert(!background.includes('assets/battle-hall.webp")')||background.indexOf('battle-scene-')<background.indexOf('battle-hall'),'既存の背景より前面に描く')
  await p.capture(new URL('../../work/scenery-'+id+'.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))
  await p.tap('[data-slot="0:front:0"] .standing-art')
  assert.equal(await p.evaluate('document.querySelector(".battle").dataset.bgmScene'),id,'ユニット選択で背景を変えない')
  await p.click('[data-op=depth]')
  assert.equal(await p.evaluate('document.querySelector(".battle").dataset.bgmScene'),id,'従来表示でも同じ背景')
  await p.click('[data-op=depth]')
 }
 await p.viewport(390,844)
 assert(await p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
 assert.deepEqual(p.errors(),[])
})
