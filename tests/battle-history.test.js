import test from 'node:test'
import assert from 'node:assert/strict'
import { cards } from '../packages/cards/index.js'
import { createBattleHistory, groupBattleEvents, historyOutcomes, renderBattleLog, renderRecentHistory } from '../apps/web/battle-history.js'
const players=[{leader:'mage',units:[]},{leader:'priest',units:[]}]
const view=(events,turn=1,matchId='one')=>({matchId,players,events,turn,active:0})
const options={art:id=>id+'.webp',ownSeat:0,firstSeat:0}
const event=(seq,type,more={})=>({seq,type,text:type,seat:0,...more})

test('カード使用の前に起きる声援も同じ行動に含め、実行結果をまとめる',()=>{
 const h=createBattleHistory(),events=[event(1,'turn'),event(2,'focus',{value:3}),event(3,'summon',{id:12,card:'ember-whelp',played:true,cost:1}),event(4,'damage',{value:3}),event(5,'death'),event(6,'handAdded')]
 h.update(view(events.slice(0,1)))
 h.mark('one',events.slice(1),{type:'play'},0);h.update(view(events))
 const turns=h.turns(view(events))
 assert.equal(turns.length,1);assert.equal(turns[0].groups.length,2)
 const action=turns[0].groups[1]
 assert.equal(action.card.id,'ember-whelp');assert.equal(action.root.seq,3);assert.equal(action.events.length,5)
 assert.deepEqual(historyOutcomes(action).map(c=>c.text),['3ダメージ','退場 1体','召喚 1体','手札 ＋1'])
 const html=renderBattleLog(turns,options)
 assert.match(html,/card-ember-whelp.webp/);assert.match(html,/第 1 ターン · あなた/);assert.match(html,/処理の詳細 · 5件/)
})
test('非公開のドローと生成は本人分もキャッシュとHTMLに含めない',()=>{
 const events=[event(1,'turn'),event(2,'spell',{played:true,card:'FT-0001'}),event(3,'draw',{privateTo:0,card:'night-dragon',text:'SECRET_CARD'}),event(4,'generate',{privateTo:1,text:'ENEMY_SECRET'}),event(5,'handAdded',{seat:1})]
 const h=createBattleHistory();h.update(view(events))
 assert.equal(h.event(3),undefined);assert.equal(h.event(4),undefined)
 const html=renderBattleLog(h.turns(view(events)),options)+renderRecentHistory(h.turns(view(events)),options)
 assert(!html.includes('SECRET'));assert(!html.includes('night-dragon'));assert(html.includes('相手の手札 ＋1'))
})
test('選択破棄を2回行っても元のカードの使用結果へつなげる',()=>{
 const h=createBattleHistory(),first=[event(1,'turn'),event(2,'summon',{played:true,card:'FT-0616',id:5}),event(3,'handAdded')]
 h.update(view(first.slice(0,1)));h.mark('one',first.slice(1),{type:'play'},0);h.update(view(first))
 const a=event(4,'discard',{card:'FT-0001'}),b=event(5,'discard',{card:'FT-0002'})
 h.mark('one',[a],{type:'decide'},0);h.update(view([...first,a]))
 h.mark('one',[b],{type:'decide'},0);h.update(view([...first,a,b]))
 const action=h.turns(view([...first,a,b]))[0].groups[1]
 assert.equal(action.card.id,'FT-0616');assert.equal(action.events.length,4)
 assert(historyOutcomes(action).some(chip=>chip.text==='破棄 2件'))
})
test('退場した攻撃元を公開済み召喚記録から特定でき、各ターンを分ける',()=>{
 const events=[event(1,'turn'),event(2,'summon',{played:true,card:'ember-whelp',id:15}),event(3,'attack',{id:15,target:{kind:'leader',seat:1}}),event(4,'damage',{value:2}),event(5,'turn',{seat:1}),event(6,'focus',{seat:1,value:1})]
 const turns=groupBattleEvents(events,view(events,2))
 assert.equal(turns.length,2);assert.equal(turns[0].groups[2].card.id,'ember-whelp')
 assert.equal(turns[0].groups[2].target,'オーロラ・ソムニア')
 const html=renderBattleLog(turns,options)
 assert(html.indexOf('第 2 ターン')<html.indexOf('第 1 ターン'))
 assert.match(html,/history-enemy/)
})
test('取得途中の履歴は以前の記録とし、残っているturnイベントを正しい番号へ対応させる',()=>{
 const events=[event(12,'spell',{played:true,card:'FT-0001'}),event(150,'damage',{value:2}),event(153,'turn',{seat:1}),event(154,'handAdded',{seat:1})]
 const turns=groupBattleEvents(events,view(events,9))
 assert.equal(turns[0].turn,null);assert.equal(turns[1].turn,9)
 assert.equal(turns[0].groups.length,2,'切り詰められた別の効果を過去のカードに結びつけない')
 assert.equal(historyOutcomes(turns[0].groups[0]).length,0)
 const html=renderBattleLog(turns,options)
 assert(html.includes('以前の記録（一部）'));assert(html.includes('第 9 ターン · 相手'))
})
test('再描画・通信再送で履歴を重複させず、別の試合で消去し、上限を守る',()=>{
 const h=createBattleHistory(3),events=[event(1,'turn'),event(2,'focus'),event(3,'focus'),event(4,'focus')]
 h.update(view(events));h.update(view(events));assert.equal(h.event(1),undefined)
 assert.equal(h.turns(view(events)).flatMap(t=>t.groups).length,3)
 h.update(view([event(1,'turn')],1,'two'));assert.equal(h.event(4),undefined)
})
test('直近履歴は行動5件に絞り、ダメージの回数と軽減も残す',()=>{
 const events=[event(1,'turn'),...Array.from({length:7},(_,i)=>event(i+2,'spell',{played:true,card:'FT-0001'})),event(9,'damage',{value:3}),event(10,'damage',{value:3}),event(11,'damage',{value:0})]
 const turns=groupBattleEvents(events,view(events)),html=renderRecentHistory(turns,options)
 assert.equal((html.match(/data-history-action=/g)??[]).length,5)
 assert(html.includes('3ダメージ ×2'));assert(html.includes('ダメージ防御 1回'))
})
test('開閉状態を保ち、ログ文言をHTMLとして解釈しない',()=>{
 const events=[event(1,'turn'),event(2,'spell',{played:true,card:'FT-0001'}),event(3,'ability',{text:'<img src=x onerror=alert(1)>'})]
 const turns=groupBattleEvents(events,view(events))
 const html=renderBattleLog(turns,{...options,open:true,turnState:new Map([['1',false]]),expandedActions:new Set(['1-2'])})
 assert.match(html,/<details class="battle-log" open>/);assert.match(html,/data-log-turn="1">/)
 assert.match(html,/data-log-action="1-2" open/);assert(!html.includes('<img src=x'))
 assert(html.includes('&lt;img'))
})
