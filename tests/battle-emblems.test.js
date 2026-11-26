import test from 'node:test'
import assert from 'node:assert/strict'
import { cards } from '../packages/cards/index.js'
import { battlePreviewFixture } from '../scripts/battle-preview.js'
import { createLocalMatch } from '../packages/local-match/index.js'
import { statusVisuals } from '../apps/web/battle-status.js'
import { renderEmblems } from '../apps/web/battle-emblems.js'

function fixture() {
 const {config,game}=battlePreviewFixture()
 const view=createLocalMatch(config,game).view(0)
 const unit=view.players[0].units.find(u=>u.card==='twig-guard')
 const show=()=>statusVisuals(view,null,0,unit,cards[unit.card],[],true)
 return {view,unit,show}
}
test('付与された攻撃能力と毒・能力封じを分け、無効な能力を灰色用の状態で表示する',()=>{
 const {unit,show}=fixture()
 unit.statuses=['SILENCE']
 for(const id of ['PIERCE','DOUBLE_ATTACK','AIM']) {
  unit.grants=[id]
  const output=show()
  for(const disabled of [id,'GUARD'])assert(output.markup.includes(`data-ability="${disabled}" data-active="false"`))
  assert.match(output.markup,/data-granted="true"/)
  assert(output.labels.some(label=>label.includes('能力封じ中')))
 }
 unit.grants=[];unit.statuses=['SILENCE','POISON']
 for(const id of ['SILENCE','POISON'])assert(show().markup.includes(`data-ability="${id}" data-active="true"`))
})
test('期限付きの防護と後衛で無効な騎士の誓いを区別する',()=>{
 const {view,unit,show}=fixture()
 unit.position.row='back';unit.spellGuardThrough=view.turn
 assert.match(show().markup,/data-ability="GUARD" data-active="false"/)
 assert.match(show().markup,/data-status-info="SPELL_WARD" data-timed="true"/)
 view.turn++
 assert(!show().markup.includes('data-status-info="SPELL_WARD"'))
})
test('被弾によるHP減少を強化マークにせず、攻撃力・最大HPの変化を説明する',()=>{
 const {view,unit,show}=fixture()
 unit.hp--
 assert(!show().markup.includes('data-ability="BUFF"'))
 view.players[0].boardAttack={...view.players[0].boardAttack,[unit.id]:4}
 assert.match(show().markup,/data-ability="BUFF"/)
 assert(show().labels.some(label=>label.includes('攻撃力 1 → 4')))
})
test('多数の能力でも表示数を抑え、残りの能力をまとめて読める',()=>{
 const states=['GUARD','PIERCE','DOUBLE_ATTACK','AIM','CHARGE','STEALTH','METAL_BODY','POISON'].map(id=>[id,true,'有効',false])
 const markup=renderEmblems(states,{grants:[]})
 assert.equal((markup.match(/data-status-info=/g)??[]).length,3)
 assert.match(markup,/data-status-info="ALL"/)
 assert(markup.includes('騎士の誓い：有効'))
})
