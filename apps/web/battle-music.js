import { createInstruments } from './battle-instruments.js'

// 「月下の綴り」, a 24-bar score in D minor with a separate percussion stem.
const step = 60 / 104 / 2
const bar = 8 * step
const chords = [
  [38, 57, 62, 65, 69], [34, 53, 58, 62, 65], [41, 57, 60, 65, 69], [36, 55, 60, 64, 67],
  [43, 55, 58, 62, 67], [46, 53, 58, 62, 65], [40, 55, 58, 64, 67], [45, 57, 61, 64, 67],
  [38, 57, 62, 65, 69], [41, 57, 60, 65, 69], [46, 57, 58, 62, 65], [36, 55, 60, 62, 67],
  [43, 55, 58, 62, 67], [38, 53, 57, 62, 65], [40, 55, 58, 62, 64], [45, 55, 57, 61, 64],
  [34, 57, 58, 62, 65], [36, 55, 60, 64, 67], [38, 57, 62, 65, 69], [41, 60, 65, 69, 72],
  [43, 55, 58, 62, 67], [34, 53, 58, 62, 65], [45, 57, 61, 64, 67], [45, 55, 57, 61, 64],
]
// Each group is [eighth-note offset, MIDI pitch, duration in eighth notes].
const melody = [
  [[0, 74, 2.6], [3, 77, .8], [4, 76, 1.6], [6, 69, 1.6]],
  [[0, 70, 1.7], [2, 72, .8], [3, 74, 2.7], [6, 77, 1.2]],
  [[0, 79, 1.6], [2, 77, .8], [3, 76, .85], [4, 72, 2.8]],
  [[1, 74, 1.75], [3, 72, .8], [4, 67, 2.3]],
  [[0, 70, 1.6], [2, 74, .8], [3, 79, .85], [4, 77, 2.4]],
  [[0, 77, 2.85], [3, 74, .8], [4, 72, 1.5], [6, 70, 1.5]],
  [[0, 67, 2.65], [3, 70, .8], [4, 74, 2.6]],
  [[0, 73, 2.7], [3, 76, .8], [4, 69, 2.9]],
  [[0, 74, 2.6], [3, 77, .8], [4, 81, 1.65], [6, 79, 1.5]],
  [[0, 77, 2.6], [3, 72, .8], [4, 76, 1.6], [6, 77, 1.45]],
  [[0, 74, 2.65], [3, 70, .8], [4, 69, 2.5]],
  [[0, 67, 1.65], [2, 72, .8], [3, 76, .8], [4, 79, 2.5]],
  [[0, 82, 2.7], [3, 81, .8], [4, 79, 1.55], [6, 74, 1.5]],
  [[0, 77, 2.7], [3, 76, .8], [4, 74, 2.6]],
  [[0, 70, 2.7], [3, 67, .8], [4, 76, 2.5]],
  [[0, 73, 1.6], [2, 69, .75], [3, 76, .8], [4, 81, 2.4]],
  [[0, 82, 1.6], [2, 81, .8], [3, 77, .8], [4, 74, 2.3]],
  [[0, 76, 1.65], [2, 79, .8], [3, 84, .8], [4, 79, 2.5]],
  [[0, 81, 2.7], [3, 77, .8], [4, 76, 1.6], [6, 74, 1.4]],
  [[0, 72, 1.65], [2, 77, .8], [3, 81, .8], [4, 84, 2.5]],
  [[0, 82, 2.65], [3, 79, .8], [4, 77, 2.55]],
  [[0, 74, 2.65], [3, 77, .8], [4, 82, 1.55], [6, 81, 1.5]],
  [[0, 79, 1.65], [2, 76, .8], [3, 73, .8], [4, 69, 2.3]],
  [[0, 73, 2.6], [3, 76, .8], [4, 69, 2.2]],
]

const chamber = (context, master) => {
  const output = context.createGain()
  const echo = context.createConvolver()
  const wet = context.createGain()
  const rate = context.sampleRate
  const impulse = context.createBuffer(2, Math.round(rate * .9), rate)
  let seed = 71346
  for (let side = 0; side < 2; side++) {
    const samples = impulse.getChannelData(side)
    let filtered = 0
    for (let index = 0; index < samples.length; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      filtered += .25 * ((seed / 0x80000000 - 1) - filtered)
      samples[index] = filtered * (1 - index / samples.length) ** 4
    }
  }
  echo.buffer = impulse
  wet.gain.value = .21
  output.connect(master)
  output.connect(echo).connect(wet).connect(master)
  return output
}

const battleLoopSeconds = chords.length * bar

async function loadTracks(context) {
  const tracks = await Promise.all(['battle-score.ogg', 'battle-percussion.ogg'].map(async name => {
    const url = globalThis.fairytaleMusic?.[name] ?? new URL('./assets/' + name, import.meta.url)
    const response = await fetch(url)
    if (!response.ok) throw new Error('戦闘曲を読み込めませんでした。')
    return context.decodeAudioData(await response.arrayBuffer())
  }))
  if (tracks.some(track => Math.abs(track.duration - battleLoopSeconds) > .05)) throw new Error('戦闘曲の長さが不正です。')
  return tracks
}

async function renderTracks() {
  const rate = 24000
  const frames = Math.round(battleLoopSeconds * rate)
  // Capture the second pass so the room reverb also crosses the loop boundary.
  const music = new OfflineAudioContext(2, frames * 2, rate)
  const drums = new OfflineAudioContext(2, frames * 2, rate)
  const plush = music.createGain()
  plush.gain.value = .79
  plush.connect(music.destination)
  const note = createInstruments(music, chamber(music, plush))
  const strike = createInstruments(drums, drums.destination)
  for (let index = 0; index < chords.length * 2; index++) {
    const phrase = index % chords.length
    const [root, ...harmony] = chords[phrase]
    const at = index * frames / rate / chords.length
    note('bass', root, at, step * 3.5, .68)
    note('bass', root + 12, at + step * 4, step * 2.4, .4)
    for (const [voice, pitch] of harmony.entries()) {
      note('viola', pitch, at + voice * .018, step * 7.2, .36 + voice * .045, -.35 + voice * .23)
    }
    const pattern = phrase % 2 ? [0, 2, 1, 3, 2, 0, 1, 3] : [0, 2, 3, 1, 2, 3, 1, 0]
    for (const [offset, voice] of pattern.entries()) {
      note('harp', harmony[voice] + (offset % 3 === 2 ? 12 : 0), at + offset * step, step * .75,
        offset % 4 === 0 ? .69 : .35, -.43)
    }
    for (const [offset, pitch, length] of melody[phrase]) {
      note(phrase >= 16 ? 'horn' : 'flute', pitch, at + step * offset, step * length, offset === 0 ? .79 : .62, .29)
      if (offset === 0 && phrase % 2 === 0) note('bell', pitch + 12, at, step * 2, .27, .5)
    }
    for (const offset of [0, 3, 4, 7]) {
      strike('drum', offset === 0 || offset === 4 ? root - 8 : root - 3,
        at + step * offset, step * .72, offset === 0 ? .83 : .52, -.17)
    }
    for (const offset of [1, 2, 4.5, 5, 6, 7.5]) {
      strike('frame', offset % 2 ? 48 : 42, at + step * offset, step * .35, offset === 6 ? .72 : .49, .32)
    }
  }
  const rendered = await Promise.all([music.startRendering(), drums.startRendering()])
  return rendered.map(source => {
    const loop = new AudioBuffer({ numberOfChannels: 2, length: frames, sampleRate: rate })
    for (let side = 0; side < 2; side++) loop.copyToChannel(source.getChannelData(side).subarray(frames), side)
    return loop
  })
}

const endings = {
  victory: [
    ['horn', 62, 0, .34, .72], ['horn', 69, .21, .38, .74], ['horn', 74, .45, 1.26, .92],
    ['bell', 81, .49, 1.02, .46], ['harp', 69, .32, .58, .52], ['harp', 78, .62, .9, .39],
    ...[38, 57, 66, 69].map(pitch => ['viola', pitch, .43, 1.87, .53]),
  ],
  defeat: [
    ['flute', 74, 0, .37, .59], ['flute', 72, .32, .48, .58], ['flute', 69, .73, 1.21, .58],
    ['harp', 62, .08, .76, .36], ['bell', 65, .77, .88, .36],
    ...[38, 53, 57, 62].map(pitch => ['viola', pitch, .22, 1.91, .43]),
  ],
  draw: [['harp', 62, 0, .55, .51], ['harp', 69, .25, .55, .49], ['bell', 74, .53, 1.11, .52]],
}

const isBattle = scene => scene === 'battle' || scene === 'danger'

export function createBattleMusic(context, output) {
  let scene = 'off'
  let tracks
  let playing
  let ending
  let available
  const music = context.createGain()
  music.connect(output)

  function intensity() {
    if (!playing) return
    const now = context.currentTime
    const beat = 2 * step
    const nextBeat = playing.clock + Math.ceil(Math.max(0, now - playing.clock) / beat) * beat
    playing.drum.gain.cancelScheduledValues(now)
    playing.drum.gain.setTargetAtTime(scene === 'danger' ? .9 : 0, Math.max(now, nextBeat), .43)
  }

  function playLoop() {
    if (playing || !available || !isBattle(scene)) return
    const clock = context.currentTime + .04
    const fade = context.createGain()
    const drum = context.createGain()
    fade.gain.setValueAtTime(0, clock)
    fade.gain.setTargetAtTime(1, clock, .31)
    drum.gain.value = 0
    drum.connect(fade)
    fade.connect(music)
    const sources = available.map((buffer, index) => {
      const source = context.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.loopEnd = Math.min(available[0].duration, available[1].duration)
      source.connect(index ? drum : fade)
      source.start(clock)
      return source
    })
    sources[0].onended = () => { drum.disconnect(); fade.disconnect() }
    playing = { fade, drum, sources, clock }
    intensity()
  }

  function prepare() {
    if (!tracks) {
      tracks = loadTracks(context).catch(error => {
        if (!globalThis.OfflineAudioContext) throw error
        return renderTracks()
      }).then(buffers => {
        available = buffers
        playLoop()
      }).catch(() => {})
    }
  }

  function set(next) {
    if (scene === next) return
    scene = next
    if (isBattle(next)) {
      prepare()
      playLoop()
      intensity()
    } else if (playing) {
      const time = context.currentTime
      playing.fade.gain.setTargetAtTime(0, time, .12)
      for (const source of playing.sources) source.stop(time + .56)
      playing = null
    }
    if (ending) {
      ending.gain.setTargetAtTime(0, context.currentTime, .05)
      ending = null
    }
    if (endings[next]) {
      ending = context.createGain()
      ending.connect(music)
      const note = createInstruments(context, ending)
      const start = context.currentTime + .17
      for (const [voice, pitch, offset, duration, velocity] of endings[next]) {
        note(voice, pitch, start + offset, duration, velocity)
      }
    }
  }

  return {
    set,
    prepare,
    duck() {
      const now = context.currentTime
      music.gain.cancelScheduledValues(now)
      music.gain.setTargetAtTime(.55, now, .045)
      music.gain.setTargetAtTime(1, now + .48, .16)
    },
  }
}
