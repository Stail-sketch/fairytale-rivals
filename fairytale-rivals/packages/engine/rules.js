export const rules = Object.freeze({
  id: 'prototype-2',
  leaderHp: 25,
  deckSize: 30,
  initialHand: Object.freeze([3, 4]),
  initialTension: Object.freeze([0, 2]),
  maxMp: 10,
  maxTension: 3,
  maxHand: 9,
  focusCost: 1,
  fatigueDamage: 1,
  copyLimit: Object.freeze({ unlabeled: 2, common: 2, rare: 2, superRare: 2, legendary: 1 }),
  firstTurnDraw: true,
  effectLimit: 256,
})

export const positions = Object.freeze(['front', 'back'].flatMap(row =>
  [0, 1, 2].map(column => Object.freeze({ row, column })),
))
export const other = seat => 1 - seat
export const samePosition = (a, b) => a?.row === b?.row && a?.column === b?.column
export const sameTarget = (a, b) => a?.kind === b?.kind && (
  a?.kind === 'unit' ? a.id === b.id : a?.kind === 'leader' && a.seat === b.seat
)
export const unitTarget = id => ({ kind: 'unit', id })
export const leaderTarget = seat => ({ kind: 'leader', seat })

