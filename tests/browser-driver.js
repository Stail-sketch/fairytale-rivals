import { access, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { join } from 'node:path'
import assert from 'node:assert/strict'

async function executable() {
  const candidates = [
    process.env.FAIRYTALE_BROWSER,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean)
  for (const path of candidates) {
    try { await access(path); return path } catch { /* Try next browser. */ }
  }
  throw new Error('Chrome または Edge のパスを FAIRYTALE_BROWSER で指定してください')
}

export async function eventually(read, description) {
  const deadline = Date.now() + 9000
  do {
    const result = await read()
    if (result) return result
    await new Promise(resolve => setTimeout(resolve, 40))
  } while (Date.now() < deadline)
  assert.fail(description)
}

export async function browserControl(t, directory) {
  const chrome = spawn(await executable(), [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--noerrdialogs', '--disable-background-networking', '--remote-debugging-port=0', '--user-data-dir=' + directory,
  ], { stdio: 'ignore', windowsHide: true })
  const exited = once(chrome, 'exit')
  t.after(async () => { chrome.kill(); await exited })
  const activePort = await eventually(() => readFile(join(directory, 'DevToolsActivePort'), 'utf8').catch(() => null), 'Chromiumの起動')
  const [port, path] = activePort.trim().split(/\r?\n/)
  const socket = new WebSocket('ws://127.0.0.1:' + port + path)
  await once(socket, 'open')
  const pending = new Map()
  let sequence = 0
  socket.addEventListener('message', event => {
    const response = JSON.parse(event.data)
    if (!pending.has(response.id)) return
    const { resolve, reject } = pending.get(response.id)
    pending.delete(response.id)
    if (response.error) reject(new Error(response.error.message))
    else resolve(response.result)
  })
  socket.addEventListener('close', () => {
    for (const { reject } of pending.values()) reject(new Error('Chromiumとの接続が終了しました'))
    pending.clear()
  })
  t.after(() => socket.close())
  function command(method, params, sessionId) {
    const id = ++sequence
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params, sessionId }))
    })
  }
  return async () => {
    const { browserContextId } = await command('Target.createBrowserContext', {})
    const { targetId } = await command('Target.createTarget', { url: 'about:blank', browserContextId })
    const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true })
    async function evaluate(expression) {
      const data = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
      if (data.exceptionDetails) throw new Error(data.exceptionDetails.exception?.description ?? data.exceptionDetails.text)
      return data.result.value
    }
    const wait = selector => eventually(() => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), selector)
    return {
      evaluate, wait,
      async capture(path) {
        const { data } = await command('Page.captureScreenshot', { format: 'png' }, sessionId)
        await writeFile(path, Buffer.from(data, 'base64'))
      },
      viewport: (width, height) => command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId),
      navigate: url => command('Page.navigate', { url }, sessionId),
      async click(selector) {
        await wait(selector)
        await evaluate(`document.querySelector(${JSON.stringify(selector)})?.click()`)
      },
    }
  }
}
