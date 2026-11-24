import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { catalog, species } from '../packages/cards/index.js'

const root = new URL('../', import.meta.url)
const creative = JSON.parse(await readFile(new URL('docs/fourth-pack-creative.json', root), 'utf8'))
const source = JSON.parse(await readFile(new URL('docs/fourth-pack-candidates.json', root), 'utf8'))
assert.equal(source.cards.length, 100)
assert.equal(source.generatedReferences.length, 14)
assert.equal(creative.cards.length, 114)
assert.deepEqual(creative.fixedSpecies, species)
const planned = new Set(creative.cards.map(card => card.id))
const names = new Set(catalog.filter(card => !planned.has(card.id)).map(card => card.name))
const ids = new Set()
const hashes = new Set()
let images = 0
for (const card of creative.cards) {
  assert.ok(!names.has(card.name), 'Duplicate name: ' + card.name)
  assert.ok(!ids.has(card.id), 'Duplicate ID: ' + card.id)
  names.add(card.name)
  ids.add(card.id)
  const live = catalog.find(existing => existing.id === card.id)
  assert.equal(live?.name, card.name, 'Missing runtime definition: ' + card.id)
  const original = card.id.startsWith('FT-') ? source.cards.find(row => row.ftId === card.id) :
    source.generatedReferences.find(row => row.proposedFtId === card.id)
  assert.ok(original, 'Missing correspondence: ' + card.id)
  assert.equal(card.referenceId, original.referenceId)
  assert.equal(card.name, original.adaptedName)
  assert.equal(original.implementation, 'implemented')
  assert.equal(original.testStatus, 'tested')
  assert.equal(original.verification.effect, 'image-verified')
  if (card.appearanceSpecies) assert.ok(species.includes(card.appearanceSpecies))
  assert.ok(creative.factions[card.faction])
  assert.ok(card.prompt?.length > 300)
  if (!card.artPath) { assert.equal(card.artStatus, 'not-created'); continue }
  assert.match(card.artPath, /^artwork\/set-4\/card-(FT-\d{4}|token-set4-[a-z-]+)\.png$/)
  assert.equal(card.artStatus, 'generated')
  const bytes = await readFile(new URL(card.artPath, root))
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
  assert.equal(width, height)
  assert.ok(width >= 1024)
  const imported = JSON.parse(await readFile(new URL('artwork/set-4/imports/' + card.id + '.json', root), 'utf8'))
  assert.equal(width, imported.width)
  assert.equal(height, imported.height)
  const hash = createHash('sha256').update(bytes).digest('hex')
  assert.equal(hash, imported.sha256)
  assert.ok(!hashes.has(hash), 'Reused image: ' + card.id)
  hashes.add(hash)
  images++
}
assert.equal(images, creative.summary.artGenerated)
assert.equal(114 - images, creative.summary.artRemaining)
console.log(`第4弾：114種類、原画${images}枚、未制作${114 - images}件。対応ID・名称重複・画像サイズ・画像使い回しを確認しました。`)
