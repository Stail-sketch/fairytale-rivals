export const battleMusicIds = Object.freeze(['warrior', 'mage', 'fighter', 'priest', 'merchant', 'seer', 'swordsman'])

// Presentation entropy is independent of deck shuffling and is safe to share with both players.
export function matchPresentation(config, savedGame) {
  const matchId = savedGame?.matchId ?? config.matchId ?? crypto.randomUUID()
  const proposed = savedGame?.bgmId ?? config.bgmId
  const bgmId = battleMusicIds.includes(proposed) ? proposed : battleMusicIds[
    Number.parseInt(crypto.randomUUID().replaceAll('-', '').slice(0, 8), 16) % battleMusicIds.length]
  return { matchId, bgmId }
}
