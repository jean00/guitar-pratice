"use client";

import { useEffect, useRef, useState } from "react";
import { frequencyToBinIndex } from "./audioUtils";
import { useGuitarStore } from "./useGuitarStore";

type InputStatus = "idle" | "starting" | "listening" | "error";

interface AudioSession {
  context: AudioContext;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  frameId: number;
}

export function useTargetPitchValidator(thresholdDb = -45, toleranceBins = 2, requiredConsecutiveFrames = 3) {
  if (
    !Number.isFinite(thresholdDb) ||
    !Number.isInteger(toleranceBins) ||
    toleranceBins < 0 ||
    !Number.isInteger(requiredConsecutiveFrames) ||
    requiredConsecutiveFrames < 1
  ) {
    throw new RangeError("Provide a finite threshold and valid integer debounce settings.");
  }

  const [status, setStatus] = useState<InputStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<AudioSession | null>(null);
  const generationRef = useRef(0);
  const startingRef = useRef(false);
  const optionsRef = useRef({ thresholdDb, toleranceBins, requiredConsecutiveFrames });

  useEffect(() => {
    optionsRef.current = { thresholdDb, toleranceBins, requiredConsecutiveFrames };
  }, [thresholdDb, toleranceBins, requiredConsecutiveFrames]);

  function releaseSession() {
    generationRef.current += 1;
    startingRef.current = false;
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session) return;
    cancelAnimationFrame(session.frameId);
    session.stream.getTracks().forEach((track) => track.stop());
    session.source.disconnect();
    session.analyser.disconnect();
    void session.context.close().catch(() => undefined);
  }

  useEffect(() => () => releaseSession(), []);

  function stop() {
    releaseSession();
    useGuitarStore.getState().setIsHit(false);
    setStatus("idle");
    setError(null);
  }

  async function start(deviceId?: string): Promise<boolean> {
    if (sessionRef.current || startingRef.current) return false;
    const generation = ++generationRef.current;
    startingRef.current = true;
    setStatus("starting");
    setError(null);
    let context: AudioContext | null = null;
    let stream: MediaStream | null = null;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Audio input requires HTTPS or localhost and microphone support.");
      }
      context = new AudioContext({ latencyHint: "interactive" });
      await context.resume();
      if (generation !== generationRef.current) {
        await context.close();
        return false;
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      });
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        await context.close();
        return false;
      }

      const analyser = context.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      const bins = new Float32Array(analyser.frequencyBinCount);
      const session: AudioSession = { context, stream, source, analyser, frameId: 0 };
      sessionRef.current = session;
      let consecutiveFrames = 0;
      let lastRevision = -1;

      function validateFrame() {
        if (sessionRef.current !== session) return;
        const state = useGuitarStore.getState();
        if (lastRevision !== state.targetRevision) {
          lastRevision = state.targetRevision;
          consecutiveFrames = 0;
        }
        if (state.isWaitMode && state.expectedFrequency !== null && !state.isHit && session.context.state === "running") {
          analyser.getFloatFrequencyData(bins);
          const targetBin = frequencyToBinIndex(state.expectedFrequency, analyser.fftSize, session.context.sampleRate);
          const options = optionsRef.current;
          let aboveThreshold = false;
          if (targetBin > 0 && targetBin < bins.length) {
            const firstBin = Math.max(1, targetBin - options.toleranceBins);
            const lastBin = Math.min(bins.length - 1, targetBin + options.toleranceBins);
            for (let binIndex = firstBin; binIndex <= lastBin; binIndex += 1) {
              if (bins[binIndex] > options.thresholdDb) {
                aboveThreshold = true;
                break;
              }
            }
          }
          consecutiveFrames = aboveThreshold ? consecutiveFrames + 1 : 0;
          if (consecutiveFrames >= options.requiredConsecutiveFrames) {
            state.setIsHit(true);
            consecutiveFrames = 0;
          }
        } else {
          consecutiveFrames = 0;
        }
        session.frameId = requestAnimationFrame(validateFrame);
      }

      session.frameId = requestAnimationFrame(validateFrame);
      setStatus("listening");
      return true;
    } catch (cause) {
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== "closed") {
        await context.close().catch(() => undefined);
      }
      if (generation === generationRef.current) {
        sessionRef.current = null;
        setError(cause instanceof Error ? cause.message : "Unable to open audio input.");
        setStatus("error");
      }
      return false;
    } finally {
      if (generation === generationRef.current) startingRef.current = false;
    }
  }

  return { start, stop, status, error, isListening: status === "listening" };
}
