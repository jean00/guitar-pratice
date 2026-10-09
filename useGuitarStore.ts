"use client";

import { create } from "zustand";

export interface GuitarState {
  isWaitMode: boolean;
  expectedFrequency: number | null;
  isHit: boolean;
  targetRevision: number;
  setIsWaitMode: (enabled: boolean) => void;
  setExpectedFrequency: (frequency: number | null) => void;
  setIsHit: (hit: boolean) => void;
}

export const useGuitarStore = create<GuitarState>((set) => ({
  isWaitMode: true,
  expectedFrequency: null,
  isHit: false,
  targetRevision: 0,
  setIsWaitMode: (enabled) =>
    set((state) => ({
      isWaitMode: enabled,
      ...(!enabled
        ? {
            expectedFrequency: null,
            isHit: false,
            targetRevision: state.targetRevision + 1,
          }
        : {}),
    })),
  setExpectedFrequency: (frequency) => {
    if (frequency !== null && (!Number.isFinite(frequency) || frequency <= 0)) {
      throw new RangeError("Expected frequency must be a positive finite number.");
    }
    set((state) => ({
      expectedFrequency: frequency,
      isHit: false,
      targetRevision: state.targetRevision + 1,
    }));
  },
  setIsHit: (hit) =>
    set((state) => ({
      isHit: hit && state.isWaitMode && state.expectedFrequency !== null,
    })),
}));
