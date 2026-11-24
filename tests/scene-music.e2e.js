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

test('実音源10曲を再生でき、抽選発表から手札交換と対戦まで同じ曲を継続する', {timeout:60000}, async t=>{
 const server=createDevServer();server.listen(0,'127.0.0.1');await once(server,'listening')
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve))})
 const temp=await realpath(tmpdir()),directory=await mkdtemp(join(temp,'fairytale-music-'))
 const open=await browserControl(t,directory)
 t.after(async()=>{const p=await realpath(directory);if(dirname(p)!==temp)throw new Error('Unexpected directory');await rm(p,{recursive:true,force:true,maxRetries:5,retryDelay:200})})
 const page=await open(),origin=process.env.FAIRYTALE_SERVER_URL ?? 'http://127.0.0.1:'+server.address().port
 await page.viewport(1600,1000);await page.navigate(origin);await page.wait('[data-op=start]')
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
  const p=await open();await p.viewport(1600,1000);await p.navigate(origin);await p.wait('[data-op=start]')
  await p.evaluate(`(()=>{const Native=window.Audio;window.__songs=[];window.Audio=function(url){const a=new Native(url);window.__songs.push(a);return a};const random=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=a=>{if(a instanceof Uint8Array&&a.length===1){a[0]=${firstSeat};return a}return random(a)}})()`)
  await p.tap('[data-op=start]');await p.wait('[data-opening-stage=draw]')
  assert.equal(await p.evaluate('Boolean(document.querySelector("[data-op=mulligan]"))'),false)
  await p.capture(new URL('../../work/opening-'+firstSeat+'.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))
  await p.wait('[data-opening-stage=result]')
  assert.equal(await p.evaluate('document.querySelectorAll(".opening-role")[0].textContent'),firstSeat===0?'先攻':'後攻')
  await p.wait('.mulligan [data-replace]')
  assert.equal(await p.evaluate('document.querySelectorAll("[data-replace]").length'),firstSeat===0?3:4)
  await eventually(()=>p.evaluate('window.__songs.at(-1)?.currentTime>.05'),'対戦曲の実再生')
  const song=await p.evaluate('({src:window.__songs.at(-1).src,n:window.__songs.length,time:window.__songs.at(-1).currentTime})')
  await p.click('[data-op=mulligan]');await p.wait('.battle')
  assert.equal(await p.evaluate('window.__songs.length'),song.n)
  assert.equal(await p.evaluate('window.__songs.at(-1).src'),song.src)
  assert(await p.evaluate('window.__songs.at(-1).currentTime')>=song.time)
  await p.capture(new URL('../../work/bgm-battle-'+firstSeat+'.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))
  assert.deepEqual(p.errors(),[])
 }
 assert.deepEqual(page.errors(),[])
})
