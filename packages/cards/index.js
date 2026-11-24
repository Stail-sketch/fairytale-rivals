import { names, orbNames } from './names.js'
import { expansionCards } from './expansion.js'
import { adaptedCards } from './adapted-cards.js'
import { cardFamilies } from './families.js'

export { names, species, terrains } from './names.js'
export const familyNames = Object.freeze({ slime: '露珠の一族', dragon: '竜鱗の一族', undead: '夜継ぎの一族', adventurer: '星路の一族' })

const ability = (trigger, ...effects) => ({ trigger, effects })
const damage = (amount, to = 'chosen') => ({ id: 'damage', amount, to })
const heal = (amount, to = 'chosen') => ({ id: 'heal', amount, to })
const buff = (attack, hp, to = 'chosen') => ({ id: 'buff', attack, hp, to })
const status = (effect, to = 'chosen') => ({ id: 'status', status: effect, to })
const draw = amount => ({ id: 'draw', amount })
const tension = amount => ({ id: 'tension', amount })

const martialCards = ['token-fist', 'token-kick', 'token-breath']
const toolCards = ['token-power', 'token-life', 'token-fortune']

const leader = (name, job, motif, strategy, color, accent, sigil, skillName, description, effects, target = null) =>
  ({ name, job, motif, strategy, color, accent, sigil, skill: { name: skillName, description, effects, target } })

export const leaders = {
  warrior: leader('レオン・ド・ブーツ', '戦士', '長靴をはいた猫', '武器・リーダー攻撃', '#a63143', '#eec46d', '♜',
    '金剣の雷光', 'このターン、味方リーダーの攻撃力+3。穿ちの一撃を得る。', [{ id: 'leaderPower', amount: 3, pierce: true }]),
  mage: leader('アリス・ワンダー', '魔法使い', '不思議の国のアリス', '特技・魔法ダメージ', '#434ea1', '#bc9aff', '◷',
    '鏡炎の火球', '敵リーダーか敵ユニット1体に3ダメージ。', [damage(3)], 'enemy'),
  fighter: leader('ルゥ・クリムゾン', '武闘家', '赤ずきん', '連続攻撃・コンボ', '#266649', '#ee776e', '❧',
    '赤ずきんの型', '1枚引き、ランダムな武術カード1枚を手札に加える。', [draw(1), { id: 'generateRandom', cards: martialCards, amount: 1 }]),
  priest: leader('オーロラ・ソムニア', '僧侶', '眠れる森の美女', '回復・耐久', '#a85675', '#fff2db', '✿',
    '花冠の祝祷', '味方リーダーとすべての味方ユニットのHPを3回復。', [heal(3, 'allies')]),
  merchant: leader('ジャック・グリーン', '商人', 'ジャックと豆の木', '道具・ユニット強化', '#98662c', '#64d4bb', '⚙',
    '豆の木の宝探し', 'ランダムな道具カード3枚を手札に加える。', [{ id: 'generateRandom', cards: toolCards, amount: 3 }]),
  seer: leader('スノウ・ミラー', '占い師', '白雪姫', '占い・未来操作', '#3b4d79', '#d1e1ef', '◇',
    '白銀の水晶', '山札から特技1枚を引き、コストを1下げる。特技がなければ「鏡の審判」を手札に加える。',
    [{ id: 'drawDiscountedSpell', amount: 1, fallback: 'token-reflection' }]),
  swordsman: leader('ヴァルド・ローゼン', '魔剣士', '美女と野獣', 'MP操作・大型召喚', '#482842', '#ec5a73', '❦',
    '黒薔薇の騎士', '空きマスに3/2の「茨の騎士」を1体召喚。', [{ id: 'summon', card: 'token-rose-knight' }]),
}

const base = (id, name, cost, options) => ({
  id, name, cost, artId: `card-${id}`,
  packId: 'prototype', classId: 'neutral', species: null, rarity: 'common',
  implementation: 'prototype', tests: 'covered',
  keywords: [], abilities: [], target: null, effects: [], choice: null,
  ...options,
})

const unit = (id, name, cost, attack, hp, species, options = {}) =>
  base(id, name, cost, { kind: 'unit', attack, hp, species, description: '基本ユニット。', ...options })

const spell = (id, name, cost, description, effects, target = null, options = {}) =>
  base(id, name, cost, { kind: 'spell', attack: 0, hp: 0, description, effects, target, ...options })

export const catalog = [
  unit('moon-hare', '月灯りのうさぎ', 1, 1, 2, '幻獣族'),
  unit('twig-guard', '小枝の門番', 1, 1, 2, '付喪族', {
    keywords: ['GUARD'], description: '騎士の誓い：前衛にいる間、敵の攻撃を引きつける。',
  }),
  unit('ember-whelp', '火花の仔竜', 1, 2, 1, '竜族', {
    keywords: ['CHARGE'], description: '奇襲：登場したターンにも攻撃できる。',
  }),
  unit('brass-squire', '真鍮の従者', 2, 2, 3, '機巧族'),
  unit('mist-cat', '霧渡りの猫', 2, 3, 1, '夢幻族', {
    keywords: ['STEALTH'], description: '影隠れ：攻撃するまで敵の単体対象にならない。',
  }),
  unit('lake-scout', '鏡湖の斥候', 2, 2, 2, '水棲族', {
    keywords: ['AIM'], description: '鷹の目：敵の配置による攻撃制限を無視する。',
  }),
  unit('page-sprite', '頁めくりの精', 2, 1, 2, '精霊族', {
    abilities: [ability('ON_SUMMON', draw(1))], description: '登場時：カードを1枚引く。',
  }),
  unit('sugar-bomb', '金平糖の火鬼', 2, 2, 2, '菓子族', {
    abilities: [ability('ON_DEATH', damage(2, 'enemyLeader'))], description: '退場時：敵リーダーに2ダメージ。',
  }),
  unit('bell-familiar', '銀鈴の使い魔', 2, 1, 3, '魔族', {
    abilities: [ability('TENSION_LINK', buff(1, 0, 'self'))], description: '共鳴：味方の熱量が上がるたび攻撃力+1。',
  }),
  unit('needle-knight', '縫い針の騎士', 3, 3, 3, '付喪族', {
    keywords: ['PIERCE'], description: '穿ちの一撃：前衛への攻撃時、同列の後衛にも攻撃力分のダメージ。',
  }),
  unit('twin-fox', '双尾の火狐', 3, 2, 3, '幻獣族', {
    keywords: ['DOUBLE_ATTACK'], description: '双撃：1ターンに2回攻撃できる。',
  }),
  unit('steel-beetle', '鋼甲のコガネ', 3, 1, 4, '機巧族', {
    keywords: ['METAL_BODY'], description: '鋼の身：3以下のダメージを1に減らす。',
  }),
  unit('thorn-owl', '茨森のフクロウ', 3, 3, 2, '精霊族', {
    abilities: [ability('ON_ATTACK', damage(1, 'enemyLeader'))], description: '攻撃時：敵リーダーに1ダメージ。',
  }),
  unit('lantern-ghost', '提灯おばけ', 3, 2, 3, '不死族', {
    abilities: [ability('ON_DEATH', { id: 'summon', card: 'page-sprite', triggerSummon: true })],
    description: '退場時：空きマスに頁めくりの精を召喚。',
  }),
  unit('choir-siren', '水鏡の歌い手', 4, 3, 4, '水棲族', {
    abilities: [ability('SKILL_LINK', heal(2, 'ownLeader'))],
    description: '物語の共鳴：味方が語り手の奥義を使うたび、味方リーダーのHPを2回復。',
  }),
  unit('honey-bear', 'はちみつの番熊', 4, 3, 5, '菓子族', {
    keywords: ['GUARD'], description: '騎士の誓い：前衛にいる間、敵の攻撃を引きつける。',
  }),
  unit('dawn-deer', '夜明けを呼ぶ鹿', 4, 3, 4, '幻獣族', {
    abilities: [ability('ON_SUMMON', heal(3, 'ownLeader'))], description: '登場時：味方リーダーのHPを3回復。',
  }),
  unit('night-dragon', '星喰らいの竜', 6, 6, 6, '竜族', {
    rarity: 'legendary', keywords: ['PIERCE'], description: '穿ちの一撃：前衛への攻撃時、同列の後衛にも攻撃力分のダメージ。',
  }),
  spell('spark', '燐火のしおり', 1, '敵1体に2ダメージ。', [damage(2)], 'enemy'),
  spell('dew', '朝露の小瓶', 1, '味方リーダーのHPを3回復。', [heal(3, 'ownLeader')]),
  spell('blessing', '若芽の祝福', 1, '味方ユニット1体に+1/+2。', [buff(1, 2)], 'allyUnit'),
  spell('cheer', '森からの声援', 1, '声援：熱量を1上げる。', [tension(1)]),
  spell('ink', '沈黙のインク', 2, '敵ユニット1体に能力封じ。', [status('SILENCE')], 'enemyUnit'),
  spell('poison', '魔女の青林檎', 2, '敵ユニット1体に毒。持ち主のターン終了時に1ダメージ。', [status('POISON')], 'enemyUnit'),
  spell('veil', '星絹の帳', 2, '味方ユニット1体に完全防護。次の味方ターン開始までダメージを受けない。', [status('INVULNERABLE')], 'allyUnit'),
  spell('retreat', '退き際の羽根', 1, '転位：味方の前衛1体を、同列の空いている後衛へ移す。', [{ id: 'move', row: 'back', to: 'chosen' }], 'allyUnit'),
  spell('crossroads', '岐路のきらめき', 2, '分岐：カードを2枚引くか、月灯りのうさぎを手札に加える。', [], null, {
    choice: [
      { label: 'カードを2枚引く', effects: [draw(2)] },
      { label: '月灯りのうさぎを作る', effects: [{ id: 'generate', card: 'moon-hare' }] },
    ],
  }),
  spell('tithe', '黄金の取引', 2, '無作為に手札を1枚捨て、2枚引く。', [{ id: 'discard', amount: 1 }, draw(2)]),
  spell('storm', '鐘楼の嵐', 4, 'すべてのユニットに2ダメージ。', [damage(2, 'allUnits')], null, { rarity: 'rare' }),
  spell('exile', '白紙への帰還', 4, '敵ユニット1体を除外する。', [{ id: 'exile', to: 'chosen' }], 'enemyUnit', { rarity: 'rare' }),
  spell('FT-0001', '夢時計の弾丸', 2, 'リーダーかユニット1体に3ダメージ。', [damage(3)], 'anyCharacter', {
    classId: 'mage', packId: 'basic', rarity: 'rare',
  }),
  unit('FT-0002', 'ティーカップの火術師', 2, 2, 3, '付喪族', {
    classId: 'mage', packId: 'basic',
    abilities: [ability('ON_ALLY_SPELL', buff(1, 0, 'self'))],
    description: '自分が特技を使うたび、このユニットの攻撃力+1。',
  }),
  spell('FT-0003', '鏡渡りの流星', 7, '敵ユニットすべてに3ダメージ。', [damage(3, 'enemyUnits')], null, {
    classId: 'mage', packId: 'basic', rarity: 'rare',
  }),
  spell('FT-0004', '眠り森の護り', 1, 'ユニット1体のHPを3上げる。', [buff(0, 3)], 'anyUnit', {
    classId: 'priest', packId: 'basic',
  }),
  spell('FT-0005', '夜明けの木洩れ日', 0, 'リーダーかユニット1体のHPを3回復。', [heal(3)], 'anyCharacter', {
    classId: 'priest', packId: 'basic',
  }),
  unit('FT-0006', '薔薇園の守護獣', 3, 2, 4, '幻獣族', {
    classId: 'priest', packId: 'basic', rarity: 'rare',
    abilities: [ability('ON_ALLY_HEAL', buff(1, 0, 'self'))],
    description: '味方のリーダーやユニットのHPが回復するたび、このユニットの攻撃力+1。',
  }),
  spell('FT-0007', '黒薔薇の契約', 1, '味方ユニット1体を退場させ、カードを1枚引き、最大MPを1増やす。', [
    { id: 'destroy', to: 'chosen' }, draw(1), { id: 'ramp', amount: 1 },
  ], 'allyUnit', { classId: 'swordsman', packId: 'basic', rarity: 'rare' }),
  spell('FT-0008', '茨鎖の解放', 0, 'このターンに使えるMPを1増やす。', [{ id: 'temporaryMp', amount: 1 }], null, {
    classId: 'swordsman', packId: 'basic',
  }),
  unit('FT-0009', '黒薔薇の古竜', 7, 7, 7, '竜族', {
    classId: 'swordsman', packId: 'basic', keywords: ['GUARD'],
    description: '騎士の誓い：前衛にいる間、敵の攻撃を引きつける。',
  }),
  unit('FT-0010', '木苺ころがし', 1, 2, 1, '精霊族', { packId: 'basic' }),
  unit('FT-0011', '葦辺の槍兵', 2, 3, 2, '水棲族', { packId: 'basic' }),
  unit('FT-0012', '銀甲のアルマ', 2, 1, 2, '機巧族', {
    packId: 'basic', rarity: 'rare', keywords: ['METAL_BODY'],
    description: '鋼の身：3以下のダメージを1に減らす。',
  }),
  spell('token-fist', '紅葉の一打', 0, 'リーダーかユニット1体に1ダメージ。', [damage(1)], 'anyCharacter', {
    classId: 'fighter', packId: 'generated', origin: '赤ずきんの型',
  }),
  spell('token-kick', '狼走りの蹴り', 0, 'ユニット1体の位置を同じ列の前衛・後衛で入れ替える。',
    [{ id: 'swapRank', to: 'chosen' }], 'anyUnit', { classId: 'fighter', packId: 'generated', origin: '赤ずきんの型' }),
  spell('token-breath', '森息の型', 1, 'カードを1枚引く。', [draw(1)], null, {
    classId: 'fighter', packId: 'generated', origin: '赤ずきんの型',
  }),
  spell('token-power', '力芽の種', 0, 'ユニット1体の攻撃力を1上げる。', [buff(1, 0)], 'anyUnit', {
    classId: 'merchant', packId: 'generated', origin: '豆の木の宝探し',
  }),
  spell('token-life', '命芽の実', 0, 'ユニット1体のHPを1上げる。', [buff(0, 1)], 'anyUnit', {
    classId: 'merchant', packId: 'generated', origin: '豆の木の宝探し',
  }),
  spell('token-fortune', '双葉の種', 1, 'ユニット1体に+1/+1。', [buff(1, 1)], 'anyUnit', {
    classId: 'merchant', packId: 'generated', origin: '豆の木の宝探し',
  }),
  spell('token-reflection', '鏡の審判', 0, '運命の分岐：1枚引くか、味方リーダーのHPを2回復する。どちらかがランダムに発動。',
    [{ id: 'randomEffect', options: [draw(1), heal(2, 'ownLeader')] }], null, {
      classId: 'seer', packId: 'generated', origin: '白銀の水晶',
    }),
  unit('token-rose-knight', '茨の騎士', 2, 3, 2, '魔族', {
    classId: 'swordsman', packId: 'generated', origin: '黒薔薇の騎士',
  }),
  unit('token-star-shield', '星盾の従者', 3, 3, 3, '機巧族', {
    packId: 'generated', classId: 'seer', origin: '星花の札', keywords: ['GUARD'], description: '騎士の誓い。',
  }),
  spell('token-orbit', '巡りゆく星座', 1, 'このターン中、未来の統合を得る。すでに未来の統合があれば熱量+1。',
    [{ id: 'setFortune', mode: 'temporaryBoth', repeatTension: 1 }], null,
    { classId: 'seer', packId: 'generated', origin: '銀軌道の札' }),
  unit('token-frost-block', '根付く氷塊', 1, 0, 5, '精霊族', {
    packId: 'generated', classId: 'mage', origin: '氷結の効果', cannotAttack: true,
    abilities: [ability('ON_ANY_TURN_END', damage(1, 'self'))],
    description: '攻撃できない。どちらのターンの終了時にも自身に1ダメージ。',
  }),
  unit('token-moon-wolf', '月草狼', 3, 3, 1, '幻獣族', {
    packId: 'generated', origin: '月狼を駆る仔猫', keywords: ['CHARGE'], description: '奇襲。',
  }),
  unit('token-little-dog', '青紐の小犬', 1, 1, 1, '幻獣族', {
    packId: 'generated', origin: '白鼬の変化司教', description: '能力なし。',
  }),
  unit('token-sea-pot', '灯つぼの蛸', 1, 1, 1, '水棲族', {
    packId: 'generated', origin: '碧瀬の川君', abilities: [ability('ON_TURN_END', heal(1, 'allies'))],
    description: '自分のターン終了時、味方全員のHPを1回復。',
  }),
  unit('token-sea-singer', '珊瑚冠の歌い手', 2, 2, 2, '水棲族', {
    packId: 'generated', origin: '碧瀬の川君', rarity: 'rare', attackAura: { amount: 1 },
    description: '自身を除く味方ユニットの攻撃力+1。',
  }),
  unit('token-sea-rider', '濡羽の海騎兵', 3, 3, 3, '水棲族', {
    packId: 'generated', origin: '碧瀬の川君', description: '能力なし。',
  }),
  spell('token-light-sphere', '白光の珠', 4, '宵衣を持つ敵ユニットをすべて能力封じにする。',
    [{ ...status('SILENCE', 'enemyUnits'), requiresKeyword: 'DARK_CLOAK' }], null,
    { packId: 'generated', origin: '宵衣の無貌王', rarity: 'superRare' }),
  unit('token-dragon-emperor', '紅葉竜の真王', 9, 7, 7, '竜族', {
    packId: 'generated', origin: '焔影の小王', rarity: 'legendary', keywords: ['SUPER_PIERCE'],
    description: '貫きの奔流。ユニットを攻撃すると、その列の敵全員と敵リーダーにもダメージ。',
  }),
  spell('token-sun-pendant', '陽環の首飾り', 1, '味方リーダーの物語の熱量+3。',
    [tension(3)], null, { packId: 'generated', origin: '陽環の紅竜', rarity: 'superRare' }),
  unit('token-mirror-double', '綱渡りの鏡写し', 1, 1, 1, '夢幻族', {
    packId: 'generated', classId: 'swordsman', origin: '三鏡の綱渡り', rarity: 'rare',
    description: '敵に狙われると、同じ術の本体と分身の中から対象を再抽選する。',
  }),
  unit('token-cloth-dead', '古布の骸', 3, 3, 3, '不死族', {
    packId: 'generated', origin: '芽を包む舌骸、黄金の招き爪', family: 'undead', rarity: 'rare', description: '能力なし。',
  }),
  unit('token-night-stallion', '紫焔の蹄魔', 4, 4, 4, '魔族', {
    packId: 'generated', classId: 'seer', origin: '黒翼の札、黒骰子の星魔', description: '能力なし。',
  }),
  unit('token-stump-child', '切株の子', 3, 1, 1, '精霊族', {
    packId: 'generated', classId: 'merchant', origin: '若株の森守り', description: '能力なし。',
  }),
  base('token-old-sword', '月鍔の老剣', 4, {
    packId: 'generated', kind: 'weapon', classId: 'warrior', attack: 4, hp: 2,
    origin: '蒼帽の老剣士', rarity: 'superRare', description: '能力なし。',
  }),
  unit('token-cap-raider', '赤頭巾の突撃兵', 3, 3, 1, '幻獣族', {
    packId: 'generated', classId: 'merchant', origin: '荒備えの号令', keywords: ['CHARGE'], rarity: 'rare', description: '奇襲。',
  }),
  spell('token-wedding-gift', '翡翠の祝弓', 1, 'ユニット1体のHP+2。そのユニットは特技ダメージを受けなくなる。カードを1枚引く。',
    [buff(0, 2), { id: 'grant', keyword: 'RESIST_SPELL', to: 'chosen' }, draw(1)], 'anyUnit',
    { packId: 'generated', origin: '婚礼箱の湖姫', rarity: 'rare' }),
  unit('token-pinecone-ward', '松毬の弟子', 2, 2, 2, '付喪族', {
    packId: 'generated', classId: 'merchant', origin: '赤器の松毬師', description: '能力なし。',
  }),
  unit('token-iron-ant', '鋼針の蟻', 1, 0, 1, '幻獣族', {
    packId: 'generated', classId: 'swordsman', origin: '若葉の隊列蟻',
    abilities: [ability('ON_ATTACK', { ...buff(1, 0, 'self'), temporary: true })],
    description: '攻撃時、このターン中攻撃力+1。',
  }),
  unit('token-shovel-scout', '小鍬の兵', 3, 1, 1, '幻獣族', {
    packId: 'generated', classId: 'swordsman', origin: '土冠の掘り王', keywords: ['CHARGE'], rarity: 'rare', boost: { attack: 1 },
    abilities: [ability('ON_ANY_TURN_END', { id: 'destroy', to: 'self' })],
    description: '奇襲。ターン終了時に退場。覚醒で奥義を使った回数だけ攻撃力が上がる。',
  }),
  unit('token-four-mask', '七光の仮面機', 7, 7, 10, '機巧族', {
    packId: 'generated', origin: '翼面の木兎と双面の銅兎', keywords: ['CHARGE', 'DOUBLE_ATTACK'],
    rarity: 'superRare', description: '奇襲と双撃。',
  }),
  unit('token-ghost-hound', '幽舟の猟犬', 5, 2, 2, '不死族', {
    packId: 'generated', origin: '海霧の骨船長', description: '能力なし。',
  }),
  unit('token-dusk-guard', '暮翼の護衛', 3, 3, 3, '魔族', {
    packId: 'generated', origin: '暮翼の冥王', keywords: ['GUARD'], rarity: 'rare', description: '騎士の誓い。',
  }),
  unit('token-dusk-guard-large', '暮翼の大護衛', 5, 5, 5, '魔族', {
    packId: 'generated', origin: '暮翼の冥王', keywords: ['GUARD'], rarity: 'rare', description: '騎士の誓い。',
  }),
  base('token-awakened-claw', '獣王の爪', 9, {
    packId: 'generated', kind: 'weapon', classId: 'swordsman', attack: 6, hp: 3,
    origin: '獣王の黒薔薇', rarity: 'rare', description: '能力なし。',
  }),
  ...Object.entries(orbNames).map(([stage, name]) => spell('token-' + stage, name, 3,
    '種晶と安息の地を除く味方マス1つにこの種晶を置き、カードを1枚引く。このカードはコピーできない。',
    [{ id: 'placeOrb', color: stage.slice(4) }, draw(1)], null, {
      packId: 'generated', origin: '六彩の暁鳥', rarity: 'superRare', terrainPlace: { side: 'own', nonOrb: true, unprotected: true },
    })),
  unit('token-petal-sisters', '花風の三姉妹', 0, 1, 1, '精霊族', {
    packId: 'generated', classId: 'mage', origin: '花風の投げ接吻', description: '花風の投げ接吻で与えたダメージによって攻撃力とHPが決まる。',
  }),
  unit('token-practice-beast', '赤枝の鍛錬獣', 0, 1, 1, '幻獣族', {
    packId: 'generated', classId: 'fighter', origin: '赤枝の稽古台', description: '出たターン中、味方が手札を使うたびに+1/+1。',
    abilities: [ability('ON_ALLY_PLAY', { ...buff(1, 1, 'self'), when: ['practiceTurn', true] })],
  }),
  unit('token-oak-stag', '樫の鋏甲虫', 1, 2, 2, '幻獣族', {
    packId: 'generated', classId: 'merchant', origin: '樫角の甲虫騎士', keywords: ['GUARD'], rarity: 'rare', description: '騎士の誓い。',
  }),
  unit('token-sanctuary-guard', '銀域の守護騎士', 5, 4, 4, '機巧族', {
    packId: 'generated', classId: 'seer', origin: '闇庭の影卓', description: '能力なし。',
  }),
  unit('token-scarf-dragon', '紅舞姫の焔竜', 6, 6, 6, '竜族', {
    packId: 'generated', classId: 'seer', origin: '双紗の紅舞姫', rarity: 'legendary', family: 'dragon', cannotAttack: true,
    description: '攻撃できない。自分のターン終了時、ランダムな1列の敵ユニット全員と敵リーダーに4ダメージ。',
    abilities: [ability('ON_TURN_END', { id: 'randomLaneDamage', amount: 4 })],
  }),
  ...expansionCards({ unit, spell, ability, damage, heal, buff, status, draw, tension }),
  ...adaptedCards(),
]

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested)
    Object.freeze(value)
  }
  return value
}

freeze(leaders)
for (const card of catalog) {
  if (cardFamilies[card.id]) card.family = cardFamilies[card.id]
}
freeze(catalog)
export const cards = Object.freeze(Object.fromEntries(catalog.map(card => [card.id, card])))
export const prototypeDeck = Object.freeze(catalog.filter(card => card.packId === 'prototype').map(card => card.id))
export const cardCost = (instance, skillUses = 0) => {
  const card = cards[instance.card]
  return Math.max(0, card.cost - (instance.discount ?? 0) - (card.boost?.cost ?? 0) * skillUses)
}
export const keywordLabel = unit => cards[unit.card].keywords.map(id => names[id]).join('・')

