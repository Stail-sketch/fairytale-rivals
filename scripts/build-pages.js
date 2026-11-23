import { cp, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = join(root, 'dist-pages')
if (relative(root, output) !== 'dist-pages') throw new Error('Unexpected Pages build directory')
await rm(output, { recursive: true, force: true })
await cp(join(root, 'dist'), output, { recursive: true })
await cp(join(root, 'cloudflare/pages/worker.js'), join(output, '_worker.js'))
await writeFile(join(output, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }))
console.log('短い公開URL用のゲーム画面を dist-pages に生成しました。')
