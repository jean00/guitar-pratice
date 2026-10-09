"use client";

import { useEffect, useRef, useState } from "react";
import { AlphaTabApi, model, synth } from "@coderline/alphatab";
import { midiNoteToFrequency } from "./audioUtils";
import { useGuitarStore } from "./useGuitarStore";
import { useTargetPitchValidator } from "./useTargetPitchValidator";

export interface AlphaTabViewerProps {
  file: string | Uint8Array;
  trackIndex?: number;
  assetBaseUrl?: string;
  inputDeviceId?: string;
  audioInput?: ReturnType<typeof useTargetPitchValidator>;
}

export function AlphaTabViewer({
  file,
  trackIndex = 0,
  assetBaseUrl = "https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.8.0/dist",
  inputDeviceId,
  audioInput,
}: AlphaTabViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const pendingBeatRef = useRef<model.Beat | null>(null);
  const lastBeatIdRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const isWaitMode = useGuitarStore((state) => state.isWaitMode);
  const isHit = useGuitarStore((state) => state.isHit);
  const expectedFrequency = useGuitarStore((state) => state.expectedFrequency);
  const localInput = useTargetPitchValidator();
  const input = audioInput ?? localInput;

  useEffect(() => {
    if (!containerRef.current) return;
    setReady(false);
    setPlaying(false);
    setPlayerError(null);
    lastBeatIdRef.current = null;
    pendingBeatRef.current = null;
    useGuitarStore.getState().setExpectedFrequency(null);
    const assets = assetBaseUrl.replace(/\/$/, "");
    const api = new AlphaTabApi(containerRef.current, {
      core: {
        scriptFile: `${assets}/alphaTab.min.js`,
        fontDirectory: `${assets}/font/`,
      },
      player: {
        enablePlayer: true,
        soundFont: `${assets}/soundfont/sonivox.sf2`,
      },
    });
    apiRef.current = api;
    let playerReady = false;
    let midiReady = false;
    const updateReady = () => setReady(playerReady && midiReady);
    const onPlayerReady = () => {
      playerReady = true;
      updateReady();
    };
    const onMidiLoaded = () => {
      midiReady = true;
      updateReady();
    };
    const onStateChanged = (event: synth.PlayerStateChangedEventArgs) => {
      setPlaying(event.state === synth.PlayerState.Playing);
    };
    const onError = (cause: Error) => {
      setPlayerError(cause.message);
      setReady(false);
    };
    const onFinished = () => {
      lastBeatIdRef.current = null;
      pendingBeatRef.current = null;
      useGuitarStore.getState().setExpectedFrequency(null);
      setPlaying(false);
    };
    const onBeatChanged = (beat: model.Beat) => {
      const state = useGuitarStore.getState();
      if (beat.voice.bar.staff.track.index !== trackIndex || lastBeatIdRef.current === beat.id || pendingBeatRef.current) return;
      lastBeatIdRef.current = beat.id;
      if (!state.isWaitMode) return;
      const note = beat.notes.find((candidate) => !candidate.isTieDestination && !candidate.isDead);
      if (!note) return;
      api.pause();
      pendingBeatRef.current = beat;
      state.setExpectedFrequency(midiNoteToFrequency(note.realValue));
    };

    api.playerReady.on(onPlayerReady);
    api.midiLoaded.on(onMidiLoaded);
    api.playedBeatChanged.on(onBeatChanged);
    api.playerStateChanged.on(onStateChanged);
    api.playerFinished.on(onFinished);
    api.error.on(onError);
    api.load(file, [trackIndex]);

    return () => {
      api.playerReady.off(onPlayerReady);
      api.midiLoaded.off(onMidiLoaded);
      api.playedBeatChanged.off(onBeatChanged);
      api.playerStateChanged.off(onStateChanged);
      api.playerFinished.off(onFinished);
      api.error.off(onError);
      apiRef.current = null;
      pendingBeatRef.current = null;
      useGuitarStore.getState().setExpectedFrequency(null);
      api.destroy();
    };
  }, [file, trackIndex, assetBaseUrl]);

  useEffect(() => {
    if (!isHit || !isWaitMode || !pendingBeatRef.current) return;
    // TODO: color pendingBeatRef.current's validated note green in the rendered SVG/canvas.
    pendingBeatRef.current = null;
    useGuitarStore.getState().setExpectedFrequency(null);
    apiRef.current?.play();
  }, [isHit, isWaitMode]);

  useEffect(() => {
    if (!isWaitMode && pendingBeatRef.current) {
      pendingBeatRef.current = null;
      useGuitarStore.getState().setExpectedFrequency(null);
      apiRef.current?.play();
    }
  }, [isWaitMode]);

  async function startPractice() {
    if (isWaitMode && !input.isListening && !(await input.start(inputDeviceId))) return;
    apiRef.current?.play();
  }

  return (
    <section aria-label="Guitar practice">
      <div role="group" aria-label="Practice controls">
        <button
          type="button"
          disabled={!ready || input.status === "starting" || expectedFrequency !== null}
          onClick={() => {
            if (playing) apiRef.current?.pause();
            else void startPractice();
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          disabled={input.status === "starting"}
          onClick={() => {
            if (input.isListening) {
              apiRef.current?.pause();
              input.stop();
            } else void input.start(inputDeviceId);
          }}
        >
          {input.isListening ? "Disable input" : "Enable input"}
        </button>
        <label>
          <input
            type="checkbox"
            checked={isWaitMode}
            onChange={(event) => useGuitarStore.getState().setIsWaitMode(event.target.checked)}
          />
          Wait mode
        </label>
      </div>
      {expectedFrequency !== null && <output aria-live="polite">Target: {expectedFrequency.toFixed(1)} Hz</output>}
      {(playerError || input.error) && <p role="alert">{playerError || input.error}</p>}
      <div ref={containerRef} />
    </section>
  );
}
