import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { starterLineup } from '../packages/cards/decks.js'
import { createGame, dispatch } from '../packages/engine/index.js'
import { createInstance, resolution } from '../packages/engine/effects.js'
import { createDraft, draftAction } from '../packages/arena/index.js'
import { createDevServer } from '../scripts/dev-server.js'
import { browserControl, eventually } from './browser-driver.js'

test('金の二重召喚陣と斬撃を同期し、竜と剣士を別演出にして短縮・終了にも対応する',{timeout:45000},async t=>{
 const server=createDevServer();server.listen(0,'127.0.0.1');await once(server,'listening')
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve))})
 const temp=await realpath(tmpdir()),directory=await mkdtemp(join(temp,'fairytale-vfx-'))
 const open=await browserControl(t,directory)
 t.after(async()=>{const p=await realpath(directory);if(dirname(p)!==temp)throw new Error('Unexpected directory');await rm(p,{recursive:true,force:true,maxRetries:5,retryDelay:200})})
 const config={seed:521,format:'arena',lineups:[starterLineup('fighter'),starterLineup('mage')]}
 let game=createGame(config)
 for(let seat=0;seat<2;seat++)game=dispatch(game,seat,{type:'mulligan',replace:[]}).game
 Object.assign(game.players[0],{mp:10,maxMp:10,hand:[createInstance(game,'FT-0140')]})
 const r=resolution(game)
 r.summon(0,createInstance(game,'night-dragon'),{row:'front',column:0})
 r.summon(0,createInstance(game,'brass-squire'),{row:'front',column:1})
 r.summon(0,createInstance(game,'FT-0374'),{row:'back',column:0})
 r.summon(1,createInstance(game,'night-dragon'),{row:'front',column:0});r.settle()
 for(const u of game.players[0].units){u.attacks=0;u.summonedTurn=-1}
 game.players[0].units[0].grants=['DOUBLE_ATTACK']
 Object.assign(game.players[1].units[0],{hp:80,maxHp:80})
 let draft=createDraft(521);draftAction(draft,{type:'arena-class',choice:draft.choices[0]})
 while(draft.stage!=='complete')draftAction(draft,{type:draft.stage==='door'?'arena-door':'arena-pick',choice:draft.choices[0]})
 const run={version:1,wins:0,ended:false,settled:false,draft,match:{config,game}}
 const p=await open(),origin=process.env.FAIRYTALE_SERVER_URL??'http://127.0.0.1:'+server.address().port
 await p.viewport(1600,1000);await p.navigate(origin);await p.wait('[data-op=arena-open]')
 await p.evaluate('localStorage.setItem("fairytale-rivals.arena.v1",'+JSON.stringify(JSON.stringify(run))+')')
 await p.navigate(origin+'/?vfx-test=1');await p.click('[data-op=arena-open]');await p.click('[data-op=arena-resume]');await p.wait('.battle-depth')
 assert.equal(await p.evaluate('Boolean(document.querySelector("[data-op=preview-demo]"))'),false,'通常の対戦には試遊ボタンを表示しない')
 await p.click('[data-slot="0:front:0"] [data-status-info=PIERCE]');await p.wait('.emblem-dialog[open]')
 assert.equal(await p.evaluate('document.querySelector("#emblem-dialog-title").textContent'),'穿ちの一撃')
 await p.click('.emblem-dialog button')
 assert.equal(await p.evaluate('document.querySelector("[data-slot=\\"0:front:0\\"] .unit-stage").dataset.rarity'),'legendary')
 await p.evaluate(`(()=>{window.__vfxStages=[];new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&node.matches('[data-vfx-stage]'))window.__vfxStages.push({...node.dataset})}).observe(document.querySelector('#app'),{childList:true,subtree:true})})()`)
 await p.evaluate(`(async()=>{const {vfxAtlases}=await import('/apps/web/vfx-atlases.js');await Promise.all(Object.values(vfxAtlases).map(a=>{const i=new Image();i.src='/apps/web/assets/'+a.file;return i.decode()}))})()`)
 await p.click('[data-hand][data-card=FT-0140]');await p.click('[data-slot="0:back:1"]')
 await p.wait('[data-vfx-stage=approach][data-vfx-tier=legendary]')
 const pixels='(()=>{const c=document.querySelector(".battle-vfx-canvas");return c&&c.width>0&&c.getContext("2d").getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)})()'
 await eventually(()=>p.evaluate(pixels),'召喚陣と光柱の実描画')
 await p.evaluate('new Promise(resolve=>setTimeout(resolve,100))')
 await p.capture(new URL('../../work/vfx-summon.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))
 await p.wait('[data-slot="0:back:1"][data-card=FT-0140]')
 await p.click('[data-slot="0:front:1"]');await p.click('[data-slot="1:front:0"]')
 await p.wait('[data-vfx-stage=impact]');await eventually(()=>p.evaluate(pixels),'通常攻撃の連番描画')
 assert.equal(await p.evaluate('document.querySelector(".battle-vfx-layer").dataset.vfxProfile'),undefined)
 await p.click('[data-slot="0:front:0"]');await p.click('[data-slot="1:front:0"]')
 await p.wait('[data-vfx-stage=approach][data-vfx-profile=night-dragon]')
 await eventually(()=>p.evaluate(pixels),'竜のブレスの描画')
 await p.evaluate('new Promise(resolve=>setTimeout(resolve,80))')
 await p.capture(new URL('../../work/vfx-dragon.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))
 await eventually(()=>p.evaluate('window.__vfxStages.some(stage=>stage.vfxStage==="impact"&&stage.vfxProfile==="night-dragon")'),'竜の着弾レイヤーを生成')
 await p.click('[data-slot="0:back:0"]');await p.click('[data-slot="1:front:0"]')
 await p.wait('[data-vfx-stage=approach][data-vfx-profile=FT-0374]')
 await eventually(()=>p.evaluate(pixels),'剣士の一閃の描画')
 await p.evaluate('new Promise(resolve=>setTimeout(resolve,45))')
 await p.capture(new URL('../../work/vfx-sword.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))
 await eventually(()=>p.evaluate('window.__vfxStages.some(stage=>stage.vfxStage==="impact"&&stage.vfxProfile==="FT-0374")'),'剣士の着弾レイヤーを生成')
 await p.click('[data-op=motion]');await p.wait('.battle.short-motion')
 await p.click('[data-slot="0:front:0"]');await p.click('[data-slot="1:front:0"]')
 assert.equal(await p.evaluate('Boolean(document.querySelector(".battle-vfx-layer"))'),false)
 await p.click('[data-op=home]');await p.wait('[data-op=arena-resume]')
 assert.equal(await p.evaluate('Boolean(document.querySelector(".battle-vfx-layer"))'),false)
 assert.deepEqual(p.errors(),[])
})
