import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createDevServer } from '../scripts/dev-server.js'
import { browserControl, eventually } from './browser-driver.js'
import { bgmFiles } from '../apps/web/scene-music.js'
import manifest from '../artwork/audio/bgm-manifest.json' with { type:'json' }

test('実音源12曲を再生でき、抽選発表から手札交換と対戦まで同じ曲を継続する', {timeout:60000}, async t=>{
 const server=createDevServer();server.listen(0,'127.0.0.1');await once(server,'listening')
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve))})
 const temp=await realpath(tmpdir()),directory=await mkdtemp(join(temp,'fairytale-music-'))
 const open=await browserControl(t,directory)
 t.after(async()=>{const p=await realpath(directory);if(dirname(p)!==temp)throw new Error('Unexpected directory');await rm(p,{recursive:true,force:true,maxRetries:5,retryDelay:200})})
 const page=await open(),origin=process.env.FAIRYTALE_SERVER_URL ?? 'http://127.0.0.1:'+server.address().port
 await page.viewport(1600,1000);await page.navigate(origin);await page.wait('[data-op=prepare]')
 await page.evaluate(`(()=>{const Native=window.Audio;window.__songs=[];window.Audio=function(url){const a=new Native(url);window.__songs.push(a);return a}})()`)
 await page.tap('[data-op=audio-mixer]')
 await eventually(()=>page.evaluate('window.__songs.at(-1)?.currentTime > .1'),'メニュー曲の実再生')
 assert(await page.evaluate('window.__songs.at(-1).src.endsWith("bgm-menu.ogg")'))
 const durations=await page.evaluate(`(async()=>{const c=new AudioContext(),out={};for(const file of ${JSON.stringify(Object.values(bgmFiles))}){const b=await c.decodeAudioData(await(await fetch('/apps/web/assets/'+file)).arrayBuffer());out[file]=b.duration}await c.close();return out})()`)
 for(const track of manifest.tracks)assert(Math.abs(durations[track.file]-track.duration)<.1,track.id)
 await page.click('[data-op=decks]');await eventually(()=>page.evaluate('window.__songs.at(-1)?.src.endsWith("bgm-deck.ogg")'),'デッキ曲へ切替')
 const count=await page.evaluate('window.__songs.length');await page.click('[data-op=audio-mixer]');assert.equal(await page.evaluate('window.__songs.length'),count)
 await page.click('[data-op=close-decks]');await page.click('[data-op=arena-open]')
 await eventually(()=>page.evaluate('window.__songs.at(-1)?.src.endsWith("bgm-arena.ogg")'),'闘技場曲へ切替')
 // A new page keeps this test independent of arena draft state and verifies both initiative outcomes.
 for(const firstSeat of [0,1]){
  const p=await open();await p.viewport(1600,1000);await p.navigate(origin);await p.click('[data-op=prepare]');await p.wait('[data-op=start]')
  await p.evaluate(`(()=>{const Native=window.Audio;window.__songs=[];window.Audio=function(url){const a=new Native(url);window.__songs.push(a);return a};const random=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=a=>{if(a instanceof Uint8Array&&a.length===1){a[0]=${firstSeat};return a}return random(a)}})()`)
  if(firstSeat===1) await p.evaluate('(()=>{const native=setTimeout;window.setTimeout=(fn,ms,...args)=>native(fn,ms===3250?8000:ms,...args)})()')
  await p.tap('[data-op=start]');await p.wait('[data-opening-stage=draw]')
  assert.equal(await p.evaluate('Boolean(document.querySelector("[data-op=mulligan]"))'),false)
  await p.capture(new URL('../../work/opening-'+firstSeat+'.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))
  await p.wait('[data-opening-stage=result]')
  assert.equal(await p.evaluate('document.querySelectorAll(".opening-role")[0].textContent'),firstSeat===0?'先攻':'後攻')
  await p.evaluate('new Promise(resolve=>setTimeout(resolve,850))')
  await p.capture(new URL('../../work/opening-result-'+firstSeat+'.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))
  if(firstSeat===1){
    await p.viewport(390,844)
    assert(await p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    await p.capture(new URL('../../work/opening-mobile.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))
    await p.viewport(1600,1000)
  }
  await p.wait('.mulligan [data-replace]')
  assert.equal(await p.evaluate('document.querySelectorAll("[data-replace]").length'),firstSeat===0?3:4)
  await eventually(()=>p.evaluate('window.__songs.at(-1)?.currentTime>.05'),'対戦曲の実再生')
  const song=await p.evaluate('({src:window.__songs.at(-1).src,n:window.__songs.length,time:window.__songs.at(-1).currentTime})')
  const scene=song.src.match(/bgm-([\w]+)\.ogg/)[1]
  assert.equal(await p.evaluate('document.querySelector(".ceremony").dataset.bgmScene'),scene,'手札交換の背景を対戦曲に合わせる')
  await p.click('[data-op=mulligan]');await p.wait('.battle')
  assert.equal(await p.evaluate('window.__songs.length'),song.n)
  assert.equal(await p.evaluate('window.__songs.at(-1).src'),song.src)
  assert.equal(await p.evaluate('document.querySelector(".battle").dataset.bgmScene'),scene,'手札交換から同じ曲と背景を引き継ぐ')
  assert(await p.evaluate('window.__songs.at(-1).currentTime')>=song.time)
  await p.capture(new URL('../../work/bgm-battle-'+firstSeat+'.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))
  assert.deepEqual(p.errors(),[])
 }
 assert.deepEqual(page.errors(),[])
})

test('音楽室で全12曲の選択・停止・シーク・曲送り・音量変更と通常BGMへの復帰ができる', {timeout:45000}, async t=>{
 const server=createDevServer();server.listen(0,'127.0.0.1');await once(server,'listening')
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve))})
 const temp=await realpath(tmpdir()),directory=await mkdtemp(join(temp,'fairytale-music-room-'))
 const open=await browserControl(t,directory)
 t.after(async()=>{const p=await realpath(directory);if(dirname(p)!==temp)throw new Error('Unexpected directory');await rm(p,{recursive:true,force:true,maxRetries:5,retryDelay:200})})
 const page=await open(),origin=process.env.FAIRYTALE_SERVER_URL??'http://127.0.0.1:'+server.address().port
 await page.viewport(1440,1000);await page.navigate(origin);await page.wait('[data-op=music]')
 await page.evaluate(`(()=>{const Native=window.Audio;window.__songs=[];window.Audio=function(url){const a=new Native(url);window.__songs.push(a);return a}})()`)
 await page.tap('[data-op=music]');await page.wait('.music-library[open]')
 assert.equal(await page.evaluate('document.querySelectorAll("[data-music-track]").length'),12)
 await page.tap('[data-music-track=priest]')
 await eventually(()=>page.evaluate('document.querySelector(".music-library audio").currentTime>.1'),'音楽室の実再生')
 assert(await page.evaluate('document.querySelector(".music-library audio").dataset.track==="priest"'))
 await page.evaluate('document.querySelector(".music-library audio").pause()')
 assert(await page.evaluate('document.querySelector(".music-library audio").paused'))
 await page.evaluate('document.querySelector(".music-library audio").currentTime=30')
 await eventually(()=>page.evaluate('Math.abs(document.querySelector(".music-library audio").currentTime-30)<1'),'ネットワークからのシーク完了')
 await page.click('[data-music-next]');assert(await page.evaluate('document.querySelector(".music-library audio").dataset.track==="merchant"'))
 await page.click('[data-music-prev]');assert(await page.evaluate('document.querySelector(".music-library audio").dataset.track==="priest"'))
 await page.click('[data-music-loop]');assert.equal(await page.evaluate('document.querySelector(".music-library audio").loop'),false)
 await page.evaluate('document.querySelector(".music-library audio").volume=.24')
 await eventually(()=>page.evaluate('localStorage.getItem("fairytale-audio-volume.bgm")==="24"'),'音楽室の音量を共通BGM設定に保存')
 await page.capture(new URL('../../work/music-room-desktop.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))
 await page.viewport(390,844)
 assert(await page.evaluate('document.querySelector(".music-library").getBoundingClientRect().right<=innerWidth'))
 await page.capture(new URL('../../work/music-room-mobile.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))
 await page.click('[data-music-close]')
 await eventually(()=>page.evaluate('window.__songs.at(-1)?.src.endsWith("bgm-menu.ogg")&&window.__songs.at(-1)?.currentTime>.1'),'音楽室を閉じてメニューBGMに戻る')
 await eventually(()=>page.evaluate('document.querySelector(".music-library audio").paused&&!document.querySelector(".music-library audio").hasAttribute("src")'),'音楽室の終了処理で音源を解放')
 await page.viewport(1440,1000)
 await page.tap('[data-op=music]');await page.click('[data-music-track=arena]');await page.click('[data-music-close]')
 await page.tap('[data-op=music]')
 for(const result of ['victory','defeat']){
  await page.click('[data-music-track='+result+']')
  await eventually(()=>page.evaluate('document.querySelector(".music-library audio").currentTime>.1'),'結果曲の実再生: '+result)
  assert.equal(await page.evaluate('document.querySelector(".music-library audio").dataset.track'),result)
 }
 await page.click('[data-music-close]')
 assert.deepEqual(page.errors(),[])
})
