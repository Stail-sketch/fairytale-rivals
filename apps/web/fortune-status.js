export function fortuneStatus(player) {
  if (player.fortune === 'both') return { term: 'FORTUNE_BOTH', state: 'both', duration: '継続' }
  if (player.bothFortunesThisTurn) return { term: 'FORTUNE_BOTH', state: 'turn', duration: 'このターン' }
  if (player.fortune === 'choose') return { term: 'FORTUNE_CHOOSE', state: 'choose', duration: '継続' }
  if (player.nextFortune) return { term: 'FORTUNE_CHOOSE', state: 'next', duration: '次の1回' }
  return null
}
