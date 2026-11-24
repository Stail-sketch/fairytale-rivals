import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function cardSearchNames({ cards, generatedFromSecondPack, otherGeneratedCards, generatedFromThirdPack = [], generatedFromFourthPack = [] }) {
  const entries = cards.map(({ ftId, sourceName, sourceAliases, archive }) =>
    [ftId, [sourceName, ...(sourceAliases ?? []), archive?.sourceName].filter(Boolean)])
  for (const { sourceName, cardIds } of [...generatedFromSecondPack, ...otherGeneratedCards]) {
    for (const id of cardIds) entries.push([id, [sourceName]])
  }
  for (const { sourceName, ftId } of generatedFromThirdPack) entries.push([ftId, [sourceName]])
  for (const { sourceName, ftId } of generatedFromFourthPack) entries.push([ftId, [sourceName]])
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b))
    .map(([id, names]) => [id, [...new Set(names)]]))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const doc = JSON.parse(readFileSync(new URL('../docs/card-correspondence.json', import.meta.url), 'utf8'))
  const lines = Object.entries(cardSearchNames(doc)).map(([id, names]) =>
    '  ' + JSON.stringify(id) + ': ' + JSON.stringify(names) + ',')
  const output = new URL('../apps/web/original-card-names.js', import.meta.url)
  const module = '// Generated from docs/card-correspondence.json by scripts/sync-card-search-names.js.\n' +
    'export const originalCardNames = {\n' + lines.join('\n') + '\n}\n'
  if (!existsSync(output) || readFileSync(output, 'utf8') !== module) writeFileSync(output, module)
}
