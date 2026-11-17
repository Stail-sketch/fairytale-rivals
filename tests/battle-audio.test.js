import test from 'node:test'
import assert from 'node:assert/strict'
import { impactSamples } from '../apps/web/battle-impact-sounds.js'

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
