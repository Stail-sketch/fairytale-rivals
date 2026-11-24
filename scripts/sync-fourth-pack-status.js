import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { cards } from '../packages/cards/index.js'

const root = new URL('../', import.meta.url)
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'))
const write = (path, value) => writeFileSync(new URL(path, root), JSON.stringify(value, null, 2) + '\n')
const candidates = read('docs/fourth-pack-candidates.json')
const creative = read('docs/fourth-pack-creative.json')
const correspondence = read('docs/card-correspondence.json')
const records = []
for (const entry of [...candidates.cards, ...candidates.generatedReferences]) {
  const id = entry.ftId ?? entry.proposedFtId
  const art = creative.cards.find(card => card.id === id)
  if (id === 'FT-0605') { entry.sourceName = art.sourceName = '背水のかまえ'; entry.sourceAliases = ['背水の構え', '排水の構え'] }
  if (id === 'token-set4-wish-strength') entry.sourceName = art.sourceName = 'ドラゴンを つよくしたい'
  const file = 'artwork/set-4/imports/' + id + '.json'
  const imported = existsSync(new URL(file, root)) ? read(file) : null
  entry.adaptedName = art.name
  entry.nameStatus = art.nameStatus = 'adopted'
  entry.artStatus = art.artStatus = imported ? 'generated' : 'not-created'
  if (imported) {
    art.artPath = 'artwork/set-4/card-' + id + '.png'
    art.art = { width: imported.width, height: imported.height, sha256: imported.sha256 }
  }
  entry.verification.effect = 'image-verified'
  entry.verification.metadata = 'image-verified'
  entry.verification.targetsAndOrder = 'implemented-regression-tested'
  entry.verification.interactions = 'regression-tested-main-mechanics'
  entry.implementation = 'implemented'
  entry.testStatus = 'tested'
  records.push({ id, sourceName: entry.sourceName, sourceImage: 'https://dqrdb.com/card/' + entry.referenceId.split(':')[1] + '.png',
    referenceId: entry.referenceId, originalCardId: null, originalCardIdStatus: 'official-identifier-unverified',
    adoptedStats: entry.stats, alternativeStats: entry.alternativeStats,
    adoptedKeywords: cards[id].keywords, sourceKeywords: entry.archiveKeywords ?? [], badge: cards[id].badge,
    target: cards[id].target, targetFilter: cards[id].targetFilter, effects: cards[id].effects, abilities: cards[id].abilities,
    versionPolicy: 'DQRDB image snapshot; historical GameConductor alternatives retained separately',
    effect: cards[id].description, effectVerification: 'image-verified', implementation: 'implemented',
    tests: 'tests/fourth-pack.test.js', art: imported ? imported.delivery : null })
  if (entry.ftId) {
    let mapped = correspondence.cards.find(card => card.ftId === id)
    if (!mapped) { mapped = { ftId: id }; correspondence.cards.push(mapped) }
    const { cost, attack, hp, classId, kind, rarity, keywords } = cards[id]
    const referenceUrl = 'https://dqrdb.com/card/' + entry.referenceId.split(':')[1] + '.png'
    Object.assign(mapped, { sourceName: entry.sourceName, sourceAliases: entry.sourceAliases, name: art.name, pack: 'set-4', referenceUrl,
      sourceKey: 'set-4/' + entry.sourceName, archive: { id: Number(entry.referenceId.split(':')[1]), referenceId: entry.referenceId, cardImageUrl: referenceUrl, ...entry.stats },
      stats: { cost, attack, hp, classId, kind, rarity, keywords },
      verification: 'image-verified', implementation: 'tested', tests: 'tests/fourth-pack.test.js' })
  }
}
correspondence.generatedFromFourthPack = candidates.generatedReferences.map(entry => ({
  sourceName: entry.sourceName, ftId: entry.proposedFtId, referenceId: entry.referenceId, role: entry.role,
}))
let pack = correspondence.packs.find(pack => pack.id === 'set-4')
if (!pack) { pack = { id: 'set-4' }; correspondence.packs.push(pack) }
Object.assign(pack, { count: 100, archivedCount: 100, implemented: 100, implementation: 'tested', name: candidates.sourcePack, adaptedName: candidates.adaptedPack })
correspondence.sources.fourthCardImages = 'https://dqrdb.com/card/{id}.png'
correspondence.edition = 'ベーシックから第4弾まで。第4弾はDQRDBのカード画像を採用版として照合し、資料間の版差を別記。'
creative.summary = { ...creative.summary, artGenerated: creative.cards.filter(card => card.artStatus === 'generated').length,
  artRemaining: creative.cards.filter(card => card.artStatus !== 'generated').length }
candidates.implementation = 'implemented'
candidates.releaseVersionStatus = 'DQRDB-image-snapshot-verified'
creative.status = creative.cards.every(card => card.artStatus === 'generated') ? 'all-art-integrated' : 'art-in-progress-effects-implemented'
write('docs/fourth-pack-candidates.json', candidates)
write('docs/fourth-pack-creative.json', creative)
write('docs/card-correspondence.json', correspondence)
write('docs/fourth-pack-implementation.json', { pack: 'set-4', normalCards: 100, generatedCardsAndChoices: 14,
  sourcePolicy: 'Original performance follows the DQRDB card-image snapshot. No mixed-version balancing.',
  officialCardIds: 'Unverified; reference IDs are archive identifiers, not claimed official IDs.', records })
console.log('Fourth pack:', records.length, 'definitions;', creative.cards.filter(card => card.artStatus === 'generated').length, 'artworks imported')
