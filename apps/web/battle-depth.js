// The illustrated 2.5D board is the default. The prefilled test match remains local-only.
const params = new URLSearchParams(globalThis.location?.search ?? '')
export const depthPreviewAvailable = ['localhost', '127.0.0.1', '[::1]'].includes(globalThis.location?.hostname) && params.get('battlePreview') === 'depth'
export const boardStyleKey = 'fairytale-battle-board-style-v1'
let enabled = true
try { enabled = depthPreviewAvailable || localStorage.getItem(boardStyleKey) !== 'classic' } catch { /* A board can still be shown without storage. */ }
export const depthEnabled = () => enabled
export function toggleBattleDepth() {
  enabled = !enabled
  try { localStorage.setItem(boardStyleKey,enabled ? 'depth' : 'classic') } catch { /* The current match can still switch. */ }
}

export function standingUnit(card, art, _enemy, id) {
  // Keep the original illustration, including its background and orientation, on both sides.
  return `<span class="unit-stage portrait-fallback" data-rarity="${card.rarity ?? 'unlabeled'}" style="--unit-delay:-${(id % 9) * .41}s;--unit-facing:1" aria-hidden="true">
    <span class="unit-contact-shadow"></span><span class="unit-plinth"></span>
    <span class="unit-actor"><span class="unit-facing"><img class="standing-art" src="${art(card.artId)}" data-unit-art="portrait" alt=""><i class="unit-rarity-gem" aria-hidden="true"></i></span></span>
  </span>`
}
