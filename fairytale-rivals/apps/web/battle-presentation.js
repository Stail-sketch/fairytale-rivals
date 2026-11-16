import { cards, leaders } from '../../packages/cards/index.js'

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
  const skill = skillEvent && { name: skillEvent.name, leader: after.players[skillEvent.seat].leader }
  const decisive = after.phase === 'finished'
  const phoenix = events.some(event => event.type === 'specialVictory')
  const attack = events.find(event => event.type === 'attack' || event.type === 'leaderAttack')
  const motions = events.filter(event => event.type === 'move').slice(0, 6)
  const terrain = new Map()
  const sources = new Map()
  const targets = new Map()
  const links = new Map()
  const chained = events.some(event => event.type === 'terrain' || event.type === 'terrainTrigger')
  for (const [index, event] of events.entries()) {
    if (!outcomes.has(event.type)) continue
    if (event.source?.position || event.source?.kind === 'leader') sources.set(anchorKey(event.source), event.source)
    const to = destinationFor(event, before, after)
    if (!to || (event.type === 'heal' && !event.value)) continue
    const tone = event.type === 'damage' || event.type === 'death' ? 'damage' : event.type === 'heal' ? 'heal' : 'effect'
    const key = anchorKey(to)
    const order = chained ? Math.min(index, 4) : 0
    if (event.terrain) terrain.set(key, { to, stage: event.terrain, order })
    if (!targets.has(key) || targets.get(key).tone === 'effect') targets.set(key, { to, tone, order })
    const from = event.source
    if (from && anchorKey(from) !== key) links.set(anchorKey(from) + '>' + key, { from, to, tone, order })
  }
  if (attack) {
    const from = attack.type === 'leaderAttack' ? leaderAnchor(attack.seat) : anchorFor({ kind: 'unit', id: attack.id }, before, after)
    const to = anchorFor(attack.target, before, after)
    if (from && to) {
      sources.set(anchorKey(from), from)
      links.set(anchorKey(from) + '>' + anchorKey(to), { from, to, tone: 'strike', order: 0 })
    }
  }
  if (!card && !skill && !decisive && !targets.size && !sources.size) return null
  const reduced = reducedMotion()
  return {
    card, cost: play?.cost, skill, landing, decisive, phoenix, winner: after.specialVictory, motions, before, reduced,
    terrain: [...terrain.values()],
    impactCue: attack ? 'attack' : play?.type === 'equip' ? 'equip' : landing ? 'summon' :
      events.some(event => event.type === 'heal' && event.value > 0) ? 'heal' :
        terrain.size ? 'terrain' : card?.kind === 'spell' ? 'spell' : null,
    sources: [...sources.values()], targets: [...targets.values()], links: [...links.values()],
    caption: events.find(event => event.triggered)?.text,
    revealMs: reduced ? (card || skill ? 145 : 0) : skill ? 430 : card ? (cpu ? 395 : 285) : 0,
    approachMs: reduced ? 60 : chained ? 250 : landing ? 155 : 130,
    finishMs: phoenix ? (reduced ? 440 : 1350) : reduced ? 210 : 540,
  }
}

export function presentationLayer(presentation, art, escape) {
  if (!presentation) return ''
  const { scene, beat } = presentation
  const { card, skill, decisive, cost, caption } = scene
  const leader = skill && leaders[skill.leader]
  const face = card ? `<figure class="battle-reveal" data-reveal-card="${card.id}" data-card-kind="${card.kind}">
    <img src="${art(card.artId)}" alt=""><span class="cost">${cost ?? card.cost}</span>
    <figcaption>${escape(card.name)}</figcaption></figure>` :
    skill ? `<div class="skill-reveal" data-skill-class="${skill.leader}" style="--skill-light:${leader.accent}">
      <i class="skill-emblem" aria-hidden="true">${leader.sigil}</i><img src="${art(skill.leader)}" alt=""><strong>${escape(skill.name)}</strong>
    </div>` : ''
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
  }

  if (scene.reduced) return
  for (const event of scene.motions) {
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
  for (const { from, to, tone, order } of scene.links.slice(0, 18)) {
    const source = anchorNode(app, from)
    const target = anchorNode(app, to)
    if (!source || !target) continue
    const start = center(source)
    const end = center(target)
    const x = end.x - start.x
    const y = end.y - start.y
    const path = document.createElement('i')
    path.className = 'effect-path effect-' + tone
    path.style.left = start.x - origin.left + 'px'
    path.style.top = start.y - origin.top + 'px'
    path.style.animationDelay = order * 32 + 'ms'
    path.style.width = Math.hypot(x, y) + 'px'
    path.style.rotate = Math.atan2(y, x) + 'rad'
    paths.append(path)
  }
}
