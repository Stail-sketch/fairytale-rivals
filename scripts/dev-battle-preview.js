import { createDevServer } from './dev-server.js'
const port = Number(process.env.FAIRYTALE_PREVIEW_PORT ?? 4185)
const server = createDevServer()
server.once('error', error => { console.error(error.code === 'EADDRINUSE' ? `ポート${port}は使用中です。既に開いているプレビューを確認してください。` : error.message); process.exitCode = 1 })
server.listen(port, '127.0.0.1', () => {
  console.log(`2.5D試遊盤面: http://127.0.0.1:${port}/?battlePreview=depth&demo=1`)
  console.log(`通常のCPU戦: http://127.0.0.1:${port}/?battlePreview=depth`)
  console.log('終了するときは Ctrl+C。公開・アップロードは行いません。')
})
