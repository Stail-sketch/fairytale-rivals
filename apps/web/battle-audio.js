import { impactSamples } from './battle-impact-sounds.js'
import { createInstruments } from './battle-instruments.js'
import { createSceneMusic } from './scene-music.js'

const soundKey = 'fairytale-battle-sound'
const volumeKey = 'fairytale-audio-volume.'
const defaults = { bgm: 38, se: 60 }
const phrases = {
  draw: [[825, 0, .065], [430, .035, .09]],
  'turn-in': [[392, 0, .19, .40, 'triangle'], [523, .07, .22, .40, 'triangle'],
    [659, .14, .24, .37, 'triangle'], [784, .21, .32, .36, 'triangle'], [1047, .21, .30, .16]],
  'turn-out': [[494, 0, .14, .34, 'triangle'], [330, .095, .21, .38, 'triangle']],
  spell: [[450, 0, .11], [690, .035, .12]],
  terrain: [[245, 0, .09], [490, .03, .13]],
  'focus-charge': [[196, 0, .18, .34, 'triangle'], [294, .055, .20, .32, 'triangle'],
    [440, .12, .24, .36, 'triangle'], [659, .20, .27, .30], [880, .26, .22, .12]],
  'focus-ready': [[196, 0, .20, .32, 'triangle'], [392, .07, .23, .34, 'triangle'],
    [587, .14, .26, .33, 'triangle'], [784, .22, .40, .38, 'triangle'], [1175, .25, .49, .22], [1568, .30, .46, .14]],
  finish: [[147, 0, .24], [294, .04, .29], [440, .13, .30]],
  phoenix: [[196, 0, .40], [294, .10, .36], [392, .22, .36], [523, .38, .40], [784, .52, .42]],
  'opening-page': [[180, 0, .11, .17, 'triangle'], [260, .05, .13, .13, 'triangle'], [390, .12, .12, .10]],
  'opening-suspense': [[147, 0, .22, .15, 'triangle'], [220, .10, .24, .15, 'triangle'], [294, .21, .25, .17, 'triangle']],
  'opening-result': [[523, 0, .18, .30, 'triangle'], [659, .07, .20, .30, 'triangle'], [784, .14, .32, .32, 'triangle'], [1047, .14, .36, .14]],
}

const skillPhrases = {
  warrior: [['drum', 37, 0, .16, .95], ['horn', 50, .035, .25, .9], ['horn', 57, .145, .31, .91], ['bell', 81, .21, .20, .48]],
  mage: [['bell', 84, 0, .24, .8], ['bell', 89, .078, .22, .65], ['bell', 77, .155, .27, .77], ['flute', 69, .188, .26, .9]],
  fighter: [['drum', 34, 0, .10, 1], ['frame', 56, .085, .09, .88], ['frame', 62, .169, .085, .8], ['drum', 41, .24, .18, .95]],
  priest: [['harp', 65, 0, .28, .7], ['harp', 69, .069, .31, .73], ['harp', 74, .14, .4, .72], ['bell', 81, .231, .49, .56]],
  merchant: [['bell', 74, 0, .20, .72], ['bell', 78, .090, .21, .72], ['bell', 83, .18, .23, .71], ['harp', 66, .242, .35, .76]],
  seer: [['flute', 81, 0, .29, .65], ['harp', 74, .1, .25, .61], ['bell', 88, .201, .39, .69], ['bell', 81, .26, .43, .43]],
  swordsman: [['drum', 30, 0, .17, .82], ['viola', 43, .01, .49, .85], ['horn', 49, .088, .41, .64], ['bell', 70, .21, .47, .46]],
  rosefire: [['drum', 28, 0, .16, .94], ['viola', 38, .015, .49, .87], ['horn', 45, .11, .48, .96], ['horn', 50, .25, .41, .86]],
}

const gains = { bgm: .27, se: .22 }
const clampVolume = value => Math.min(100, Math.max(0, Math.round(value)))

export function createBattleAudio() {
  let context
  let music
  let skillNote
  let scene = 'off'
  let bgmId
  const output = {}
  const buffers = new Map()
  const volume = { ...defaults }
  let muted = false
  try {
    muted = localStorage.getItem(soundKey) === 'off'
    for (const channel of Object.keys(volume)) {
      const value = localStorage.getItem(volumeKey + channel)
      if (value !== null && Number.isFinite(Number(value))) volume[channel] = clampVolume(Number(value))
    }
  } catch { /* Storage is optional. */ }

  function updateVolume(channel) {
    if (!output[channel]) return
    const value = channel === 'se' && muted ? 0 : volume[channel]
    output[channel].gain.setTargetAtTime(gains[channel] * value / 100, context.currentTime, .025)
  }

  function persist() {
    try {
      localStorage.setItem(soundKey, muted ? 'off' : 'on')
      for (const [channel, value] of Object.entries(volume)) localStorage.setItem(volumeKey + channel, value)
    } catch { /* Storage is optional. */ }
  }

  function unlock() {
    if (!globalThis.AudioContext) return
    try {
      if (!context) {
        context = new AudioContext()
        for (const channel of Object.keys(gains)) {
          output[channel] = context.createGain()
          output[channel].gain.value = gains[channel] * (channel === 'se' && muted ? 0 : volume[channel]) / 100
          output[channel].connect(context.destination)
        }
        music = createSceneMusic(context, output.bgm)
        skillNote = createInstruments(context, output.se)
      }
      if (context.state === 'suspended') context.resume().catch(() => {})
      if (volume.bgm) {
        music.set(scene, bgmId)
        music.prepare()
      }
    } catch { /* Audio availability does not affect play. */ }
  }

  const enabled = () => !muted && volume.se > 0
  return {
    get enabled() { return enabled() },
    volume(channel) { return channel === 'se' && muted ? 0 : volume[channel] },
    unlock,
    toggle() {
      muted = enabled()
      if (!muted && !volume.se) volume.se = defaults.se
      persist()
      unlock()
      updateVolume('se')
    },
    setVolume(channel, value) {
      if (!Object.hasOwn(volume, channel) || !Number.isFinite(value)) return
      volume[channel] = clampVolume(value)
      if (channel === 'se') muted = false
      persist()
      unlock()
      updateVolume(channel)
    },
    setScene(next, trackId) {
      scene = next
      bgmId = trackId
      if (volume.bgm) music?.set(scene, bgmId)
      else music?.set('off')
    },
    playSkill(style) {
      if (context?.state !== 'running') return
      music?.duck()
      if (!enabled() || !skillPhrases[style]) return
      const start = context.currentTime + .008
      for (const [voice, pitch, offset, duration, velocity] of skillPhrases[style]) {
        skillNote(voice, pitch, start + offset, duration, velocity)
      }
    },
    play(cue, pan = 0) {
      if (!enabled() || context?.state !== 'running') return
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
          source.connect(stereo).connect(output.se)
          source.onended = () => stereo.disconnect()
        } else source.connect(output.se)
        source.start()
        return
      }
      if (cue === 'turn-in' || cue === 'focus-charge' || cue === 'focus-ready') music?.duck()
      for (const [frequency, delay, duration, level = .22, wave = 'sine'] of phrases[cue]) {
        const at = context.currentTime + delay
        const tone = context.createOscillator()
        const envelope = context.createGain()
        tone.type = wave
        tone.frequency.value = frequency
        envelope.gain.setValueAtTime(.001, at)
        envelope.gain.exponentialRampToValueAtTime(level, at + .025)
        envelope.gain.exponentialRampToValueAtTime(.001, at + duration)
        tone.connect(envelope).connect(output.se)
        tone.start(at)
        tone.stop(at + duration)
      }
    },
  }
}
