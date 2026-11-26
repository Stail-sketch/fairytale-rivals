import { cards, leaders } from '../../packages/cards/index.js'
import { escapeText as escape } from './card-terms.js'

const publicEvent = event => event.privateTo === undefined
const actionRoot = event => event.played || ['attack','leaderAttack','skill','focus','turn','mulligan'].includes(event.type)
const rootPriority = event => event.played ? 6 : ['attack','leaderAttack','skill'].includes(event.type) ? 5 : event.type==='turn' ? 4 : event.type==='focus' ? 3 : 0

// Client-only, bounded public history. Never keep draw identities or unprojected state.
export function createBattleHistory(limit=1500) {
  let matchId=null, continuing=null
  const events=new Map(),marks=new Map(),unitCards=new Map()
  function reset(id){matchId=id;continuing=null;events.clear();marks.clear();unitCards.clear()}
  return {
    mark(id,batch,action,seat) {
      if(id!==matchId)reset(id)
      const visible=batch.filter(publicEvent)
      if(!visible.length)return
      const key=action.type==='decide'&&continuing!=null?continuing:visible[0].seq
      if(action.type!=='decide')continuing=key
      for(const event of visible)marks.set(event.seq,{key,kind:action.type,seat})
    },
    update(view) {
      if(view.matchId!==matchId)reset(view.matchId)
      for(const player of view.players)for(const unit of player.units)unitCards.set(unit.id,unit.card)
      for(const event of view.events.filter(publicEvent)) {
        events.set(event.seq,event)
        if(event.id&&event.card&&event.type==='summon')unitCards.set(event.id,event.card)
        if(event.source?.id&&event.source.card)unitCards.set(event.source.id,event.source.card)
      }
      const sorted=[...events.keys()].sort((a,b)=>a-b)
      for(const seq of sorted.slice(0,Math.max(0,sorted.length-limit))){events.delete(seq);marks.delete(seq)}
      // IDs for retired units are retained only while referenced in the visible history.
      const referenced=new Set(view.players.flatMap(p=>p.units.map(u=>u.id)))
      for(const event of events.values())for(const id of [event.id,event.source?.id,event.destination?.id,event.target?.id])if(id)referenced.add(id)
      for(const id of unitCards.keys())if(!referenced.has(id))unitCards.delete(id)
    },
    event:seq=>events.get(seq),
    card:event=>cards[event?.card??unitCards.get(event?.id)??event?.source?.card],
    turns(view){return groupBattleEvents([...events.values()],view,marks,unitCards)},
  }
}

export function groupBattleEvents(input,view,marks=new Map(),unitCards=new Map()) {
  const events=[...new Map(input.filter(publicEvent).map(e=>[e.seq,e])).values()].sort((a,b)=>a.seq-b.seq)
  const knownCards=new Map(unitCards)
  for(const p of view.players)for(const u of p.units)knownCards.set(u.id,u.card)
  for(const e of events){if(e.type==='summon'&&e.card)knownCards.set(e.id,e.card);if(e.source?.id&&e.source.card)knownCards.set(e.source.id,e.source.card)}
  const count=events.filter(e=>e.type==='turn').length
  let turn=Math.max(0,view.turn-count),section=null,group=null,previousSeq=null
  const partial=events[0]?.seq>1,turns=[]
  function newSection(event){
    const key=event?String(event.seq):partial?'earlier':'setup'
    section={key,turn:event?turn:partial?null:0,seat:event?.seat,partial:!event&&partial,groups:[]};turns.push(section);group=null
  }
  for(const event of events){
    if(event.type==='turn'){turn++;newSection(event)}
    if(!section)newSection(null)
    const mark=marks.get(event.seq)
    // A projected private draw can leave a one-event hole. Larger gaps can be a
    // reconnect window; never attach its orphan effects to an old retained card.
    const gap=previousSeq!==null&&event.seq-previousSeq>2&&(!mark||mark.key!==group?.command)
    previousSeq=event.seq
    const boundary=!group || gap || mark&&mark.key!==group.command || !mark&&actionRoot(event)
    if(boundary){group={key:section.key+'-'+event.seq,seq:event.seq,root:event,command:mark?.key,kind:mark?.kind,seat:mark?.seat,events:[]};section.groups.push(group)}
    group.events.push(event)
    if(rootPriority(event)>rootPriority(group.root))group.root=event
  }
  const targetName=target=>target?.kind==='leader'?leaders[view.players[target.seat]?.leader]?.name:
    target?.kind==='unit'?cards[knownCards.get(target.id)]?.name??'ユニット':null
  for(const section of turns)for(const group of section.groups){
    const root=group.root
    group.seq=root.seq
    group.card=cards[root.card??knownCards.get(root.id)??root.source?.card]
    group.seat=root.seat??root.source?.seat??group.seat??section.seat
    group.label=root.played?'カード使用':({attack:'攻撃',leaderAttack:'リーダー攻撃',skill:'奥義',focus:'熱量',turn:'ターン開始',mulligan:'手札交換'})[root.type]??(group.kind==='end'?'ターン終了時の効果':'効果')
    group.title=root.played?group.card?.name??root.text:root.type==='skill'?root.name??'語り手の奥義':root.type==='attack'?group.card?.name??root.text:root.text
    group.target=targetName(root.target)
    group.portrait=root.type==='skill'||root.type==='leaderAttack'?view.players[group.seat]?.leader:null
    group.icon=({focus:'◆',turn:'◷',mulligan:'▤'})[root.type]??'✦'
  }
  return turns
}

export function historyOutcomes(group) {
  const chips=[]
  const hits=new Map(),heals=new Map(),hands=new Map(),counts={}
  for(const event of group.events){
    if(event.type==='damage')hits.set(event.value,(hits.get(event.value)??0)+1)
    if(event.type==='heal'&&event.value>0)heals.set(event.value,(heals.get(event.value)??0)+1)
    if(event.type==='handAdded')hands.set(event.seat,(hands.get(event.seat)??0)+1)
    counts[event.type]=(counts[event.type]??0)+1
  }
  for(const [value,n]of hits)chips.push({kind:value?'damage':'guard',text:value?`${value}ダメージ${n>1?' ×'+n:''}`:`ダメージ防御 ${n}回`})
  for(const [value,n]of heals)chips.push({kind:'heal',text:`${value}回復${n>1?' ×'+n:''}`})
  for(const [type,label]of [['death','退場'],['summon','召喚'],['move','移動'],['discard','破棄'],['badge','刻印']])if(counts[type])chips.push({kind:type,text:label+' '+counts[type]+(['death','summon'].includes(type)?'体':'件')})
  for(const [seat,n]of hands)chips.push({kind:'hand',seat,text:'手札 ＋'+n})
  if(!chips.length&&counts.ability)chips.push({kind:'ability',text:'能力発動 '+counts.ability+'件'})
  return chips
}

const owner=(seat,ownSeat,firstSeat)=>seat==null?'記録':ownSeat==null?(seat===firstSeat?'先攻':'後攻'):seat===ownSeat?'あなた':'相手'
const attrs=(event,card)=>`data-log-event="${event.seq}"${card?` data-log-card="${card.id}" data-card="${card.id}"${event.cost!==undefined?` data-cost="${event.cost}"`:''}`:''}`
function actionHtml(group,options,compact=false){
  const {art,ownSeat,firstSeat,expandedActions}=options
  const relation=ownSeat==null||group.seat==null?'neutral':group.seat===ownSeat?'own':'enemy'
  const image=group.card?art(group.card.artId):group.portrait?art(group.portrait):null
  const root=group.root
  const chips=historyOutcomes(group)
  const control=group.card?'button':'div'
  const icon=image?`<img src="${image}" alt="" loading="lazy">`:`<span class="history-symbol" aria-hidden="true">${group.icon}</span>`
  return `<article class="history-action history-${relation}${compact?' history-compact':''}" data-history-action="${group.key}">
    <${control}${control==='button'?' type="button"':''} class="history-action-head" ${attrs(root,group.card)}${!group.card&&group.portrait?` data-log-skill="${group.seat}"`:''}>
      ${icon}<span class="history-action-copy"><small><b>${owner(group.seat,ownSeat,firstSeat)}</b> · ${group.label}${root.cost!==undefined?' · '+root.cost+' MP':''}</small><strong>${escape(group.title)}</strong>${group.target?`<span class="history-target">→ ${escape(group.target)}</span>`:''}</span>
    </${control}>
    ${chips.length?`<div class="history-outcomes">${chips.map(chip=>`<span class="history-chip chip-${chip.kind}">${chip.seat===undefined?'':owner(chip.seat,ownSeat,firstSeat)+'の'}${escape(chip.text)}</span>`).join('')}</div>`:''}
    ${compact?'':`<details class="history-action-details" data-log-action="${group.key}"${expandedActions?.has(group.key)?' open':''}><summary>処理の詳細 · ${group.events.length}件</summary><ol>${group.events.map(event=>{
      const card=cards[event.card??event.source?.card]
      const text=event.type==='handAdded'?owner(event.seat,ownSeat,firstSeat)+'の手札に1枚追加':event.text
      return `<li class="history-event event-${event.type}"><button type="button" class="log-card" ${attrs(event,card)}>${escape(text)}</button></li>`
    }).join('')}</ol></details>`}
  </article>`
}
export function renderBattleLog(turns,options){
  const groups=turns.flatMap(t=>t.groups)
  return `<details class="battle-log"${options.open?' open':''}><summary class="icon-button">対戦記録 <span class="history-count">${groups.length}</span></summary><div class="events" aria-label="ターン別の対戦記録"><div class="history-guide">最新のターンから表示 · カードを選ぶと詳細を確認</div>${turns.length?[...turns].reverse().map((turn,index)=>{
    const title=turn.turn===null?'以前の記録（一部）':turn.turn===0?'対戦準備':`第 ${turn.turn} ターン · ${owner(turn.seat,options.ownSeat,options.firstSeat)}`
    const open=options.turnState?.has(turn.key)?options.turnState.get(turn.key):index===0
    return `<details class="history-turn" data-log-turn="${turn.key}"${open?' open':''}><summary><strong>${title}</strong><small>${turn.groups.length}行動</small></summary><div class="history-turn-body">${[...turn.groups].reverse().map(g=>actionHtml(g,options)).join('')}</div></details>`
  }).join(''):'<p class="history-empty">まだ行動の記録はありません。</p>'}<p class="history-footnote">このタブで取得した公開記録を表示しています。再接続前や古い記録は一部のみの場合があります。</p></div></details>`
}
export function renderRecentHistory(turns,options){
  const groups=turns.flatMap(t=>t.groups).filter(g=>g.root.played||['attack','leaderAttack','skill','focus'].includes(g.root.type)).slice(-5).reverse()
  return `<aside class="recent-history" aria-label="直近の行動"><header><span>RECENT ACTIONS</span><h2>直近の行動</h2><small>新しい行動から表示</small></header><div class="recent-history-list">${groups.length?groups.map(g=>actionHtml(g,options,true)).join(''):'<p class="history-empty">カードの使用や攻撃が<br>ここに記録されます。</p>'}</div></aside>`
}
