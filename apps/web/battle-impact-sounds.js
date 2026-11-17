const tau = 2 * Math.PI

const sounds = {
  windup: {
    duration: .135, noise: [2180, 185, .52, .03, .045],
    partials: [[196, 114, .16, .041, .032]],
  },
  slash: {
    duration: .34, noise: [6900, 3100, .44, .002, .062],
    partials: [[1950, 1490, .21, .001, .043], [2730, 2380, .13, .001, .067],
      [1260, 1004, .15, .002, .084], [118, 47, .59, .002, .069]],
  },
  blow: {
    duration: .27, noise: [1450, 420, .37, .001, .042],
    partials: [[108, 39, .82, .001, .063], [225, 78, .25, .001, .029], [510, 160, .12, .001, .018]],
  },
  arcane: {
    duration: .49, noise: [3850, 185, .31, .003, .055],
    partials: [[119, 43, .48, .004, .088], [1025, 360, .31, .005, .092],
      [1380, 1020, .18, .009, .116], [768, 805, .14, .012, .136]],
  },
  guard: {
    duration: .31, noise: [5000, 2100, .22, .001, .034],
    partials: [[810, 580, .42, .002, .063], [1730, 1560, .20, .001, .084], [160, 85, .35, .001, .04]],
  },
  summon: {
    duration: .46, noise: [2150, 110, .22, .006, .086],
    partials: [[86, 41, .65, .002, .092], [261, 249, .09, .018, .12],
      [521, 526, .15, .035, .14], [783, 787, .10, .068, .13], [1047, 1057, .055, .08, .115]],
  },
  equip: {
    duration: .36, noise: [4200, 1280, .34, .002, .047],
    partials: [[970, 901, .22, .001, .071], [1590, 1490, .19, .005, .082],
      [2600, 2440, .15, .003, .078], [150, 72, .39, .002, .066]],
  },
  heal: {
    duration: .51, noise: [2900, 460, .07, .026, .1],
    partials: [[392, 394, .17, .013, .14], [523, 527, .16, .052, .155],
      [659, 664, .13, .079, .148], [1046, 1054, .06, .106, .142]],
  },
}

function envelope(time, rise, decay) {
  return Math.min(1, time / rise) * Math.exp(-time / decay)
}

export function impactSamples(name, sampleRate) {
  if (!Object.hasOwn(sounds, name)) return null
  const sound = sounds[name]
  const { duration, noise: [high, low, noiseGain, rise, decay], partials } = sound
  const samples = new Float32Array(Math.round(duration * sampleRate))
  const lowPass = 1 - Math.exp(-tau * low / sampleRate)
  const highPass = 1 - Math.exp(-tau * high / sampleRate)
  let seed = 0x67ad436b
  let lowBand = 0
  let highBand = 0
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const white = seed / 0x80000000 - 1
    lowBand += (white - lowBand) * lowPass
    highBand += (white - highBand) * highPass
    let sample = (highBand - lowBand) * noiseGain * envelope(time, rise, decay)
    for (const [start, end, level, attack, fall] of partials) {
      const frequencySweep = (end - start) * time * time / (2 * duration)
      sample += Math.sin(tau * (start * time + frequencySweep)) * level * envelope(time, attack, fall)
    }
    const tail = Math.min(1, (samples.length - 1 - index) / (sampleRate * .028))
    samples[index] = Math.tanh(sample) * tail
  }
  return samples
}
