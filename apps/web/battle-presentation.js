import { cards } from '../../packages/cards/index.js'
import { attackProfile, summonTier } from './legendary-attacks.js'
import { mountBattleVfx } from './battle-vfx.js'
import { skillPresentation, skillProjectile, skillTheme } from './battle-skill-presentation.js'

const outcomes = new Set(['damage', 'heal', 'ability', 'death', 'summon', 'transform', 'move', 'exile', 'withdraw', 'equip', 'terrain', 'terrainTrigger'])
const motionKey = 'fairytale-battle-motion'
let fast = false
try { fast = localStorage.getItem(motionKey) === 'fast' } catch { /* Storage is optional. */ }

export const reducedMotion = () => fast || matchMedia('(prefers-reduced-motion: reduce)').matches
export function toggleBattleMotion() {
  fast = !reducedMotion()
  try { localStorage.setItem(motionKey, fast ? 'fast' : 'full') } catch { /* Storage is optional. */ }
}
const leaderAnchor = seat => ({ kind: 'leader', seat })

function attackStyle(view, attack) {
  const player = view.players[attack.seat]
  const card = cards[attack.type === 'leaderAttack' ? player.weapon?.card : player.units.find(unit => unit.id === attack.id)?.card]
  const job = card?.classId ?? player.leader
  if (['mage', 'seer'].includes(job) || card?.species === '精霊族') return 'arcane'
  if (['warrior', 'swordsman'].includes(job) || card?.kind === 'weapon' && !['priest', 'fighter'].includes(job)) return 'slash'
  return 'blow'
}

function positionAnchor(event) {
  return { kind: 'unit', seat: event.seat, id: event.id, position: event.position }
}

function anchorFor(target, before, after) {
  if (!target || target.kind === 'leader') return target
  const unit = [before, after].flatMap(view => view.players.flatMap(player => player.units))
    .find(unit => unit.id === target.id)
  return unit && positionAnchor({ seat: unit.owner, id: unit.id, position: unit.position })
}

function destinationFor(event, before, after) {
  if (event.destination) return event.destination
  if (event.position) return positionAnchor(event)
  if (event.type === 'equip' || (event.type === 'ability' && !event.triggered && !event.target && event.seat !== undefined)) {
    return leaderAnchor(event.seat)
  }
  return anchorFor(event.target, before, after)
}

function anchorKey(anchor) {
  if (!anchor) return ''
  if (anchor.kind === 'unit') return `${anchor.seat}:${anchor.position.row}:${anchor.position.column}`
  return anchor.kind + ':' + anchor.seat
}

export function planBattlePresentation(before, after, events, cpu) {
  const play = events.find(event => event.played && cards[event.card])
  const skillEvent = events.find(event => event.type === 'skill')
  const card = play && cards[play.card]
  const landing = play && (play.type === 'summon' || play.type === 'equip') ? destinationFor(play, before, after) : null
  const skill = skillEvent && skillTheme(skillEvent, before.players[skillEvent.seat],
    events.filter(event => event.type === 'handAdded' && event.seat === skillEvent.seat).length)
  const decisive = after.phase === 'finished'
  const phoenix = events.some(event => event.type === 'specialVictory')
  const attack = events.find(event => event.type === 'attack' || event.type === 'leaderAttack')
  const legend = attackProfile(before, attack)
  const tier = summonTier(card)
  const style = attack && (legend?.impactCue ?? attackStyle(before, attack))
  let strike
  const motions = events.filter(event => event.type === 'move').slice(0, 6)
  const terrain = new Map()
  const sources = new Map()
  const targets = new Map()
  const links = new Map()
  const impacts = new Map()
  const chained = events.some(event => event.type === 'terrain' || event.type === 'terrainTrigger')
  for (const [index, event] of events.entries()) {
    if (!outcomes.has(event.type)) continue
    if (event.source?.position || event.source?.kind === 'leader') sources.set(anchorKey(event.source), event.source)
    const to = destinationFor(event, before, after)
    if (!to || (event.type === 'heal' && !event.value)) continue
    const tone = event.type === 'damage' || event.type === 'death' ? 'damage' : event.type === 'heal' ? 'heal' : 'effect'
    const key = anchorKey(to)
    const order = chained ? Math.min(index, 4) : 0
    if (event.terrain && !event.afterFrontDeath) terrain.set(key, { to, stage: event.terrain, order })
    if (!targets.has(key) || targets.get(key).tone === 'effect') targets.set(key, { to, tone, order })
    const from = event.source
    if (from && anchorKey(from) !== key) links.set(anchorKey(from) + '>' + key, { from, to, tone, order })
    const impact = event.type === 'damage' ? (event.value ? style || 'arcane' : 'guard') :
      event.type === 'heal' ? 'heal' : event.type === 'summon' ? 'summon' :
        event.type === 'equip' ? 'equip' : (event.type === 'terrain' || event.type === 'terrainTrigger') && 'terrain'
    const fromSkill = skill && from?.kind === 'leader' && from.seat === skill.seat && !from.card
    if (impact) impacts.set(key + '/' + impact, { to, style: impact, card: cards[event.card], motif: fromSkill ? skill.motif : undefined })
    else if (fromSkill && skill.motif === 'lightning' && event.type === 'ability') {
      impacts.set(key + '/equip', { to, style: 'equip', motif: skill.motif })
    }
  }
  if (attack) {
    const from = attack.type === 'leaderAttack' ? leaderAnchor(attack.seat) : anchorFor({ kind: 'unit', id: attack.id }, before, after)
    const to = anchorFor(attack.target, before, after)
    if (from && to) {
      strike = { from, to, style, legend }
      sources.set(anchorKey(from), from)
      links.set(anchorKey(from) + '>' + anchorKey(to), { ...strike, tone: 'strike', order: 0 })
    }
  }
  if (!card && !skill && !decisive && !targets.size && !sources.size) return null
  const reduced = reducedMotion()
  const bursts = [...impacts.values()]
  const firstImpact = bursts.find(impact => attack ? [style, 'guard'].includes(impact.style) :
    landing ? ['summon', 'equip'].includes(impact.style) : ['arcane', 'heal', 'guard', 'terrain'].includes(impact.style))
  if (!firstImpact && strike) bursts.push({ to: strike.to, style })
  const sound = firstImpact ?? bursts[0]
  return {
    card, summonTier: tier, cost: play?.cost, skill, landing, strike, decisive, phoenix, winner: after.specialVictory, motions, before, reduced,
    terrain: [...terrain.values()],
    bursts, sound, impactCue: sound?.style ?? (card?.kind === 'spell' ? 'spell' : null),
    sources: [...sources.values()], targets: [...targets.values()], links: [...links.values()],
    caption: events.find(event => event.triggered)?.text,
    revealMs: reduced ? (card || skill ? 145 : 0) : skill ? 445 : card ? (tier === 'legendary' ? (cpu ? 650 : 600) : cpu ? 395 : 285) : 0,
    approachMs: reduced ? 60 : skill ? 205 : chained ? 230 : landing ? tier === 'legendary' ? 430 : tier === 'major' ? 300 : 162 : strike ? legend?.travelMs ?? 135 : 125,
    finishMs: phoenix ? (reduced ? 440 : 1350) : reduced ? 210 : 540,
  }
}

export function presentationLayer(presentation, art, escape) {
  if (!presentation) return ''
  const { scene, beat } = presentation
  const { card, skill, decisive, cost, caption } = scene
  const face = card ? `<figure class="battle-reveal" data-reveal-card="${card.id}" data-card-kind="${card.kind}">
    <img src="${art(card.artId)}" alt=""><span class="cost">${cost ?? card.cost}</span>
    <figcaption>${escape(card.name)}</figcaption></figure>` :
    skill ? skillPresentation(skill, art, escape, scene.reduced) : ''
  return `<div class="battle-presentation" data-beat="${beat}" aria-hidden="true">
    <div class="effect-paths"></div>
    ${beat !== 'finish' ? face : ''}
    ${beat === 'approach' && caption ? `<span class="effect-caption">${escape(caption)}</span>` : ''}
    ${beat === 'finish' && decisive ? scene.phoenix ? `<div class="phoenix-reveal">
      <img src="${art(cards['FT-0491'].artId)}" alt=""><span>六彩の暁鳥</span>
      ${['red', 'yellow', 'green', 'blue', 'purple', 'silver'].map((color, index) =>
        `<i class="seed-light seed-${color}" style="--seed-angle:${index * 60}deg;--seed-index:${index}"></i>`).join('')}</div>` :
      '<div class="finish-reveal"><span>決着</span></div>' : ''}
  </div>`
}

function anchorNode(app, anchor) {
  if (anchor.kind === 'card') return app.querySelector('.battle-reveal')
  if (anchor.kind === 'leader') return app.querySelector(`[data-leader="${anchor.seat}"]`)
  return app.querySelector(`[data-slot="${anchorKey(anchor)}"]`)
}

function center(node) {
  const { left, top, width, height } = node.getBoundingClientRect()
  return { x: left + width / 2, y: top + height / 2, width }
}

export function positionPresentation(app, presentation) {
  const { beat, scene } = presentation
  if (beat === 'reveal') return
  for (const source of scene.sources) anchorNode(app, source)?.classList.add('effect-origin')
  for (const { to, tone, order } of scene.targets) {
    const target = anchorNode(app, to)
    target?.classList.add('effect-destination', 'effect-' + tone)
    target?.style.setProperty('--effect-delay', order * 32 + 'ms')
  }
  if (beat === 'finish') {
    const burst = app.querySelector('.phoenix-reveal')
    if (burst && !scene.reduced) {
      const origin = burst.getBoundingClientRect()
      for (const seed of burst.querySelectorAll('.seed-light')) {
        const stage = seed.classList[1].replace('seed-', 'orb-')
        const slot = app.querySelector(`[data-slot^="${scene.winner}:"][data-terrain="${stage}"]`)
        if (!slot) continue
        const start = center(slot)
        seed.style.setProperty('--seed-x', start.x - origin.x - origin.width / 2 - 6 + 'px')
        seed.style.setProperty('--seed-y', start.y - origin.y - origin.height * .46 - 6 + 'px')
        seed.classList.add('seed-from-board')
      }
    }
    return
  }
  for (const { to, stage, order } of scene.terrain) {
    const tile = anchorNode(app, to)
    if (!tile) continue
    const flash = document.createElement('i')
    flash.className = 'terrain-flash'
    flash.dataset.stage = stage
    flash.style.animationDelay = order * 32 + 'ms'
    tile.append(flash)
  }

  const face = app.querySelector('.battle-reveal')
  const landing = scene.landing && anchorNode(app, scene.landing)
  if (landing && face) {
    const start = center(face)
    const end = center(landing)
    face.classList.add('reveal-travel')
    face.style.setProperty('--reveal-x', end.x - start.x + 'px')
    face.style.setProperty('--reveal-y', end.y - start.y + 'px')
    face.style.setProperty('--reveal-scale', Math.min(0.75, end.width / start.width))
    face.style.setProperty('--reveal-travel-time', scene.approachMs + 'ms')
  }

  if (scene.reduced) return
  if (scene.skill?.motif === 'mirror') {
    const impact = scene.bursts.find(burst => burst.motif === 'mirror')
    if (impact) skillProjectile(app, scene.skill, anchorNode(app, impact.to), scene.approachMs)
  }
  if (scene.skill?.handAdded) {
    const seat = scene.skill.seat
    const resource = app.querySelector(`[data-hand-count="${seat}"]`) ?? app.querySelector('.hand')
    skillProjectile(app, scene.skill, resource, scene.approachMs)
  }
  for (const event of scene.motions) {
    if (event.afterFrontDeath) continue
    const start = anchorFor({ kind: 'unit', id: event.id }, scene.before, scene.before)
    const source = start && anchorNode(app, start)?.querySelector('img')
    const destination = anchorNode(app, positionAnchor(event))
    if (!source || !destination || source.closest('.slot') === destination) continue
    const from = center(source)
    const to = center(destination)
    source.animate([
      { zIndex: 4, transform: 'translate(0, 0)' },
      { zIndex: 4, transform: `translate(${to.x - from.x}px, ${to.y - from.y}px)` },
    ], { duration: Math.min(190, scene.approachMs), easing: 'cubic-bezier(.22,.78,.36,1)', fill: 'forwards' })
    source.closest('.slot').classList.add('moving-unit')
  }
  const paths = app.querySelector('.effect-paths')
  const origin = paths.getBoundingClientRect()
  for (const { from, to, tone, order, style } of scene.links.slice(0, 18)) {
    if (tone === 'strike' && scene.strike?.legend) continue
    const source = anchorNode(app, from)
    const target = anchorNode(app, to)
    if (!source || !target) continue
    const start = center(source)
    const end = center(target)
    const x = end.x - start.x
    const y = end.y - start.y
    const path = document.createElement('i')
    path.className = 'effect-path effect-' + tone
    if (style) path.dataset.strikeStyle = style
    path.style.left = start.x - origin.left + 'px'
    path.style.top = start.y - origin.top + 'px'
    path.style.animationDelay = order * 32 + 'ms'
    path.style.width = Math.hypot(x, y) + 'px'
    path.style.rotate = Math.atan2(y, x) + 'rad'
    paths.append(path)
  }
  if (scene.strike) windUp(app, scene.strike, scene.approachMs)
  mountBattleVfx(app, scene, 'approach', anchor => anchorNode(app, anchor))
}

function windUp(app, { from, to, style }, duration) {
  const attacker = anchorNode(app, from)
  const defender = anchorNode(app, to)
  if (!attacker || !defender) return
  const start = center(attacker)
  const end = center(defender)
  const length = Math.hypot(end.x - start.x, end.y - start.y) || 1
  const reach = Math.min(start.width * .38, length * .29, 44)
  const x = (end.x - start.x) / length * reach
  const y = (end.y - start.y) / length * reach
  attacker.classList.add('attack-approach')
  attacker.animate(style === 'arcane' ? [
    { filter: 'brightness(1)', scale: 1 }, { filter: 'brightness(1.45)', scale: 1.04 },
  ] : [
    { translate: '0px 0px', scale: 1 },
    { translate: `${-x * .20}px ${-y * .20}px`, scale: .97, offset: .37 },
    { translate: `${x}px ${y}px`, scale: 1.06 },
  ], { duration, easing: 'ease-in', fill: 'forwards' })
}

const sparkAngles = [-115, -77, -40, 5, 42, 81, 124, 162, 195, 224]

export function positionBattleImpact(app, scene) {
  const grid = app.querySelector('.battle-grid')
  if (!grid || !scene.bursts.length) return 0
  if (!scene.reduced) {
    for (const event of scene.motions.filter(motion => motion.afterFrontDeath)) {
      const start = anchorNode(app, { ...positionAnchor(event), position: { ...event.position, row: 'back' } })
      const destination = anchorNode(app, positionAnchor(event))
      if (!start || destination?.dataset.unit !== String(event.id)) continue
      const art = destination.querySelector('img')
      if (!art) continue
      const from = center(start)
      const to = center(destination)
      destination.classList.add('moving-unit')
      const animation = art.animate([
        { transform: `translate(${from.x - to.x}px, ${from.y - to.y}px)` },
        { transform: 'translate(0, 0)' },
      ], { duration: 190, easing: 'cubic-bezier(.22,.78,.36,1)' })
      animation.onfinish = () => destination.classList.remove('moving-unit')
    }
  }
  const origin = grid.getBoundingClientRect()
  const layer = document.createElement('div')
  layer.className = 'battle-impacts'
  layer.setAttribute('aria-hidden', 'true')
  let pan = 0
  for (const [index, impact] of scene.bursts.slice(0, 12).entries()) {
    const target = anchorNode(app, impact.to)
    if (!target) continue
    const { x, y, width } = center(target)
    const burst = document.createElement('div')
    burst.className = 'combat-impact'
    burst.dataset.impactStyle = impact.style
    if (impact.motif) {
      burst.dataset.skillImpact = impact.motif
      burst.style.setProperty('--skill-impact-order', index)
    }
    burst.style.left = x - origin.left + 'px'
    burst.style.top = y - origin.top + 'px'
    burst.style.setProperty('--impact-size', Math.min(170, Math.max(44, width * 1.23)) + 'px')
    if (impact === scene.sound) pan = .46 * (2 * (x - origin.left) / origin.width - 1)
    if (!scene.reduced) {
      for (const [index, angle] of sparkAngles.entries()) {
        const spark = document.createElement('i')
        spark.style.setProperty('--ray-angle', angle + 'deg')
        spark.style.setProperty('--ray-reach', (.46 + (index % 4) * .12) * Math.min(140, width) + 'px')
        spark.style.setProperty('--ray-life', (240 + (index % 4) * 57) + 'ms')
        burst.append(spark)
      }
    }
    layer.append(burst)
  }
  layer.addEventListener('animationend', event => { if (event.target === layer) layer.remove() })
  grid.append(layer)
  mountBattleVfx(app, scene, 'impact', anchor => anchorNode(app, anchor))
  return Math.max(-1, Math.min(1, pan))
}
