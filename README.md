# Guitar practice

A Vite React application with composable TypeScript practice modules.

## Run

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite. Choose a Guitar Pro file, click
"Start Audio & Practice", and allow audio input access. The viewer appears after
audio initialization succeeds; click Play once the score and soundfont are ready.
Use the header switch to turn wait mode on or off.

`App.tsx` owns `isAudioInitialized` and the active validator. The start handler
calls the validator directly during the click, rather than relying on a flag to
unlock an AudioContext created later. Permission errors leave the start screen
visible for retry. The viewer reuses that active audio session.

Run `npm run typecheck` for TypeScript checks and `npm run build` for a production
bundle. `npm run preview` serves that bundle locally.

## Integration

Mount the viewer in a Vite React app or a Next.js client component:

```tsx
import { AlphaTabViewer } from "./AlphaTabViewer";

export default function Practice() {
  return <AlphaTabViewer file="/songs/practice.gp" trackIndex={0} />;
}
```

Serve your Guitar Pro file at that URL. Alternatively, pass a stable `Uint8Array`
from a file upload. `trackIndex` selects the guitar track to render and validate.
Use one viewer/audio validator per page: the store represents one practice session.

The standalone viewer's default assets come from the alphaTab 1.8.0 CDN. This
app instead uses `assetBaseUrl="/"`; Vite serves the installed alphaTab `dist`
directory as public assets and copies it into the production build. No asset
download or manual copy is needed for this app. Deploy the build at the site root.
For local
hosting, copy the installed alphaTab `dist` directory into your app's public
directory as `alphatab`, then pass `assetBaseUrl="/alphatab"`. This includes worker
scripts, fonts, and `soundfont/sonivox.sf2`. Ensure your CSP permits your chosen
asset URLs, workers, and audio worklets. For Vite, alphaTab also provides a bundler
plugin if you prefer bundled workers/assets over the URL-based setup here.

## Modules

- `useGuitarStore.ts`: shared wait mode, target, hit, and setters. Setting a target
  also clears the previous hit and advances a revision so repeated pitches reset
  debounce even when the renderer does not observe an intervening null target.
- `audioUtils.ts`: MIDI-to-Hz and Hz-to-FFT-bin conversion using the actual context
  sample rate.
- `useTargetPitchValidator.ts`: call `start(deviceId?)` from a user gesture. It
  requests unprocessed audio, uses FFT size 8192 and Float32 decibel bins, and
  requires three consecutive above-threshold animation frames by default. No input
  is connected to speakers. `stop()` and unmount release tracks, nodes, RAF, and
  AudioContext; late permission responses are also cleaned up.
- `AlphaTabViewer.tsx`: uses alphaTab's actual `playerReady`, `midiLoaded`, and
  `playedBeatChanged` events. `midiLoad` is a method, not an event. Each eligible
  beat pauses playback and publishes its first pitched note's `realValue` as Hz.
  A hit atomically clears the target/hit and resumes playback. The green-note
  rendering placeholder is in the hit effect.

## Audio and MVP limitations

- Microphone access requires HTTPS or localhost. Enable input or click Play to
  request access. Pass `inputDeviceId` to select an audio interface; otherwise
  the browser uses its default input.
- Use headphones or a direct interface input to prevent backing audio from
  validating the target. Calibrate the default -45 dB threshold for input gain.
- This is monophonic: chords validate only the first eligible note. Rests, dead
  notes, and tied continuations do not create targets.
- Energy in a target bin is not proof of an exact pitch. At 48 kHz the bin spacing
  is about 5.86 Hz; a two-bin tolerance can admit neighboring low notes. Harmonics,
  sustained previous notes, and noise can also trigger a hit. Three RAF frames
  debounce the signal but are overlapping FFT observations, not independent
  audio windows or a fresh-pick detector.
- `playedBeatChanged` is a playback notification, not a sample-accurate pre-note
  gate. `pause()` may occur after part of the beat is already scheduled/audible.
  Strict Rocksmith-style gating needs a separate pre-note transport scheduler.
- Verification includes strict TypeScript compilation and mocked behavior checks
  for the audio loop and alphaTab events. Real guitar/audio-interface detection
  still needs verification with your own hardware.
