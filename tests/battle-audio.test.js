import test from 'node:test'
import assert from 'node:assert/strict'
import { impactSamples } from '../apps/web/battle-impact-sounds.js'
import { createBattleAudio } from '../apps/web/battle-audio.js'
import { skillPresentation, skillTheme } from '../apps/web/battle-skill-presentation.js'
import { leaders } from '../packages/cards/index.js'

test('手応えの異なるSEをブラウザーのサンプルレートに合わせ、末尾まで鳴らせる', () => {
  for (const rate of [44100, 48000]) {
    const signatures = new Set()
    for (const cue of ['windup', 'slash', 'blow', 'arcane', 'guard', 'summon', 'equip', 'heal']) {
      const waveform = impactSamples(cue, rate)
      assert.ok(waveform.length > rate * .1)
      assert.equal(waveform[0], 0)
      assert.ok(waveform.at(-1) === 0)
      const peak = waveform.reduce((max, value) => Math.max(max, Math.abs(value)), 0)
      assert.ok(peak > .06 && peak < 1, cue)
      signatures.add(waveform.slice(rate * .02, rate * .02 + 40).join(','))
    }
    assert.equal(signatures.size, 8)
  }
})

test('音楽と効果音を別々に調整し、効果音の一時ミュートから音量を復元できる', () => {
  const audio = createBattleAudio()
  audio.setVolume('bgm', 23)
  audio.setVolume('se', 71)
  audio.toggle()
  assert.equal(audio.volume('bgm'), 23)
  assert.equal(audio.volume('se'), 0)
  audio.toggle()
  assert.equal(audio.volume('se'), 71)
  audio.setVolume('bgm', -20)
  assert.equal(audio.volume('bgm'), 0)
  assert.equal(audio.enabled, true)
})

test('7人に固有の奥義演出があり、覚醒と短い演出にも対応する', () => {
  const motifs = new Set()
  for (const [leader, definition] of Object.entries(leaders)) {
    const theme = skillTheme({ name: definition.skill.name, seat: 0 }, { leader }, 0)
    motifs.add(theme.motif)
    const markup = skillPresentation(theme, () => 'portrait.webp', title => title, false)
    assert.ok(markup.includes(definition.skill.name))
    assert.ok(markup.includes('skill-ornament'))
    assert.ok(!skillPresentation(theme, () => 'portrait.webp', title => title, true).includes('skill-ornament'))
  }
  assert.equal(motifs.size, 7)
  assert.equal(skillTheme({ name: '黒薔薇の焔嵐', seat: 0 }, { leader: 'swordsman', awakenedLeader: true }, 0).motif, 'rosefire')
})
