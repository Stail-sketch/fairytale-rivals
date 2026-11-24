import { fourthMetadata } from './fourth-metadata.js'

const token = name => 'token-set4-' + name
const op = (operation, options = {}) => ({ id: 'fourth', operation, ...options })
const hit = (amount, to = 'chosen') => ({ id: 'damage', amount, to })
const buff = (attack, hp, to = 'chosen') => ({ id: 'buff', attack, hp, to })
const heal = (amount, to = 'ownLeader') => ({ id: 'heal', amount, to })
const draw = (amount = 1) => ({ id: 'draw', amount })
const summon = (card, amount = 1, extra = {}) => ({ id: 'summon', card, amount, ...extra })
const generate = (card, amount = 1) => ({ id: 'generate', card, amount })
const grant = (keyword, to = 'self') => ({ id: 'grant', keyword, to })
const on = (trigger, ...effects) => ({ abilities: [{ trigger, effects }] })
const enter = (...effects) => on('ON_SUMMON', ...effects)
const leave = (...effects) => on('ON_DEATH', ...effects)
const spell = (...effects) => ({ effects })
const target = (target, options, targetFilter) => ({ ...options, target, targetFilter })
const traits = (...keywords) => ({ keywords })
const badge = data => ({ badge: data, ...enter({ id: 'storyBadge', badge: data }) })
const fortune = (...options) => ({ fortune: options.map(([label, ...effects]) => ({ label, effects })) })
const slime = { family: 'slime' }, undead = { family: 'undead' }, dragon = { family: 'dragon' }
const split = (a, b) => ({ abilities: [...(a.abilities ?? []), ...(b.abilities ?? [])], ...Object.fromEntries(
  Object.entries({ ...a, ...b }).filter(([key]) => key !== 'abilities')) })

// All numbers follow the DQRDB image snapshot rather than mixing historical balance versions.
const definitions = {
  575: ['攻撃時、前後の味方ユニットのHP+1。', on('ON_ATTACK', buff(0, 1, 'alignedAlly'))],
  576: ['登場時、露珠の一族の味方ユニット1体の攻撃力+1。', target('allyUnit', enter(buff(1, 0)), slime)],
  577: ['物語の刻印：夜継ぎの一族のユニットカードを使うたび、敵の武器の攻撃力-1。', badge({ family: 'undead', event: 'weaponRust', amount: 1 })],
  578: ['敵リーダーにダメージを与えたとき、相手の手札に「萎れた旅の栞」を加える。', on('ON_DEAL_DAMAGE', op('leaderHitBookmark', { card: token('withered-bookmark') }))],
  579: ['基本ユニット。', {}],
  580: ['物語の刻印：露珠の一族のユニットカードを使うたび、味方リーダーのHPを1回復。', badge({ family: 'slime', event: 'heal', amount: 1 })],
  581: ['退場時、山札から物語の刻印を持つユニット1枚を引く。', leave(op('drawBadge'))],
  582: ['登場時、夜継ぎの一族の味方ユニット1体の攻撃力+1。自分の最大MPが相手以下なら、代わりに+1/+1。', target('allyUnit', enter(op('behindBuff')), undead)],
  583: ['登場時、合計2ダメージを正面のランダムな敵マスに割り振る。他の露珠の一族の味方の数だけ合計ダメージ+1。', enter(op('slimeScatter'))],
  584: ['登場時、山札から露珠・竜鱗・夜継ぎの一族のいずれか1枚を引く。', enter(op('drawThreeFamilies'))],
  585: ['登場時、自分の最大MPが1減る。', enter(op('loseMaxMp'))],
  586: ['登場時、ユニット1体に1ダメージ。自分の最大MPが相手以下なら、代わりに3ダメージ。', target('anyUnit', enter(op('behindDamage')))],
  587: ['退場時、退場済みのコスト1以下の夜継ぎの一族の味方1体を、このマスにランダムに復活。', leave(op('reviveHere', { family: 'undead', maxCost: 1 }))],
  588: ['物語の刻印：竜鱗の一族のユニットカードを使うたび、敵リーダーに1ダメージ。', badge({ family: 'dragon', event: 'damage', amount: 1 })],
  589: ['登場時、1/1の「露雫の精」を1体出す。自分の最大MPが相手以下なら、代わりに2体出す。', enter(op('behindSlimes', { card: 'FT-0013' }))],
  590: ['登場時、敵の星路の一族1体を+2/+2して、このユニットが場にいる間、味方にする。', target('enemyUnit', enter(op('boundControl')), { family: 'adventurer' })],
  591: ['登場時、お互いの山札にランダムなコスト2の特技を3枚ずつ混ぜる。', enter(op('seedSpells'))],
  592: ['穿ちの一撃。登場時、自分の場の物語の舞台の数だけ攻撃力+1。', { ...traits('PIERCE'), ...enter(op('terrainAttack')) }],
  593: ['登場時、自分の最大MPが相手以下なら、選んだ手札の竜鱗の一族1枚のコスト-2。', { ...enter(op('discountDragon')), handSelection: true, handFamily: 'dragon' }],
  594: ['登場時、敵リーダーの物語の刻印をランダムに1つ消す。', enter(op('eraseBadge'))],
  595: ['物語の刻印：星路の一族の味方ユニットを+1/+1。', badge({ family: 'adventurer', attack: 1, hp: 1 })],
  596: ['退場時、「アウル・第二幕」に変わって手札に加わる。', leave(generate(token('aul-act-two')))],
  597: ['退場した竜鱗の一族の味方の数だけ攻撃力が上がる。自分のターン開始時、攻撃力が6以上なら竜詩の姿に変身。', { fallenFamily: 'dragon', ...on('ON_TURN_START', op('dragonForm', { card: token('serena-dragon') })) }],
  598: ['基本ユニット。', {}],
  599: ['登場時、物語の舞台にいる味方ユニット全員を+1/+1。', enter(op('terrainBuff'))],
  600: ['共鳴：前後の味方ユニットに奇襲を付与。', on('TENSION_LINK', grant('CHARGE', 'alignedAlly'))],
  601: ['自分のターン終了時、前後の空きマスに2/2の「夜継ぎの影騎士」を出す。', on('ON_TURN_END', summon(token('shadow-knight'), 2, { at: 'ranks' }))],
  602: ['登場時、お互いに1枚引く。覚醒：引く枚数+1。', enter(op('bothBoostDraw'))],
  603: ['登場時、ランダムな敵ユニット1体に1ダメージ。他の自分の場と手札の竜鱗の一族1枚につき、ダメージ+3。', enter(op('dragonBurst'))],
  604: ['基本ユニット。', {}],
  605: ['味方リーダーのHPを15になるまで減らす。', spell(op('hpFifteen'))],
  606: ['退場時、お互いのリーダーに2ダメージ。', leave(hit(2, 'bothLeaders'))],
  607: ['物語の刻印：夜継ぎの一族の味方ユニットのHP+1。', badge({ family: 'undead', hp: 1 })],
  608: ['このターン、味方リーダーの攻撃力+2。覚醒：攻撃力+1。', spell({ id: 'leaderPower', amount: 2, boost: 1 })],
  609: ['壊れた自分の武器からランダムに1枚を手札に戻し、+1/+1。', spell(op('recoverWeapon'))],
  610: ['登場時、夜継ぎの一族の味方1体に「退場時、このカードを手札に加える」を付与。', target('allyUnit', enter({ id: 'grantAbility', to: 'chosen', ability: { trigger: 'ON_DEATH', effects: [op('returnSelf')] } }), undead)],
  611: ['騎士の誓い。物語の刻印：夜継ぎの一族の味方ユニットに穿ちの一撃を付与。', { ...badge({ family: 'undead', keyword: 'PIERCE' }), ...traits('GUARD') }],
  612: ['退場した夜継ぎの一族の味方1体につき、コスト-1。', { fallenFamilyDiscount: 'undead' }],
  613: ['物語の刻印：夜継ぎの一族の味方ユニットに奇襲を付与。', badge({ family: 'undead', keyword: 'CHARGE' })],
  614: ['退場した夜継ぎの一族の味方1体につき、コスト-1。', { fallenFamilyDiscount: 'undead' }],
  615: ['1枚引く。相手の手札に同じ特技を1枚加える。', spell(draw(), { ...generate('FT-0615'), enemy: true })],
  616: ['登場時、2枚引いた後、手札を2枚選んで捨てる。', enter(draw(2), { id: 'peek', mode: 'discardHand', amount: 2 })],
  617: ['敵ユニット全員に被ダメージ2倍を付与。', spell(grant('VULNERABLE', 'enemyUnits'))],
  618: ['物語の刻印：露珠の一族の味方ユニットのHP+1。', badge({ family: 'slime', hp: 1 })],
  619: ['物語の刻印：露珠の一族の味方ユニットは特技ダメージを受けない。', badge({ family: 'slime', keyword: 'RESIST_SPELL' })],
  620: ['1枚引く。覚醒：引く枚数+1。', spell(op('boostDraw'))],
  621: ['特技ダメージ+1。自分が特技を使うたび、ランダムな露珠の一族のユニット1枚を手札に加える。', { spellDamage: 1, ...on('ON_ALLY_SPELL', { id: 'generateMatching', amount: 1, filter: { kind: 'unit', family: 'slime' } }) }],
  622: ['選んだ味方の前衛または後衛の空きマスすべてに、1/1の「露雫の精」を出す。覚醒：コスト-1。', { ...spell(op('fillSlimes', { card: 'FT-0013' })), place: { side: 'own' }, boost: { cost: 1 } }],
  623: ['登場時、他の露珠の一族の味方をすべて手札に戻し、そのマスに「宵露の守晶」を出す。', enter(op('crystalReturn', { card: token('dusk-crystal') }))],
  624: ['ユニット1体を1/1の「露雫の精」に変える。露珠の一族の味方1体につき、コスト-1。', { ...target('anyUnit', spell({ id: 'transform', card: 'FT-0013', to: 'chosen' })), boardFamilyDiscount: 'slime' }],
  625: ['手札の特技すべてをランダムな露珠の一族のユニットに変える。', spell(op('slimeHand'))],
  626: ['登場時、露珠の一族の味方1体を手札に戻す。その後、自身に双撃を付与。', target('allyUnit', enter(op('bounceSlime')), slime)],
  627: ['山札から露珠の一族のユニットをランダムに2枚引く。', spell({ id: 'drawMatching', amount: 2, filter: { ...slime, kind: 'unit' } })],
  628: ['前衛のユニット1体に7ダメージ。', target('anyUnit', spell(hit(7)), { row: 'front' })],
  629: ['露珠の一族の味方ユニットが場に出るたび、このターン中、武器の攻撃力+1。', { slimeEntryWeapon: true }],
  630: ['物語の刻印：露珠の一族の味方ユニットの攻撃力+1。', badge({ family: 'slime', attack: 1 })],
  631: ['登場時、山札の上から3枚を公開。その中の露珠の一族のユニットをすべて手札に加え、残りを捨てる。', enter(op('revealSlimes'))],
  632: ['ユニット1体に4ダメージ。露珠の一族の味方1体につき、コスト-1。', { ...target('anyUnit', spell(hit(4))), boardFamilyDiscount: 'slime' }],
  633: ['物語の刻印：露珠の一族のユニットカードを使うたび、味方リーダーの熱量+1。', badge({ family: 'slime', event: 'tension', amount: 1 })],
  634: ['他の露珠の一族の味方を+1/+1。手札の露珠の一族のユニットのコスト-1。', { attackAura: { ...slime, amount: 1 }, hpAura: { ...slime, amount: 1 }, handFamilyAura: 'slime' }],
  635: ['退場時、ランダムなコスト1の竜鱗の一族をこのマスに出す。覚醒：出すユニットのコスト+1。', leave(op('dragonHere'))],
  636: ['選んだ前衛または後衛のユニット全員のHP+2。', { ...spell(op('rankBuff')), terrainPlace: { side: 'both' } }],
  637: ['ユニット1体を+1/+2。竜鱗の一族なら1枚引く。', target('anyUnit', spell(buff(1, 2), op('drawIfDragon')))],
  638: ['物語の刻印：竜鱗の一族の味方ユニットのHP+1。', badge({ family: 'dragon', hp: 1 })],
  639: ['この武器が壊れたとき、ランダムな竜鱗の一族のユニット1枚を手札に加える。', on('ON_WEAPON_BREAK', { id: 'generateMatching', amount: 1, filter: { ...dragon, kind: 'unit' } })],
  640: ['物語の刻印：手札の竜鱗の一族のユニットのコスト-1。', badge({ family: 'dragon', discount: 1 })],
  641: ['登場時、「黎明竜の守護装具」を手札に加える。竜鱗の一族の味方が攻撃で敵ユニットを倒すたび、熱量+1。', { ...enter(generate(token('dawn-regalia'))), dragonKillHeat: true }],
  642: ['お互いのユニット全員の攻撃力を、現在のHPと同じ値にする。', spell({ id: 'setAttack', fromHp: true, to: 'allUnits' })],
  643: ['ユニット1体に3ダメージ。これで倒した場合、この特技のコスト分のMPを回復。', target('anyUnit', spell(op('refundArrow', { amount: 3 })))],
  644: ['騎士の誓い。自分のターン終了時、味方リーダーの熱量+1。', { ...traits('GUARD'), ...on('ON_TURN_END', { id: 'tension', amount: 1 }) }],
  645: ['鋼の身または鋼の身（強化）を持つランダムなユニットか武器1枚を手札に加える。', spell(op('generateMetal'))],
  646: ['鋼の身。この武器の鋼の身は、自分のターン中だけ味方リーダーに働く。', { ...traits('METAL_BODY'), leaderMetalOwnTurn: true }],
  647: ['物語の刻印：鋼の身または鋼の身（強化）を持つ味方ユニットと武器の攻撃力+1。', badge({ metal: true, attack: 1 })],
  648: ['鋼の身。退場時、「銀甲のアルマ」を2枚、手札に加える。', { ...traits('METAL_BODY'), ...leave(generate('FT-0012', 2)) }],
  649: ['味方の鋼の身は、鋼の身（強化）に強化される。', { hardMetalAura: true }],
  650: ['ユニット1体に穿ちの一撃と騎士の誓いを付与し、+1/+1。覚醒：さらに+1/+1。', target('anyUnit', spell(grant('PIERCE', 'chosen'), grant('GUARD', 'chosen'), op('boostBuff')))],
  651: ['お互いのユニット全員に3ダメージ。', spell(hit(3, 'allUnits'))],
  652: ['物語の刻印：手札の、鋼の身または鋼の身（強化）を持つユニットと武器のコスト-1。', badge({ metal: true, discount: 1 })],
  653: ['選んだ前衛または後衛の全ユニットを、鋼の身か鋼の身（強化）を持つランダムなユニットに変える。', { ...spell(op('metalRank')), terrainPlace: { side: 'both' } }],
  654: ['鋼の身（強化）。登場時、山札から鋼の身を持つユニットか武器を、各コストにつき1枚ずつ手札に加える。', { ...traits('HARD_METAL_BODY'), ...enter(op('drawMetalCosts')) }],
  655: ['登場時、味方リーダーの奥義を「竜詩の導き」に変更。', enter(op('changeSkill', { skill: 'dragonGuide' }))],
  656: ['ユニット1体と同じカード2枚を自分の山札に混ぜる。', target('anyUnit', spell(op('copyToDeck')))],
  657: ['ランダムな敵ユニット1体に、竜鱗の一族の味方の最大攻撃力と同じダメージ。', spell(op('dragonWrath'))],
  658: ['運命の分岐：①味方ユニット全員の攻撃力+1。②ランダムな味方ユニット1体を+3/+2。', fortune(['攻撃の祝福', buff(1, 0, 'allyUnits')], ['選ばれし勇者', { ...buff(3, 2, 'allyUnits'), randomTargets: 1 }])],
  659: ['物語の刻印：竜鱗の一族の味方ユニットに騎士の誓いを付与。', badge({ family: 'dragon', keyword: 'GUARD' })],
  660: ['ランダムな竜鱗の一族のユニット2枚を手札に加える。', spell({ id: 'generateMatching', amount: 2, filter: { ...dragon, kind: 'unit' } })],
  661: ['物語の刻印：竜鱗の一族の味方ユニットの攻撃力+1。', badge({ family: 'dragon', attack: 1 })],
  662: ['運命の分岐：①味方リーダーのHPを5回復。②正面の敵ユニット全員に3ダメージ。', fortune(['竜の癒し', heal(5)], ['正面への咆哮', hit(3, 'enemyColumn')])],
  663: ['特技ダメージ+1。登場時、手札に竜鱗の一族のユニットがあれば「巡りゆく星座」を手札に加える。', { spellDamage: 1, ...enter(op('dragonFortune')) }],
  664: ['登場時、4つの願いから1つをかなえる。未来の統合なら、すべての願いをかなえる。', { ...enter(op('wishes')), wishChoices: true }],
  665: ['登場時、味方リーダーの奥義を「夜継ぎの目覚め」に変更。', enter(op('changeSkill', { skill: 'deadAwakening' }))],
  666: ['攻撃力1以下のユニット1体を倒す。覚醒：選べる攻撃力+1。', target('anyUnit', spell({ id: 'destroy', to: 'chosen' }), { maxAttack: 1, attackBoost: 1 })],
  667: ['1/2の「夜継ぎの小従者」を2体出す。', spell(summon(token('returning-revenant'), 2))],
  668: ['お互いのユニット全員を毒にする。', spell({ id: 'status', status: 'POISON', to: 'allUnits' })],
  669: ['物語の刻印：夜継ぎの一族の味方ユニットの攻撃力+1。', badge({ family: 'undead', attack: 1 })],
  670: ['最大MP+1。3/3の「古布の骸」を出す。', spell({ id: 'ramp', amount: 1 }, op('mummy'))],
  671: ['味方ユニット全員に「退場時、1/2の夜継ぎの小従者を1体出す」を付与。', spell({ id: 'grantAbility', to: 'allyUnits', ability: { trigger: 'ON_DEATH', effects: [summon(token('returning-revenant'))] } })],
  672: ['物語の刻印：夜継ぎの一族のユニットカードを使うたび、MPを1回復。', badge({ family: 'undead', event: 'mp', amount: 1 })],
  673: ['登場時、山札の最もコストが高い夜継ぎの一族1枚を引き、そのコスト-6。', enter(op('drawHighestUndead'))],
  674: ['物語の刻印：自分のターン終了時、夜継ぎの一族の味方ユニットを+1/+1。', badge({ family: 'undead', event: 'endBuff', attack: 1, hp: 1 })],
}

const generated = {
  'withered-bookmark': ['何も起こらない。', spell({ id: 'nothing' })],
  'secret-grimoire': ['ランダムな敵3体を、次のターン終了時まで攻撃不能にする。', spell({ id: 'freeze', to: 'enemies', randomTargets: 3 })],
  'shadow-knight': ['他の夜継ぎの一族の味方ユニットの攻撃力+1。', { attackAura: { ...undead, amount: 1 } }],
  'aul-act-two': ['双撃。退場時、「アウル・第三幕」に変わって手札に加わる。', { ...traits('DOUBLE_ATTACK'), ...leave(generate(token('aul-act-three'))) }],
  'aul-act-three': ['登場時、他の全ユニットに2ダメージ。退場時、「アウル・第四幕」に変わって手札に加わる。', split(enter(hit(2, 'otherUnits')), leave(generate(token('aul-act-four'))))],
  'aul-act-four': ['騎士の誓い。攻撃した相手の上下のユニットにも攻撃力分のダメージ。', { ...traits('GUARD'), neighborAttack: true }],
  'serena-dragon': ['貫きの奔流。奇襲。騎士の誓い。退場した竜鱗の一族の味方の数だけ攻撃力が上がる。', { ...traits('SUPER_PIERCE', 'CHARGE', 'GUARD'), fallenFamily: 'dragon' }],
  'dusk-crystal': ['攻撃できない。自分のターン終了時、正面の敵ユニット全員と敵リーダーに2ダメージ。', { cannotAttack: true, ...on('ON_TURN_END', hit(2, 'enemyColumn'), hit(2, 'enemyLeader')) }],
  'dawn-regalia': ['味方リーダーのHPを8回復。奥義を「黎明竜の祝祷」に変更。', spell(heal(8), op('changeSkill', { skill: 'dragonBlessing' }))],
  'wish-pages': ['手札が7枚になるまで引く。', enter(op('wish', { wish: 0 }))],
  'wish-summon': ['手札の竜鱗の一族のユニットのコスト-5。', enter(op('wish', { wish: 1 }))],
  'wish-strength': ['物語の刻印：竜鱗の一族の味方ユニットを+2/+2。', enter(op('wish', { wish: 2 }))],
  'wish-grimoire': ['「秘めごとの禁書」を手札に加える。', enter(op('wish', { wish: 3 }))],
  'returning-revenant': ['基本ユニット。', {}],
}

export const fourthSkills = Object.freeze({
  dragonGuide: { name: '竜詩の導き', description: '山札から竜鱗の一族のユニットをランダムに1枚引き、そのコスト-1。', effects: [op('dragonGuide')] },
  deadAwakening: { name: '夜継ぎの目覚め', description: '空きマスに3/3の「古布の骸」を1体出す。', effects: [op('mummy')] },
  dragonBlessing: { name: '黎明竜の祝祷', description: '味方全体のHPを3回復。退場した竜鱗の一族の味方1体をランダムに復活。', effects: [heal(3, 'allies'), { id: 'resurrect', filter: dragon }] },
})

export function fourthCards() {
  return fourthMetadata.map(metadata => {
    const [description, options] = metadata.id.startsWith('FT-') ? definitions[Number(metadata.id.slice(3))] : generated[metadata.id.slice(11)]
    return { ...metadata, artId: 'card-' + metadata.id, target: null, choice: null, effects: [], abilities: [], keywords: [],
      implementation: 'implemented', tests: 'covered', description, ...options }
  })
}
