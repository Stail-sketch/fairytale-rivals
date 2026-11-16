import { cards } from '../cards/index.js'
import { dispatch, legalAttack, legalFocus, legalLeaderAttack, legalPlay, legalSkill, leaderTarget, rules, sameTarget } from '../engine/index.js'
import { attackLimit, attackTargets, attackValue, has, hidden, leaderPower, leaderTargets } from '../engine/targeting.js'
import { isOrb, terrainAt } from '../engine/terrain.js'

const profiles = {
  mage: { health: 1, pressure: 1.3, board: 1, ramp: 1, spells: true },
  priest: { health: 1.35, pressure: 1, board: 1.15, ramp: 1 },
  swordsman: { health: 1.05, pressure: 1, board: 1, ramp: 3.2 },
}
const standard = { health: 1.1, pressure: 1.1, board: 1, ramp: 1 }

function mulligan(player) {
  const earlyUnit = player.hand.some(instance => {
    const card = cards[instance.card]
    return card.kind === 'unit' && card.cost <= 2
  })
  const keep = player.hand.filter(instance => {
    const card = cards[instance.card]
    if (card.kind === 'unit') return card.cost <= 2 || (earlyUnit && card.cost === 3)
    if (player.leader === 'swordsman') return earlyUnit && card.effects.some(effect => effect.id === 'ramp')
    if (player.leader === 'mage') return card.cost <= 2 && card.effects.some(effect => effect.id === 'damage')
    return false
  })
  return { type: 'mulligan', replace: player.hand.filter(instance => !keep.includes(instance)).map(instance => instance.id) }
}

// Unknown draws preserve the number of cards left. Negative IDs keep them out of the follow-up search.
function hypotheticalGame(view, seat) {
  let hiddenId = 0
  const unknown = count => Array.from({ length: count }, () => ({ id: --hiddenId, card: 'moon-hare' }))
  const players = view.players.map(({ hand, handCount, deckCount, ...player }, owner) => ({
    ...player, deck: unknown(deckCount), graveyard: [],
    hand: owner === seat ? hand : unknown(handCount),
  }))
  const ids = players.flatMap(player => [...player.hand, ...player.units, ...[player.weapon].filter(Boolean)]
    .map(instance => instance.id))
  return {
    phase: view.phase, active: seat, turn: view.turn, winner: null, rng: 0xfa1721,
    nextId: Math.max(0, ...ids) + 1, players, events: [], history: [], exiled: [],
  }
}

function actionsWith(options, base) {
  if (!options?.enabled) return []
  const choices = options.choices?.map((_, index) => ({ choice: index })) ?? [{}]
  const positions = options.positions?.map(position => ({ position })) ?? [{}]
  const targets = options.targets?.map(target => ({ target })) ?? [{}]
  const columns = options.columns?.map(column => ({ column })) ?? [{}]
  const extraPositions = options.extraPositions?.map(extraPosition => ({ extraPosition })) ?? [{}]
  const hands = options.handChoices?.length ? options.handChoices.map(handChoice => ({ handChoice })) : [{}]
  return choices.flatMap(choice => positions.flatMap(position =>
    extraPositions.filter(({ extraPosition }) => !extraPosition || position.position !== extraPosition).flatMap(extra =>
      targets.flatMap(target => columns.flatMap(column => hands.map(hand =>
        ({ ...base, ...choice, ...position, ...target, ...column, ...extra, ...hand }))))),
  ))
}

function candidateActions(game, seat, legal) {
  const player = game.players[seat]
  return [
    ...player.hand.filter(instance => instance.id > 0).flatMap(instance =>
      actionsWith(legal ? legal.play[instance.id] : legalPlay(game, seat, instance.id), { type: 'play', id: instance.id }),
    ),
    ...player.units.flatMap(unit =>
      actionsWith(legal ? legal.attack[unit.id] : legalAttack(game, seat, unit.id), { type: 'attack', id: unit.id }),
    ),
    ...actionsWith(legal ? legal.leaderAttack : legalLeaderAttack(game, seat), { type: 'leaderAttack' }),
    ...actionsWith(legal ? legal.skill : legalSkill(game, seat), { type: 'skill' }),
    ...actionsWith(legal ? legal.focus : legalFocus(game, seat), { type: 'focus' }),
  ]
}

function boardValue(game, seat, profile) {
  const player = game.players[seat]
  const visible = player.units.filter(unit => !hidden(unit))
  const fronts = new Set(visible.filter(unit => unit.position.row === 'front').map(unit => unit.position.column))
  const wall = new Set(visible.map(unit => unit.position.column)).size === 3 ? 0.8 : 0
  const stages = Object.values(player.terrain ?? {}).reduce((total, stage) =>
    total + (isOrb(stage) ? 2.4 : stage === 'rest' ? -0.22 : stage === 'hazard' ? -0.14 : 0.48), 0)
  return wall + stages + player.units.reduce((value, unit) => {
    const card = cards[unit.card]
    const power = attackValue(game, unit)
    const terrain = terrainAt(game, seat, unit.position)
    let material = 0.8 + (terrain === 'rest' ? 0 : power * 0.69) + unit.hp * 0.55
    if (terrain === 'circle') material += profile?.spells ? 0.9 : 0.35
    if (has(unit, 'AIM') || has(unit, 'PIERCE')) material += 0.55
    if (has(unit, 'DOUBLE_ATTACK')) material += unit.attack * 0.42
    if (has(unit, 'METAL_BODY')) material += 0.6
    if (has(unit, 'GUARD') && unit.position.row === 'front') material += 0.65
    if (hidden(unit)) material += 0.35
    if (unit.position.row === 'back' && fronts.has(unit.position.column)) material += 0.45 + unit.attack * 0.09

    if (unit.statuses.includes('POISON')) material -= unit.hp === 1 ? 1.25 : 0.48
    if (unit.statuses.includes('INVULNERABLE')) material += 0.65
    if (!unit.statuses.includes('SILENCE')) {
      for (const ability of card.abilities) {
        if (ability.trigger === 'ON_DEATH') material += 0.55
        if (['ON_ALLY_SPELL', 'ON_ALLY_HEAL', 'TENSION_LINK', 'SKILL_LINK', 'ON_ATTACK'].includes(ability.trigger)) {
          material += profile?.spells && ability.trigger === 'ON_ALLY_SPELL' ? 1.65 : 0.8
        }
      }
    }
    return value + material
  }, 0)
}

function directThreat(game, seat, readyOnly) {
  const target = leaderTarget(1 - seat)
  const player = game.players[seat]
  const limit = player.weapon && has(player.weapon, 'DOUBLE_ATTACK') ? 2 : 1
  const strikes = limit - (player.leaderStrikes ?? Number(player.leaderAttacked))
  const leaderCanHit = (!readyOnly || strikes > 0) && leaderPower(game, seat) > 0
    && leaderTargets(game, seat).some(candidate => sameTarget(candidate, target))
  return player.units.reduce((total, unit) => {
    if (terrainAt(game, seat, unit.position) === 'rest' || cards[unit.card].cannotAttack) return total
    if (!attackTargets(game, seat, unit).some(candidate => sameTarget(candidate, target))) return total
    const attacks = attackLimit(unit) - (readyOnly ? unit.attacks : 0)
    return total + attackValue(game, unit) * Math.max(0, attacks)
  }, leaderCanHit ? leaderPower(game, seat) * Math.min(player.weapon?.durability ?? 1, readyOnly ? strikes : limit) : 0)
}

const healthValue = hp => Math.min(hp, 9) * 1.65 + Math.max(0, hp - 9) * 0.72

function evaluation(game, seat, profile) {
  if (game.phase === 'finished') return game.winner === seat ? 10000 : game.winner === 'draw' ? 0 : -10000
  const own = game.players[seat]
  const enemy = game.players[1 - seat]
  const enemyThreat = directThreat(game, 1 - seat, false)
  const immediateThreat = directThreat(game, seat, true)
  const resources = own.hand.length * 1.08 + own.tension * 0.56 + own.mp * 0.09
    + own.skillUses * 0.34 + (own.leaderArmor ?? 0) * 0.4
  const ramp = Math.min(own.maxMp, 8) * profile.ramp + own.maxMp * 0.14
  return healthValue(own.hp) * profile.health - healthValue(enemy.hp) * profile.pressure
    + boardValue(game, seat, profile) * profile.board - boardValue(game, 1 - seat) * 1.08
    + resources + ramp - enemyThreat * 0.27
    - (enemyThreat >= own.hp ? 4.2 : 0)
    + (immediateThreat >= enemy.hp ? 2.5 : 0)
}

function predict(game, seat, action, profile) {
  const result = dispatch(game, seat, action)
  if (!result.ok) return null
  const value = evaluation(result.game, seat, profile)
  return { action, game: result.game, value }
}

export function chooseCpuAction(view, seat) {
  if (view.pending) return { type: 'decide', choice: 0 }
  if (view.active !== seat || view.phase === 'finished') return null
  if (view.phase === 'mulligan') return mulligan(view.players[seat])
  if (!view.legal) return null
  const profile = profiles[view.players[seat].leader] ?? standard
  const game = hypotheticalGame(view, seat)
  const initial = evaluation(game, seat, profile)
  const ranked = candidateActions(game, seat, view.legal).map(action => predict(game, seat, action, profile))
    .filter(Boolean).sort((a, b) => b.value - a.value)
  if (ranked[0]?.game.winner === seat) return ranked[0].action

  // Examine a second move for the most promising plays. A pair can be good even if its first step spends a card.
  let best = { action: { type: 'end' }, value: initial + 0.06 }
  for (const candidate of ranked.slice(0, 8)) {
    if (candidate.game.phase === 'finished' && candidate.game.winner !== seat) continue
    let continuation = candidate.value
    for (const action of candidateActions(candidate.game, seat)) {
      const next = predict(candidate.game, seat, action, profile)
      if (next) continuation = Math.max(continuation, next.value)
    }
    const value = candidate.value + (continuation - candidate.value) * 0.76
    if (value > best.value) best = { action: candidate.action, value }
  }
  return best.action
}
