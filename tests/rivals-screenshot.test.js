import assert from 'node:assert/strict'
import test from 'node:test'
import { deckIssue } from '../packages/engine/index.js'
import { createDeckCollection } from '../packages/cards/decks.js'
import { initialDecks } from '../packages/cards/initial-decks.js'
import { exampleRivalsDeck, retireRivalsExample } from '../apps/web/rivals-example.js'
import { fingerprintColors, fingerprintIds, gridSize } from '../apps/web/rivals-card-fingerprints.js'
import { readDeckScreenshot } from '../apps/web/rivals-screenshot.js'

test('スクショ照合は各枠を数え、同じカードの2枚目と空き枠を区別する', () => {
  const width = 1280
  const height = 463
  const data = new Uint8ClampedArray(width * height * 4)
  const samples = Buffer.from(fingerprintColors, 'base64')
  const byId = new Map(fingerprintIds.map((id, index) => [id, index * gridSize ** 2 * 3]))
  function fill(x, y, w, h, color) {
    for (let row = Math.round(y); row < Math.round(y + h); row++) {
      for (let col = Math.round(x); col < Math.round(x + w); col++) data.set(color, (row * width + col) * 4)
    }
  }
  assert.equal(byId.size, 673)
  assert.equal(samples.length, byId.size * gridSize ** 2 * 3)
  const ids = exampleRivalsDeck.deck.slice(0, 28)
  for (const [index, id] of ids.entries()) {
    const pitch = 124.4
    const x = 17 + (index % 10) * pitch
    const y = 3 + Math.floor(index / 10) * 152
    const stepX = pitch * .977 * .46 / gridSize
    const stepY = 152 * .981 * .40 / gridSize
    fill(x + 1, y, 25, 19, [22, 170, 240, 255])
    for (let row = 0; row < gridSize; row++) for (let col = 0; col < gridSize; col++) {
      const offset = byId.get(id) + (row * gridSize + col) * 3
      fill(x + pitch * .977 * .27 + col * stepX, y + 152 * .981 * .08 + row * stepY,
        stepX, stepY, [...samples.subarray(offset, offset + 3), 255])
    }
  }
  const out = readDeckScreenshot({ width, height, data })
  assert(out)
  assert.equal(out.columns, 10)
  assert.deepEqual(out.slots.map(slot => slot.id), [...ids, null, null])
  assert(out.slots.slice(-2).every(slot => slot.empty))
  assert.equal(readDeckScreenshot({ width, height, data: new Uint8ClampedArray(data.length) }), null)
})

test('全7職業の初期デッキを1回ずつ追加し、既存の同名・同内容デッキと個人の編集を保つ', () => {
  assert.equal(initialDecks.length, 9)
  assert.equal(new Set(initialDecks.map(deck => deck.leader)).size, 7)
  for (const { deck, leader } of initialDecks) assert.equal(deckIssue(deck, leader), null)
  const persisted = new Map()
  const storage = {
    keys: () => persisted.keys(),
    getItem: key => persisted.get(key) ?? null,
    setItem: (key, value) => persisted.set(key, value),
    removeItem: key => persisted.delete(key),
  }
  const collection = createDeckCollection(storage)
  const own = collection.save(initialDecks.map(({ leader, name, deck }) => ({ leader, name, deck }))[0]).deck
  const example = collection.save(exampleRivalsDeck).deck
  const key = 'fairytale-rivals.rivals-example-deck.v1'
  storage.setItem(key, example.id)
  retireRivalsExample(collection, storage)
  assert.equal(collection.get(example.id), null)
  collection.initialize(initialDecks)
  collection.initialize(initialDecks)
  assert.equal(collection.list().length, 9)
  assert(collection.get(own.id))
  const next = initialDecks[1]
  collection.remove(next.id)
  collection.initialize(initialDecks)
  assert.equal(collection.get(next.id), null)
  const edited = collection.save({ ...exampleRivalsDeck, name: '個人用に編集したデッキ' }).deck
  storage.setItem(key, edited.id)
  retireRivalsExample(collection, storage)
  assert(collection.get(edited.id))
})

