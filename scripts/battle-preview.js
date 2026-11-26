import { createGame, dispatch } from '../packages/engine/index.js'
import { createInstance, resolution } from '../packages/engine/effects.js'
import { starterLineup } from '../packages/cards/decks.js'

// Development-only fixture; never copied to the Cloudflare build or saved in the deck collection.
export function battlePreviewFixture() {
  const config = { seed: 527, format: 'arena', lineups: [starterLineup('mage'), starterLineup('priest')] }
  let game = createGame(config)
  for (const seat of [0,1]) game = dispatch(game,seat,{ type: 'mulligan', replace: [] }).game
  const resolver = resolution(game)
  const units = [
    [0,'brass-squire','front',0], [0,'night-dragon','back',1],
    [0,'twig-guard','front',2], [0,'ember-whelp','back',2],
    [1,'brass-squire','front',0], [1,'night-dragon','front',1], [1,'ember-whelp','back',2], [1,'moon-hare','back',0],
  ]
  for (const [seat,id,row,column] of units) resolver.summon(seat,createInstance(game,id),{row,column})
  resolver.settle()
  for (const player of game.players) {
    player.mp = player.maxMp = 10
    player.hand = ['brass-squire','ember-whelp','twig-guard','night-dragon','spark'].map(id=>createInstance(game,id))
    for (const unit of player.units) { unit.summonedTurn = -1; unit.attacks = 0 }
  }
  return { config, game }
}
