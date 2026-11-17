import { cards, names } from '../cards/index.js'
import { amountFrom, damageAllowed, damagePower, damageValue, effectCondition, findUnit } from './effects.js'
import { addModifier, awakeningBonus, breakdown, entryPower, powerChanges } from './power.js'
import { attackBreakdown, attackValue, aurasFor } from './targeting.js'

const scaleLabels = {
  tension: '物語の熱量', enemyUnits: '敵ユニット数', otherAllies: '他の味方ユニット数',
  sourceAttack: '自身の攻撃力', damageDealt: '実際に与えたダメージ', leaderAttack: '味方リーダーの攻撃力',
  leaderAttackTotal: 'リーダーの攻撃回数', dragons: '他の竜族の数', overflow: '超過ダメージ',
  summonedCost: '対象のコスト', spellsUsed: '特技を使った回数', priorSpellsThisTurn: 'このターン使った特技の数',
  terrainCount: '味方の舞台の数', allyUnits: '味方ユニット数', unitsMoved: '転位した回数',
}
const needsResult = new Set(['damageDealt', 'overflow'])
const needsSource = new Set(['sourceAttack'])
const publicConditions = new Set([
  'ownHpAtLeast', 'ownHpAtMost', 'enemyUnitsAtLeast', 'leaderPowerAtLeast', 'enemyIce',
  'leaderTarget', 'unitTarget', 'chosenWounded',
])
const targetConditions = new Set(['leaderTarget', 'unitTarget', 'chosenWounded'])

const row = (label, power, group = '', suffix = '') => ({ label, group, suffix, ...power })

function scaled(game, effect, context) {
  if (!effect.from || needsResult.has(effect.from) || needsSource.has(effect.from) && !context.source ||
      effect.from === 'summonedCost' && !context.chosen) return undefined
  const player = game.players[context.seat]
  if (effect.from === 'dragons' && player.handCount > player.hand.length) return undefined
  return { label: scaleLabels[effect.from], amount: amountFrom(game, effect.from, context) * (effect.multiplier ?? 1) }
}

function measure(base, boost, scaling) {
  const bonuses = {}
  addModifier(bonuses, names.SKILL_BOOST, boost)
  if (scaling) addModifier(bonuses, scaling.label, scaling.amount)
  return breakdown(base, base + boost + (scaling?.amount ?? 0), bonuses)
}

function effectRows(game, effect, context, group) {
  if (effect.when) {
    const [kind, value] = effect.when
    if (publicConditions.has(kind) && (!targetConditions.has(kind) || context.chosen)) {
      if (!effectCondition(game, kind, value, context)) {
        return (effect.otherwise ?? []).flatMap(alternate => effectRows(game, alternate, context, group))
      }
    } else {
      const condition = group ? group + ' · ' : ''
      return [...effectRows(game, { ...effect, when: undefined }, context, condition + '条件成立時'),
        ...(effect.otherwise ?? []).flatMap(alternate => effectRows(game, alternate, context, condition + '条件外'))]
    }
  }

  const skillUses = context.skillUses
  const boost = awakeningBonus(effect.boost, skillUses)
  const scaling = scaled(game, effect, context)
  const amount = effect.amount ?? 0
  const damage = (base, label, suffix = '') =>
    row(label, damagePower(game, { amount: base, boost: effect.id === 'damage' ? effect.boost : undefined },
      skillUses, { ...context, scaling }), group, suffix)
  switch (effect.id) {
    case 'damage':
    case 'hitAndSummon':
    case 'hitSpawn':
    case 'stageDamage':
    case 'randomLaneDamage':
      return effect.from && !scaling ? [] : [damage(amount, 'ダメージ')]
    case 'randomHits':
      return [row('連撃の回数', measure(amount, boost, scaling), group, '回'),
        row('1回のダメージ', damagePower(game, { amount: 1 }, skillUses, context), group)]
    case 'repeatDamage':
      return [row('最大連撃回数', measure(effect.times, 0), group, '回'), damage(amount, '1回のダメージ')]
    case 'spendMpDamage':
      return [row('ダメージ', damagePower(game, { amount: 0 }, skillUses, {
        ...context, scaling: { label: '使用後の残りMP', amount: Math.max(0, game.players[context.seat].mp - (context.cost ?? 0)) },
      }), group)]
    case 'heal':
    case 'healWounded':
      return effect.from && !scaling ? [] : [row('回復量', measure(amount, 0, scaling), group)]
    case 'healByKills':
      return [row('ダメージ', measure(amount, 0), group), row('倒したユニット1体あたりの回復', measure(effect.multiplier, 0), group)]
    case 'sacrifice': {
      const unit = findUnit(game, context.chosen?.id)
      return unit ? [row('回復量', measure(0, 0, {
        label: '対象の攻撃力 ×' + effect.multiplier, amount: attackBreakdown(game, unit).value * effect.multiplier,
      }), group)] : []
    }
    case 'multiplyAttack': {
      if (!context.source) return []
      const base = attackValue(game, context.source)
      const result = attackValue(game, { ...context.source, attack: context.source.attack * amount })
      return [row('発動後の攻撃力', measure(base, 0, { label: '攻撃力 ×' + amount, amount: result - base }), group)]
    }
    case 'buff':
    case 'buffWeapon': {
      if (effect.from && !scaling) return []
      const attack = measure(effect.attack, effect.id === 'buff' ? boost : 0, effect.scaleHpOnly ? undefined : scaling)
      const hp = measure(effect.hp, 0, effect.scaleHp || effect.scaleHpOnly ? scaling : undefined)
      return [
        ...(attack.value || attack.modifiers.length ? [row('攻撃力の変化', attack, group)] : []),
        ...(hp.value || hp.modifiers.length ? [row(effect.id === 'buffWeapon' ? '耐久の変化' : 'HPの変化', hp, group)] : []),
      ]
    }
    case 'leaderPower': return [row('リーダー攻撃力の上昇', measure(amount, 0), group)]
    case 'leaderArmor': return [row('被ダメージの軽減量', measure(amount, boost), group)]
    case 'spellBonus': return [row('特技ダメージの上昇', measure(amount, 0), group)]
    case 'duelTop': return [row('勝負時のダメージ', measure(amount, boost), group)]
    case 'summonPool':
      return effect.boost ? [row('召喚するユニットのMP', measure(effect.filter.cost, boost), group)] : []
    case 'summon': {
      const card = cards[effect.card]
      const count = effect.boost ? [row('最大召喚数', measure(effect.amount ?? 1, boost), group, '体')] : []
      if (!card || effect.stats) return count
      const stats = entryRows(card, game.players[context.seat])
      return [...count, ...stats.map(stat => ({ ...stat, group: [group, card.name].filter(Boolean).join(' · ') }))]
    }
    case 'resurrect': return effect.boost ? [row('最大復活数', measure(effect.amount ?? 1, boost), group, '体')] : []
    case 'generateMatching':
    case 'generateRandom':
    case 'draw':
      return boost || scaling ? [row(effect.id === 'draw' ? 'ドロー枚数' : '手札に加える枚数', measure(amount, boost, scaling), group, '枚')] : []
    case 'spendHeat':
      return game.players[context.seat].tension > 0 ? effectRows(game, effect.effect, context, group) : []
    default: return []
  }
}

function entryRows(card, player) {
  if (!['unit', 'weapon'].includes(card.kind)) return []
  return [row('攻撃力', entryPower(card, player, 'attack')),
    ...(card.kind === 'unit' ? [row('最大HP', entryPower(card, player, 'hp'))] : [])]
    .filter(stat => stat.modifiers.length)
}

export function boardPowerRows(game, unit) {
  const attack = row('攻撃力', attackBreakdown(game, unit))
  const hpBonuses = powerChanges(unit, 'maxHp')
  for (const { aura, provider } of aurasFor(game, unit, 'hpAura')) {
    addModifier(hpBonuses, cards[provider.card].name, aura.amount + awakeningBonus(aura.boost, game.players[provider.owner].skillUses))
  }
  const hp = row('最大HP', breakdown(cards[unit.card].hp, unit.maxHp, hpBonuses))
  return [attack, hp].filter(stat => stat.modifiers.length)
}

function optionsRows(game, options, context, label) {
  return options.flatMap((option, index) => context.choice === undefined || context.choice === index
    ? option.effects.flatMap(effect => effectRows(game, effect, context, option.label ?? label + ' ' + (index + 1))) : [])
}

export function definitionPowerRows(game, seat, definition, options = {}) {
  const player = game.players[seat]
  const { source, chosen, choice, cost, handInstance, skill = false } = options
  const spell = definition.kind === 'spell'
  const context = { seat, source, chosen, choice, cost, handInstance, spell, beforePlay: !source, skillUses: player.skillUses + Number(skill) }
  const numbers = !source ? entryRows(definition, player) : definition.kind === 'weapon' ?
    [row('武器の攻撃力', breakdown(definition.attack, source.attack, powerChanges(source, 'attack')))]
      .filter(stat => stat.modifiers.length) : boardPowerRows(game, source)
  const effects = source ? [] : definition.effects
  const direct = definition.choice ? optionsRows(game, definition.choice, context, names.CHOICE) :
    effects.flatMap(effect => effectRows(game, effect, context, ''))
  const fortuneContext = { ...context, choice: player.fortune === 'both' || player.bothFortunesThisTurn ? undefined : choice }
  const fortune = !source && definition.fortune ? optionsRows(game, definition.fortune, fortuneContext, names.FORTUNE) : []
  const active = !source?.statuses?.includes('SILENCE')
  const abilities = active ? [...(definition.abilities ?? []), ...(source?.extraAbilities ?? [])]
    .flatMap(ability => ability.effects.flatMap(effect => effectRows(game, effect, { ...context, spell: false },
      names[ability.trigger] ?? '能力の発動時'))) : []
  return [...new Map([...numbers, ...direct, ...fortune, ...abilities].map(stat => [JSON.stringify(stat), stat])).values()]
}

export function targetDamagePreview(game, seat, definition, target, { choice, cost, skill = false } = {}) {
  if (!definition || definition.fortune) return undefined
  const effects = definition.choice ? definition.choice[choice]?.effects : definition.kind === 'unit' ?
    definition.abilities.filter(ability => ability.trigger === 'ON_SUMMON').flatMap(ability => ability.effects) : definition.effects
  const spell = definition.kind === 'spell'
  const context = { seat, chosen: target, cost, spell, beforePlay: true, skillUses: game.players[seat].skillUses + Number(skill) }
  let first = effects?.[0]
  while (first?.when) {
    if (!publicConditions.has(first.when[0])) return undefined
    if (effectCondition(game, ...first.when, context)) break
    first = first.otherwise?.[0]
  }
  if (!first || first.to !== 'chosen' && !['hitSpawn', 'hitAndSummon'].includes(first.id) ||
      !['damage', 'hitSpawn', 'hitAndSummon'].includes(first.id) || first.randomTargets || first.filter) return undefined
  const victim = target.kind === 'unit' ? findUnit(game, target.id) : game.players[target.seat]
  if (!victim || victim.decoyId) return undefined
  const [power] = effectRows(game, first, context, '')
  if (!power || power.label !== 'ダメージ') return undefined
  const value = damageAllowed(game, victim, spell) ? damageValue(game, victim, power.value) : 0
  return { value, hp: Math.max(0, victim.hp - value) }
}
