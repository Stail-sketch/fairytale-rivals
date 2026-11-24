import { battleMusicIds } from '../../packages/cards/battle-music.js'
import { createBattleMusic } from './battle-music.js'

export const bgmFiles = Object.freeze(Object.fromEntries(['menu', 'deck', 'arena', ...battleMusicIds, 'victory', 'defeat'].map(id => [id, 'bgm-' + id + '.ogg'])))
export const sceneTrack = (scene, bgmId) => scene === 'battle' || scene === 'danger' ?
  (battleMusicIds.includes(bgmId) ? bgmId : 'warrior') : Object.hasOwn(bgmFiles, scene) ? scene : null

export function createSceneMusic(context, output, audioFactory = url => new Audio(url)) {
  const bus = context.createGain()
  bus.gain.value = 2.4
  bus.connect(output)
  const fallback = createBattleMusic(context, output)
  let scene = 'off', desired = null, current = null, generation = 0

  function retire(track) {
    if (!track || track.retiring) return
    track.retiring = true
    const now = context.currentTime
    track.gain.gain.cancelScheduledValues(now)
    track.gain.gain.setTargetAtTime(0, now, .10)
    setTimeout(() => {
      track.audio.pause()
      track.audio.removeAttribute('src')
      track.audio.load()
      track.source.disconnect()
      track.gain.disconnect()
    }, 650)
  }
  function start() {
    if (!desired) return
    if (current?.id === desired) {
      if (current.audio.paused && !current.audio.ended) current.audio.play().catch(() => {})
      return
    }
    const id = desired, request = ++generation
    const file = bgmFiles[id]
    const url = globalThis.fairytaleMusic?.[file] ?? new URL('./assets/' + file, import.meta.url).href
    const audio = audioFactory(url)
    audio.loop = id !== 'victory' && id !== 'defeat'
    audio.preload = 'auto'
    const gain = context.createGain()
    gain.gain.value = 0
    const source = context.createMediaElementSource(audio)
    source.connect(gain).connect(bus)
    const previous = current
    const track = { id, audio, gain, source }
    current = track
    retire(previous)
    audio.addEventListener('playing', () => {
      if (request !== generation || current !== track) return
      fallback.set('off')
      gain.gain.setTargetAtTime(1, context.currentTime, .24)
    })
    audio.addEventListener('error', () => {
      if (request !== generation || current !== track) return
      current = null
      retire(track)
      if (['battle', 'danger', 'victory', 'defeat'].includes(scene)) fallback.set(scene)
    }, { once: true })
    audio.play().catch(() => {}) // A later user gesture calls prepare and retries autoplay.
  }
  return {
    prepare: start,
    set(next, bgmId) {
      const id = sceneTrack(next, bgmId)
      if (scene === next && desired === id) return
      scene = next
      if (id === desired && id) return // Battle -> danger preserves the selected full song and playback position.
      desired = id
      fallback.set(next === 'draw' ? next : 'off')
      if (id) start()
      else { ++generation; retire(current); current = null }
    },
    duck() {
      const now = context.currentTime
      bus.gain.cancelScheduledValues(now)
      bus.gain.setTargetAtTime(1.5, now, .045)
      bus.gain.setTargetAtTime(2.4, now + .48, .16)
      fallback.duck()
    },
  }
}
