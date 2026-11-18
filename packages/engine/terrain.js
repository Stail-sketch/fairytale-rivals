import { orbNames, terrains } from '../cards/names.js'
import { positions, samePosition } from './rules.js'

export const orbCards = Object.freeze(Object.keys(orbNames).map(stage => 'token-' + stage))
export const isOrb = terrain => typeof terrain === 'string' && terrain.startsWith('orb-')
export const terrainName = id => terrains[id] ?? orbNames[id]
export const terrainText = Object.freeze({
  runway: 'この後衛マスにいるユニットは、同じ列の前衛が空いていれば転位する。前衛が埋まっている場合は待機し、前衛ユニットが退場して空いたときにも転位する。',
  treasure: 'ユニットが踏むと商人の特技か武器が1枚手に入り、この舞台は消える。',
  hazard: 'ユニットが踏むと1ダメージ。',
  sword: 'ユニットがいる間、味方の武器で与えるダメージ+1。',
  circle: 'ユニットがいる間、味方の特技ダメージ+1。',
  blessing: 'ここにいるユニットの攻撃力は現在のHPと同じになる。',
  rest: 'ここにいるユニットは攻撃できない。',
  guide: 'ここにいるユニットの退場時、コストが1高いカードを山札から1枚得て、この舞台は消える。',
})

export const terrainKey = ({ row, column }) => row + ':' + column
export const terrainAt = (game, seat, position) => position && game.players[seat].terrain?.[terrainKey(position)]
export const terrainCount = (game, seat) => Object.keys(game.players[seat].terrain ?? {}).length
export const occupiedTerrainCount = (game, seat, terrain) => game.players[seat].units.filter(unit =>
  unit.hp > 0 && terrainAt(game, seat, unit.position) === terrain).length

export function terrainSpaces(game, actor, { side, row, fresh, nonOrb, existing, empty, unprotected }) {
  const seats = side === 'both' ? [actor, 1 - actor] : [side === 'enemy' ? 1 - actor : actor]
  return seats.flatMap(seat => positions.flatMap(position => {
    const terrain = terrainAt(game, seat, position)
    if ((row && row !== position.row) || (fresh && terrain) || (nonOrb && isOrb(terrain)) ||
        (existing && !terrain) || (unprotected && terrain === 'rest')) return []
    if (empty && game.players[seat].units.some(unit => samePosition(unit.position, position))) return []
    return [{ ...position, seat }]
  }))
}
