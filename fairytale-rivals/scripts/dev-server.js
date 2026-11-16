import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { resolve, extname, relative, isAbsolute, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRoomApi } from '../packages/online-match/index.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.webp': 'image/webp',
}

export function createDevServer() {
  const roomApi = createRoomApi()
  return createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      if (url.pathname.startsWith('/api/')) return roomApi(req, res, url)
      const path = decodeURIComponent(url.pathname)
      const route = path === '/' ? '/apps/web/index.html' : path
      if (!route.startsWith('/apps/web/') && !route.startsWith('/packages/')) throw new Error('Not found')
      const absolute = resolve(root, '.' + route)
      const paths = ['apps/web', 'packages'].map(dir => relative(resolve(root, dir), absolute))
      const inside = paths.some(path => path && path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path))
      const mime = types[extname(absolute)]
      if (!inside || !mime || !statSync(absolute).isFile()) throw new Error('Not found')
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' })
      createReadStream(absolute).pipe(res)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found')
    }
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.FAIRYTALE_PORT ?? process.env.PORT ?? 4173)
  const host = process.env.FAIRYTALE_HOST ?? (process.env.PORT ? '0.0.0.0' : '127.0.0.1')
  createDevServer().listen(port, host, () => {
    console.log('童話戦記  http://' + host + ':' + port)
  })
}

