import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { catalog, cards } from '../packages/cards/index.js'
import { attackMethods, attackProfile, legendaryAttacks, summonTier } from '../apps/web/legendary-attacks.js'
import { vfxAtlases } from '../apps/web/vfx-atlases.js'
import { mountBattleVfx } from '../apps/web/battle-vfx.js'
import { planBattlePresentation } from '../apps/web/battle-presentation.js'

test('全レジェンドユニットと生成形態へカードIDごとの攻撃演出を割り当てる',()=>{
 const units=catalog.filter(c=>c.rarity==='legendary'&&c.kind==='unit')
 assert.equal(units.length,80)
 for(const card of units){
  const profile=legendaryAttacks[card.id];assert(profile,card.name)
  assert(attackMethods.includes(profile.method),card.name);assert.match(profile.color,/^#[a-f0-9]{6}$/i)
  const view={players:[{units:[{id:7,card:card.id}]}]}
  assert.equal(attackProfile(view,{type:'attack',seat:0,id:7}),profile)
 }
 assert.notEqual(legendaryAttacks['FT-0374'].method,legendaryAttacks['night-dragon'].method)
 assert.notEqual(legendaryAttacks['FT-0596'].color,legendaryAttacks['token-set4-aul-act-four'].color)
 assert(Object.values(legendaryAttacks).every(profile=>Object.isFrozen(profile)))
})
test('全レジェンドと変身リーダーの攻撃が通常攻撃と同じ時間で命中する',t=>{
 const old=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:false});t.after(()=>{if(old===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=old})
 const position={row:'front',column:0}
 for(const card of ['brass-squire',...Object.keys(legendaryAttacks)]){
  const players=[{leader:'warrior',hp:25,units:[{id:1,owner:0,card,position}]},{leader:'mage',hp:25,units:[]}]
  const view={phase:'battle',players}
  const event={type:'attack',seat:0,id:1,target:{kind:'leader',seat:1}}
  for(const cpu of [false,true]){
   const scene=planBattlePresentation(view,view,[event],cpu)
   assert.equal(scene.approachMs,135,card);assert.equal(scene.revealMs,0,card)
  }
 }
 const view={phase:'battle',players:[{leader:'warrior',hp:25,units:[],awakenedLeader:true},{leader:'mage',hp:25,units:[]}]}
 assert.equal(planBattlePresentation(view,view,[{type:'leaderAttack',seat:0,target:{kind:'leader',seat:1}}],false).approachMs,135)
})

test('一般ユニットをレジェンド扱いせず、変身リーダーは黒薔薇を使う',()=>{
 assert.equal(attackProfile({players:[{units:[{id:1,card:'brass-squire'}]}]},{type:'attack',seat:0,id:1}),null)
 assert.equal(attackProfile({players:[{units:[],awakenedLeader:true}]},{type:'leaderAttack',seat:0}).method,'vine')
 assert.equal(summonTier(cards['FT-0140']),'legendary');assert.equal(summonTier(cards['brass-squire']),'normal')
 assert.equal(summonTier({...cards['brass-squire'],cost:6}),'major');assert.equal(summonTier(cards['FT-0001']),'none')
})
test('CC0素材は出典・ライセンス・ハッシュを保存し、連番の矩形を保つ',()=>{
 const root=new URL('../',import.meta.url),manifest=JSON.parse(readFileSync(new URL('artwork/vfx/manifest.json',root),'utf8'))
 assert.equal(manifest.assets.length,10)
 let bytes=0
 for(const asset of manifest.assets){
  assert.equal(asset.license,'CC0-1.0');const data=readFileSync(new URL('apps/web/assets/'+asset.file,root));bytes+=data.length
  assert.equal(createHash('sha256').update(data).digest('hex'),asset.outputSha256)
  assert(asset.source.startsWith('https://'));assert.equal(data.toString('ascii',0,4),'RIFF')
 }
 assert(bytes<1024*1024)
 for(const atlas of Object.values(vfxAtlases)){
  assert.equal(atlas.frames.length,6)
  for(const frame of atlas.frames){assert(frame.x>=0&&frame.y>=0);assert(frame.x+frame.w<=atlas.width);assert(frame.y+frame.h<=atlas.height)}
 }
 for(const name of ['spritecanvas-LICENSE.txt','kenney-LICENSE.txt'])assert.match(readFileSync(new URL('artwork/vfx/'+name,root),'utf8'),/CC0/)
})
test('短い演出は重いCanvas処理を起動せず、金の召喚と通常攻撃の待ち時間を区別する',t=>{
 assert.equal(mountBattleVfx({querySelector(){throw new Error('must not allocate')}},{reduced:true},'impact',()=>null),null)
 const old=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:false});t.after(()=>{if(old===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=old})
 const players=[{leader:'warrior',hp:25,units:[]},{leader:'mage',hp:25,units:[]}],before={phase:'battle',players},after={phase:'battle',players}
 const position={row:'front',column:0}
 const scene=card=>planBattlePresentation(before,after,[{type:'summon',played:true,card,seat:0,id:1,position,cost:cards[card].cost}],false)
 assert(scene('FT-0140').approachMs>scene('brass-squire').approachMs)
 assert.equal(scene('FT-0140').summonTier,'legendary')
 const image=JSON.stringify(before)
 scene('FT-0140');assert.equal(JSON.stringify(before),image,'演出計画でゲーム状態を書き換えない')
})
