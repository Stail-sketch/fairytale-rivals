import { names } from '../../packages/cards/index.js'
import { canUseAbilities, has, hidden } from '../../packages/engine/targeting.js'
import { leaderTarget, sameTarget, unitTarget } from '../../packages/engine/rules.js'
import { escapeText } from './card-terms.js'

const icons = {
  INVULNERABLE: '✧', SPELL_WARD: '◈', RESIST_SPELL: '◈', DARK_CLOAK: '◆',
  GUARD: '⛨', METAL_BODY: '⬢', STEALTH: '◐', PIERCE: '➶', SUPER_PIERCE: '↠',
}

function printedKeywords(unit, card) {
  return new Set([...card.keywords, ...(unit.grants ?? [])])
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

function abilityStates(unit, card, view) {
  const list = protectionStates(unit, view.turn)
  for (const id of printedKeywords(unit, card)) {
    if (!Object.hasOwn(icons, id)) continue
    const enabled = has(unit, id)
    const concealed = id === 'GUARD' && hidden(unit)
    const active = enabled && (id !== 'GUARD' || unit.position.row === 'front' && !concealed) && (id !== 'STEALTH' || !unit.revealed)
    const state = !enabled ? '能力封じ中' : id === 'GUARD' ? (active ? '前衛で有効' : concealed ? '影隠れ中' : '後衛で待機中') :
      id === 'STEALTH' && !active ? '解除済み' : '有効'
    list.push([id, active, state])
  }
  return list
}

function describe([id, , state]) {
  return (id === 'SPELL_WARD' ? names.RESIST_SPELL : names[id]) + '（' + state + '）'
}

export function statusDescriptions(character, view, card) {
  return (card ? abilityStates(character, card, view) : protectionStates(character, view.turn)).map(describe)
}

export function statusVisuals(view, previous, seat, unit, card, events) {
  const current = unit ?? view.players[seat]
  const states = unit ? abilityStates(unit, card, view) : protectionStates(current, view.turn)
  const other = unit && [...new Set([...unit.statuses, ...(canUseAbilities(unit) ? printedKeywords(unit, card) : [])])]
    .filter(id => !Object.hasOwn(icons, id)).map(id => names[id]).filter(Boolean).join('・')
  const timed = states.filter(([id]) => id === 'INVULNERABLE' || id === 'SPELL_WARD')
  const priorPlayer = previous?.players[seat]
  const prior = unit ? previous?.players.flatMap(player => player.units).find(value => value.id === unit.id) : priorPlayer
  const oldStates = previous && prior ?
    (unit && prior.card === unit.card ? abilityStates(prior, card, previous) : protectionStates(prior, previous.turn)) : []
  const target = unit ? unitTarget(unit.id) : leaderTarget(seat)
  const fresh = previous !== view && events.length > 0
  const blocked = fresh ? new Set(events.filter(event => event.protection && sameTarget(event.target, target)).map(event => event.protection)) : new Set()
  if (!states.length && !other && !blocked.size) return { cls: '', markup: '', labels: [] }
  const activated = id => fresh && !oldStates.some(([key, active]) => key === id && active)
  const burst = blocked.has('INVULNERABLE') || blocked.has('SPELL_WARD') || blocked.has('RESIST_SPELL') ||
    timed.some(([id]) => activated(id)) ||
    (fresh && (prior?.spellGuardThrough ?? -1) < current.spellGuardThrough)
  const badges = states.map(([id, active, state]) => {
    const released = id === 'STEALTH' && fresh && !active && unit.revealed && oldStates.some(([key, on]) => key === id && on)
    const pulse = (active && activated(id)) || blocked.has(id) || released
    return `<span class="ability-badge${pulse ? ' ability-pulse' : ''}" data-ability="${id}" data-active="${active}"
      title="${escapeText(describe([id, active, state]))}">${icons[id]}</span>`
  }).join('')
  const guard = states.some(([id, active]) => id === 'GUARD' && active)
  return {
    cls: [timed.length && 'protected-now', guard && 'guard-active'].filter(Boolean).join(' '),
    labels: [...states.map(describe), ...(other ? [other] : [])],
    markup: `<span class="ability-badges" aria-hidden="true">${badges}
      ${other ? `<span class="ability-badge" title="${escapeText(other)}">✦</span>` : ''}</span>
      ${timed.length || burst ? `<span class="defense-field${burst ? ' defense-burst' : ''}" aria-hidden="true"></span>` : ''}`,
  }
}
