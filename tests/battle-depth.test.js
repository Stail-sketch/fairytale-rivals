import test from 'node:test'
import assert from 'node:assert/strict'
import { cards } from '../packages/cards/index.js'
import { battlePreviewFixture } from '../scripts/battle-preview.js'
import { createLocalMatch } from '../packages/local-match/index.js'
import { standingUnit } from '../apps/web/battle-depth.js'

test('立体盤面は公開版でも初期表示になり、試遊機能だけをローカルに限定する',async t=>{
 const old=globalThis.location;t.after(()=>{if(old===undefined)delete globalThis.location;else globalThis.location=old})
 for(const [hostname,search,preview] of [['fairytale-rivals.pages.dev','?battlePreview=depth',false],['127.0.0.1','',false],['127.0.0.1','?battlePreview=depth',true]]){
  globalThis.location={hostname,search}
  const module=await import('../apps/web/battle-depth.js?test='+hostname+search)
  assert.equal(module.depthEnabled(),true)
  assert.equal(module.depthPreviewAvailable,preview)
  module.toggleBattleDepth();assert.equal(module.depthEnabled(),false)
 }
})

test('盤面表示の設定だけを保存し、再読み込みで従来表示の選択も引き継ぐ',async t=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage')
 const map=new Map([['saved-decks','変更しない']])
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)}})
 t.after(()=>{if(old)Object.defineProperty(globalThis,'localStorage',old);else delete globalThis.localStorage})
 const first=await import('../apps/web/battle-depth.js?settings=first')
 first.toggleBattleDepth()
 const second=await import('../apps/web/battle-depth.js?settings=second')
 assert.equal(second.depthEnabled(),false)
 assert.equal(map.get('saved-decks'),'変更しない')
 assert.equal(map.size,2)
})
test('全ユニットを背景ありの既存絵で表示し、相手側でも反転させずカード定義を保つ',()=>{
 const before=JSON.stringify(cards)
 const own=standingUnit(cards['brass-squire'],id=>id,false,1),enemy=standingUnit(cards['brass-squire'],id=>id,true,1)
 assert.match(own,/--unit-facing:1/);assert.match(enemy,/--unit-facing:1/)
 assert.match(standingUnit(cards['night-dragon'],id=>id,true,2),/--unit-facing:1/)
 assert.match(standingUnit(cards['FT-0140'],id=>id,false,2),/portrait-fallback/)
 assert.equal(JSON.stringify(cards),before)
 for(const card of Object.values(cards).filter(c=>c.kind==='unit')){
  for(const enemy of [false,true]){
   const markup=standingUnit(card,id=>id,enemy,1)
   assert(markup.includes(`src="${card.artId}"`),card.name)
   assert.match(markup,/data-unit-art="portrait"/)
  }
 }
})
test('試遊盤面は保存デッキを使わず、元の能力・数値で戦闘と召喚ができる',()=>{
 const {config,game}=battlePreviewFixture(),match=createLocalMatch(config,game)
 const before=match.view(0),attacker=before.players[0].units.find(u=>u.card==='brass-squire'),defender=before.players[1].units.find(u=>u.card==='brass-squire')
 for(const p of before.players)for(const u of p.units){assert.equal(u.attack,cards[u.card].attack);assert.equal(u.hp,cards[u.card].hp)}
 assert(match.act(0,{type:'attack',id:attacker.id,target:{kind:'unit',id:defender.id}}).ok)
 assert.equal(match.view(0).players[0].units.find(u=>u.id===attacker.id).hp,1)
 const hand=match.view(0).players[0].hand.find(c=>c.card==='ember-whelp')
 assert(match.act(0,{type:'play',id:hand.id,position:{row:'back',column:0}}).ok)
 assert.equal(match.view(0).players[0].units.length,5)
})
