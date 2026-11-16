import { readFile, writeFile, readdir } from 'node:fs/promises'
import { posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const scriptString = value => JSON.stringify(value).replaceAll('<', '\\u003c')
const importPattern = /(from\s+)(['"])(\.[^'"]+)\2/g

export async function standalone(afterReady = '') {
  const shell = await read('apps/web/index.html')
  let css = await read('apps/web/style.css')
  const modules = new Map()
  const entry = 'apps/web/main.js'
  const images = {}

  for (const image of await readdir(new URL('apps/web/assets/', root))) {
    if (!image.endsWith('.webp')) continue
    const bytes = await readFile(new URL('apps/web/assets/' + image, root))
    images[image] = 'data:image/webp;base64,' + bytes.toString('base64')
  }
  css = css.replaceAll('assets/arena.webp', images['arena.webp'])

  async function include(path) {
    if (modules.has(path)) return
    const source = await read(path)
    for (const [, , , spec] of source.matchAll(importPattern)) {
      await include(posix.join(posix.dirname(path), spec))
    }
    const resolved = source.replace(importPattern, (_, prefix, quote, spec) =>
      prefix + quote + '@bundle/' + posix.join(posix.dirname(path), spec) + quote)
    modules.set(path, resolved)
  }

  await include(entry)
  const bootstrap = `
    globalThis.fairytaleImages = Object.fromEntries(
      Object.entries(${scriptString(images)}).map(([name, data]) => {
        const encoded = data.slice(data.indexOf(',') + 1);
        const bytes = Uint8Array.fromBase64 ? Uint8Array.fromBase64(encoded) :
          Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
        const image = new Blob([bytes], {type: 'image/webp'});
        return [name, URL.createObjectURL(image)];
      })
    );
    const imports = {};
    for (const [path, source] of ${scriptString([...modules])}) {
      imports['@bundle/' + path] = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
    }
    const map = document.createElement('script');
    map.type = 'importmap';
    map.textContent = JSON.stringify({imports});
    document.head.append(map);
    import('@bundle/${entry}').then(async () => { ${afterReady} })
      .catch(error => {
        document.body.dataset.bootError = error.message;
        document.getElementById('app').textContent = '読み込みに失敗しました。';
      });
  `
  return shell.replace(/<link rel="stylesheet"[^>]*>/, () => '<style>' + css + '</style>')
    .replace(/<script type="module"[^>]*><\/script>/, () => '<script>' + bootstrap + '</script>')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await writeFile(new URL('play.html', root), await standalone(), 'utf8')
  console.log('play.html')
}

