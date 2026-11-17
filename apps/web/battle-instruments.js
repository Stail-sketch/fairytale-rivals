export const midiFrequency = note => 440 * 2 ** ((note - 69) / 12)

const voices = {
  viola: { harmonics: [1, .43, .26, .21, .12, .07], attack: .15, release: .31, width: 8, level: .11 },
  horn: { harmonics: [1, .63, .27, .09, .038], attack: .072, release: .21, width: 4, level: .16 },
  flute: { harmonics: [1, .5, .14, .045], attack: .051, release: .16, vibrato: 5, level: .14 },
  bass: { harmonics: [1, .45, .19, .073], attack: .027, release: .17, fall: .49, level: .2 },
  harp: { harmonics: [1, .47, .22, .13, .048], attack: .008, release: .32, fall: .31, level: .24 },
  bell: { harmonics: [1, .23, .17, .038], attack: .004, release: .45, fall: .26, shimmer: 2.76, level: .19 },
  drum: { harmonics: [1, .29, .14], attack: .004, release: .15, fall: .145, pitchDrop: .72, level: .35 },
  frame: { harmonics: [1, .38, .21, .09, .025], attack: .005, release: .10, fall: .085, pitchDrop: .45, level: .22 },
}

export function createInstruments(context, output) {
  const waves = new Map()
  const buses = new Map()
  const panBus = pan => {
    if (!pan || !context.createStereoPanner) return output
    if (!buses.has(pan)) {
      const node = context.createStereoPanner()
      node.pan.value = pan
      node.connect(output)
      buses.set(pan, node)
    }
    return buses.get(pan)
  }

  return function note(voice, pitch, start, duration, velocity, pan = 0) {
    const { harmonics, attack, release, width, level, fall, vibrato, shimmer, pitchDrop } = voices[voice]
    if (!waves.has(voice)) {
      const imaginary = Float32Array.from([0, ...harmonics])
      waves.set(voice, context.createPeriodicWave(new Float32Array(imaginary.length), imaginary))
    }
    const envelope = context.createGain()
    const strength = velocity * level
    const attackEnd = start + Math.min(attack, duration * .55)
    const finish = start + duration + release
    envelope.gain.setValueAtTime(.0001, start)
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, strength), attackEnd)
    if (fall) envelope.gain.setTargetAtTime(.0001, attackEnd, fall)
    envelope.gain.setTargetAtTime(.0001, start + duration, release / 4)
    envelope.connect(panBus(pan))
    const frequency = midiFrequency(pitch)
    const oscillators = width ? [-width, width] : [0]
    for (const detune of oscillators) {
      const oscillator = context.createOscillator()
      oscillator.setPeriodicWave(waves.get(voice))
      oscillator.detune.value = detune
      oscillator.frequency.setValueAtTime(frequency * (1 + (pitchDrop ?? 0)), start)
      if (pitchDrop) oscillator.frequency.setTargetAtTime(frequency, start, .024)
      oscillator.connect(envelope)
      oscillator.start(start)
      oscillator.stop(finish)
      if (detune === oscillators[0]) oscillator.onended = () => envelope.disconnect()
      if (vibrato) {
        const lfo = context.createOscillator()
        const depth = context.createGain()
        lfo.frequency.value = vibrato
        depth.gain.value = 7
        lfo.connect(depth).connect(oscillator.detune)
        lfo.start(start)
        lfo.stop(finish)
      }
    }
    if (shimmer) {
      const overtone = context.createOscillator()
      const gain = context.createGain()
      overtone.frequency.value = frequency * shimmer
      gain.gain.setValueAtTime(.0001, start)
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002, strength * .36), attackEnd)
      gain.gain.exponentialRampToValueAtTime(.0001, start + Math.min(.37, duration + release))
      overtone.connect(gain).connect(panBus(pan))
      overtone.start(start)
      overtone.stop(start + Math.min(.37, duration + release))
      overtone.onended = () => gain.disconnect()
    }
  }
}
