export type Seat = 0 | 1
export type Row = 'front' | 'back'
export type Column = 0 | 1 | 2
export type Position = { row: Row; column: Column }
export type BoardPosition = Position & { seat?: Seat }
export type TerrainId = 'sword' | 'circle' | 'blessing' | 'rest' | 'guide' | 'runway' | 'hazard' | 'treasure'
  | 'orb-red' | 'orb-yellow' | 'orb-green' | 'orb-blue' | 'orb-purple' | 'orb-silver'
export type TerrainPlacement = {
  side: 'own' | 'enemy' | 'both'; row?: Row; fresh?: boolean; nonOrb?: boolean;
  existing?: boolean; empty?: boolean; unprotected?: boolean;
}
export type Target = { kind: 'leader'; seat: Seat } | { kind: 'unit'; id: number }
export type TargetRule = 'enemy' | 'enemyUnit' | 'ally' | 'allyUnit' | 'anyUnit' | 'anyCharacter'
export type Status = 'POISON' | 'SILENCE' | 'INVULNERABLE'
export type StoryBadge = {
  id?: number; card?: string; family?: 'slime' | 'dragon' | 'undead' | 'adventurer'; metal?: boolean;
  attack?: number; hp?: number; discount?: number; keyword?: Keyword; amount?: number;
  event?: 'weaponRust' | 'heal' | 'damage' | 'mp' | 'tension' | 'endBuff'
}
export type Keyword = 'CHARGE' | 'GUARD' | 'AIM' | 'PIERCE' | 'DOUBLE_ATTACK' | 'STEALTH' | 'METAL_BODY' | 'CHEER'
  | 'FINISHER' | 'SUPER_PIERCE' | 'VULNERABLE' | 'UNTARGETABLE' | 'DARK_CLOAK' | 'RESIST_SPELL' | 'HARD_METAL_BODY'
export type Trigger = 'ON_SUMMON' | 'ON_DEATH' | 'ON_ATTACK' | 'TENSION_LINK' | 'SKILL_LINK'
  | 'ON_ALLY_SPELL' | 'ON_ALLY_HEAL' | 'ON_TURN_START' | 'ON_TURN_END' | 'ON_ANY_TURN_END'
  | 'ON_COMBAT' | 'ON_LEADER_ATTACK' | 'ON_LEADER_KILL' | 'ON_DEAL_DAMAGE' | 'ON_KILL' | 'ON_WEAPON_BREAK'
  | 'ON_ALLY_PLAY' | 'ON_ALLY_ENTER' | 'ON_ALLY_DEATH' | 'ON_SELF_SPELL' | 'ON_OTHER_SPELL'
  | 'ON_ENEMY_SPELL_BEFORE' | 'ON_SPELL_KILL' | 'ON_LEADER_HEAL'
  | 'ON_FORTUNE' | 'ON_FORTUNE_FIRST' | 'ON_FORTUNE_SECOND' | 'ON_ALLY_UNIT_ATTACK'
  | 'ON_MOVE' | 'ON_ENEMY_DEATH' | 'ON_ENEMY_FOCUS' | 'ON_GUIDE_DRAW' | 'ON_ALLY_DAMAGE'
export type ClassId = 'warrior' | 'mage' | 'fighter' | 'priest' | 'merchant' | 'seer' | 'swordsman'
export type EffectTarget = 'chosen' | 'self' | 'ownLeader' | 'enemyLeader' | 'allies' | 'allyUnits' | 'enemyUnits' | 'allUnits'
  | 'bothLeaders' | 'allCharacters' | 'enemies' | 'otherUnits' | 'otherAllies' | 'otherCharacters'
  | 'frontEnemies' | 'backEnemies' | 'frontUnits' | 'backUnits'
  | 'enemyColumn' | 'allyColumn' | 'allColumn' | 'enemyRow' | 'allyRow' | 'allRow'
  | 'alignedAlly' | 'enemyOpposite' | 'crossEnemy' | 'justAhead' | 'ownFrontNeighbor' | 'neighborOfTarget' | 'adjacentToTarget'
export type EffectCondition = readonly [kind: string, value: string | number | boolean]
export type Effect = (
  | { id: 'fourth'; operation: string; [parameter: string]: unknown }
  | { id: 'storyBadge'; badge: StoryBadge }
  | { id: 'damage'; amount: number; to: EffectTarget; boost?: number }
  | { id: 'heal'; amount: number; to: EffectTarget }
  | { id: 'buff'; attack: number; hp: number; to: EffectTarget; boost?: number }
  | { id: 'status'; status: Status; to: EffectTarget }
  | { id: 'exile' | 'destroy' | 'swapRank'; to: EffectTarget }
  | { id: 'move'; row: Row; to: EffectTarget }
  | { id: 'draw' | 'discard' | 'tension' | 'mp' | 'ramp' | 'temporaryMp'; amount: number }
  | { id: 'enemyDraw' | 'healWounded'; amount: number }
  | { id: 'randomHits' | 'leaderArmor'; amount: number; boost: number }
  | { id: 'nothing' | 'drawOdd' | 'recoverFallen' }
  | { id: 'generate' | 'summon'; card: string }
  | { id: 'generateRandom'; cards: readonly string[]; amount: number }
  | { id: 'drawDiscountedSpell'; amount: number; fallback: string }
  | { id: 'leaderPower'; amount: number; pierce?: boolean; neighbors?: boolean }
  | { id: 'randomEffect'; options: readonly Effect[] }
  | { id: 'grant'; keyword: Keyword; to: EffectTarget }
  | { id: 'grantAbility'; ability: Ability; to: EffectTarget }
  | { id: 'return' | 'borrow' | 'freeze' | 'moveDown' | 'moveCenter' | 'moveOpposite' | 'moveAligned'; to: EffectTarget }
  | { id: 'setAttack' | 'setHp' | 'multiplyAttack' | 'repeatDamage' | 'hitAndSummon' | 'transform'; to: EffectTarget;
      amount?: number; delta?: number; fromHp?: boolean; fromChosen?: boolean; card?: string; count?: number; times?: number }
  | { id: 'drawMatching' | 'summonMatching' | 'summonPool' | 'generateMatching' | 'discountMatching' | 'resurrect';
      filter?: Record<string, string | number>; amount?: number; boost?: number; highest?: boolean; enemy?: boolean }
  | { id: 'peek'; mode: 'topOrBottom' | 'arrangeTop' | 'drawOne' | 'handToDeck' | 'usedSpellToDeck'; amount?: number }
  | { id: 'tensionSummon' | 'combine' | 'putTop' | 'equip'; card: string; partner?: string; enemy?: boolean }
  | { id: 'awakening'; weapon: string }
  | { id: 'setFortune'; mode: 'choose' | 'both' | 'next' | 'temporaryBoth'; repeatTension?: number }
  | { id: 'chance'; probability: number; success: Effect; failure?: Effect }
  | { id: 'buffWeapon' | 'healByKills'; attack?: number; hp?: number; amount?: number; multiplier?: number; to?: EffectTarget }
  | { id: 'bothDraw' | 'drawActive' | 'discountTop' | 'destroyRandomSpaces' | 'scatterSpaces' | 'wearWeapon'
      | 'enemyMpLoss' | 'spellTax' | 'turnDiscount' | 'nextDiscount' | 'spellBonus' | 'changeTension' | 'duelTop';
      amount: number; boost?: number; both?: boolean; enemy?: boolean; kind?: 'unit' | 'spell' }
  | { id: 'drawForTension' | 'copyChosen' | 'drawTopCopy' | 'upgradeHand' | 'randomFromHand' | 'copySpellEffect'
      | 'destroyWeapon' | 'stealWeapon' | 'blockSkill' | 'blockBack' | 'forceLeaderAttack' | 'spellGuard'
      | 'copyNextSpell' | 'moveBackEnemy' | 'swapAllEnemies'; others?: boolean; enemy?: boolean }
  | { id: 'setStage'; stage?: TerrainId | null; area?: string; fresh?: boolean; copy?: boolean }
  | { id: 'placeOrb'; color: string }
  | { id: 'spendHeat'; effect: Effect }
  | { id: 'selectHand' | 'stageDamage' | 'randomLaneDamage'; amount?: number; discount?: number }
  | { id: 'discardUnits' | 'timedUnitState' | 'scheduleReturn' | 'takeControl' | 'spendMpDamage'
      | 'hitSpawn' | 'randomMove' | 'reverseHealing' | 'recoverOwnSpells' | 'copyUnitStats'
      | 'burnTreasure' | 'powerByHealing' | 'sacrifice' | 'knightBuff' | 'returnToDeck'
      | 'discountDrawTop' | 'seedOrbs' }
) & {
  when?: EffectCondition; otherwise?: readonly Effect[]; from?: string; temporary?: boolean; randomTargets?: number;
  [parameter: string]: unknown
}
export type Ability = { trigger: Trigger; effects: readonly Effect[]; once?: boolean }
export type Choice = { label: string; effects: readonly Effect[] }
export type Card = {
  id: string; packId: string; classId: ClassId | 'neutral'; species: string | null;
  rarity: 'unlabeled' | 'common' | 'rare' | 'superRare' | 'legendary'; cost: number; name: string;
  kind: 'unit' | 'spell' | 'weapon'; attack: number; hp: number; artId: string; description: string;
  implementation: 'prototype' | 'implemented'; tests: 'covered'; keywords: readonly Keyword[];
  boost?: { attack?: number; hp?: number; cost?: number };
  origin?: string;
  target: TargetRule | null; effects: readonly Effect[]; abilities: readonly Ability[];
  choice: readonly Choice[] | null; fortune?: readonly Choice[];
  targetFilter?: Record<string, string | number | boolean>; place?: { side: 'own' | 'enemy'; empty?: boolean };
  terrainPlace?: TerrainPlacement; handSelection?: boolean; requiresHandSelection?: boolean; handKind?: Card['kind'];
  handFamily?: string; badge?: StoryBadge; wishChoices?: boolean;
  family?: 'adventurer' | 'slime' | 'undead' | 'dragon'; extraPlacement?: boolean; useSummonColumn?: boolean;
}
export type Instance = { id: number; card: string; discount?: number; bonusAttack?: number; bonusHp?: number }
export type Unit = Instance & {
  owner: Seat; position: Position; attack: number; hp: number; maxHp: number;
  attacks: number; revealed: boolean; statuses: Status[]
  grants?: Keyword[]; extraAbilities?: Ability[];
  badgeKeywords?: Keyword[]; badgeHp?: number; boundTo?: { source: number; owner: Seat; position: Position };
}
export type Weapon = Instance & { owner: Seat; attack: number; durability: number }
export type Player = {
  leader: ClassId; hp: number; mp: number; maxMp: number; tension: number; skillUses: number;
  leaderAttack: number; leaderPierce: boolean; leaderAttacked: boolean; leaderArmor: number;
  focused: boolean; deck: Instance[]; hand: Instance[]; graveyard: Instance[];
  units: Unit[]; fallen: string[]; weapon: Weapon | null;
  leaderStrikes: number; leaderAttackTotal: number; focusCount: number; spellsUsed: number;
  fortune?: 'choose' | 'both'; awakenedLeader?: boolean;
  terrain?: Partial<Record<`${Row}:${Column}`, TerrainId>>; unitsMoved?: number; phoenix?: boolean;
  knightBuff?: number; healReversedThrough?: number; nextTurnCards?: string[];
  badges?: StoryBadge[]; brokenWeapons?: string[]; skillOverride?: 'dragonGuide' | 'deadAwakening' | 'dragonBlessing';
}
export type Action =
  | { type: 'mulligan'; replace: number[] }
  | { type: 'play'; id: number; position?: BoardPosition; extraPosition?: BoardPosition; column?: Column;
      target?: Target; choice?: number; handChoice?: number }
  | { type: 'attack'; id: number; target: Target }
  | { type: 'leaderAttack'; target: Target }
  | { type: 'focus' }
  | { type: 'skill'; target?: Target; position?: Position; choice?: number }
  | { type: 'decide'; choice: number }
  | { type: 'end' }
export type EffectAnchor =
  | { kind: 'leader'; seat: Seat; card?: string }
  | { kind: 'unit'; seat: Seat; id: number; position: Position; card: string }
  | { kind: 'card'; seat: Seat; card: string }
export type Event = {
  seq: number; type: string; seat?: Seat; id?: number; target?: Target;
  card?: string; value?: number; position?: Position; text: string;
  played?: boolean; cost?: number; name?: string; triggered?: boolean;
  source?: EffectAnchor; destination?: EffectAnchor;
  protection?: 'INVULNERABLE' | 'DARK_CLOAK' | 'METAL_BODY' | 'SPELL_WARD' | 'RESIST_SPELL';
  afterFrontDeath?: boolean;
  privateTo?: Seat; terrain?: TerrainId | null
}
export type Game = {
  phase: 'mulligan' | 'battle' | 'finished'; active: Seat; turn: number;
  winner: Seat | 'draw' | null; specialVictory?: Seat; seed: number; rng: number; nextId: number;
  players: [Player, Player]; exiled: Instance[]; events: Event[];
  history: { actor: Seat; action: Action }[];
  pending?: { seat: Seat; mode: string; labels: string[]; instances: Instance[] };
}
export type LegalAction = {
  enabled: boolean; reason?: string; positions?: BoardPosition[]; targets?: Target[];
  forecasts?: ({ target: Target; note: string } | { target: Target; damage: number; retaliation: number; hp: number; attackerHp: number })[];
  protection?: { covered?: Record<number, number>; wall?: number[]; guards?: number[] };
  choices?: string[]; columns?: Column[]; cost?: number; positionSeat?: Seat; extraPositions?: BoardPosition[]; handChoices?: number[];
}

