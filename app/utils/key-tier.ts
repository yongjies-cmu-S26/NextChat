import { useSyncExternalStore } from "react";

export type KeyTier = "paid" | "free";

const STORAGE_KEY = "key-tier";
const listeners = new Set<() => void>();

// Models covered by OpenAI's free daily usage program (keep in sync with
// FREE_TIER_MODELS in app/api/common.ts).
export const FREE_TIER_MODELS = new Set([
  "gpt-5.4",
  "gpt-5.2",
  "gpt-5.1",
  "gpt-5",
  "gpt-4.1",
  "gpt-4o",
  "o1",
  "o3",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o-mini",
  "o3-mini",
  "o4-mini",
]);

// the free key is only used for the OpenAI provider
const NON_OPENAI_PROVIDERS = new Set(["Azure", "302.AI"]);

export function isFreeTierModel(name: string, providerName?: string) {
  return (
    FREE_TIER_MODELS.has(name) && !NON_OPENAI_PROVIDERS.has(providerName ?? "")
  );
}

export function getKeyTier(): KeyTier {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "free"
      ? "free"
      : "paid";
  } catch (e) {
    return "paid";
  }
}

export function setKeyTier(tier: KeyTier) {
  try {
    window.localStorage.setItem(STORAGE_KEY, tier);
  } catch (e) {}
  listeners.forEach((l) => l());
}

export function useKeyTier(): KeyTier {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getKeyTier,
    () => "paid" as KeyTier,
  );
}
