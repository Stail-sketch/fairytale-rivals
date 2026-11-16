import { cards, leaders, prototypeDeck } from '../cards/index.js'
import { createInstance, damageValue, displayName, draw, effectAnchor, emit, findUnit, resolution, shuffle } from './effects.js'
import { leaderTarget, other, positions, rules, samePosition, sameTarget, unitTarget } from './rules.js'
import { allUnits, attackLimit, attackOptions, attackValue, at, canUseAbilities, effectTargets, has, leaderPower, openPositions, opposingApathy } from './targeting.js'
import { orbCards, terrainAt, terrainSpaces } from './terrain.js'

export { rules, positions, samePosition, sameTarget, unitTarget, leaderTarget } from './rules.js'
export { attackValue, leaderPower } from './targeting.js'

const awakenedSkill = Object.freeze({
  name: '黒薔薇の焔嵐', description: '指定した前衛か後衛の敵ユニット全員と敵リーダーに5ダメージ。',
  place: { side: 'enemy' }, effects: [{ id: 'damage', amount: 5, to: 'enemyRow' },
    { id: 'damage', amount: 5, to: 'enemyLeader' }],
})
export const playerSkill = player => player.awakenedLeader ? awakenedSkill : leaders[player.leader].skill

const allowed = () => ({ enabled: true })
const denied = reason => ({ enabled: false, reason })

export function deckIssue(deck, leader) {
  if (!Object.hasOwn(leaders, leader)) return '未知のリーダーです'
  if (!Array.isArray(deck) || deck.length !== rules.deckSize) return 'デッキは30枚必要です'
  const amounts = new Map()
  for (const id of deck) {
    if (!Object.hasOwn(cards, id)) return 'デッキに未知のカードがあります'
    const card = cards[id]
    if (card.packId === 'generated') return '生成カードはデッキに入れられません'
    if (card.classId !== 'neutral' && card.classId !== leader) return '職業が一致しません'
    const count = (amounts.get(id) ?? 0) + 1
    if (count > (rules.copyLimit[card.rarity] ?? 2)) return card.name + 'の同名制限を超えています'
    amounts.set(id, count)
  }
  return null
}

export function createGame({ seed, lineups = [{ leader: 'warrior' }, { leader: 'mage' }] }) {
  if (lineups.length !== 2 || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error('対戦には2人のリーダーと32ビットのシードが必要です')
  }
  const game = {
    phase: 'mulligan', active: 0, turn: 0, winner: null, seed, rng: seed,
    nextId: 1, players: [], exiled: [], events: [], history: [],
  }
  for (const [seat, { leader, deck = prototypeDeck }] of lineups.entries()) {
    const issue = deckIssue(deck, leader)
    if (issue) throw new Error(issue)
    const player = {
      leader, hp: rules.leaderHp, mp: 0, maxMp: 0, tension: rules.initialTension[seat],
      leaderAttack: 0, leaderPierce: false, leaderAttacked: false, leaderArmor: 0,
      focused: false, skillUses: 0, deck: deck.map(card => createInstance(game, card)), hand: [], graveyard: [], units: [],
      fallen: [], weapon: null, leaderStrikes: 0, leaderAttackTotal: 0, focusCount: 0,
      spellsUsed: 0, temporaryArmor: 0, terrain: {}, unitsMoved: 0,
    }
    shuffle(game, player.deck)
    game.players.push(player)
    player.hand = player.deck.splice(0, rules.initialHand[seat])
  }
  return game
}

function battleIssue(game, actor) {
  if (game.phase !== 'battle') return '対戦中に行える操作です'
  if (actor !== game.active) return '相手のターンです'
  if (game.pending) return '効果の選択を確定してください'
  return null
}

function legalDefinition(game, seat, definition, unit = false) {
  const positionSeat = definition.place?.side === 'enemy' ? other(seat) : seat
  const summonColumns = unit && definition.useSummonColumn
  const spaces = definition.terrainPlace && !unit ? terrainSpaces(game, seat, definition.terrainPlace)
    : unit || definition.place?.empty ? openPositions(game, positionSeat).filter(position =>
    !unit || position.row !== 'back' || !(game.players[seat].blockBackThrough >= game.turn)) :
    definition.place ? positions : undefined
  if (spaces?.length === 0) return denied('空いているマスがありません')
  const targets = effectTargets(game, seat, definition)
  if (!unit && targets?.length === 0) return denied('選択できる対象がいません')
  const player = game.players[seat]
  const extra = unit && definition.terrainPlace ? terrainSpaces(game, seat, definition.terrainPlace) : []
  const handChoices = definition.handSelection ? player.hand.filter(instance =>
    instance.id !== definition.handInstance && (!definition.handKind || cards[instance.card].kind === definition.handKind))
    .map(instance => instance.id) : undefined
  if (definition.requiresHandSelection && !handChoices?.length) return denied('選べる手札がありません')
  const fortuneChoice = definition.fortune && !player.bothFortunesThisTurn && player.fortune !== 'both' &&
    (player.fortune === 'choose' || player.nextFortune)
  return { enabled: true, positions: spaces, positionSeat, targets: targets?.length ? targets : undefined,
    columns: summonColumns ? [0, 1, 2] : undefined,
    extraPositions: extra.length ? extra : definition.extraPlacement && spaces.length > 1 ? spaces : undefined,
    handChoices,
    choices: (definition.choice ?? (fortuneChoice ? definition.fortune : null))?.map(option => option.label) }
}

export function playCost(game, seat, instance) {
  const player = game.players[seat]
  const card = cards[instance.card]
  const handDiscount = card.handDiscount && player.hand.length > card.handDiscount.threshold ? card.handDiscount.amount : 0
  const spellDiscount = card.kind === 'spell' ? (player.nextSpellDiscount ?? 0) + player.units
    .filter(unit => !unit.statuses.includes('SILENCE')).reduce((sum, unit) => sum + (cards[unit.card].spellDiscount ?? 0), 0) : 0
  const unitDiscount = card.kind === 'unit' ? (player.nextUnitDiscount ?? 0) : 0
  const familyDiscount = card.familyDiscount ? [...player.units, ...player.hand].filter(other =>
    other.id !== instance.id && cards[other.card].family === card.familyDiscount).length : 0
  const taxes = allUnits(game).filter(unit => canUseAbilities(unit) && unit.position.row === 'front' &&
    cards[unit.card].taxKind === card.kind).length
  const spellTax = card.kind === 'spell' && player.spellTaxThrough >= game.turn ? (player.spellTax ?? 0) : 0
  const baseCost = card.cost - (instance.discount ?? 0) - (card.boost?.cost ?? 0) * player.skillUses
  const conditionDiscount = (card.spellCountDiscount ? player.spellsUsed : 0) +
    (card.fallenDiscount ? player.fallen.length : 0) +
    (card.leaderPowerDiscount && leaderPower(game, seat) >= card.leaderPowerDiscount.threshold ? card.leaderPowerDiscount.amount : 0)
  return Math.max(0, baseCost - (player.turnDiscount ?? 0) -
    (card.tensionDiscount ? player.tension : 0) - handDiscount - spellDiscount - unitDiscount - familyDiscount - conditionDiscount + taxes + spellTax)
}

export function legalPlay(game, seat, id) {
  const issue = battleIssue(game, seat)
  if (issue) return denied(issue)
  const player = game.players[seat]
  const instance = player.hand.find(card => card.id === id)
  if (!instance) return denied('手札にあるカードを選んでください')
  const card = cards[instance.card]
  const cost = playCost(game, seat, instance)
  if (card.needsFallen && !player.fallen.length) return denied('復活できる味方がいません')
  if (player.mp < cost) return { ...denied('MPが足りません'), cost }
  if (card.keywords.includes('FINISHER') && player.tension < rules.maxTension) {
    return { ...denied('終幕の一撃には熱量が3必要です'), cost }
  }
  return { ...legalDefinition(game, seat, { ...card, handInstance: instance.id }, card.kind === 'unit'), cost }
}

export function legalAttack(game, seat, id, preview = false) {
  const issue = battleIssue(game, seat)
  if (issue) return denied(issue)
  const unit = game.players[seat].units.find(candidate => candidate.id === id)
  if (!unit) return denied('味方ユニットを選んでください')
  const card = cards[unit.card]
  const blockedByAbility = canUseAbilities(unit) && (card.cannotAttack || card.requiresWound && unit.hp >= unit.maxHp)
  const attackTrigger = canUseAbilities(unit) &&
    [...card.abilities, ...unit.extraAbilities ?? []].some(ability => ability.trigger === 'ON_ATTACK')
  if (unit.attacks >= attackLimit(unit) || attackValue(game, unit) <= 0 && !attackTrigger || unit.blockAttackThrough >= game.turn ||
      blockedByAbility || terrainAt(game, seat, unit.position) === 'rest') return denied('このユニットは今ターン攻撃できません')
  return describeAttack(game, seat, unit, preview)
}

export function legalLeaderAttack(game, seat, preview = false) {
  const issue = battleIssue(game, seat)
  if (issue) return denied(issue)
  const player = game.players[seat]
  const limit = player.weapon && has(player.weapon, 'DOUBLE_ATTACK') ? 2 : 1
  if (leaderPower(game, seat) <= 0 || (player.leaderStrikes ?? Number(player.leaderAttacked)) >= limit ||
      player.blockAttackThrough >= game.turn || opposingApathy(game, seat)) return denied('今ターンはリーダーで攻撃できません')
  return describeAttack(game, seat, undefined, preview)
}

function combatStats(game, attacker, target) {
  const card = cards[attacker.card]
  const active = canUseAbilities(attacker)
  const multiplier = active && card.doubleAgainstLeader && target.kind === 'leader' ? 2 : 1
  return {
    power: attackValue(game, attacker) * multiplier,
    noRetaliation: active && (attacker.noRetaliationTurn === game.turn ||
      card.backNoRetaliation && attacker.position.row === 'back'),
  }
}

function hasTrigger(source, trigger) {
  return source && canUseAbilities(source) &&
    [...cards[source.card].abilities, ...source.extraAbilities ?? []].some(ability => ability.trigger === trigger)
}

function describeAttack(game, seat, attacker, preview) {
  const player = game.players[seat]
  const { targets, guards, covered, wall } = attackOptions(game, seat, attacker ?? player.weapon)
  if (!targets.length) return denied('攻撃可能な対象がいません')
  if (!preview) return { enabled: true, targets }
  const forecasts = targets.map(target => {
    const defender = target.kind === 'unit' ? findUnit(game, target.id) : game.players[target.seat]
    if (defender.decoyId) return { target, note: '分身により攻撃先が変わることがあります' }
    if (attacker && (hasTrigger(attacker, 'ON_ATTACK') || hasTrigger(player.weapon, 'ON_ALLY_UNIT_ATTACK') ||
        (target.kind === 'unit' && (hasTrigger(attacker, 'ON_COMBAT') || hasTrigger(defender, 'ON_COMBAT'))))) {
      return { target, note: '攻撃前にカードの効果を解決します' }
    }
    const { power, noRetaliation } = attacker ? combatStats(game, attacker, target) :
      { power: leaderPower(game, seat), noRetaliation: cards[player.weapon?.card]?.noRetaliation }
    const damage = damageValue(game, defender, power)
    const source = attacker ?? player
    const hp = defender.hp - damage
    const retaliation = target.kind === 'unit' && !noRetaliation ?
      damageValue(game, source, attackValue(game, { ...defender, hp })) : 0
    return { target, damage, retaliation, hp: Math.max(0, hp),
      attackerHp: Math.max(0, source.hp - retaliation) }
  })
  return { enabled: true, targets, forecasts, protection: { guards, covered, wall } }
}

export function legalFocus(game, seat) {
  const issue = battleIssue(game, seat)
  if (issue) return denied(issue)
  const player = game.players[seat]
  const limit = player.units.some(unit => !unit.statuses.includes('SILENCE') && cards[unit.card].extraFocus) ? 2 : 1
  if ((player.focusCount ?? Number(player.focused)) >= limit) return denied('このターンの熱量をためる回数を使い切りました')
  if (player.tension >= rules.maxTension) return denied('熱量が最大です')
  if (opposingApathy(game, seat)) return denied('熱量をためられません')
  const cost = player.units.some(unit => canUseAbilities(unit) && cards[unit.card].freeFocus) ? 0 : rules.focusCost
  return player.mp >= cost ? { enabled: true, cost } : { ...denied('MPが足りません'), cost }
}

export function legalSkill(game, seat) {
  const issue = battleIssue(game, seat)
  if (issue) return denied(issue)
  const player = game.players[seat]
  if (opposingApathy(game, seat)) return denied('このターンは奥義を使えません')
  if (player.blockSkillThrough >= game.turn) return denied('このターンは奥義を使えません')
  if (player.tension < rules.maxTension) return denied('熱量が3必要です')
  const skill = playerSkill(player)
  if (skill.effects.some(effect => effect.id === 'summon') && !openPositions(game, seat).length) {
    return denied('空いているマスがありません')
  }
  return legalDefinition(game, seat, skill)
}

const matchesSpace = (space, chosen) => Boolean(space && chosen && samePosition(space, chosen) && space.seat === chosen.seat)

function definitionIssue(check, action) {
  if (!check.enabled) return check.reason
  if (check.positions ? !check.positions.some(position => matchesSpace(position, action.position)) : action.position !== undefined) {
    return '合法な召喚先を選んでください'
  }
  if (check.targets ? !check.targets.some(target => sameTarget(target, action.target)) : action.target !== undefined) {
    return '合法な対象を選んでください'
  }
  if (check.choices ? !Number.isInteger(action.choice) || action.choice < 0 || action.choice >= check.choices.length : action.choice !== undefined) {
    return '効果を選んでください'
  }
  if (check.columns ? !check.columns.includes(action.column) : action.column !== undefined) return '合法な列を指定してください'
  if (check.extraPositions ? !check.extraPositions.some(position => matchesSpace(position, action.extraPosition)) ||
      matchesSpace(action.position, action.extraPosition) : action.extraPosition !== undefined) return '追加のマスを選んでください'
  if (check.handChoices?.length ? !check.handChoices.includes(action.handChoice) : action.handChoice !== undefined) {
    return '効果を使う手札を選んでください'
  }
  return null
}

function actionIssue(game, seat, action) {
  if ((seat !== 0 && seat !== 1) || !action || typeof action !== 'object') return '不明な操作です'
  if (game.phase === 'finished') return '対戦は終了しました'
  if (action.type === 'decide') {
    const pending = game.pending
    return pending?.seat === seat && Number.isInteger(action.choice) &&
      action.choice >= 0 && action.choice < pending.labels.length ? null : '合法な選択肢を選んでください'
  }
  if (action.type === 'mulligan') {
    if (game.phase !== 'mulligan' || game.active !== seat) return '手札交換を行えません'
    const hand = game.players[seat].hand
    const { replace } = action
    return Array.isArray(replace) && new Set(replace).size === replace.length
      && replace.every(id => hand.some(instance => instance.id === id)) ? null : '交換する手札が不正です'
  }
  const issue = battleIssue(game, seat)
  if (issue) return issue
  switch (action.type) {
    case 'play': return definitionIssue(legalPlay(game, seat, action.id), action)
    case 'attack': return definitionIssue(legalAttack(game, seat, action.id), action)
    case 'leaderAttack': return definitionIssue(legalLeaderAttack(game, seat), action)
    case 'focus': return legalFocus(game, seat).reason ?? null
    case 'skill': return definitionIssue(legalSkill(game, seat), action)
    case 'end': return null
    default: return '不明な操作です'
  }
}

function canonical(action) {
  const { type, id, position, target, choice } = action
  if (type === 'mulligan') return { type, replace: [...action.replace] }
  const clean = { type }
  if (type === 'play' || type === 'attack') clean.id = id
  const copyPosition = ({ row, column, seat }) => seat === undefined ? { row, column } : { row, column, seat }
  if (['play', 'skill'].includes(type) && position) clean.position = copyPosition(position)
  if (type === 'play' && action.extraPosition) clean.extraPosition = copyPosition(action.extraPosition)
  if (type === 'play' && action.handChoice !== undefined) clean.handChoice = action.handChoice
  if (type === 'play' && action.column !== undefined) clean.column = action.column
  if (['play', 'attack', 'leaderAttack', 'skill'].includes(type) && target) {
    clean.target = target.kind === 'unit' ? unitTarget(target.id) : leaderTarget(target.seat)
  }
  if (['play', 'skill', 'decide'].includes(type) && choice !== undefined) clean.choice = choice
  return clean
}

function beginTurn(game, seat, resolver) {
  game.active = seat
  game.turn++
  const player = game.players[seat]
  player.maxMp = Math.min(player.maxMp + 1, rules.maxMp)
  player.mp = Math.max(0, player.maxMp - (player.nextMpLoss ?? 0))
  player.nextMpLoss = 0
  player.focused = false
  player.focusCount = 0
  player.leaderAttacked = false
  player.leaderStrikes = 0
  player.leaderArmor = 0
  for (const unit of player.units) {
    unit.attacks = 0
    unit.statuses = unit.statuses.filter(status => status !== 'INVULNERABLE')
  }
  emit(game, 'turn', (seat === 0 ? '先攻' : '後攻') + 'のターン', { seat })
  resolver.recoverScheduled(seat)
  if (rules.firstTurnDraw || game.turn > 1) draw(game, seat, 1)
  for (const unit of player.units) resolver.trigger(unit, 'ON_TURN_START')
}

function checkWinner(game) {
  const lost = game.players.map(player => player.hp <= 0)
  if (!lost.some(Boolean) && game.specialVictory === undefined) return false
  game.phase = 'finished'
  game.winner = game.specialVictory ?? (lost.every(Boolean) ? 'draw' : lost[0] ? 1 : 0)
  emit(game, 'finish', game.winner === 'draw' ? '引き分け' : (game.winner === 0 ? '先攻' : '後攻') + 'の勝利')
  return true
}

function mulligan(game, seat, replace, resolver) {
  const player = game.players[seat]
  const returned = []
  player.hand = player.hand.map(instance => {
    if (!replace.includes(instance.id)) return instance
    returned.push(instance)
    return player.deck.shift()
  })
  player.deck.push(...returned)
  shuffle(game, player.deck)
  emit(game, 'mulligan', (seat === 0 ? '先攻' : '後攻') + 'が手札を確定', { seat })
  if (seat === 0) game.active = 1
  else {
    game.phase = 'battle'
    beginTurn(game, 0, resolver)
  }
}

function play(game, seat, action, resolver) {
  action = { ...action, target: resolver.redirectTarget(action.target, seat) }
  const player = game.players[seat]
  const cost = playCost(game, seat, player.hand.find(instance => instance.id === action.id))
  const index = player.hand.findIndex(instance => instance.id === action.id)
  const [instance] = player.hand.splice(index, 1)
  const card = cards[instance.card]
  const copied = card.kind === 'spell' && player.copyNextSpell
  if (copied) player.copyNextSpell = false
  player.mp -= cost
  const selectedUnit = findUnit(game, action.target?.id)
  const context = { seat, chosen: action.target, position: action.position, cost, choice: action.choice, handChoice: action.handChoice, actionId: instance.id,
    targetArea: selectedUnit && { owner: selectedUnit.owner, position: selectedUnit.position },
    effectSource: { kind: 'card', seat, card: card.id }, played: true }
  if (card.keywords.includes('FINISHER')) player.tension = 0
  if (card.cheerFirst) {
    resolver.gainTension(seat, 1)
    resolver.settle()
  }
  if (card.kind === 'unit') {
    player.nextUnitDiscount = 0
    resolver.summon(seat, instance, action.position, action.target, action.choice, true,
      action.column === undefined ? action.extraPosition : { column: action.column }, cost)
  } else if (card.kind === 'weapon') {
    resolver.equip(seat, instance, context)
  } else {
    player.nextSpellDiscount = 0
    player.spellsUsed++
    player.turnSpells = (player.turnSpells ?? 0) + 1
    const spellLog = player.spellLog ??= []
    spellLog.push(card.id)
    if (selectedUnit?.owner === seat && cards[selectedUnit.card].recoverOwnSpells) (selectedUnit.usedOn ??= []).push(card.id)
    player.graveyard.push(instance)
    emit(game, 'spell', card.name + 'を使用', { seat, id: instance.id, card: card.id, target: action.target,
      played: true, cost,
    })
    for (const enemy of game.players[other(seat)].units) resolver.trigger(enemy, 'ON_ENEMY_SPELL_BEFORE', action.target)
    resolver.enqueue(card.choice ? card.choice[action.choice].effects : card.effects, { ...context, spell: card.id })
  }
  if (card.fortune && card.kind !== 'unit') resolver.fortune(card.fortune, { ...context, spell: card.id })
  resolver.settle()
  if (game.pending) {
    game.afterChoice = { type: 'play', seat, action, cardId: card.id, cost, copied }
    return
  }
  finishPlay(game, seat, action, card.id, cost, copied, resolver)
}

function finishPlay(game, seat, action, cardId, cost, copied, resolver) {
  const player = game.players[seat]
  const card = cards[cardId]
  if (card.keywords.includes('CHEER') && !card.cheerFirst) resolver.gainTension(seat, 1)
  if (card.kind === 'spell') {
    for (const unit of player.units) {
      resolver.trigger(unit, 'ON_ALLY_SPELL')
      if (unit.id === action.target?.id) resolver.trigger(unit, 'ON_SELF_SPELL', action.target, { spellCard: card.id })
      else if (player.units.some(ally => ally.id === action.target?.id)) {
        resolver.trigger(unit, 'ON_OTHER_SPELL', action.target, { spellCard: card.id })
      }
    }
    if (copied && !orbCards.includes(cardId)) {
      resolver.addCard(seat, card.id)
    }
  }
  for (const unit of player.units) resolver.trigger(unit, 'ON_ALLY_PLAY', undefined, { cost, played: card.id, actionId: action.id })
}

function combat(game, resolver, from, target, power, pierce, noRetaliation = false, superPierce = false, neighbors = false) {
  const defender = target.kind === 'unit' ? findUnit(game, target.id) : null
  if (target.kind === 'unit' && !defender) return
  const behind = defender?.position.row === 'front' && pierce
    ? at(game, defender.owner, { row: 'back', column: defender.position.column }) : null
  const overflow = defender ? Math.max(0, power - defender.hp) : 0
  const source = effectAnchor(game, from)
  const dealt = resolver.damage(target, power, source)
  if (defender && !noRetaliation) resolver.damage(from, attackValue(game, defender), effectAnchor(game, target))
  if (behind) resolver.damage(unitTarget(behind.id), power, source)
  if (neighbors && defender) for (const victim of game.players[defender.owner].units) {
    if (victim.position.row === defender.position.row && Math.abs(victim.position.column - defender.position.column) === 1) {
      resolver.damage(unitTarget(victim.id), power, source)
    }
  }
  if (superPierce && defender) {
    for (const victim of game.players[defender.owner].units) {
      if (victim !== defender && victim.position.column === defender.position.column) resolver.damage(unitTarget(victim.id), power, source)
    }
    resolver.damage(leaderTarget(defender.owner), power, source)
  }
  return { dealt, overflow, killed: defender?.hp <= 0 }
}

function attack(game, seat, action, resolver) {
  action = { ...action, target: resolver.redirectTarget(action.target, seat) }
  const attacker = findUnit(game, action.id)
  attacker.attacks++
  attacker.revealed = true
  if (action.target.kind === 'leader') attacker.lastLeaderAttackTurn = game.turn
  emit(game, 'attack', displayName(attacker) + 'が攻撃', { seat, id: attacker.id, target: action.target })
  const weapon = game.players[seat].weapon
  if (weapon) resolver.trigger(weapon, 'ON_ALLY_UNIT_ATTACK', action.target)
  resolver.trigger(attacker, 'ON_ATTACK', action.target)
  const defender = action.target.kind === 'unit' && findUnit(game, action.target.id)
  if (defender) {
    resolver.trigger(attacker, 'ON_COMBAT', action.target)
    resolver.trigger(defender, 'ON_COMBAT', unitTarget(attacker.id))
  }
  resolver.settle()
  if (game.pending) {
    game.afterChoice = { type: 'attack', seat, action }
    return
  }
  finishAttack(game, action, resolver)
}

function finishAttack(game, action, resolver) {
  const attacker = findUnit(game, action.id)
  if (!attacker || game.players.some(player => player.hp <= 0)) return
  const { power, noRetaliation } = combatStats(game, attacker, action.target)
  const result = combat(game, resolver, unitTarget(attacker.id), action.target, power,
    has(attacker, 'PIERCE'), noRetaliation,
    has(attacker, 'SUPER_PIERCE'))
  if (result?.dealt > 0) resolver.trigger(attacker, 'ON_DEAL_DAMAGE', action.target, result)
  if (result?.killed) resolver.trigger(attacker, 'ON_KILL', action.target, result)
  const weapon = game.players[attacker.owner].weapon
  if (weapon && action.target.kind === 'leader') resolver.trigger(weapon, 'ON_ALLY_LEADER_HIT', unitTarget(attacker.id))
}

export function dispatch(game, actor, rawAction) {
  const issue = actionIssue(game, actor, rawAction)
  if (issue) return { ok: false, issue, game }
  const action = canonical(rawAction)
  const next = structuredClone(game)
  const player = next.players[actor]
  const resolver = resolution(next)
  try {
    switch (action.type) {
      case 'decide': {
        resolver.decide(action.choice)
        resolver.settle()
        if (!next.pending && next.afterChoice) {
          const continuation = next.afterChoice
          delete next.afterChoice
          if (continuation.type === 'attack') finishAttack(next, continuation.action, resolver)
          if (continuation.type === 'play') finishPlay(next, continuation.seat, continuation.action,
            continuation.cardId, continuation.cost, continuation.copied, resolver)
        }
        break
      }
      case 'mulligan': mulligan(next, actor, action.replace, resolver); break
      case 'play': play(next, actor, action, resolver); break
      case 'attack': attack(next, actor, action, resolver); break
      case 'leaderAttack': {
        const weapon = player.weapon
        player.leaderAttacked = true
        player.leaderStrikes = (player.leaderStrikes ?? 0) + 1
        player.leaderAttackTotal = (player.leaderAttackTotal ?? 0) + 1
        emit(next, 'leaderAttack', leaders[player.leader].name + 'が攻撃', { seat: actor, target: action.target })
        const target = resolver.redirectTarget(action.target, actor)
        const result = combat(next, resolver, leaderTarget(actor), target, leaderPower(next, actor),
          player.leaderPierce || Boolean(weapon && has(weapon, 'PIERCE')), cards[weapon?.card]?.noRetaliation, false, player.leaderNeighbors)
        if (weapon) {
          if (result?.dealt > 0) resolver.trigger(weapon, 'ON_DEAL_DAMAGE', target, result)
          resolver.trigger(weapon, 'ON_LEADER_ATTACK', target, result)
          if (result?.killed) resolver.trigger(weapon, 'ON_LEADER_KILL', target, result)
        }
        for (const unit of player.units) {
          resolver.trigger(unit, 'ON_LEADER_ATTACK', target, result)
          if (result?.killed) resolver.trigger(unit, 'ON_LEADER_KILL', target, result)
        }
        resolver.wearWeapon(actor, 1)
        break
      }
      case 'focus':
        player.mp -= legalFocus(next, actor).cost
        player.focused = true
        player.focusCount = (player.focusCount ?? 0) + 1
        resolver.gainTension(actor, 1)
        break
      case 'skill': {
        const skill = playerSkill(player)
        player.tension = 0
        player.skillUses = (player.skillUses ?? 0) + 1
        emit(next, 'skill', '語り手の奥義「' + skill.name + '」', { seat: actor, target: action.target, name: skill.name })
        resolver.enqueue(skill.effects, { seat: actor, chosen: action.target, position: action.position,
          effectSource: { kind: 'leader', seat: actor },
        })
        resolver.settle()
        for (const unit of player.units) resolver.trigger(unit, 'SKILL_LINK')
        break
      }
      case 'end':
        for (const unit of player.units) resolver.trigger(unit, 'ON_TURN_END')
        for (const side of next.players) for (const unit of side.units) resolver.trigger(unit, 'ON_ANY_TURN_END')
        resolver.settle()
        player.leaderAttack = 0
        player.leaderPierce = false
        player.leaderNeighbors = false
        player.temporaryArmor = 0
        player.turnDiscount = 0
        player.nextSpellDiscount = 0
        player.copyNextSpell = false
        player.spellBonus = 0
        if (player.weapon?.temporaryAttack) {
          player.weapon.attack -= player.weapon.temporaryAttack
          player.weapon.temporaryAttack = 0
        }
        player.bothFortunesThisTurn = false
        player.turnSpells = 0
        for (const side of next.players) for (const unit of side.units) {
          unit.attack -= unit.temporaryAttack ?? 0
          unit.temporaryAttack = 0
        }
        resolver.returnBorrowed(actor)
        for (const unit of player.units) {
          if (unit.statuses.includes('POISON')) resolver.damage(unitTarget(unit.id), 1)
        }
        resolver.settle()
        if (!checkWinner(next)) beginTurn(next, other(actor), resolver)
        break
    }
    resolver.settle()
    if (next.phase === 'battle' && !next.pending) checkWinner(next)
    next.history.push({ actor, action })
    return { ok: true, game: next }
  } catch (error) {
    return { ok: false, issue: error instanceof Error ? error.message : '効果の処理に失敗しました', game }
  }
}

export function replay(config, history) {
  let game = createGame(config)
  for (const { actor, action } of history) {
    const result = dispatch(game, actor, action)
    if (!result.ok) throw new Error('再生不能: ' + result.issue)
    game = result.game
  }
  return game
}

