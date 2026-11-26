import { sceneTrack } from './scene-music.js'

export const battleSceneries = Object.freeze({
  warrior: { name: '黄金の城郭', accent: '#e8b760' },
  mage: { name: '不思議の書庫', accent: '#ae91ec' },
  fighter: { name: '深緑の小径', accent: '#70b390' },
  priest: { name: '暁の花園', accent: '#e6b0c9' },
  merchant: { name: '天空の豆の木', accent: '#72cdb9' },
  seer: { name: '月鏡の回廊', accent: '#a5cde5' },
  swordsman: { name: '黒薔薇の古城', accent: '#b670a3' },
})

// The song, not either participating leader, determines the scenery for the whole match.
export function battleScenery(bgmId) {
  const id = sceneTrack('battle',bgmId)
  return { id, ...battleSceneries[id], artId: 'battle-scene-'+id }
}

export function sceneryAttributes(bgmId, art, extraStyle = '') {
  const scene = battleScenery(bgmId)
  return `data-bgm-scene="${scene.id}" style="--battle-scenery:url('${art(scene.artId)}');--scene-accent:${scene.accent};${extraStyle}"`
}

const preloaded = new Set()
export function preloadBattleScenery(bgmId, art) {
  const url = art(battleScenery(bgmId).artId)
  if (preloaded.has(url)) return
  preloaded.add(url)
  const image = new Image()
  image.decoding = 'async'
  image.onerror = () => preloaded.delete(url)
  image.src = url
}
