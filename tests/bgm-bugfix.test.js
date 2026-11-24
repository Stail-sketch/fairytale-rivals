import assert from 'node:assert/strict'
import test from 'node:test'
import { cards } from '../packages/cards/index.js'
import { starterLineup } from '../packages/cards/decks.js'
import { createGame, dispatch, legalPlay, legalAttack, unitTarget, rules } from '../packages/engine/index.js'
import { createInstance, resolution } from '../packages/engine/effects.js'
import { createLocalMatch } from '../packages/local-match/index.js'
import { battleMusicIds } from '../packages/cards/battle-music.js'
import { battleOpening, openingTiming } from '../apps/web/battle-opening.js'
import { sceneTrack, createSceneMusic } from '../apps/web/scene-music.js'
const config = { seed: 491, lineups: [starterLineup('mage'), starterLineup('fighter')] }
const act = (game, action) => { const r=dispatch(game, game.pending?.seat ?? game.active, action); assert(r.ok,r.issue); return r.game }
const start = () => act(act(createGame(config), {type:'mulligan',replace:[]}),{type:'mulligan',replace:[]})
const add = (game, card, seat=0) => { const i=createInstance(game,card);game.players[seat].hand.push(i);return i.id }
const put = (game, card, seat, column=0) => { const i=createInstance(game,card),r=resolution(game);r.summon(seat,i,{row:'front',column});r.settle();return i.id }
test('三つ編み精は2枚引き、本人が2回選ぶまで捨てず、相手には選択肢を公開しない',()=>{
 let g=start();g.players[0].hand=[];g.players[0].mp=10
 const keep=add(g,'FT-0001'), id=add(g,'FT-0616'), drawn=g.players[0].deck.slice(0,2).map(i=>i.id)
 g=act(g,{type:'play',id,position:{row:'front',column:0}})
 assert.equal(g.players[0].hand.length,3);assert.equal(g.pending.remaining,2)
 assert.equal(createLocalMatch(config,g).view(1).pending,null)
 g=act(g,{type:'decide',choice:g.pending.instances.findIndex(i=>i.id===drawn[0])})
 assert.equal(g.pending.remaining,1)
 g=act(g,{type:'decide',choice:g.pending.instances.findIndex(i=>i.id===drawn[1])})
 assert.equal(g.pending,undefined);assert.deepEqual(g.players[0].hand.map(i=>i.id),[keep])
 assert.deepEqual(g.players[0].graveyard.slice(-2).map(i=>i.id),drawn)
})
test('必中掌は特技として対象選択・一族割引・4点ダメージを処理し盤面に出ない',()=>{
 let g=start();g.active=1;g.players[1].hand=[];g.players[1].mp=10
 put(g,'FT-0013',1);const enemy=put(g,'night-dragon',0),id=add(g,'FT-0632',1)
 const hp=g.players[0].units[0].hp
 assert.equal(cards['FT-0632'].kind,'spell');assert.equal(legalPlay(g,1,id).cost,3)
 g=act(g,{type:'play',id,target:unitTarget(enemy)})
 assert.equal(g.players[0].units[0].hp,hp-4);assert(!g.players[1].units.some(u=>u.card==='FT-0632'))
})
test('祝福の地は被弾前のHPで同時反撃し、予測値も実際の戦闘に一致する',()=>{
 for(const hp of [2,6]){
  let g=start();const a=put(g,'night-dragon',0),d=put(g,'night-dragon',1)
  const attacker=g.players[0].units[0],defender=g.players[1].units[0]
  attacker.attacks=0;attacker.summonedTurn=-1;defender.hp=hp;g.players[1].terrain['front:0']='blessing'
  const before=attacker.hp, forecast=legalAttack(g,0,a,true).forecasts.find(f=>f.target.id===d)
  assert.equal(forecast.retaliation,hp)
  g=act(g,{type:'attack',id:a,target:unitTarget(d)})
  assert.equal(g.events.findLast(e=>e.type==='damage'&&e.target?.id===a).value,hp)
  assert.equal(g.players[0].units.find(u=>u.id===a)?.hp??0,Math.max(0,before-hp))
 }
})
test('先攻席を変えると手札枚数・初期熱量・開始席が変わり、保存しても維持する',()=>{
 for(const firstSeat of [0,1]){
  const m=createLocalMatch({...config,firstSeat})
  for(const seat of [0,1]){assert.equal(m.view(seat).players[seat].hand.length,rules.initialHand[seat===firstSeat?0:1]);assert.equal(m.view().players[seat].tension,rules.initialTension[seat===firstSeat?0:1])}
  m.act(0,{type:'mulligan',replace:[]});m.act(1,{type:'mulligan',replace:[]});assert.equal(m.view().active,firstSeat)
  const saved=m.exportState();assert.equal(createLocalMatch(saved.config,saved.game).view().firstSeat,firstSeat)
 }
})
test('全7曲は対戦する職業と無関係に共有され、山札乱数に影響せず保存・再開で固定する',()=>{
 for(const bgmId of battleMusicIds){
  const m=createLocalMatch({...config,bgmId});assert.equal(m.view(0).bgmId,bgmId);assert.equal(m.view(1).bgmId,bgmId)
  assert.equal(m.view(0).matchId,m.view(1).matchId)
  const saved=m.exportState(),restored=createLocalMatch(saved.config,saved.game)
  assert.equal(restored.view().bgmId,bgmId);assert.equal(restored.view().matchId,m.view().matchId)
  assert.deepEqual(saved.game.players.map(p=>p.deck),createGame(config).players.map(p=>p.deck))
 }
})
test('開始演出は実際の先攻席を表示し、短縮設定に対応する',()=>{
 const view=createLocalMatch({...config,firstSeat:1}).view()
 const html=battleOpening(view,{stage:'result',short:false},0,()=> 'portrait.webp')
 assert.match(html,/data-opening-seat="0">後攻/);assert.match(html,/data-opening-seat="1">先攻/)
 assert(openingTiming(true).finish<openingTiming(false).finish)
 assert.equal(sceneTrack('danger','priest'),'priest');assert.equal(sceneTrack('deck'),'deck')
})
test('同じ対戦曲は再描画とピンチで作り直さず、画面切替でフェードして旧音源を解放する',t=>{
 t.mock.timers.enable({apis:['setTimeout']})
 const node=()=>({gain:{value:0,cancelScheduledValues(){},setTargetAtTime(){}},connect(){return this},disconnect(){this.disconnected=true}})
 const context={currentTime:0,createGain:node,createMediaElementSource:node}
 const audios=[];const music=createSceneMusic(context,node(),url=>{const a={url,paused:true,plays:0,addEventListener(){},play(){this.paused=false;this.plays++;return Promise.resolve()},pause(){this.paused=true},removeAttribute(){this.cleared=true},load(){}};audios.push(a);return a})
 music.set('battle','priest');music.set('battle','priest');music.set('danger','priest');assert.equal(audios.length,1)
 music.set('deck');assert.equal(audios.length,2);t.mock.timers.tick(650);assert(audios[0].cleared)
 music.set('off');t.mock.timers.tick(650);assert(audios[1].cleared)
})
