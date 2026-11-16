import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createCardSearch } from '../apps/web/card-search.js'
import { originalCardNames } from '../apps/web/original-card-names.js'
import { cards, catalog } from '../packages/cards/index.js'
import { cardSearchNames } from '../scripts/sync-card-search-names.js'

test('対応表の原作名と別表記ですべての対応カードが検索できる', () => {
  const correspondence = JSON.parse(readFileSync(new URL('../docs/card-correspondence.json', import.meta.url), 'utf8'))
  assert.deepEqual(originalCardNames, cardSearchNames(correspondence))
  const search = createCardSearch(catalog)
  for (const [id, names] of Object.entries(originalCardNames)) {
    assert(Object.hasOwn(cards, id), id)
    for (const name of names) {
      assert(search(name, () => true).some(card => card.id === id), name + ' → ' + id)
    }
  }
  const fireSpells = search('メラ', () => true)
  assert.equal(fireSpells[0].id, 'FT-0021')
  assert(fireSpells.some(card => card.id === 'FT-0001'), '部分一致の結果も表示される')
})
