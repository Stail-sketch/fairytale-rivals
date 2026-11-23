import { cp, mkdir, readdir, copyFile, rm } from 'node:fs/promises'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = join(root, 'dist')
const allowed = new Set(['.js', '.css', '.webp', '.ogg', '.json'])
async function copy(directory) {
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await copy(path)
    else if (allowed.has(extname(entry.name))) {
      await mkdir(dirname(join(output, path)), { recursive: true })
      await copyFile(join(root, path), join(output, path))
    }
  }
}
if (relative(root, output) !== 'dist') throw new Error('Unexpected build directory')
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp(join(root, 'apps/web/index.html'), join(output, 'index.html'))
await copy('apps/web')
for (const name of ['cards', 'engine', 'cpu', 'local-match', 'arena']) await copy('packages/' + name)
// Only these portable online modules are used by the browser. The server is never a static asset.
for (const name of ['lobby.js', 'room-snapshot.js', 'arena.js']) {
  await mkdir(join(output, 'packages/online-match'), { recursive: true })
  await copyFile(join(root, 'packages/online-match', name), join(output, 'packages/online-match', name))
}
await copyFile(join(root, 'cloudflare/_headers'), join(output, '_headers'))
console.log('Cloudflare用のゲーム画面を dist に生成しました。')
