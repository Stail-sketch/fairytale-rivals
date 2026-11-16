export const exampleRivalsDeck = Object.freeze({
  leader: 'seer',
  name: 'おおぞらはおまえのもの',
  deck: Object.freeze([
    'FT-0435', 'FT-0435', 'FT-0556', 'FT-0556', 'FT-0557', 'FT-0557', 'FT-0014', 'FT-0014', 'FT-0079', 'FT-0079',
    'FT-0028', 'FT-0028', 'FT-0232', 'FT-0232', 'FT-0475', 'FT-0475', 'FT-0481', 'FT-0491', 'FT-0186', 'FT-0186',
    'FT-0460', 'FT-0460', 'FT-0559', 'FT-0559', 'FT-0478', 'FT-0478', 'FT-0560', 'FT-0501', 'FT-0501', 'FT-0504',
  ]),
})

export function retireRivalsExample(collection, storage) {
  const key = 'fairytale-rivals.rivals-example-deck.v1'
  const { leader, name, deck } = exampleRivalsDeck
  try {
    const id = storage.getItem(key)
    if (!id) return
    const saved = collection.get(id)
    if (saved?.leader === leader && saved.name === name) {
      const original = [...deck].sort()
      if ([...saved.deck].sort().every((card, index) => card === original[index]) && !collection.remove(id).ok) return
    }
    storage.removeItem(key)
  } catch { /* A writable browser store can retry on the next load. */ }
}

