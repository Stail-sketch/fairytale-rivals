import { leaders } from '../../packages/cards/index.js'

const themes = {
  warrior: { motif: 'lightning', light: '#ffd181', petals: 3 },
  mage: { motif: 'mirror', light: '#b39bff', petals: 6 },
  fighter: { motif: 'steps', light: '#ff8064', petals: 4 },
  priest: { motif: 'blossom', light: '#ffe2d9', petals: 8 },
  merchant: { motif: 'coins', light: '#ffd37d', petals: 7 },
  seer: { motif: 'crystal', light: '#acebff', petals: 6 },
  swordsman: { motif: 'thorns', light: '#ef6889', petals: 7 },
  rosefire: { motif: 'rosefire', light: '#ff6885', petals: 9 },
}

export function skillTheme(event, player, handAdded) {
  const style = player.awakenedLeader ? 'rosefire' : player.leader
  return { style, leader: player.leader, name: event.name, seat: event.seat,
    handAdded, ...themes[style] }
}

export function skillPresentation(skill, art, escape, reduced) {
  const hero = leaders[skill.leader]
  return `<div class="skill-scene" data-skill-style="${skill.style}" data-skill-motif="${skill.motif}" style="--skill-light:${skill.light}">
    ${reduced ? '' : `<div class="skill-ornament"><b></b>${Array.from({ length: skill.petals }, (_, index) =>
      `<i style="--skill-index:${index};--skill-angle:${360 / skill.petals * index}deg"></i>`).join('')}</div>`}
    <div class="skill-reveal" data-skill-class="${skill.leader}">
      <img src="${art(skill.leader)}" alt="">
      <strong>${escape(skill.name)}</strong>
      <span class="skill-seal" aria-hidden="true">${hero.sigil}</span>
    </div>
  </div>`
}

export function skillProjectile(app, skill, destination, duration) {
  const scene = app.querySelector('.skill-scene')
  if (!scene || !destination) return
  const face = scene.querySelector('.skill-reveal').getBoundingClientRect()
  const board = scene.getBoundingClientRect()
  const target = destination.getBoundingClientRect()
  const x = face.left + face.width * (skill.motif === 'mirror' ? .66 : .5)
  const y = face.top + face.height / 2
  const dx = target.left + target.width / 2 - x
  const dy = target.top + target.height / 2 - y
  const count = skill.motif === 'mirror' ? 1 : Math.min(3, skill.handAdded)
  for (let index = 0; index < count; index++) {
    const projectile = document.createElement('i')
    projectile.className = 'skill-projectile'
    projectile.style.left = x - board.left + 'px'
    projectile.style.top = y - board.top + 'px'
    scene.append(projectile)
    const delay = 25 * index
    projectile.animate([
      { opacity: 0, transform: 'translate(0, 0) scale(.62)' },
      { opacity: 1, transform: `translate(${dx * .45}px, ${dy * .4 - 20 - index * 14}px) scale(1.1)`, offset: .48 },
      { opacity: .95, transform: `translate(${dx}px, ${dy}px) scale(.78)` },
    ], { duration: duration - delay, delay, easing: 'cubic-bezier(.28,.04,.79,.6)', fill: 'both' })
  }
}
