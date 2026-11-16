export const exampleRivalsDeck = Object.freeze({
  leader: 'seer',
  name: 'おおぞらはおまえのもの',
  deck: Object.freeze([
    'FT-0435', 'FT-0435', 'FT-0556', 'FT-0556', 'FT-0557', 'FT-0557', 'FT-0014', 'FT-0014', 'FT-0079', 'FT-0079',
    'FT-0028', 'FT-0028', 'FT-0232', 'FT-0232', 'FT-0475', 'FT-0475', 'FT-0481', 'FT-0491', 'FT-0186', 'FT-0186',
    'FT-0460', 'FT-0460', 'FT-0559', 'FT-0559', 'FT-0478', 'FT-0478', 'FT-0560', 'FT-0501', 'FT-0501', 'FT-0504',
  ]),
})

export function installRivalsExample(collection, storage) {
  const key = 'fairytale-rivals.rivals-example-deck.v1'
  const { leader, name, deck } = exampleRivalsDeck
  try {
    const installed = storage.getItem(key)
    if (installed !== null) return installed
    const list = [...deck].sort()
    const existing = collection.list(leader).find(saved => {
      if (saved.name !== name) return false
      return [...saved.deck].sort().every((id, index) => id === list[index])
    })
    // An existing matching deck belongs to the player and keeps its normal selection behavior.
    if (existing) {
      storage.setItem(key, '')
      return ''
    }
    const result = collection.save(exampleRivalsDeck)
    if (!result.ok) return ''
    storage.setItem(key, result.deck.id)
    return result.deck.id
  } catch { return '' }
}

