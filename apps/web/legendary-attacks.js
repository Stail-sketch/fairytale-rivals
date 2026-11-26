// Presentation only. These profiles never change damage, hits, targeting or card abilities.
// Every currently legendary unit, including generated forms, has an explicit assignment.
const rows = `
night-dragon|breath|#9566ff|#c3caff|✦
token-dragon-emperor|breath|#ff693b|#ffdc78|♛
token-scarf-dragon|breath|#e94b55|#ffd38d|✧
FT-0037|music|#f8c968|#fff3b2|♪
FT-0125|meteor|#e84b45|#ffb977|✦
FT-0126|shadow|#8e76d9|#c9dafa|◈
FT-0127|wave|#4dc5cf|#b6f5ec|≈
FT-0129|rune|#5fcba2|#edd792|◇
FT-0130|flame|#ff814d|#f4be73|♛
FT-0131|hammer|#d26c45|#f6d391|◆
FT-0136|rune|#c4c9eb|#e7c98f|✧
FT-0137|vine|#6ab66b|#c6db8d|❧
FT-0138|meteor|#c4b3e8|#f4d7a8|◈
FT-0139|breath|#e86b83|#ffd4c7|◇
FT-0140|claw|#9ab4f5|#e6e6ff|☽
FT-0150|lantern|#5bbdc1|#ffd294|✧
FT-0151|hammer|#8bcceb|#edf4ff|❄
FT-0165|rune|#f1ca70|#fff2bd|✦
FT-0180|breath|#f8a64a|#ffe6a0|☀
FT-0206|cloud|#b2cae9|#f6e9ff|☁
FT-0242|wave|#ab80ec|#e7c1ff|◈
FT-0248|mirror|#b9a7ef|#cceaff|◇
FT-0267|ice|#e49abb|#e4edff|❄
FT-0271|star|#8bc39b|#efdf94|✦
FT-0285|axe|#b7bcad|#e9b97b|◆
FT-0297|lantern|#f4b16e|#ffe8b4|✧
FT-0307|flame|#d16b8d|#ffba73|♜
FT-0309|rune|#b9dce6|#fff0bc|✧
FT-0326|claw|#e5b854|#ffe7a5|♛
FT-0329|hammer|#b99b7e|#f4d6ad|◆
FT-0348|orb|#88d8c7|#e0a8ee|✧
FT-0349|ice|#a1d5f4|#eeeaff|❄
FT-0370|hammer|#a78bcd|#e9c6b2|◆
FT-0374|blade|#8eb9ef|#f9e8c4|✦
FT-0389|blade|#dc936b|#ffe4b1|☽
FT-0390|feather|#ed6d72|#ffd4a7|✦
FT-0391|dagger|#8e9ee4|#ddd4ff|◇
FT-0392|arrow|#84d9b4|#fff1c8|✧
FT-0393|ribbon|#c291df|#ffc0dd|❧
FT-0402|blade|#94c78c|#f1d58a|♜
FT-0409|orb|#edc774|#dfb4f1|✦
FT-0416|hammer|#85c796|#ecdfad|◆
FT-0425|wave|#b9a0e7|#f5e8c5|✧
FT-0432|jelly|#80c294|#d5eba6|♛
FT-0439|star|#dab47b|#f8e4af|✦
FT-0450|vine|#a75c9f|#e984ab|❧
FT-0468|music|#e0aa67|#ffe1a1|♫
FT-0472|shadow|#9572d7|#d2b4f5|♜
FT-0481|petal|#c0a1e8|#fde3ed|❀
FT-0490|cloud|#9aabd7|#c5d9f3|☽
FT-0491|feather|#e4b3fb|#fff1bd|✦
FT-0500|shadow|#ab9db6|#dccdbf|♛
FT-0504|hammer|#8b9fb7|#d6c5e4|◆
FT-0505|blade|#a2b9cd|#e9ddba|♜
FT-0520|flame|#f5a04e|#ffe7ad|✦
FT-0531|feather|#ec8b81|#f4ccab|❧
FT-0544|shadow|#b08ed8|#ecc1e0|♜
FT-0547|blade|#e5bf78|#cce2ba|✧
FT-0560|ribbon|#e787a8|#f9d2bd|❧
FT-0567|blade|#a4b7df|#e5d2ee|♛
FT-0583|arrow|#8ac6ec|#fff0a7|✦
FT-0590|mirror|#b294e1|#e0cdfd|◇
FT-0596|breath|#91cce1|#f9dda0|♜
FT-0597|star|#a1d7cc|#f5d29b|✧
FT-0601|blade|#8ea5d7|#cdb8ef|♜
FT-0613|shadow|#9c86c7|#eb9b9d|◆
FT-0623|ice|#889de2|#cfb8ef|◈
FT-0634|jelly|#96d5e8|#f6df96|♛
FT-0641|breath|#f4cc88|#eff6ff|☀
FT-0654|hammer|#e5d086|#e2f4ee|♛
FT-0664|star|#b0b4ef|#f2de9b|✧
FT-0674|vine|#bf709d|#f8a9b9|❀
token-set4-aul-act-two|claw|#88d0d8|#f8cd93|Ⅱ
token-set4-aul-act-three|flame|#c39cdd|#ffd09a|Ⅲ
token-set4-aul-act-four|breath|#e5bb78|#fff0bf|Ⅳ
token-set4-serena-dragon|breath|#a0e4d4|#f4d394|✧
token-set4-wish-pages|rune|#b8c4f1|#fff0b5|✧
token-set4-wish-summon|rune|#a4dece|#efdb9b|✧
token-set4-wish-strength|rune|#e6c782|#f5e7b8|✧
token-set4-wish-grimoire|rune|#bb9adf|#e5c7e8|✧`

export const attackMethods = Object.freeze(['blade','dagger','axe','claw','hammer','breath','flame','bolt','ice','wave','rune','mirror','star','meteor','orb','vine','ribbon','feather','petal','cloud','jelly','lantern','music','arrow','shadow'])
const melee = new Set(['blade','dagger','axe','claw','hammer'])
const heavy = new Set(['breath','flame','meteor','wave'])
const signature = id => [...id].reduce((n,ch)=>(Math.imul(n,31)+ch.charCodeAt(0))>>>0,17)
function profile(id,method,color,accent,glyph){
  const hash=signature(id)
  return Object.freeze({ id,method,color,accent,glyph,seed:hash,phase:hash%360,spokes:5+hash%5,
    travelMs:melee.has(method)?215:heavy.has(method)?340:285,
    impactCue:['blade','dagger','axe','claw','shadow'].includes(method)?'slash':method==='hammer'?'blow':'arcane',
    voice:method==='music'?'bell':['petal','wave','jelly','ribbon'].includes(method)?'harp':heavy.has(method)?'horn':melee.has(method)?'viola':'bell',
  })
}
export const legendaryAttacks = Object.freeze(Object.fromEntries(rows.trim().split('\n').map(row=>{const fields=row.split('|');return [fields[0],profile(...fields)]})))
export const rosefireAttack = profile('leader-rosefire','vine','#bd538f','#ff9a9f','❀')
export function attackProfile(before,attack){
  if(!attack)return null
  const player=before.players[attack.seat]
  if(attack.type==='leaderAttack'&&player.awakenedLeader)return rosefireAttack
  const id=attack.type==='leaderAttack'?player.weapon?.card:player.units.find(unit=>unit.id===attack.id)?.card
  return legendaryAttacks[id]??null
}
export const summonTier = card => card?.kind!=='unit'?'none':card.rarity==='legendary'?'legendary':card.cost>=6||card.attack>=6||card.hp>=7?'major':'normal'
