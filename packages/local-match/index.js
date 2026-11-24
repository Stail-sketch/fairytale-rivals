import { attackValue, createGame, dispatch, leaderPower, legalAttack, legalFocus, legalLeaderAttack, legalPlay, legalSkill, playerSkill, rules } from '../engine/index.js'
import { matchPresentation } from '../cards/battle-music.js'

export function project(game, viewer) {
  return {
    phase: game.phase, active: game.active, firstSeat: game.firstSeat ?? 0, turn: game.turn, winner: game.winner,
    matchId: game.matchId, bgmId: game.bgmId,
    specialVictory: game.specialVictory,
    decisionSeat: game.pending?.seat ?? null,
    pending: game.pending && viewer === game.pending.seat ? {
      cards: game.pending.instances.map(instance => instance.card), labels: game.pending.labels,
    } : null,
    players: game.players.map((player, seat) => ({
      leader: player.leader, hp: player.hp, mp: player.mp, maxMp: player.maxMp,
      leaderAttack: player.leaderAttack, leaderPierce: player.leaderPierce, leaderAttacked: player.leaderAttacked,
      weapon: player.weapon, leaderPower: leaderPower(game, seat), leaderStrikes: player.leaderStrikes,
      leaderAttackTotal: player.leaderAttackTotal, focusCount: player.focusCount, spellsUsed: player.spellsUsed,
      awakenedLeader: player.awakenedLeader, skill: playerSkill(player), turnSpells: player.turnSpells, spellLog: player.spellLog,
      leaderNeighbors: player.leaderNeighbors,
      badges: player.badges ?? [], skillOverride: player.skillOverride, brokenWeapons: player.brokenWeapons ?? [],
      temporaryArmor: player.temporaryArmor, blockAttackThrough: player.blockAttackThrough,
      blockSkillThrough: player.blockSkillThrough, nextMpLoss: player.nextMpLoss,
      nextSpellDiscount: player.nextSpellDiscount, nextUnitDiscount: player.nextUnitDiscount,
      spellBonus: player.spellBonus, temporaryPower: player.temporaryPower, turnDiscount: player.turnDiscount,
      fortune: player.fortune, nextFortune: player.nextFortune, copyNextSpell: player.copyNextSpell,
      bothFortunesThisTurn: player.bothFortunesThisTurn, forceLeaderAttackThrough: player.forceLeaderAttackThrough,
      blockBackThrough: player.blockBackThrough, spellTaxThrough: player.spellTaxThrough, spellTax: player.spellTax,
      spellGuardThrough: player.spellGuardThrough,
      boardAttack: Object.fromEntries(player.units.map(unit => [unit.id, attackValue(game, unit)])),
      tension: player.tension, skillUses: player.skillUses, focused: player.focused,
      leaderArmor: player.leaderArmor, fallen: player.fallen,
      deckCount: player.deck.length, handCount: player.hand.length,
      terrain: player.terrain, unitsMoved: player.unitsMoved, phoenix: player.phoenix,
      knightBuff: player.knightBuff, healReversedThrough: player.healReversedThrough,
      hand: viewer === seat ? player.hand : [], units: player.units,
    })),
    events: game.events.filter(event => event.privateTo === undefined || viewer === event.privateTo),
    legal: viewer === game.active && game.phase === 'battle' ? {
      play: Object.fromEntries(game.players[viewer].hand.map(card => [card.id, legalPlay(game, viewer, card.id)])),
      attack: Object.fromEntries(game.players[viewer].units.map(unit => [unit.id, legalAttack(game, viewer, unit.id, true)])),
      leaderAttack: legalLeaderAttack(game, viewer, true),
      focus: legalFocus(game, viewer), skill: legalSkill(game, viewer),
    } : null,
  }
}

export function createLocalMatch(config, savedGame) {
  let game = savedGame ? structuredClone(savedGame) : createGame(config)
  const presentation = matchPresentation(config, game)
  Object.assign(game, presentation)
  const storedConfig = { ...config, ...presentation }
  return {
    view: (viewer = null) => structuredClone(project(game, viewer)),
    act(actor, action) {
      const first = game.events.length
      const result = dispatch(game, actor, action)
      if (result.ok) game = result.game
      const events = result.ok ? game.events.slice(first).filter(event => event.privateTo === undefined) : []
      return { ok: result.ok, issue: result.issue, events: structuredClone(events) }
    },
    exportReplay: () => structuredClone({ version: 1, ruleset: rules.id, config: storedConfig, history: game.history }),
    // Trusted server storage only; never send this unprojected state to a player.
    exportState: () => structuredClone({ config: storedConfig, game }),
  }
}

