export function midiNoteToFrequency(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

export function frequencyToBinIndex(frequency: number, fftSize: number, sampleRate: number): number {
  return Math.round((frequency * fftSize) / sampleRate);
}
