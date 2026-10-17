"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import type { CropPixels } from "@/lib/artwork/rules";

// DESIGN-PREVIEW state, kept only in this browser tab. Nothing is sent to a server.
// The uploaded image stays as a local blob URL in memory; selection and details are also kept in
// sessionStorage so a refresh doesn't lose your place.

export type DemoSelection = {
  slotIds: string[];
  side: "front" | "back";
  size: "standard" | "double";
  priceCents: number;
  holdExpiresAt: string; // sample 15-minute hold, set when the space is picked
};
export type DemoArtwork = { src: string; width: number; height: number; crop: CropPixels | null; zoom: number };
export type DemoContact = { businessName: string; contactName: string; email: string; phone: string; website: string };

type State = { selection: DemoSelection | null; artwork: DemoArtwork | null; contact: DemoContact | null };

const KEY = "inside914-design-preview";
const EMPTY: State = { selection: null, artwork: null, contact: null };
let state: State | null = null;
const listeners = new Set<() => void>();

function current(): State {
  if (!state) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
      state = { selection: saved?.selection ?? null, artwork: null, contact: saved?.contact ?? null };
    } catch {
      state = EMPTY;
    }
  }
  return state;
}

function update(patch: Partial<State>) {
  state = { ...current(), ...patch };
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ selection: state.selection, contact: state.contact }));
  } catch {
    // storage unavailable: keep in memory only
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const actions = {
  setSelection: (selection: DemoSelection | null) => update({ selection }),
  setArtwork: (artwork: DemoArtwork | null) => update({ artwork }),
  setContact: (contact: DemoContact | null) => update({ contact }),
  reset: () => update(EMPTY),
};

export function useDemoStore() {
  const snapshot = useSyncExternalStore(subscribe, current, () => EMPTY);
  return { ...snapshot, ...actions };
}

// Kept for layout symmetry; the store itself is module-level.
export function DemoStoreProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
