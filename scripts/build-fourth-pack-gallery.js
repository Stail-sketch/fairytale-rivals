import { readFileSync, writeFileSync } from 'node:fs'
import { cards } from '../packages/cards/index.js'

const root = new URL('../', import.meta.url)
const creative = JSON.parse(readFileSync(new URL('docs/fourth-pack-creative.json', root), 'utf8'))
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const suffix = '\nReference role: use the supplied existing illustration only for the character\'s opaline crystal, antler or staff-jewel and wing motifs, and the hand-painted style. Create this NEW transformed creature form in a distinct full-bleed composition, not a collage, not the human form. No frame or writing.'
for (const card of creative.cards) {
  if (card.id.includes('aul-act-') || card.id === 'token-set4-serena-dragon') {
    if (!card.prompt.endsWith(suffix)) card.prompt += suffix
    card.referenceArt = 'artwork/set-4/card-' + (card.id.includes('serena') ? 'FT-0597' : 'FT-0596') + '.png'
  }
  card.appearanceSpeciesStatus = 'assigned-from-adopted-art-direction'
}
creative.factionStatus = 'adopted-visual-theme-not-new-races'
writeFileSync(new URL('docs/fourth-pack-creative.json', root), JSON.stringify(creative, null, 2) + '\n')
const tiles = creative.cards.map(card => `<article data-search="${esc(card.id + ' ' + card.name + ' ' + card.sourceName)}">
<a href="card-${card.id}.png"><img src="../../apps/web/assets/card-${card.id}.webp" alt="${esc(card.name)}" loading="lazy"></a>
<div><small>${esc(card.id)} · ${cards[card.id].cost} MP</small><h2>${esc(card.name)}</h2><p>${esc(cards[card.id].description)}</p></div></article>`).join('\n')
const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>刻印に集う、おとぎの一族 · 原画114枚</title>
<style>body{margin:0;background:#0c1722;color:#f6eedf;font:15px/1.7 system-ui,sans-serif}main{max-width:1400px;padding:32px;margin:auto}h1{font-family:serif;color:#f0ce87}header p{max-width:800px;color:#c4cdd7}input{box-sizing:border-box;width:100%;background:#192a3d;border:1px solid #a28450;color:white;padding:14px;font:inherit;margin:16px 0 28px;border-radius:8px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}article{border:1px solid #76613c;border-radius:12px;overflow:hidden;background:#152333}img{width:100%;aspect-ratio:1;object-fit:cover;display:block}article>div{padding:18px}h2{font:600 20px/1.4 serif;margin:6px 0 12px}small{color:#dcbf7d}p{margin:0}a{color:#dcbf7d}[hidden]{display:none!important}@media(max-width:900px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:18px}}@media(max-width:550px){.grid{grid-template-columns:1fr}}</style>
<main><header><small>童話戦記 · 第4弾</small><h1>刻印に集う、おとぎの一族</h1><p>通常100種類＋生成・選択14種類。114枚をそれぞれ制作し、ゲームへ組み込みました。画像を押すと原画を開けます。</p>
<p><a href="../../docs/fourth-pack-release.md">実装と検証の記録</a> · <a href="../../docs/fourth-pack-creative.json">全生成プロンプト・画像ハッシュ</a></p><input id="filter" type="search" aria-label="カード名・原作名・IDで検索" placeholder="カード名・原作名・IDで検索"></header><section class="grid">${tiles}</section></main>
<script>document.querySelector('#filter').addEventListener('input',event=>{const q=event.target.value.trim().toLocaleLowerCase();document.querySelectorAll('article').forEach(tile=>{tile.hidden=!tile.dataset.search.toLocaleLowerCase().includes(q)})})</script></html>`
writeFileSync(new URL('artwork/set-4/index.html', root), html)
const rows = creative.cards.map(card => `| ${card.id} | ${card.name} | ${card.sourceName} | ${cards[card.id].cost} | 制作・組込済み |`).join('\n')
writeFileSync(new URL('docs/fourth-pack-names-and-art.md', root), `# 第4弾・名称と専用画像114件\n\n通常100種類＋生成・選択14種類を実装し、各画像を制作・組み込み。\n\n[画像一覧](../artwork/set-4/index.html) · [生成プロンプト](fourth-pack-creative.json) · [実装・検証](fourth-pack-release.md)\n\n| ID | 童話戦記名 | 対応元（開発資料） | MP | 画像 |\n| --- | --- | --- | --- | --- |\n${rows}\n`)
console.log('114 artworks: gallery and card-name table updated')
