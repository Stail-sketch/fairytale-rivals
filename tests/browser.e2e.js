import { access, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { promisify } from 'node:util'
import assert from 'node:assert/strict'
import test from 'node:test'
import { standalone } from '../scripts/build.js'
import { createDevServer } from '../scripts/dev-server.js'
import { catalog } from '../packages/cards/index.js'
import { starterLineup } from '../packages/cards/decks.js'
import { exampleRivalsDeck } from '../apps/web/rivals-example.js'

const run = promisify(execFile)

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

async function driveBattle() {
  document.body.dataset.e2e = 'running'
  window.addEventListener('error', event => { document.body.dataset.runtimeError = event.message })
  function expect(condition, message) {
    if (!condition) throw new Error(message)
  }
  const query = selector => document.querySelector(selector)
  const pending = new Map()
  let timerId = 0
  globalThis.setTimeout = callback => {
    pending.set(++timerId, callback)
    return timerId
  }
  globalThis.clearTimeout = id => pending.delete(id)
  function advanceTimer() {
    const [timer, callback] = pending.entries().next().value ?? []
    expect(callback, '次の行動が予約される')
    pending.delete(timer)
    callback()
  }
  function completePresentation() {
    let beats = 0
    while (query('.battle-presentation')) {
      expect(++beats <= 3, '演出が自動で終わる')
      advanceTimer()
    }
  }
  const click = (selector, settle = true) => {
    const node = query(selector)
    expect(node && !node.disabled, '押せない: ' + selector)
    node.click()
    if (settle) completePresentation()
  }
  const drag = (source, destination, settle = true) => {
    const origin = query(source)
    expect(origin?.draggable, 'ドラッグできない: ' + source)
    const transfer = new DataTransfer()
    const send = (event, node) => node.dispatchEvent(new DragEvent(event, {
      bubbles: true, cancelable: true, dataTransfer: transfer,
    }))
    send('dragstart', origin)
    const target = query(destination)
    expect(target?.classList.contains('targetable'), 'ドラッグの合法先の表示')
    expect(!send('dragover', target), 'ドロップを許可する')
    send('drop', target)
    send('dragend', origin)
    if (settle) completePresentation()
  }
  const end = '[data-op=end]'
  const endDialog = '#end-turn-dialog[open]'
  const endTurn = (expectedConfirmation = null) => {
    click(end)
    const confirming = Boolean(query(endDialog))
    if (expectedConfirmation !== null) expect(confirming === expectedConfirmation, '残っている行動に応じて終了確認を出す')
    if (confirming) click(endDialog + ' [value=end]')
  }
  const next = (expectedConfirmation = null) => {
    const currentHand = [...document.querySelectorAll('[data-hand]')].map(card => card.dataset.hand)
    endTurn(expectedConfirmation)
    if (query('.result')) return
    expect(query('.battle') && !query('[data-op=ready]'), 'ターン終了ですぐ次の手番に進む')
    expect(currentHand.every(id => !query('[data-hand="' + id + '"]')), '前のプレイヤーの手札は表示されない')
  }
  try {
    const { cards, catalog, leaders } = await import('@bundle/packages/cards/index.js')
    const sources = catalog.map(({ artId }) => globalThis.fairytaleImages[artId + '.webp'])
    expect(sources.every(Boolean) && new Set(sources).size === catalog.length, '全カードに異なる画像がある')
    click('[data-op=library]')
    expect(document.querySelectorAll('[data-library-card]').length === catalog.length, 'ライブラリで全カードを見られる')
    const search = query('[data-library-filter=query]')
    search.value = '銀甲'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    const matchingArt = catalog.filter(card => [card.name, card.description].some(value => value.includes('銀甲')))
    expect(query('#catalog-count').textContent === matchingArt.length + '件' &&
      query('[data-library-card="FT-0012"]'), 'キーワードで検索')
    click('[data-library-card="FT-0012"]')
    expect(query('.catalog-effect').textContent.includes('鋼の身'), 'カード詳細に能力を表示')
    const metalBody = '#catalog-detail [data-term=METAL_BODY]'
    query(metalBody).focus()
    click(metalBody)
    expect(query('.term-dialog[open] h2')?.textContent === '鋼の身', 'ライブラリのカード詳細で用語説明を開く')
    click('.term-dialog button')
    expect(document.activeElement === query(metalBody), '用語説明を閉じると元のリンクに戻る')
    search.value = ''
    search.dispatchEvent(new Event('input', { bubbles: true }))
    const filter = (key, value) => {
      const field = query('[data-library-filter="' + key + '"]')
      field.value = value
      field.dispatchEvent(new Event('change', { bubbles: true }))
    }
    filter('job', 'fighter')
    filter('kind', 'spell')
    filter('source', 'generated')
    expect(query('#catalog-count').textContent === '3件', '職業・種類・収録の絞り込みを組み合わせられる')
    click('[data-library-card="token-kick"]')
    expect(query('#catalog-detail').textContent.includes('赤ずきんの型'), '生成カードの入手元を表示')
    filter('job', '')
    filter('kind', '')
    for (const [source, count] of [['basic', 86], ['standard', 287], ['set-2', 100], ['set-3', 100], ['set-4', 100]]) {
      filter('source', source)
      expect(query('#catalog-count').textContent === count + '件', 'パック別の絞り込み ' + source)
    }
    filter('source', '')
    const shownCards = () => [...document.querySelectorAll('[data-library-card]')].map(button => cards[button.dataset.libraryCard])
    for (const rarity of ['common', 'rare', 'superRare', 'legendary', 'unlabeled']) {
      filter('rarity', rarity)
      const shown = shownCards()
      expect(shown.length === catalog.filter(card => card.rarity === rarity).length &&
        shown.every(card => card.rarity === rarity), 'レアリティの絞り込み ' + rarity)
    }
    filter('rarity', '')
    expect(shownCards().length === catalog.length, 'レアリティの絞り込み解除')
    for (const name of ['メラミ', 'ﾒﾗﾐ', 'めらみ']) {
      search.value = name
      search.dispatchEvent(new Event('input', { bubbles: true }))
      expect(shownCards().map(card => card.id).join() === 'FT-0001', '原作名を別の入力表記で検索 ' + name)
      expect(query('#catalog-detail h2').textContent === cards['FT-0001'].name, '対応カードの詳細を表示')
    }
    search.value = '魔力開放'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    expect(shownCards().map(card => card.id).join() === 'FT-0008', '原作の別表記を検索')
    search.value = 'ネルゲルの配下'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    expect(shownCards().map(card => card.id).join() === 'token-dusk-guard,token-dusk-guard-large',
      '同じ原作名を持つ生成カードは両方表示')
    filter('source', 'set-2')
    filter('rarity', 'rare')
    filter('job', 'neutral')
    filter('kind', 'unit')
    search.value = 'うみぼうず'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    expect(shownCards().map(card => card.id).join() === 'FT-0048', '原作名とレアリティ・収録・職業・種類を併用')
    filter('source', 'set-3')
    filter('rarity', 'legendary')
    search.value = 'ラーミア'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    expect(shownCards().map(card => card.id).join() === 'FT-0491', '第3弾を原作名とレアリティで検索')
    const orbs = [...query('#catalog-detail').querySelectorAll('.related-card')]
    expect(orbs.length === 6 && orbs.some(node => node.textContent.includes('朱の種晶')),
      '検索対象の外でも6色の種晶の詳細を表示する')
    filter('source', 'generated')
    filter('rarity', 'superRare')
    filter('kind', 'spell')
    search.value = 'レッドオーブ'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    expect(shownCards().map(card => card.id).join() === 'token-orb-red', '第3弾生成カードを原作名で検索')
    for (const key of ['source', 'rarity', 'kind', 'job']) filter(key, '')
    search.value = '箱呼びの縞猫'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    expect(query('#catalog-detail .related-card strong')?.textContent === cards['FT-0203'].name,
      '舞台を使う条件付き召喚の関連カードを表示する')
    click('#catalog-detail [data-term=treasure]')
    expect(query('.term-dialog[open] h2')?.textContent === '秘宝箱', '舞台の用語説明を開く')
    click('.term-dialog button')
    search.value = '土冠の掘り王'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    click('#catalog-detail .related-card [data-term=SKILL_BOOST]')
    expect(query('.term-dialog[open] h2')?.textContent === '覚醒', '関連カードの効果文からも用語説明を開く')
    click('.term-dialog button')
    search.value = 'しんりゅう'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    expect(shownCards().map(card => card.id).join() === 'FT-0664', '第4弾の原作名で検索できる')
    expect(query('#catalog-detail').querySelectorAll('.related-card').length === 4, '4つの願いの説明を確認できる')
    search.value = 'からくりエッグ'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    click('#catalog-detail [data-term=STORY_BADGE]')
    expect(query('.term-dialog[open] h2')?.textContent === '物語の刻印', '刻印の用語ポップアップを開ける')
    click('.term-dialog button')
    search.value = 'グレイナル'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    expect(query('#catalog-detail .related-card').textContent.includes('黎明竜の守護装具'), '奥義を変える関連カードを確認できる')
    click('[data-library-tab=skills]')
    expect(document.querySelectorAll('.catalog-skill').length === 7, '7人の奥義一覧が表示される')
    expect(query('.catalog-skill .related-cards')?.textContent.includes('紅葉の一打'), '奥義一覧で生成するカードを確認できる')
    click('.catalog-skill [data-term=PIERCE]')
    expect(query('.term-dialog[open] h2')?.textContent === '穿ちの一撃', '奥義一覧からも用語説明を開ける')
    click('.term-dialog button')
    click('[data-op=close-library]')
    const random = crypto.getRandomValues.bind(crypto)
    const useBattleSeed = seed => {
      crypto.getRandomValues = output => {
        if (!(output instanceof Uint32Array) || output.length !== 1) return random(output)
        output[0] = seed
        return output
      }
    }
    useBattleSeed(87)
    expect(document.querySelectorAll('#leader-0 option').length === 7, '7人から選択')
    const firstLeader = query('#leader-0')
    firstLeader.value = 'seer'
    firstLeader.dispatchEvent(new Event('change', { bubbles: true }))
    expect(query('#leader-0').value === 'seer', 'リーダー選択が反映')
    click('[data-op=rules]')
    expect(query('dialog').open, 'ルールを開く')
    click('[data-op=close-rules]')
    click('[data-mode=local]')
    const secondLeader = query('#leader-1')
    secondLeader.value = 'mage'
    secondLeader.dispatchEvent(new Event('change', { bubbles: true }))
    click('[data-op=start]')
    expect(document.querySelectorAll('[data-replace].initial-deal').length === 3, '初期手札を1枚ずつ配る')
    click('[data-replace]')
    expect(query('[data-replace][aria-pressed=true]'), '交換カードの選択')
    click('[data-replace][aria-pressed=true]')
    click('[data-op=mulligan]')
    expect(document.querySelectorAll('[data-replace]').length === 4, '先攻の確定で後攻の手札交換を開く')
    click('[data-op=mulligan]')
    expect(document.querySelectorAll('[data-slot]').length === 12, '後攻の確定で双方6マスの対戦画面を開く')
    expect(query('[data-mp="0"].mp-refresh') && query('.just-drawn') && query('[data-side="0"].active-side'),
      'MP回復、ドロー、手番表示を同期する')
    const focusButton = query('[data-op=focus]')
    expect(focusButton.querySelector('img').src === globalThis.fairytaleImages['action-focus.webp'] &&
      focusButton.getBoundingClientRect().height >= 50, '熱量をためる操作に大きな専用イラストを表示する')
    expect(query('[data-op=skill] img').src === globalThis.fairytaleImages['action-skill-seer.webp'],
      '現在のリーダーの奥義に専用イラストを表示する')
    click(end)
    expect(query(endDialog + ' h2')?.textContent === 'まだ行動できます' &&
      query('#end-turn-options').textContent.includes('熱量をためる'), '残っている行動を確認画面に表示する')
    expect(document.activeElement === query(endDialog + ' [value=cancel]'), '続ける側に初期フォーカスを置く')
    click(endDialog + ' [value=cancel]')
    expect(!query(endDialog) && query('[data-side="0"].active-side'), 'キャンセルすると手番を保つ')
    click('[data-op=motion]')
    expect(query('.battle.short-motion') && query('[data-op=motion][aria-pressed=true]'), '短い演出を選べる')
    click('[data-op=motion]')
    click('[data-op=sound]')
    expect(query('[data-op=sound][aria-pressed=false]'), '効果音をオフにできる')
    click('[data-op=audio-mixer]')
    const musicVolume = query('[data-volume=bgm]')
    musicVolume.value = '17'
    musicVolume.dispatchEvent(new Event('input', { bubbles: true }))
    expect(query('[data-volume-value=bgm]').value === '17%' &&
      query('[data-volume=se]').value === '0', 'BGM音量と消音したSEを別々に調整できる')
    const audioBounds = query('#audio-mixer').getBoundingClientRect()
    expect(audioBounds.right <= query('.top-actions').getBoundingClientRect().left &&
      audioBounds.bottom <= query('.battle-heading').getBoundingClientRect().top &&
      audioBounds.bottom <= query('#detail').getBoundingClientRect().top,
      'PC幅で音量欄が対戦ボタンと右のカード詳細に重ならない')
    musicVolume.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(query('#audio-mixer').hidden && document.activeElement === query('[data-op=audio-mixer]'),
      'Escapeキーで音量欄を閉じて音量ボタンに戻れる')
    const x = selector => query(selector).getBoundingClientRect().x
    const y = selector => query(selector).getBoundingClientRect().y
    expect(x('[data-leader="0"]') < x('[data-slot="0:back:0"]')
      && x('[data-slot="0:back:0"]') < x('[data-slot="0:front:0"]')
      && x('[data-slot="0:front:0"]') < x('[data-slot="1:front:0"]')
      && x('[data-slot="1:front:0"]') < x('[data-slot="1:back:0"]')
      && x('[data-slot="1:back:0"]') < x('[data-leader="1"]'), '左右のリーダーと中央で向き合う前衛')
    expect(y('[data-slot="0:front:0"]') === y('[data-slot="1:front:0"]')
      && y('[data-slot="0:front:0"]') < y('[data-slot="0:front:1"]'), '同列のマスが水平に揃う')
    expect(y('.hand') > y('.board'), '盤面の下に手札')
    click('.battle-log summary')
    expect(query('.battle-log').open, '対戦記録を開く')
    click('.battle-log summary')
    const summon = '[data-hand][data-card=ember-whelp]'
    query(summon).dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    expect(query('#detail .inspector-copy h2')?.textContent === cards['ember-whelp'].name &&
      query('#detail .inspector-effect')?.textContent === cards['ember-whelp'].description &&
      query('#detail .inspector-keyword')?.textContent.includes('奇襲'), 'マウスオーバーで効果と能力の説明を表示')
    query(summon).dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: query('#detail') }))
    click('#detail [data-term=CHARGE]')
    expect(query('.term-dialog[open] h2')?.textContent === '奇襲', 'カードから詳細欄へ移って用語を確認')
    click('.term-dialog button')
    query('[data-inspect-skill="1"]').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    expect(query('#detail h2')?.textContent === leaders.mage.skill.name &&
      query('#detail .skill-target-label').textContent.includes('敵ユニット1体') &&
      query('#detail .power-details').textContent.includes('3'), '相手の奥義の名前・対象・威力を事前に確認')
    const middle = query('.board').getBoundingClientRect()
    expect(Math.abs(middle.x + middle.width / 2 - document.documentElement.clientWidth / 2) < 2,
      '詳細欄を出しても戦場の中央を維持')
    const square = '[data-slot="0:front:0"]'
    const whelpArt = query(summon + ' img').src
    expect(whelpArt === globalThis.fairytaleImages['card-ember-whelp.webp'], '手札に火花の仔竜の専用画像')
    query(summon).dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 3, isPrimary: true, bubbles: true }))
    advanceTimer()
    expect(query('.battle-card-dialog[open] h2')?.textContent === cards['ember-whelp'].name, '手札の長押しでカード詳細を開ける')
    query(summon).dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 3, isPrimary: true, bubbles: true }))
    click('.battle-card-dialog .detail-dialog-actions button')
    drag(summon, square, false)
    const whelpReveal = '[data-beat=reveal] [data-reveal-card=ember-whelp]'
    expect(query(whelpReveal + ' img')?.src === whelpArt && query(whelpReveal + ' figcaption').textContent === cards['ember-whelp'].name,
      '使用したカードの名前とイラストを中央に表示')
    const boardBounds = query('.battle-grid').getBoundingClientRect()
    const revealBounds = query(whelpReveal).getBoundingClientRect()
    expect(Math.abs(boardBounds.left + boardBounds.width / 2 - revealBounds.left - revealBounds.width / 2) <= 1,
      'カードは盤面の中央に置かれる')
    expect(query(square + '.empty') && query('[data-op=end]').disabled, '表示中は次の行動を受け付けない')
    advanceTimer()
    expect(query('[data-beat=approach] .battle-reveal.reveal-travel') && query(square + '.effect-destination'),
      'カードが召喚先へ移動し、召喚先が光る')
    completePresentation()
    expect(query(square + '.ready'), '召喚と奇襲')
    expect(query('[data-impact-style=summon]'), 'カードがマスに着地したフレームで召喚の光を出す')
    expect(query(square + ' img').src === whelpArt, '手札と盤面で同じカードの画像を表示')
    expect(/MP\s*0\/1/.test(query('.leader-panel:not(.opponent) .resources').textContent), '召喚でMPを消費')
    click(end)
    expect(query(endDialog) && query('#end-turn-options').textContent.includes('攻撃'), 'MPがなくても攻撃できるなら確認する')
    click(endDialog + ' [value=cancel]')
    click('.battle-log summary')
    click('[data-log-card=ember-whelp]')
    expect(query('.battle-card-dialog[open] h2')?.textContent === cards['ember-whelp'].name &&
      query('.battle-card-dialog img').src === whelpArt &&
      query('.battle-card-dialog p').textContent === cards['ember-whelp'].description, '対戦記録からカードの絵と能力を見返す')
    click('.battle-card-dialog .detail-dialog-actions button')
    expect(!query('.battle-card-dialog[open]') && query('.battle-log').open, 'プレビュー後も対戦記録に戻れる')
    click('.battle-log summary')
    query(square).focus()
    query(square).dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }))
    expect(query('.battle-card-dialog[open] .card-current-stats')?.textContent.includes('HP'), '盤面のカードの現在値と能力を見る')
    click('.battle-card-dialog .detail-dialog-actions button')
    click(square)
    query('[data-leader="1"]').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    expect(query('#attack-preview').textContent.includes('2 ダメージ') && query('#attack-preview').textContent.includes('HP 23'),
      '攻撃を実行する前に戦闘の結果が見える')
    drag(square, '[data-leader="1"]', false)
    expect(query('.effect-path.effect-strike[data-strike-style=blow]') && query(square + '.attack-approach') &&
      query('[data-leader="1"] .leader-hp').textContent === '25', '攻撃元が動き始めるまでHPを維持する')
    completePresentation()
    expect(query('[data-impact-style=blow]') && query('[data-leader="1"] .delta')?.textContent === '−2' &&
      query('[data-leader="1"] .leader-hp').textContent === '23', '打撃・ダメージ数字・HP減少が同じタイミングで出る')
    expect(!query(square + '.ready'), '攻撃済み')
    next(false)
    expect(x('[data-leader="1"]') < x('[data-leader="0"]'), '交代すると操作側が左に回る')
    expect(document.querySelectorAll('[data-hand]').length === 5, 'ドローした手札をすぐ使える')
    expect(query('.board .turn-notice').textContent === '後攻のターン' && query('.battle-message').textContent === '',
      '手番交代を盤面で知らせ、対戦中のメッセージ欄は占有しない')
    expect(query('#skill-description').textContent === leaders.mage.skill.description &&
      y('#skill-description') > y('[data-op=skill]'), '能力文を奥義ボタンの下に常時表示')
    expect(query('[data-op=skill] img').src === globalThis.fairytaleImages['action-skill-mage.webp'],
      '手番交代で奥義イラストも切り替わる')
    click('[data-op=focus]')
    expect(document.querySelectorAll('.leader-panel:not(.opponent) .filled').length === 3, '熱量が上昇')
    click('[data-op=skill]')
    query(square).dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    expect(query('#attack-preview').textContent.includes('ダメージ見込み 3'), '対象に奥義が与えるダメージを予告')
    click(square, false)
    expect(query('[data-beat=reveal] .skill-reveal strong')?.textContent === leaders.mage.skill.name, '奥義名を中央に表示')
    expect(query('[data-skill-motif=mirror] .skill-ornament'), 'アリスの奥義で鏡が出る')
    advanceTimer()
    expect(query('[data-leader="1"].effect-origin') && query(square + '.effect-destination.effect-damage[data-unit]') &&
      query('.effect-path.effect-damage') && query('.skill-projectile'), 'ダメージ反映前に鏡から対象へ火球が飛ぶ')
    completePresentation()
    expect(!query(square + '[data-unit]') && query(square + ' .delta') && query('[data-skill-impact=mirror]'),
      '魔法の着弾と奥義のダメージを表示して相手ユニットが退場')
    next()

    // Seat 0 continues playing cheap units and attacking while Seat 1 passes.
    let finishingBlowSeen = false
    for (let round = 0; round < 22 && !query('.result'); round++) {
      for (const id of ['ember-whelp', 'moon-hare', 'twig-guard', 'brass-squire', 'lake-scout',
        'twin-fox', 'needle-knight', 'thorn-owl', 'honey-bear', 'night-dragon', 'dawn-deer', 'choir-siren']) {
        if (!query('[data-slot^="0:"].empty')) break
        const hand = '[data-hand][data-card="' + id + '"]:not(.unaffordable)'
        if (!query(hand)) continue
        click(hand)
        click('[data-slot^="0:"].targetable')
      }
      let attacks = 0
      while (query('[data-slot^="0:"].ready') && !query('.result')) {
        expect(++attacks <= 12, '合法な攻撃回数')
        click('[data-slot^="0:"].ready')
        click('[data-leader="1"].targetable', false)
        advanceTimer()
        if (query('[data-beat=finish]')) {
          expect(query('.finish-reveal')?.textContent === '決着' && query('[data-leader="1"] .leader-hp').textContent === '0',
            '最後のダメージを盤面に反映し、決着演出を表示')
          finishingBlowSeen = true
        }
        completePresentation()
      }
      if (!query('.result')) { next(); next() }
    }
    expect(finishingBlowSeen, '勝敗表示の前に決着演出が出る')
    expect(query('.result h1')?.textContent === '先攻の勝利', '勝敗結果が表示される')
    expect(query('.decisive-play')?.textContent.includes('決着の一手'), '結果画面で決着の一手を振り返る')
    click('.result .battle-log summary')
    expect(query('.result [data-log-card]'), '対戦終了後もカードを見返せる')
    expect(query('[data-op=replay]'), '対戦ログ保存ボタン')
    click('.result [data-op=home]')
    click('[data-mode=cpu]')
    const setLeader = (seat, id) => {
      const selector = query('#leader-' + seat)
      selector.value = id
      selector.dispatchEvent(new Event('change', { bubbles: true }))
    }
    setLeader(0, 'mage')
    setLeader(1, 'swordsman')
    click('[data-op=start]')
    click('[data-op=mulligan]')
    expect(query('.battle') && !query('[data-replace]'), 'CPUの手札交換が自動で進む')
    expect(query('[data-op=sound][aria-pressed=false]'), '効果音設定を次の対戦でも保持する')
    expect(query('[data-volume=bgm]').value === '17', 'BGM音量を次の対戦でも保持する')
    click('[data-op=sound]')
    const incoming = query('.board .turn-notice[data-direction=incoming]')
    const board = query('.board').getBoundingClientRect()
    const notice = incoming?.getBoundingClientRect()
    expect(incoming?.textContent === 'あなたのターン' &&
      Math.abs(notice.left + notice.width / 2 - (board.left + board.width / 2)) < 2 &&
      Math.abs(notice.top + notice.height / 2 - (board.top + board.height / 2)) < 2 &&
      parseFloat(getComputedStyle(incoming).fontSize) >= 30 && getComputedStyle(incoming).pointerEvents === 'none',
      '自分の手番を盤面中央に大きく表示し、操作を遮らない')
    let cpuActionSeen = false
    let cpuRevealSeen = false
    for (let i = 0; i < 65 && !query('.result'); i++) {
      endTurn()
      if (query('.result')) break
      expect(query('[data-op=end]').disabled && query('.selection-bar span').textContent === 'CPUが行動中', 'CPU中の操作をロック')
      expect(query('.ally-formation [data-slot^="0:"]'), 'CPUターンも自分の盤面が左')
      if (i === 0) {
        const outgoing = query('.board .turn-notice[data-direction=outgoing]')
        const rect = outgoing?.getBoundingClientRect()
        expect(outgoing?.textContent === '相手のターン' &&
          Math.abs(rect.top + rect.height / 2 - (board.top + board.height / 2)) < 2 &&
          getComputedStyle(outgoing).animationDuration === '1.7s', '相手の手番を盤面中央に長めに表示する')
        const hand = query('[data-hand][aria-haspopup=dialog]')
        const card = cards[hand.dataset.card]
        hand.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
        expect(query('#detail .inspector-effect')?.textContent === card.description, 'CPUの手番でもホバーで手札の効果を確認できる')
        click('[data-hand][aria-haspopup=dialog]')
        expect(query('.battle-card-dialog[open] p')?.textContent === card.description, 'CPUの手番でもクリックで手札の詳細を開ける')
        click('.battle-card-dialog .detail-dialog-actions button')
      }
      let steps = 0
      while (query('[data-op=end]')?.disabled) {
        expect(++steps < 120, 'CPUが自動で手番を返す')
        advanceTimer()
        if (!cpuRevealSeen && query('[data-beat=reveal] [data-reveal-card]')) {
          cpuRevealSeen = true
          const hand = query('[data-hand]')
          hand.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
          expect(query('.battle-card-dialog[open] h2')?.textContent === cards[hand.dataset.card].name,
            'CPUのカード演出中も手札の詳細を開ける')
          click('.battle-card-dialog .detail-dialog-actions button', false)
        }
        if (query('.enemy-formation [data-unit]')) cpuActionSeen = true
      }
      if (i === 0) expect(query('.turn-notice[data-direction=incoming]')?.textContent === 'あなたのターン',
        'CPUから手番が戻ったときに知らせる')
    }
    expect(cpuActionSeen && cpuRevealSeen, 'CPUも使用カードを見せてからユニットを召喚する')
    expect(query('.result h1')?.textContent === 'CPUの勝利', 'CPUが実際に対戦を終わらせる')
    click('.result [data-op=home]')
    click('[data-mode=local]')
    setLeader(0, 'warrior')
    click('[data-op=start]')
    click('[data-op=mulligan]')
    click('[data-op=mulligan]')
    for (let i = 0; i < 2; i++) {
      click('[data-op=focus]')
      next()
      next()
    }
    click('[data-op=focus]')
    expect(query('[data-op=skill]').textContent.includes('金剣の雷光'), 'レオンの奥義名を表示')
    click('[data-op=skill]')
    expect(query('[data-leader="0"].ready'), '奥義でリーダー攻撃が可能になる')
    click('[data-leader="0"]')
    expect(query('#detail .power-details').textContent.includes('0 ＋3 ＝ 3') &&
      query('#detail .power-sources').textContent.includes('語り手の奥義'), '基本攻撃力と奥義で増えた攻撃力を別々に表示')
    expect(query('[data-leader="1"].targetable'), 'リーダー攻撃の対象を表示')
    click('[data-leader="1"]')
    expect(query('[data-leader="1"] .leader-hp').textContent === '22', 'リーダー攻撃で3ダメージ')
    expect(!query('[data-leader="0"].ready'), 'リーダーは1ターンに1回攻撃する')

    window.confirm = () => true
    click('[data-op=home]')
    click('[data-mode=cpu]')
    setLeader(0, 'mage')
    const { deckStorageKey, createDeckCollection, starterLineup } = await import('@bundle/packages/cards/decks.js')
    const storage = {
      keys: () => Object.keys(localStorage),
      getItem: key => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: key => localStorage.removeItem(key),
    }
    const collection = createDeckCollection(storage)
    const legacy = starterLineup('mage').deck
    localStorage.setItem(deckStorageKey + '.mage', JSON.stringify(legacy))
    click('[data-op=decks]')
    const { initialDecks } = await import('@bundle/packages/cards/initial-decks.js')
    expect(initialDecks.length === 9 && initialDecks.every(deck => collection.get(deck.id)?.name === deck.name),
      '名前を変えずに全7職業の初期デッキを登録する')
    expect(!collection.list().some(deck => deck.name === 'おおぞらはおまえのもの'), '旧テストデッキを再登録しない')
    for (const deck of initialDecks) collection.remove(deck.id)
    const { exampleRivalsDeck } = await import('@bundle/apps/web/rivals-example.js')
    const example = collection.save(exampleRivalsDeck).deck
    click('[data-op=close-decks]')
    click('[data-op=decks]')
    const exampleOverview = '[data-deck-overview="' + example.id + '"]'
    click(exampleOverview)
    const overview = query('.deck-overview[open]')
    expect(overview.querySelector('h2').textContent === example.name, 'デッキ名を全体画面に表示')
    const allSlots = [...overview.querySelectorAll('[data-overview-card]')]
    const rows = new Set(allSlots.map(tile => tile.offsetTop))
    expect(allSlots.length === 30 && rows.size === 3 && allSlots[0].offsetTop === allSlots[9].offsetTop &&
      allSlots[10].offsetTop > allSlots[9].offsetTop, '30枚を横10×縦3に並べる')
    expect(allSlots.filter(tile => tile.dataset.overviewCard === 'FT-0478').length === 2, '同じカードを1枚ずつ表示')
    expect(overview.querySelector('[data-cost-group="1"]').dataset.amount === '17' &&
      overview.querySelector('[data-type-amount=unit]').textContent === '28枚' &&
      overview.querySelector('[data-type-amount=spell]').textContent === '2枚', 'MP別と種別の枚数が正しい')
    click('[data-overview-card=FT-0491]')
    expect(query('.deck-overview-detail h3').textContent === cards['FT-0491'].name &&
      query('.deck-overview-detail p').textContent === cards['FT-0491'].description, '全体画面でカードの効果を確認できる')
    expect(query('.deck-overview-detail .related-cards')?.textContent.includes('朱の種晶'), 'デッキ全体表示で関連カードを見る')
    click('.deck-overview button[type=submit]')
    expect(!query('.deck-overview[open]') && document.activeElement === query(exampleOverview), '閉じると開いたデッキの一覧に戻る')
    click('[data-deck-delete="' + example.id + '"]')
    expect(!collection.get(example.id), 'テストデッキも通常のデッキと同様に削除できる')
    expect(query('[data-deck-open=legacy-mage]')?.textContent.includes('夢時計の魔法'), '旧デッキを一覧に引き継ぐ')
    click('[data-op=new-deck]')
    expect(document.querySelectorAll('[data-deck-class]').length === 7, '新規作成から7クラスを選べる')
    click('[data-deck-class=mage]')
    expect(query('#deck-size').textContent === '0 / 30枚', '新規デッキを空から始める')
    const renameDeck = name => {
      const field = query('#deck-name')
      field.value = name
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    renameDeck('星降る夜')
    click('[data-op=seed-deck]')
    const deckTerm = query('.deck-card-effect [data-term=CHARGE]')
    expect(deckTerm, 'デッキ編集中もカードの用語をリンクにする')
    deckTerm.click()
    expect(query('.term-dialog[open] h2')?.textContent === '奇襲', 'デッキ編集から用語を確認')
    click('.term-dialog button')
    expect(query('#deck-size').textContent === '30 / 30枚', 'クラスの構築済みデッキから始められる')
    click('[data-deck-add=FT-0039]')
    click('[data-deck-add=FT-0039]')
    expect(query('#deck-size.over-limit').textContent === '32 / 30枚 · 2枚オーバー' &&
      query('[data-op=save-deck]').disabled && query('[data-deck-add=FT-0039]').disabled,
      '編集中は32枚まで追加でき、保存と同名上限は検証する')
    click('[data-op=deck-overview]')
    expect(document.querySelectorAll('.deck-overview [data-overview-card]').length === 32, '超過分も全体表示に含める')
    click('.deck-overview button[type=submit]')
    click('[data-deck-remove=FT-0039]')
    click('[data-deck-remove=FT-0039]')
    expect(!query('#deck-size.over-limit') && !query('[data-op=save-deck]').disabled, '30枚に戻すと保存できる')
    click('[data-deck-remove=ember-whelp]')
    expect(query('#deck-size').textContent === '29 / 30枚' && query('[data-op=save-deck]').disabled, '30枚で保存できる')
    click('[data-op=deck-overview]')
    expect(query('#deck-overview-title').textContent === '星降る夜' &&
      query('.deck-overview-total').textContent === '29 / 30枚' &&
      document.querySelectorAll('.deck-overview .overview-empty').length === 1, '編成中の変更も全体表示に反映')
    click('.deck-overview button[type=submit]')
    expect(query('#deck-name').value === '星降る夜' && query('#deck-size').textContent === '29 / 30枚',
      '全体表示から保存前の編成に戻れる')
    const deckFilter = (key, value) => {
      const field = query('[data-deck-filter="' + key + '"]')
      field.value = value
      field.dispatchEvent(new Event(field.type === 'search' ? 'input' : 'change', { bubbles: true }))
    }
    deckFilter('order', 'kind')
    const order = ['unit', 'spell', 'weapon']
    for (const selector of ['#deck-pool .deck-card', '#deck-list .deck-card']) {
      const values = [...document.querySelectorAll(selector)].map(node => order.indexOf(node.dataset.kind))
      expect(values.every((kind, index) => !index || kind >= values[index - 1]), '候補とデッキを種類順に並べる')
    }
    deckFilter('kind', 'spell')
    const spells = [...document.querySelectorAll('#deck-pool .deck-card')]
    expect(spells.length && spells.every(node => node.dataset.kind === 'spell') &&
      query('#deck-list .deck-card[data-kind=unit]'), 'カード候補だけを特技に絞り込む')
    deckFilter('kind', '')
    deckFilter('order', 'cost')
    deckFilter('pack', 'set-2')
    expect(query('[data-deck-add=FT-0040]') && !query('[data-deck-add=FT-0047]'), '共通と選択職業を追加できる')
    deckFilter('rarity', 'rare')
    expect(query('[data-deck-add=FT-0040]') && !query('[data-deck-add=FT-0039]'), 'デッキ候補もレアリティで絞り込める')
    deckFilter('query', 'くみひもこぞう')
    expect(!query('[data-deck-add]'), '原作名が一致しても異なるレアリティは除外')
    deckFilter('rarity', 'common')
    expect(document.querySelectorAll('[data-deck-add]').length === 1 && query('[data-deck-add=FT-0039]'),
      'デッキ編集で原作名・レアリティ・収録の組み合わせが使える')
    deckFilter('rarity', '')
    expect(query('[data-deck-add=FT-0039]'), 'デッキ編集のレアリティを解除できる')
    deckFilter('pack', 'set-3')
    deckFilter('rarity', 'rare')
    deckFilter('query', 'まじゅつし')
    expect(document.querySelectorAll('[data-deck-add]').length === 1 && query('[data-deck-add=FT-0516]'),
      'デッキ編集でも第3弾の原作名とレアリティが使える')
    deckFilter('pack', 'set-4')
    deckFilter('query', 'てつのさそり')
    expect(document.querySelectorAll('[data-deck-add]').length === 1 && query('[data-deck-add=FT-0618]'),
      'デッキ編集でも第4弾の原作名・レアリティ・収録を併用できる')
    deckFilter('pack', 'set-2')
    deckFilter('rarity', '')
    deckFilter('query', 'くみひもこぞう')
    function checkCardDetails(selector, cardId) {
      const card = cards[cardId]
      const tile = query(selector).closest('.deck-card')
      expect(tile.querySelector('img').src === globalThis.fairytaleImages[card.artId + '.webp'] &&
        tile.querySelector('.deck-card-name').textContent === card.name &&
        tile.querySelector('.deck-card-effect').textContent === card.description,
        'イラスト・名前・効果全文をカードに表示 ' + selector)
    }
    checkCardDetails('[data-deck-add=FT-0039]', 'FT-0039')
    click('[data-deck-add=FT-0039]')
    checkCardDetails('[data-deck-remove=FT-0039]', 'FT-0039')
    click('[data-op=save-deck]')
    expect(query('#deck-status').textContent.includes('保存しました'), '保存を表示')
    const saved = collection.list('mage').find(deck => deck.name === '星降る夜')
    expect(saved?.deck.includes('FT-0039') && JSON.stringify(collection.get('legacy-mage').deck) === JSON.stringify(legacy),
      '同じクラスの新しいデッキを旧デッキとは別に保存する')
    renameDeck('星夜の魔法')
    click('[data-op=save-deck]')
    click('[data-op=deck-list]')
    const openSaved = '[data-deck-open="' + saved.id + '"]'
    expect(query(openSaved).textContent.includes('星夜の魔法'), '改名が一覧にも反映される')
    click(openSaved)
    expect(query('[data-deck-remove=FT-0039]') && query('#deck-name').value === '星夜の魔法', '改名・編成したデッキを再度開ける')
    for (let i = 0; i < 8; i++) {
      const result = collection.save({ leader: 'mage', name: '追加デッキ ' + (i + 1), deck: legacy })
      expect(result.ok, '同じクラスで9個を超えて保存')
    }
    click('[data-op=deck-list]')
    const visible = [...document.querySelectorAll('.deck-tile')]
    expect(visible.length === 9 && visible[0].offsetTop === visible[2].offsetTop &&
      visible[3].offsetTop > visible[2].offsetTop && visible[6].offsetTop > visible[5].offsetTop,
    '1ページに3列×3行のデッキを表示')
    click('[data-deck-page="1"]')
    expect(document.querySelectorAll('[data-deck-open]').length === 1, '10個目は次のページに並ぶ')
    const tenth = query('[data-deck-open]').dataset.deckOpen
    let deletePrompt
    window.confirm = message => { deletePrompt = message; return false }
    const deleteTenth = '[data-deck-delete="' + tenth + '"]'
    click(deleteTenth)
    expect(deletePrompt.includes('追加デッキ 8') && collection.get(tenth), '削除を取り消すと保存に残る')
    window.confirm = () => true
    click(deleteTenth)
    expect(document.querySelectorAll('[data-deck-open]').length === 9 && !query('[data-deck-page]') && !collection.get(tenth),
      '最後のページのデッキを削除すると前のページへ戻る')
    click('[data-op=close-decks]')
    expect(!query('#match-deck-0 option[value="' + tenth + '"]'), '対戦画面から削除済みのデッキが消える')
    const selectDeck = (seat, id) => {
      const field = query('#match-deck-' + seat)
      field.value = id
      field.dispatchEvent(new Event('change', { bubbles: true }))
      expect(field.value === id, '対戦開始前にデッキを選ぶ')
    }
    expect(query('#match-deck-0 option[value="' + saved.id + '"]').textContent === '星夜の魔法', '対戦開始前に保存した名前を表示')
    selectDeck(0, saved.id)
    const { createGame } = await import('@bundle/packages/engine/index.js')
    const lineups = [{ leader: 'mage', deck: saved.deck }, starterLineup('swordsman')]
    let seed = 0
    let initial = createGame({ seed, lineups })
    while (!initial.players[0].hand.some(instance => instance.card === 'FT-0039') && seed < 500) {
      initial = createGame({ seed: ++seed, lineups })
    }
    expect(seed < 500, '編集カードが初期手札に入る試験用シード')
    useBattleSeed(seed)
    click('[data-op=start]')
    expect(query('[data-replace][aria-label="' + cards['FT-0039'].name + '"]'), '編集したカードを実際に引く')
    click('[data-op=mulligan]')
    click('[data-hand][data-card=FT-0039]')
    click('[data-slot="0:front:0"]')
    expect(query('[data-slot="0:front:0"][data-card=FT-0039] img').src ===
      globalThis.fairytaleImages['card-FT-0039.webp'], '編集カードを対戦中に召喚して専用絵を表示する')

    click('[data-op=home]')
    setLeader(0, 'warrior')
    click('[data-op=decks]')
    click('[data-op=new-deck]')
    click('[data-deck-class=warrior]')
    renameDeck('金剣の一閃')
    click('[data-op=seed-deck]')
    click('[data-deck-remove=twig-guard]')
    deckFilter('query', '真鍮巻きの鋼剣')
    click('[data-deck-add=FT-0086]')
    click('[data-deck-remove=spark]')
    deckFilter('query', '剣神の領域')
    click('[data-deck-add=FT-0509]')
    click('[data-op=save-deck]')
    const warrior = collection.list('warrior')[0]
    const warriorDeck = warrior.deck
    expect(warriorDeck.includes('FT-0086') && collection.get(saved.id).deck.includes('FT-0039'),
      '別の枠の保存内容を維持する')
    click('[data-op=deck-list]')
    expect(query('[data-deck-open]').dataset.deckOpen === warrior.id && document.querySelectorAll('[data-deck-open]').length === 9,
      '後から作った戦士のデッキが先頭に入り、1ページは9個のまま')
    click('[data-deck-page="1"]')
    expect(query('[data-deck-open]').textContent.includes('追加デッキ 7'), '最後の魔法使いが次ページへずれる')
    click('[data-op=close-decks]')
    click('[data-mode=local]')
    selectDeck(0, warrior.id)
    const armed = [{ leader: 'warrior', deck: warriorDeck }, starterLineup('swordsman', false)]
    let armedSeed = 0
    while (armedSeed < 500 && !['FT-0086', 'FT-0509'].every(id =>
      createGame({ seed: armedSeed, lineups: armed }).players[0].hand.some(instance => instance.card === id),
    )) armedSeed++
    expect(armedSeed < 500, '武器の初期手札用シード')
    useBattleSeed(armedSeed)
    click('[data-op=start]')
    click('[data-op=mulligan]')
    click('[data-op=mulligan]')
    for (let i = 1; i < cards['FT-0086'].cost; i++) { next(); next() }
    click('[data-hand][data-card=FT-0086]')
    click('[data-op=confirm]', false)
    expect(query('[data-beat=reveal] [data-reveal-card=FT-0086][data-card-kind=weapon]'), '装備する武器を中央に表示')
    advanceTimer()
    expect(query('[data-beat=approach] .reveal-travel') && query('[data-leader="0"].effect-destination'),
      '武器が装備する語り手の肖像に移動')
    completePresentation()
    const durability = '[data-leader="0"] .leader-durability'
    const attackBadge = '[data-leader="0"] .leader-power'
    expect(query('[data-leader="0"].ready') &&
      query(durability)?.textContent === '耐久 ' + cards['FT-0086'].hp &&
      y(durability) >= query(attackBadge).getBoundingClientRect().bottom &&
      query(durability).getBoundingClientRect().right === query(attackBadge).getBoundingClientRect().right,
      'リーダー右上の攻撃力の真下に装備中の武器の耐久を表示')
    query(durability).dispatchEvent(new PointerEvent('pointerover', { bubbles: true, relatedTarget: query(attackBadge) }))
    expect(query('#detail h2')?.textContent === cards['FT-0086'].name &&
      query('#detail .inspector-stats').textContent.includes('耐久 ' + cards['FT-0086'].hp),
      '武器の耐久にカーソルを合わせて装備の詳細を確認できる')
    click('[data-leader="0"]')
    click('[data-leader="1"]')
    expect(Number(query('[data-leader="1"] .leader-hp').textContent) === 25 - cards['FT-0086'].attack &&
      query('[data-impact-style=slash]'), '装備した剣で敵リーダーを攻撃し、斬撃を表示する')
    expect(query(durability)?.textContent === '耐久 ' + (cards['FT-0086'].hp - 1), '攻撃で減った耐久を表示')
    next()
    next()
    click('[data-hand][data-card=FT-0509]')
    const terrainCell = '[data-slot="1:back:2"]'
    expect(query(terrainCell + '.targetable'), '相手側のマスも舞台の配置先として指定できる')
    click(terrainCell, false)
    advanceTimer()
    expect(query(terrainCell + ' .terrain-flash[data-stage=sword]'), '表示が切り替わる前に地形を置くマスが光る')
    completePresentation()
    expect(query(terrainCell + '[data-terrain=sword] .slot-stage').textContent === '剣の紋章',
      '配置した舞台の名前を相手側のマスに表示する')
    click('[data-op=home]')
    click('[data-op=decks]')
    click('[data-deck-delete="' + warrior.id + '"]')
    click('[data-deck-delete=legacy-mage]')
    expect(!query('[data-deck-open=legacy-mage]') && !createDeckCollection(storage).get('legacy-mage'), '旧デッキも削除後に復活しない')
    click('[data-op=close-decks]')
    expect(!query('#match-deck-0'), '選択中のデッキを削除すると基本デッキに戻る')
    const beast = starterLineup('swordsman', false)
    beast.deck = beast.deck.map(id => id === 'crossroads' ? 'FT-0243' : id)
    const mirror = starterLineup('mage', false)
    const beastDeck = collection.save({ ...beast, name: '覚醒の検証' }).deck
    const mirrorDeck = collection.save({ ...mirror, name: '防護の検証' }).deck
    setLeader(0, beast.leader)
    setLeader(1, mirror.leader)
    selectDeck(0, beastDeck.id)
    selectDeck(1, mirrorDeck.id)
    useBattleSeed(15485863)
    click('[data-op=start]')
    click('[data-op=mulligan]')
    click('[data-op=mulligan]')
    const guardCell = '[data-slot="0:front:0"]'
    click('[data-hand][data-card=twig-guard]')
    click(guardCell)
    expect(query(guardCell + ' [data-ability=GUARD][data-active=true].ability-pulse'), '前衛の騎士の誓いが光る')
    next()
    next()
    click('[data-hand][data-card=veil]')
    click(guardCell)
    expect(query(guardCell + ' .defense-burst'), '完全防護を付与した瞬間にシールドが光る')
    query(guardCell).dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    expect(query('#detail .inspector-current').textContent.includes('持ち主の次のターン開始まで'), '詳細欄に防護の期限を表示する')
    next()
    click('[data-hand][data-card=spark]')
    click(guardCell)
    expect(query(guardCell + ' .defense-burst') && query(guardCell + ' .unit-stats span:last-child').textContent === '2',
      '防護でダメージがゼロになった瞬間にシールドが光る')
    next()
    expect(!query(guardCell + ' .defense-field'), '持ち主の次のターン開始でシールドが消える')
    for (let mp = 3; mp < 9; mp++) {
      if (mp <= 5) click('[data-op=focus]')
      next()
      next()
    }
    const leaderBefore = '[data-leader="0"] .portrait'
    expect(query(leaderBefore).src === globalThis.fairytaleImages['swordsman.webp'], '変身前は通常のヴァルドの肖像')
    click('[data-hand][data-card=FT-0243]')
    click('[data-op=confirm]', false)
    expect(query(leaderBefore).src === globalThis.fairytaleImages['swordsman.webp'], '変身の解決前は通常の肖像を表示する')
    completePresentation()
    expect(query('[data-leader="0"].leader-awakening .portrait')?.src === globalThis.fairytaleImages['swordsman-awakened.webp'] &&
      query('[data-op=skill]').textContent.includes('黒薔薇の焔嵐'), '変身が成立すると肖像と奥義が切り替わる')
    next()
    expect(query('.opponent ' + leaderBefore)?.src === globalThis.fairytaleImages['swordsman-awakened.webp'], '相手側の盤面にも覚醒後の肖像を出す')
    expect(!document.body.dataset.runtimeError, document.body.dataset.runtimeError)
    document.body.dataset.e2e = 'pass'
  } catch (error) {
    document.body.dataset.e2e = 'fail'
    document.body.dataset.e2eError = error.message
  }
}

test('Chromiumでカード閲覧、デッキの複数保存と選択、手札交換から対戦終了まで操作できる', async () => {
  const binary = await executable()
  const temp = await realpath(tmpdir())
  const directory = await mkdtemp(join(temp, 'fairytale-test-'))
  try {
    const page = join(directory, 'e2e.html')
    // The bootstrap embeds every artwork; keep it out of Chromium's DOM dump after the test finishes.
    const after = 'try { await (' + driveBattle.toString() + ')() } finally { document.querySelectorAll("script").forEach(node => node.remove()) }'
    const html = await standalone(after)
    await writeFile(page, html, 'utf8')
    const { stdout } = await run(binary, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--noerrdialogs', '--disable-background-networking', '--user-data-dir=' + join(directory, 'profile'),
      '--window-size=1280,780', '--virtual-time-budget=10000', '--dump-dom', pathToFileURL(page).href,
    ], { maxBuffer: 64 * 1024 * 1024, timeout: 45000 })
    const body = stdout.match(/<body[^>]*>/)?.[0]
    assert.match(body ?? '', /data-e2e="pass"/, body ?? 'ページ本体が見つかりません')
  } finally {
    const resolved = await realpath(directory)
    if (dirname(resolved) !== temp) throw new Error('テスト用ディレクトリの場所が不正です')
    await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})

async function eventually(read, description) {
  const deadline = Date.now() + 9000
  do {
    const result = await read()
    if (result) return result
    await new Promise(resolve => setTimeout(resolve, 40))
  } while (Date.now() < deadline)
  assert.fail(description)
}

async function browserControl(t, directory) {
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
      const data = await command('Runtime.evaluate', { expression, returnByValue: true }, sessionId)
      if (data.exceptionDetails) throw new Error(data.exceptionDetails.exception?.description ?? data.exceptionDetails.text)
      return data.result.value
    }
    const wait = selector => eventually(() => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), selector)
    return {
      evaluate, wait,
      viewport: (width, height) => command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId),
      navigate: url => command('Page.navigate', { url }, sessionId),
      async click(selector) {
        await wait(selector)
        await evaluate(`document.querySelector(${JSON.stringify(selector)})?.click()`)
      },
    }
  }
}

async function finishTurn(page) {
  await page.click('[data-op=end]:enabled')
  if (await page.evaluate('Boolean(document.querySelector("#end-turn-dialog[open]"))')) {
    await page.click('#end-turn-dialog [value=end]')
  }
}

test('別々のChromiumセッションで招待URLから参加し、対戦と再接続ができる', { timeout: 45000 }, async t => {
  const temp = await realpath(tmpdir())
  const profile = await mkdtemp(join(temp, 'fairytale-online-'))
  let origin = process.env.FAIRYTALE_SERVER_URL
  if (!origin) {
    const server = createDevServer()
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    t.after(() => {
      server.closeAllConnections()
      return new Promise(resolve => server.close(resolve))
    })
    origin = 'http://127.0.0.1:' + server.address().port
  }
  const open = await browserControl(t, profile)
  t.after(async () => {
    const resolved = await realpath(profile)
    if (dirname(resolved) !== temp) throw new Error('テスト用ディレクトリの場所が不正です')
    await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  })
  const [host, guest] = await Promise.all([open(), open()])
  await host.navigate(origin + '/')
  await host.click('[data-op=decks]')
  await host.viewport(390, 800)
  assert.equal(await host.evaluate('document.documentElement.scrollWidth === document.documentElement.clientWidth'), true,
    'デッキの書き出し・引き継ぎボタンも狭い画面に収まる')
  await host.click('[data-deck-overview]')
  assert.equal(await host.evaluate('getComputedStyle(document.querySelector(".deck-overview-grid")).gridTemplateColumns.split(" ").length'), 5)
  assert.equal(await host.evaluate('document.querySelector(".deck-overview").scrollWidth === document.querySelector(".deck-overview").clientWidth'), true)
  await host.click('.deck-overview button[type=submit]')
  await host.viewport(1200, 800)
  await host.click('[data-op=new-deck]')
  await host.click('[data-deck-class=mage]')
  await host.click('[data-op=seed-deck]')
  await host.click('[data-deck-remove=ember-whelp]')
  await host.click('[data-deck-add=FT-0039]')
  await host.evaluate(`{
    const field = document.querySelector('#deck-name')
    field.value = 'フレンド対戦用'
    field.dispatchEvent(new Event('input', { bubbles: true }))
  }`)
  await host.click('[data-op=save-deck]:enabled')
  await host.click('[data-op=deck-list]')
  assert.equal(await host.evaluate('Boolean(document.querySelector("[data-op=export-decks]"))'), true)
  const backup = { format: 'fairytale-rivals-decks', version: 1,
    decks: [{ name: '引き継いだ森の守り', leader: 'priest', deck: starterLineup('priest').deck }] }
  await host.evaluate(`{
    const create = document.createElement
    document.createElement = function(tag, ...args) {
      const element = create.call(this, tag, ...args)
      if (tag === 'input') element.click = () => {
        const files = new DataTransfer()
        files.items.add(new File([${JSON.stringify(JSON.stringify(backup))}], 'decks.json', { type: 'application/json' }))
        element.files = files.files
        element.dispatchEvent(new Event('change'))
      }
      return element
    }
    try { document.querySelector('[data-op=import-decks]').click() }
    finally { document.createElement = create }
  }`)
  await eventually(() => host.evaluate('document.querySelector("#deck-list-status")?.textContent.includes("1件のデッキを引き継ぎました")'), 'デッキファイルの読み込み')
  assert.equal(await host.evaluate('Array.from(document.querySelectorAll(".saved-deck strong")).some(node => node.textContent === "引き継いだ森の守り")'), true)
  await host.click('[data-op=close-decks]')
  await host.click('[data-mode=friend]')
  await host.evaluate(`{
    const send = window.fetch
    window.fetch = (path, options) => {
      if (path.endsWith('/actions') && options?.method === 'POST') {
        const action = JSON.parse(options.body).action
        if (action.type === 'lobby-ready') window.sentDeck = action.lineup?.deck
      }
      return send(path, options)
    }
  }`)
  await host.click('[data-op=start]:not(:disabled)')
  await host.wait('[data-lobby-member=host]')
  assert.equal(await host.evaluate('document.querySelector("#match-deck-0 option:checked").textContent'), 'フレンド対戦用')
  const code = await host.evaluate('document.querySelector("#lobby-id").value')
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  const invite = await host.evaluate('document.querySelector("#invite-url").value')
  await guest.viewport(390, 844)
  await guest.navigate(new URL(invite).origin + '/')
  await guest.click('[data-mode=friend]')
  await guest.evaluate(`document.querySelector('#lobby-id-input').value = ${JSON.stringify(code.toLowerCase())}`)
  await guest.click('#lobby-join button')
  await guest.wait('[data-lobby-member=guest]')
  assert.equal(await guest.evaluate('document.documentElement.scrollWidth === document.documentElement.clientWidth'), true)
  assert.equal(await guest.evaluate('Array.from(document.querySelectorAll("#match-deck-0 option")).some(option => option.textContent === "フレンド対戦用")'), false)
  assert.equal(await host.evaluate('document.querySelector("[data-op=lobby-start]").disabled'), true)
  await host.click('[data-op=lobby-ready]:enabled')
  await guest.wait('[data-lobby-member=host][data-ready=true]')
  assert.equal(await host.evaluate('window.sentDeck.includes("FT-0039") && !window.sentDeck.includes("ember-whelp")'), true)
  await guest.click('[data-op=lobby-ready]:enabled')
  await host.click('[data-op=lobby-start]:enabled')
  await Promise.all([host.wait('.mulligan'), guest.wait('.mulligan')])
  const active = '[data-op=mulligan]:not(:disabled)'
  const [first, second] = await host.evaluate(`Boolean(document.querySelector('${active}'))`) ? [host, guest] : [guest, host]
  await first.click(active)
  await second.click(active)

  const end = '[data-op=end]:not(:disabled)'
  await Promise.all([first.wait(end), second.wait('.battle')])
  await first.click(end)
  await first.wait('#end-turn-dialog[open]')
  assert.equal(await second.evaluate('document.querySelector("[data-op=end]").disabled'), true,
    '終了を確認する間は相手に手番が移らない')
  await first.click('#end-turn-dialog [value=cancel]')
  await first.wait(end)
  assert.equal(await second.evaluate(`(() => {
    const hand = document.querySelector('[data-hand]')
    hand.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    return hand.getAttribute('aria-label').startsWith(document.querySelector('#detail h2').textContent)
  })()`), true, '相手の手番中も自分の手札を確認できる')
  await second.click('[data-hand][aria-haspopup=dialog]')
  await second.wait('.battle-card-dialog[open] .log-card-description p')
  await second.click('.battle-card-dialog .detail-dialog-actions button')
  await second.viewport(390, 800)
  await second.click('[data-op=audio-mixer]')
  assert.equal(await second.evaluate(`(() => {
    const bounds = selector => document.querySelector(selector).getBoundingClientRect()
    const mixer = bounds('#audio-mixer')
    return mixer.top >= bounds('.top-actions').bottom && mixer.bottom <= bounds('.battle-heading').top
  })()`), true, 'スマートフォン幅で音量欄が独立した段に収まる')
  const fits = await second.evaluate('document.documentElement.scrollWidth === document.documentElement.clientWidth')
  assert.equal(fits, true, '狭い画面で対戦画面全体が横にはみ出さない')
  await second.click('[data-op=audio-mixer]')
  assert.equal(await first.evaluate('document.querySelector(".ally-formation [data-slot]").dataset.slot[0]'), '0')
  assert.equal(await second.evaluate('document.querySelector(".ally-formation [data-slot]").dataset.slot[0]'), '1')
  assert.equal(await second.evaluate('document.querySelector("[data-op=end]").disabled'), true)
  await second.viewport(1200, 800)
  const units = catalog.filter(card => card.kind === 'unit' && !card.target && !card.fortune && !card.choice && !card.extraPlacement).map(card => card.id)
  let actor = first
  let spectator = second
  let cardId
  for (let turn = 0; turn < 10; turn++) {
    await actor.wait(end)
    cardId = await actor.evaluate(`[...document.querySelectorAll("[data-hand]:not(.unaffordable)")]
      .find(node => ${JSON.stringify(units)}.includes(node.dataset.card))?.dataset.card`)
    if (cardId) break
    await finishTurn(actor)
    const previous = actor
    actor = spectator
    spectator = previous
  }
  assert.ok(cardId, '合法な召喚カードを引く')
  await spectator.evaluate(`{
    window.summonSeen = false
    new MutationObserver(() => {
      if (document.querySelector('[data-reveal-card="${cardId}"]')) window.summonSeen = true
    }).observe(document.querySelector('#app'), { subtree: true, childList: true })
  }`)
  await actor.click(`[data-hand][data-card="${cardId}"]`)
  await actor.click('.ally-formation .slot.targetable')
  const placed = `.enemy-formation [data-card="${cardId}"]`
  await spectator.wait(placed)
  assert.equal(await spectator.evaluate('window.summonSeen'), true)
  await spectator.click(placed)
  assert.equal(await spectator.evaluate('document.querySelector(".battle-card-dialog[open] p")?.textContent'), catalog.find(card => card.id === cardId).description)
  await spectator.click('.battle-card-dialog .detail-dialog-actions button')
  await spectator.navigate(invite)
  await eventually(async () => (await spectator.evaluate('typeof window.summonSeen')) === 'undefined', '画面の再読み込み')
  await spectator.wait(placed)
  assert.equal(await spectator.evaluate('Boolean(document.querySelector(".room-lobby"))'), false)
  assert.equal(await spectator.evaluate('Boolean(document.querySelector(".enemy-formation [data-hand]"))'), false)
})


test('静的公開版でロビーIDから合流し、対戦・再接続・再戦・ロビーへ戻る操作ができる', {
  skip: !process.env.FAIRYTALE_PEER_E2E, timeout: 90000,
}, async t => {
  const temp = await realpath(tmpdir())
  const profile = await mkdtemp(join(temp, 'fairytale-peer-'))
  let url = process.env.FAIRYTALE_PEER_PAGE
  if (!url) {
    const server = createDevServer()
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    t.after(() => {
      server.closeAllConnections()
      return new Promise(resolve => server.close(resolve))
    })
    url = 'http://127.0.0.1:' + server.address().port + '/?transport=peer'
  }
  const open = await browserControl(t, profile)
  t.after(async () => {
    const resolved = await realpath(profile)
    if (dirname(resolved) !== temp) throw new Error('テスト用ディレクトリの場所が不正です')
    await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  })
  const [host, guest] = await Promise.all([open(), open()])
  const waitForRoom = async (page, selector) => {
    try { await page.wait(selector) }
    catch (issue) {
      const status = await page.evaluate('document.querySelector(".room-status")?.textContent')
      throw new Error(issue.message + ' / ' + status, { cause: issue })
    }
  }
  await host.navigate(url)
  await host.click('[data-mode=friend]')
  await host.click('[data-op=start]:enabled')
  await waitForRoom(host, '#invite-url')
  const invite = await host.evaluate('document.querySelector("#invite-url").value')
  assert.equal(new URL(invite).pathname, new URL(url).pathname)
  assert.equal(new URL(invite).searchParams.get('transport'), 'peer')

  const code = await host.evaluate('document.querySelector("#lobby-id").value')
  await guest.navigate(url)
  await guest.click('[data-mode=friend]')
  await guest.evaluate(`document.querySelector('#lobby-id-input').value = ${JSON.stringify(code)}`)
  await guest.click('#lobby-join button')
  await waitForRoom(guest, '[data-lobby-member=guest]')
  await host.click('[data-op=lobby-ready]:enabled')
  await guest.wait('[data-lobby-member=host][data-ready=true]')
  await guest.click('[data-op=lobby-ready]:enabled')
  await host.click('[data-op=lobby-start]:enabled')
  await Promise.all([waitForRoom(host, '.mulligan'), waitForRoom(guest, '.mulligan')])
  const keep = '[data-op=mulligan]:enabled'
  const [first, second] = await host.evaluate(`Boolean(document.querySelector('${keep}'))`) ? [host, guest] : [guest, host]
  await first.click(keep)
  await second.click(keep)
  const end = '[data-op=end]:enabled'
  await finishTurn(first)
  await second.wait(end)
  assert.equal(await second.evaluate('Boolean(document.querySelector(".enemy-formation [data-hand]"))'), false)

  await guest.evaluate('window.beforeReload = true')
  await guest.navigate(invite)
  await eventually(async () => !(await guest.evaluate('window.beforeReload')), 'ゲスト画面の再読み込み')
  await guest.wait('.battle')
  await finishTurn(second)
  await first.wait(end)

  async function finishMatch(firstToAct, secondToAct) {
    const players = [firstToAct, secondToAct]
    for (let turn = 0; turn < 115; turn++) {
      const actor = players[turn % 2]
      await actor.wait(end + ', .result')
      const ended = await actor.evaluate(`(() => {
        const button = document.querySelector('[data-op=end]:enabled')
        if (!button) return false
        button.click()
        document.querySelector('#end-turn-dialog[open] [value=end]')?.click()
        return true
      })()`)
      if (!ended) break
    }
    await Promise.all([host.wait('.result'), guest.wait('.result')])
  }

  await finishMatch(first, second)
  const rematch = '[data-op=rematch]'
  await host.click(rematch + ':enabled')
  await host.wait(rematch + ':disabled')
  await eventually(() => guest.evaluate('document.querySelector(".result .room-status")?.textContent.includes("再戦を希望")'),
    '相手の再戦希望を表示')
  await guest.click(rematch + ':enabled')
  await Promise.all([host.wait('.mulligan'), guest.wait('.mulligan')])
  const [rematchFirst, rematchSecond] = await host.evaluate(`Boolean(document.querySelector('${keep}'))`) ? [host, guest] : [guest, host]
  await rematchFirst.click(keep)
  await rematchSecond.click(keep)
  await finishMatch(rematchFirst, rematchSecond)
  await guest.click('[data-op=return-lobby]:enabled')
  for (const page of [host, guest]) {
    await page.wait('[data-lobby-member=guest][data-ready=false]')
    assert.equal(await page.evaluate('document.querySelector("#lobby-id").value'), code)
    assert.equal(await page.evaluate('document.querySelector("#invite-url").value'), invite)
  }
  assert.equal(await host.evaluate('document.querySelector("[data-op=lobby-start]").disabled'), true)
  await host.click('.room-lobby [data-op=home]:enabled')
  await guest.wait('.room-lobby:not(:has(#lobby-id))')
  assert.match(await guest.evaluate('document.querySelector(".room-status").textContent'), /閉じられました/)
})

test('添付のライバルズ画像を貼り付けて30枚を照合し、修正して保存する', {
  skip: !process.env.FAIRYTALE_RIVALS_SCREENSHOT, timeout: 35000,
}, async t => {
  const input = await readFile(process.env.FAIRYTALE_RIVALS_SCREENSHOT)
  const temp = await realpath(tmpdir())
  const profile = await mkdtemp(join(temp, 'fairytale-rivals-import-'))
  const server = createDevServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => {
    server.closeAllConnections()
    return new Promise(resolve => server.close(resolve))
  })
  const open = await browserControl(t, profile)
  t.after(async () => {
    const resolved = await realpath(profile)
    if (dirname(resolved) !== temp) throw new Error('テスト用ディレクトリの場所が不正です')
    await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  })
  const page = await open()
  await page.navigate('http://127.0.0.1:' + server.address().port + '/')
  await page.click('[data-op=decks]')
  await page.click('[data-op=rivals-import]')
  await page.wait('#rivals-file')
  const paste = target => target.evaluate(`{
    const pixels = Uint8Array.fromBase64(${JSON.stringify(input.toString('base64'))})
    const transfer = new DataTransfer()
    transfer.items.add(new File([pixels], 'rivals-deck.png', { type: 'image/png' }))
    document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }))
  }`)
  await paste(page)
  await page.wait('.rivals-read-count')
  assert.equal(await page.evaluate('document.querySelector(".rivals-read-count").textContent'), '認識 30 / 30枚 · 17種類')
  assert.equal(await page.evaluate('document.querySelector("#rivals-leader").value'), 'seer')
  const recognized = await page.evaluate('[...document.querySelectorAll("[data-rivals-slot]")].map(slot => slot.dataset.rivalsCard)')
  assert.deepEqual(recognized, exampleRivalsDeck.deck)
  await page.click('[data-rivals-slot="0"]')
  await page.click('[data-op=rivals-empty]')
  assert.equal(await page.evaluate('document.querySelector(".rivals-read-count").textContent'), '認識 29 / 30枚 · 17種類')
  await page.click('[data-rivals-slot="0"]')
  await page.evaluate(`{
    const field = document.querySelector('#rivals-search')
    field.value = 'あばれうしどり'
    field.dispatchEvent(new Event('input', { bubbles: true }))
  }`)
  await page.click('[data-rivals-match="FT-0435"]')
  await page.evaluate(`{
    const name = document.querySelector('#rivals-name')
    name.value = '画像から再作成'
    name.dispatchEvent(new Event('input', { bubbles: true }))
  }`)
  await page.click('[data-op=rivals-apply]:enabled')
  await page.wait('#deck-list')
  assert.equal(await page.evaluate('document.querySelector("#deck-size").textContent'), '30 / 30枚')
  await page.click('[data-op=save-deck]:enabled')
  assert.equal(await page.evaluate('document.querySelector("#deck-status").textContent'), 'デッキを保存しました。')
  await page.click('[data-op=deck-list]')
  assert.equal(await page.evaluate('[...document.querySelectorAll(".saved-deck strong")].some(name => name.textContent === "画像から再作成")'), true)
  const bundled = join(profile, 'play.html')
  await writeFile(bundled, await standalone(), 'utf8')
  const offline = await open()
  await offline.navigate(pathToFileURL(bundled).href)
  await offline.click('[data-op=decks]')
  await offline.click('[data-op=rivals-import]')
  await paste(offline)
  await offline.wait('.rivals-read-count')
  assert.equal(await offline.evaluate('document.querySelector(".rivals-read-count").textContent'), '認識 30 / 30枚 · 17種類')
})


