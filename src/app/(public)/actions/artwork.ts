"use server";

import { cookies } from "next/headers";
import {
  extendHold,
  finalizeUpload,
  removeArtwork as removeArtworkFor,
  requestUpload,
  saveLayout,
  type ArtworkFailure,
  type ArtworkView,
  type ExtendFailure,
} from "@/lib/artwork/service";
import { HOLD_COOKIE } from "@/lib/booking/place-hold";
import { createAdminClient } from "@/lib/supabase/admin";

// Thin wrappers: read the hold cookie, run the service, and never leak internal errors.

async function holdToken() {
  return (await cookies()).get(HOLD_COOKIE)?.value;
}

async function guarded<T>(label: string, run: () => Promise<T>): Promise<T | { ok: false; reason: "error" }> {
  try {
    return await run();
  } catch (error) {
    console.error(`${label} failed`, error);
    return { ok: false, reason: "error" };
  }
}

export type UploadTicket = { ok: true; artworkId: string; uploadUrl: string } | { ok: false; reason: ArtworkFailure };
export type FinalizeResult = { ok: true; artwork: ArtworkView } | { ok: false; reason: ArtworkFailure };
export type SimpleResult = { ok: true } | { ok: false; reason: ArtworkFailure };
export type ExtendResult = { ok: true; expiresAt: string } | { ok: false; reason: ExtendFailure };

export async function requestArtworkUpload(input: { byteSize: number }): Promise<UploadTicket> {
  return guarded("requestArtworkUpload", async () => requestUpload(createAdminClient(), await holdToken(), input));
}

export async function finalizeArtworkUpload(input: { artworkId: string }): Promise<FinalizeResult> {
  return guarded("finalizeArtworkUpload", async () => finalizeUpload(createAdminClient(), await holdToken(), input));
}

export async function saveArtworkLayout(input: {
  artworkId: string;
  crop: { x: number; y: number; width: number; height: number };
  zoom: number;
}): Promise<SimpleResult> {
  return guarded("saveArtworkLayout", async () => saveLayout(createAdminClient(), await holdToken(), input));
}

export async function removeArtwork(): Promise<SimpleResult> {
  return guarded("removeArtwork", async () => removeArtworkFor(createAdminClient(), await holdToken()));
}

export async function extendCurrentHold(): Promise<ExtendResult> {
  return guarded("extendCurrentHold", async () => extendHold(createAdminClient(), await holdToken()));
}
