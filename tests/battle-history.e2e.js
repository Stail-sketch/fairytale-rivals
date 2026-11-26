import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { starterLineup } from '../packages/cards/decks.js'
import { cards } from '../packages/cards/index.js'
import { createGame, dispatch, unitTarget } from '../packages/engine/index.js'
import { createInstance, resolution } from '../packages/engine/effects.js'
import { createDraft, draftAction } from '../packages/arena/index.js'
import { createDevServer } from '../scripts/dev-server.js'
import { browserControl, eventually } from './browser-driver.js'

test('履歴を画像とターンで読み、カード詳細・用語・展開状態を維持して盤面中央を保つ',{timeout:35000},async t=>{
 const server=createDevServer();server.listen(0,'127.0.0.1');await once(server,'listening')
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve))})
 const temp=await realpath(tmpdir()),directory=await mkdtemp(join(temp,'fairytale-history-'))
 const open=await browserControl(t,directory)
 t.after(async()=>{const p=await realpath(directory);if(dirname(p)!==temp)throw new Error('Unexpected directory');await rm(p,{recursive:true,force:true,maxRetries:5,retryDelay:200})})
 const config={seed:521,format:'arena',lineups:[starterLineup('mage'),starterLineup('priest')]}
 let game=createGame(config)
 const act=action=>{const r=dispatch(game,game.active,action);assert(r.ok,r.issue);game=r.game}
 for(let i=0;i<2;i++)act({type:'mulligan',replace:[]})
 const summon=resolution(game),enemy=createInstance(game,'night-dragon')
 summon.summon(1,enemy,{row:'front',column:0});summon.settle()
 game.players[1].units[0].hp=20;game.players[1].units[0].maxHp=20
 game.players[0].mp=20;game.players[0].maxMp=10;game.players[0].tension=3
 const bolt=createInstance(game,'FT-0001');game.players[0].hand.push(bolt)
 act({type:'play',id:bolt.id,target:unitTarget(enemy.id)})
 act({type:'skill',target:unitTarget(enemy.id)});act({type:'end'})
 act({type:'focus'});act({type:'end'})
 const whelp=createInstance(game,'ember-whelp');game.players[0].hand.push(whelp)
 act({type:'play',id:whelp.id,position:{row:'front',column:0}})
 let draft=createDraft(521)
 draftAction(draft,{type:'arena-class',choice:draft.choices[0]})
 while(draft.stage!=='complete')draftAction(draft,{type:draft.stage==='door'?'arena-door':'arena-pick',choice:draft.choices[0]})
 const run={version:1,wins:0,ended:false,settled:false,draft,match:{config,game}}
 const page=await open(),origin=process.env.FAIRYTALE_SERVER_URL??'http://127.0.0.1:'+server.address().port
 await page.viewport(1600,1000);await page.navigate(origin);await page.wait('[data-op=arena-open]')
 await page.evaluate('localStorage.setItem("fairytale-rivals.arena.v1",'+JSON.stringify(JSON.stringify(run))+')')
 await page.navigate(origin+'/?history-test=1');await page.click('[data-op=arena-open]');await page.click('[data-op=arena-resume]');await page.wait('.battle')
 await page.wait('.recent-history [data-log-card=ember-whelp]')
 const center=await page.evaluate('(()=>{const r=document.querySelector(".board").getBoundingClientRect();return r.x+r.width/2})()')
 assert(Math.abs(center-await page.evaluate('document.documentElement.clientWidth/2'))<2)
 await page.evaluate('document.querySelector(".recent-history [data-log-card=ember-whelp]").dispatchEvent(new PointerEvent("pointerover",{bubbles:true}))')
 assert.equal(await page.evaluate('document.querySelector("#detail h2").textContent'),cards['ember-whelp'].name)
 await page.click('.recent-history [data-log-card=ember-whelp]');await page.wait('.battle-card-dialog[open]')
 await page.click('.battle-card-dialog [data-term=CHARGE]');await page.wait('.term-dialog[open]');await page.click('.term-dialog button');await page.click('.battle-card-dialog form button')
 await page.click('.battle-log>summary');await page.wait('.battle-log[open] .history-turn')
 assert.equal(await page.evaluate('document.querySelectorAll(".history-turn").length'),4)
 assert(await page.evaluate('document.querySelector(".events").textContent.includes("3ダメージ")'))
 const turn=await page.evaluate('document.querySelectorAll(".history-turn")[2].dataset.logTurn')
 await page.click('[data-log-turn="'+turn+'"]>summary')
 await page.click('[data-log-turn="'+turn+'"] .history-action-details>summary')
 const expanded=await page.evaluate('document.querySelector(".history-action-details[open]").dataset.logAction')
 await page.capture(new URL('../../work/history-desktop.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))
 await page.click('[data-op=focus]:enabled')
 await eventually(()=>page.evaluate('document.querySelector(".recent-history .history-action-copy").textContent.includes("熱量")'),'直近の行動を追加')
 assert(await page.evaluate('document.querySelector('+JSON.stringify('[data-log-turn="'+turn+'"]')+').open'))
 assert(await page.evaluate('document.querySelector('+JSON.stringify('[data-log-action="'+expanded+'"]')+').open'))
 const stable=await page.evaluate('(()=>{const r=document.querySelector(".board").getBoundingClientRect();return r.x+r.width/2})()')
 assert(Math.abs(stable-center)<2)
 await page.click('.battle-log>summary');await page.viewport(1100,800)
 await page.capture(new URL('../../work/history-compact.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))
 assert.deepEqual(page.errors(),[])
})
