import { impactSamples } from './battle-impact-sounds.js'

const soundKey = 'fairytale-battle-sound'
const phrases = {
  draw: [[825, 0, .065], [430, .035, .09]],
  turn: [[360, 0, .09], [540, .065, .12]],
  spell: [[450, 0, .11], [690, .035, .12]],
  terrain: [[245, 0, .09], [490, .03, .13]],
  finish: [[147, 0, .24], [294, .04, .29], [440, .13, .30]],
  phoenix: [[196, 0, .40], [294, .10, .36], [392, .22, .36], [523, .38, .40], [784, .52, .42]],
  warrior: [[196, 0, .21], [294, .06, .22], [392, .13, .22]],
  mage: [[392, 0, .24], [523, .07, .24], [784, .13, .27]],
  fighter: [[164, 0, .12], [220, .09, .13], [330, .18, .16]],
  priest: [[330, 0, .27], [440, .07, .28], [659, .16, .27]],
  merchant: [[659, 0, .11], [880, .06, .11], [1047, .13, .15]],
  seer: [[740, 0, .25], [494, .08, .22], [988, .16, .24]],
  swordsman: [[131, 0, .24], [196, .05, .29], [311, .14, .30]],
}

export function createBattleAudio() {
  let context
  let output
  const buffers = new Map()
  let enabled = true
  try { enabled = localStorage.getItem(soundKey) !== 'off' } catch { /* Storage is optional. */ }

  function unlock() {
    if (!enabled || !globalThis.AudioContext) return
    try {
      if (!context) {
        context = new AudioContext()
        output = context.createGain()
        output.gain.value = .13
        output.connect(context.destination)
      }
      if (context.state === 'suspended') context.resume().catch(() => {})
    } catch { /* Audio availability does not affect play. */ }
  }

  return {
    get enabled() { return enabled },
    unlock,
    toggle() {
      enabled = !enabled
      try { localStorage.setItem(soundKey, enabled ? 'on' : 'off') } catch { /* Storage is optional. */ }
      if (output) output.gain.value = enabled ? .13 : 0
      unlock()
    },
    play(cue, pan = 0) {
      if (!enabled || context?.state !== 'running') return
      if (!Object.hasOwn(phrases, cue)) {
        if (!buffers.has(cue)) {
          const samples = impactSamples(cue, context.sampleRate)
          if (!samples) return
          const buffer = context.createBuffer(1, samples.length, context.sampleRate)
          buffer.copyToChannel(samples, 0)
          buffers.set(cue, buffer)
        }
        const source = context.createBufferSource()
        source.buffer = buffers.get(cue)
        if (pan && context.createStereoPanner) {
          const stereo = context.createStereoPanner()
          stereo.pan.value = pan
          source.connect(stereo).connect(output)
          source.onended = () => stereo.disconnect()
        } else source.connect(output)
        source.start()
        return
      }
      for (const [frequency, delay, duration] of phrases[cue]) {
        const at = context.currentTime + delay
        const tone = context.createOscillator()
        const envelope = context.createGain()
        tone.type = 'sine'
        tone.frequency.value = frequency
        envelope.gain.setValueAtTime(.001, at)
        envelope.gain.exponentialRampToValueAtTime(.22, at + .025)
        envelope.gain.exponentialRampToValueAtTime(.001, at + duration)
        tone.connect(envelope).connect(output)
        tone.start(at)
        tone.stop(at + duration)
      }
    },
  }
}
