const soundKey = 'fairytale-battle-sound'
const phrases = {
  draw: [[825, 0, .065], [430, .035, .09]],
  turn: [[360, 0, .09], [540, .065, .12]],
  summon: [[185, 0, .08], [370, .045, .10]],
  equip: [[620, 0, .05], [950, .025, .08]],
  attack: [[170, 0, .10], [74, .033, .13]],
  spell: [[450, 0, .11], [690, .035, .12]],
  heal: [[392, 0, .12], [588, .07, .15]],
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
    play(cue) {
      if (!enabled || context?.state !== 'running') return
      for (const [frequency, delay, duration] of phrases[cue] ?? []) {
        const at = context.currentTime + delay
        const tone = context.createOscillator()
        const envelope = context.createGain()
        tone.type = cue === 'attack' || cue === 'equip' ? 'triangle' : 'sine'
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
