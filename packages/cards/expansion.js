export function expansionCards({ unit, spell, ability, damage, heal, buff, status, draw, tension }) {
  function pack(id) {
    const options = { packId: id, implementation: 'implemented', tests: 'covered' }
    return {
      unit: (number, name, cost, attack, hp, species, extra) =>
        unit(ftId(number), name, cost, attack, hp, species, { ...options, ...extra }),
      spell: (number, name, cost, description, effects, target, extra) =>
        spell(ftId(number), name, cost, description, effects, target, { ...options, ...extra }),
    }
  }

  const basic = pack('basic')
  const standard = pack('standard')
  const second = pack('set-2')
  return [
    basic.unit(13, '露雫の精', 0, 1, 1, '精霊族'),
    basic.unit(14, '琥珀殻の番人', 1, 1, 2, '水棲族', {
      keywords: ['GUARD'], description: '騎士の誓い。',
    }),
    basic.unit(15, '木の実の早駆け', 1, 1, 1, '幻獣族', {
      keywords: ['CHARGE'], description: '奇襲。',
    }),
    basic.unit(16, '雷角の小兎', 2, 2, 1, '幻獣族', {
      keywords: ['CHARGE'], description: '奇襲。',
    }),
    basic.unit(17, '青盾のおもちゃ兵', 2, 2, 2, '付喪族', {
      keywords: ['GUARD'], description: '騎士の誓い。',
    }),
    basic.unit(18, '朱羽の戦鳥', 3, 4, 3, '幻獣族'),
    basic.unit(19, '石門の守り像', 4, 3, 5, '機巧族', {
      keywords: ['GUARD'], description: '騎士の誓い。',
    }),
    basic.unit(20, '葦鎧の竜兵', 4, 4, 5, '竜族'),
    basic.spell(21, '火種の杖先', 0, '1体に1ダメージ。', [damage(1)], 'anyCharacter', { classId: 'mage' }),
    basic.spell(22, '水晶の衝波', 2, 'すべての敵ユニットに1ダメージ。',
      [damage(1, 'enemyUnits')], null, { classId: 'mage' }),
    basic.spell(23, '白羽の光線', 1, '1体に2ダメージ。', [damage(2)], 'anyCharacter', { classId: 'priest' }),
    basic.spell(24, '黒鐘の裁き', 5, 'ユニット1体を倒す。', [{ id: 'destroy', to: 'chosen' }],
      'anyUnit', { classId: 'priest', rarity: 'rare' }),
    standard.unit(25, '月瞳の灯蛾', 1, 2, 1, '幻獣族', {
      keywords: ['AIM'], description: '鷹の目。',
    }),
    standard.unit(26, '土鳴りモグラ', 1, 1, 1, '幻獣族', {
      abilities: [ability('TENSION_LINK', buff(1, 0, 'self'))], description: '共鳴で攻撃力+1。',
    }),
    standard.unit(27, '白襟の霧おばけ', 1, 2, 1, '不死族', {
      keywords: ['STEALTH'], description: '影隠れ。',
    }),
    standard.unit(28, '綿雲のこひつじ', 1, 2, 2, '夢幻族'),
    standard.unit(29, '火棘のトカゲ', 1, 1, 2, '竜族', {
      keywords: ['PIERCE'], description: '穿ちの一撃。',
    }),
    standard.unit(30, '泥銀のカワウソ', 2, 2, 3, '水棲族', {
      keywords: ['STEALTH'], description: '影隠れ。',
    }),
    standard.unit(31, '骨鹿の槍騎士', 3, 3, 3, '不死族', {
      keywords: ['PIERCE'], description: '穿ちの一撃。',
    }),
    standard.unit(32, '蝶翅の空竜', 3, 2, 3, '竜族', {
      abilities: [ability('ON_DEATH', tension(1))], description: '退場時に物語の熱量+1。',
    }),
    standard.unit(33, '金袋の招き猫', 3, 3, 1, '幻獣族', {
      abilities: [ability('ON_DEATH', draw(1))], description: '退場時にカードを1枚引く。',
    }),
    standard.unit(34, '口枷の黒鹿', 4, 4, 3, '魔族', {
      target: 'anyUnit', abilities: [ability('ON_SUMMON', status('SILENCE'))],
      description: '登場時にユニット1体の能力を封じる。',
    }),
    standard.unit(35, '夜湖の幽鯨', 6, 5, 7, '不死族', {
      keywords: ['STEALTH'], description: '影隠れ。',
    }),
    standard.unit(36, '入れ替えの風凧', 2, 3, 2, '精霊族', {
      rarity: 'rare', target: 'anyUnit', abilities: [ability('ON_SUMMON', { id: 'swapRank', to: 'chosen' })],
      description: '登場時にユニット1体の前衛と後衛を入れ替える。',
    }),
    second.unit(37, '金糸の歌い手', 5, 5, 5, '幻獣族', {
      rarity: 'legendary', abilities: [ability('SKILL_LINK', damage(3, 'enemyLeader'))],
      description: '物語の共鳴で敵リーダーに3ダメージ。',
    }),
    second.unit(38, '折り扇の穴掘り', 1, 2, 1, '幻獣族', {
      classId: 'fighter', abilities: [ability('ON_DEATH', tension(1))], description: '退場時に物語の熱量+1。',
    }),
    second.unit(39, '編み紐の小人', 1, 1, 1, '付喪族', {
      boost: { attack: 1 }, description: '覚醒で奥義を使った回数だけ攻撃力が上がる。',
    }),
    second.spell(40, '砂時計の二重閃光', 3, '敵ユニット1体に2ダメージ。覚醒で奥義を使った回数だけダメージが増える。',
      [{ ...damage(2), boost: 1 }], 'enemyUnit', { classId: 'mage', rarity: 'rare' }),
    second.unit(41, '双面の銅兎', 3, 3, 2, '機巧族', {
      keywords: ['DOUBLE_ATTACK'], description: '双撃。',
    }),
    second.unit(42, '鎖角の巨甲虫', 12, 8, 8, '幻獣族', {
      rarity: 'superRare', boost: { cost: 2 }, description: '覚醒で奥義を使うたびにコスト-2。',
    }),
    second.unit(43, '風見の石獅子', 4, 4, 3, '機巧族', {
      keywords: ['AIM', 'CHEER'], description: '鷹の目、声援。',
    }),
    second.unit(44, '巻貝の城竜', 6, 4, 6, '竜族', {
      rarity: 'superRare', keywords: ['GUARD', 'CHEER'], description: '騎士の誓い、声援。',
    }),
    second.spell(45, '黒晶の巨腕', 7, 'ユニット1体を+4/+4。覚醒で奥義を使うたびにコスト-1。',
      [buff(4, 4)], 'anyUnit', { classId: 'swordsman', boost: { cost: 1 } }),
    second.spell(46, '芽吹きの戦太鼓', 7, 'すべての味方ユニットの攻撃力+1。覚醒で奥義を使った回数だけ上昇量が増える。',
      [{ ...buff(1, 0, 'allyUnits'), boost: 1 }], null, { classId: 'merchant', rarity: 'superRare' }),
    second.spell(47, '紅手の気合撃ち', 2, '声援。ユニット1体に2ダメージ。',
      [damage(2)], 'anyUnit', { classId: 'fighter', rarity: 'superRare', keywords: ['CHEER'] }),
    second.unit(48, '深海の墨幻', 4, 3, 3, '水棲族', {
      rarity: 'rare', keywords: ['STEALTH'], boost: { attack: 1 }, description: '影隠れ。覚醒で奥義を使った回数だけ攻撃力が上がる。',
    }),
    standard.spell(49, '岩割りの諸刃', 5, 'ユニット1体に7ダメージ。その後、味方リーダーに3ダメージ。',
      [damage(7), damage(3, 'ownLeader')], 'anyUnit', { classId: 'warrior' }),
    standard.spell(50, '雪城を穿つ星', 4, '1体に5ダメージ。',
      [damage(5)], 'anyCharacter', { classId: 'mage', rarity: 'rare' }),
    standard.spell(51, '赤枝の稽古', 1, '味方リーダーの物語の熱量+1。', [tension(1)], null, { classId: 'fighter' }),
    standard.spell(52, '月杯の大祝福', 5, 'HPを7回復し、カードを2枚引く。',
      [heal(7), draw(2)], 'anyCharacter', { classId: 'priest', rarity: 'superRare' }),
    standard.spell(53, '錠結びの杖', 0, 'ユニット1体の能力を封じる。',
      [status('SILENCE')], 'anyUnit', { classId: 'merchant' }),
    standard.unit(54, '星札読みの仔狐', 2, 2, 2, '幻獣族', {
      classId: 'seer', abilities: [ability('TENSION_LINK', { id: 'drawOdd' })],
      description: '共鳴で山札の一番上が奇数コストなら、そのカードを手札に加える。',
    }),
    second.unit(55, '蒼翼のからくり鶏', 3, 2, 4, '機巧族', {
      classId: 'warrior', abilities: [ability('ON_SUMMON', { id: 'leaderArmor', amount: 1, boost: 1 })],
      description: '登場時に次の自分のターン開始まで味方リーダーの被ダメージ-1。覚醒で奥義を使った回数だけ軽減量が増える。',
    }),
    second.spell(56, '鐘楼を巻く緑炎', 12, '1体に8ダメージ。覚醒で奥義を使うたびにコスト-1。',
      [damage(8)], 'anyCharacter', { classId: 'mage', rarity: 'superRare', boost: { cost: 1 } }),
    second.spell(57, '白百合のそよ風', 1, '声援。傷ついたランダムな味方1体のHPを1回復する処理を2回行う。',
      [{ id: 'healWounded', amount: 1 }, { id: 'healWounded', amount: 1 }],
      null, { classId: 'priest', keywords: ['CHEER'] }),
    second.unit(58, '星橋の羽占い師', 2, 3, 3, '幻獣族', {
      classId: 'seer', rarity: 'superRare', keywords: ['CHEER'],
      abilities: [ability('ON_SUMMON', { id: 'randomEffect', options: [{ id: 'enemyDraw', amount: 1 }, { id: 'nothing' }] })],
      description: '声援。登場時に50%の確率で相手がカードを1枚引く。',
    }),
    second.unit(59, '灯の渡し守', 6, 4, 5, '不死族', {
      classId: 'priest', rarity: 'superRare', abilities: [ability('TENSION_LINK', { id: 'recoverFallen' })],
      description: '共鳴で、対戦中に退場した味方ユニットからランダムに1体を手札に加える。',
    }),
    second.spell(60, '森を駆けるつむじ風', 2, 'ランダムな敵に合計3ダメージを振り分ける。覚醒で奥義を使った回数だけダメージが増える。',
      [{ id: 'randomHits', amount: 3, boost: 1 }], null, { classId: 'seer' }),
  ]
}

const ftId = number => 'FT-' + String(number).padStart(4, '0')
