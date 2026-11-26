import { names } from '../../packages/cards/index.js'
import { canUseAbilities, has, hidden } from '../../packages/engine/targeting.js'
import { leaderTarget, sameTarget, unitTarget } from '../../packages/engine/rules.js'
import { escapeText } from './card-terms.js'
import { emblemIds, renderEmblems } from './battle-emblems.js'

const icons = {
  INVULNERABLE: '✧', SPELL_WARD: '◈', RESIST_SPELL: '◈', DARK_CLOAK: '◆',
  GUARD: '⛨', METAL_BODY: '⬢', HARD_METAL_BODY: '⬡', STEALTH: '◐', PIERCE: '➶', SUPER_PIERCE: '↠',
}

function printedKeywords(unit, card) {
  return new Set([...card.keywords, ...(unit.grants ?? []), ...(unit.badgeKeywords ?? [])])
}

function protectionStates(character, turn) {
  const list = []
  if (character.statuses?.includes('INVULNERABLE')) {
    list.push(['INVULNERABLE', true, '持ち主の次のターン開始まで'])
  }
  const remaining = (character.spellGuardThrough ?? -1) - turn
  if (remaining >= 0) {
    const duration = remaining === 0 ? '現在のターン終了まで' :
      remaining === 1 ? '次のターン終了まで' : remaining + 'ターン後の終了まで'
    list.push(['SPELL_WARD', true, duration])
  }
  return list
}

function abilityStates(unit, card, view, detailed = false) {
  const list = protectionStates(unit, view.turn)
  const keywords = printedKeywords(unit, card)
  if (has(unit, 'HARD_METAL_BODY', view)) { keywords.delete('METAL_BODY'); keywords.add('HARD_METAL_BODY') }
  if (detailed && card.healthyAim) keywords.add('AIM')
  for (const id of keywords) {
    if (!(detailed ? emblemIds.has(id) : Object.hasOwn(icons, id)) || list.some(([key])=>key===id)) continue
    const enabled = has(unit, id, view)
    const concealed = id === 'GUARD' && hidden(unit)
    const active = enabled && (id !== 'GUARD' || unit.position.row === 'front' && !concealed) && (id !== 'STEALTH' || !unit.revealed)
    const state = !enabled ? '能力封じ中' : id === 'GUARD' ? (active ? '前衛で有効' : concealed ? '影隠れ中' : '後衛で待機中') :
      id === 'STEALTH' && !active ? '解除済み' : '有効'
    list.push([id, active, state])
  }
  if (detailed) {
    for (const id of ['POISON','SILENCE','VULNERABLE']) if (unit.statuses.includes(id) && !list.some(([key])=>key===id)) list.push([id,true,'有効'])
    const attack = view.players[unit.owner].boardAttack?.[unit.id] ?? unit.attack
    if (attack !== card.attack || unit.maxHp !== card.hp) list.push(['BUFF',true,`攻撃力 ${card.attack} → ${attack} ／ 最大HP ${card.hp} → ${unit.maxHp}`])
  }
  return list
}

function describe([id, , state]) {
  return (id === 'SPELL_WARD' ? names.RESIST_SPELL : id === 'BUFF' ? '能力値の変化' : names[id]) + '（' + state + '）'
}

export function statusDescriptions(character, view, card) {
  return (card ? abilityStates(character, card, view) : protectionStates(character, view.turn)).map(describe)
}

export function statusVisuals(view, previous, seat, unit, card, events, detailed = false) {
  const current = unit ?? view.players[seat]
  const states = unit ? abilityStates(unit, card, view, detailed) : protectionStates(current, view.turn)
  const other = unit && [...new Set([...unit.statuses, ...(canUseAbilities(unit) ? printedKeywords(unit, card) : [])])]
    .filter(id => !(detailed ? emblemIds.has(id) : Object.hasOwn(icons, id))).map(id => names[id]).filter(Boolean).join('・')
  const timed = states.filter(([id]) => id === 'INVULNERABLE' || id === 'SPELL_WARD')
  const priorPlayer = previous?.players[seat]
  const prior = unit ? previous?.players.flatMap(player => player.units).find(value => value.id === unit.id) : priorPlayer
  const oldStates = previous && prior ?
    (unit && prior.card === unit.card ? abilityStates(prior, card, previous, detailed) : protectionStates(prior, previous.turn)) : []
  const target = unit ? unitTarget(unit.id) : leaderTarget(seat)
  const fresh = previous !== view && events.length > 0
  const blocked = fresh ? new Set(events.filter(event => event.protection && sameTarget(event.target, target)).map(event => event.protection)) : new Set()
  if (!states.length && !other && !blocked.size) return { cls: '', markup: '', badgeMarkup: '', fieldMarkup: '', labels: [] }
  const activated = id => fresh && !oldStates.some(([key, active]) => key === id && active)
  const burst = blocked.has('INVULNERABLE') || blocked.has('SPELL_WARD') || blocked.has('RESIST_SPELL') ||
    timed.some(([id]) => activated(id)) ||
    (fresh && (prior?.spellGuardThrough ?? -1) < current.spellGuardThrough)
  const pulseStates = states.map(([id, active, state]) => {
    const released = id === 'STEALTH' && fresh && !active && unit.revealed && oldStates.some(([key, on]) => key === id && on)
    const pulse = (active && activated(id)) || blocked.has(id) || released
    return [id,active,state,pulse]
  })
  const badges = detailed ? renderEmblems(pulseStates,unit) : pulseStates.map(([id,active,state,pulse])=>`<span class="ability-badge${pulse ? ' ability-pulse' : ''}" data-ability="${id}" data-active="${active}"
      title="${escapeText(describe([id, active, state]))}">${icons[id]}</span>`
  ).join('')
  const guard = states.some(([id, active]) => id === 'GUARD' && active)
  const badgeMarkup = `<span class="ability-badges"${detailed ? ' aria-label="効果マーク"' : ' aria-hidden="true"'}>${badges}
      ${other ? `<span class="ability-badge" title="${escapeText(other)}">✦</span>` : ''}</span>`
  const fieldMarkup = timed.length || burst ? `<span class="defense-field${burst ? ' defense-burst' : ''}" aria-hidden="true"></span>` : ''
  return {
    cls: [timed.length && 'protected-now', guard && 'guard-active'].filter(Boolean).join(' '),
    labels: [...states.map(describe), ...(other ? [other] : [])],
    badgeMarkup, fieldMarkup,
    markup: badgeMarkup + fieldMarkup,
  }
}
