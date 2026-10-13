import { useSyncExternalStore } from "react";

// "思考强度" for reasoning models (gpt-5.x / gpt-6.x / o-series).
// "default" sends nothing, so each model uses its own default (medium).
export type ReasoningEffort = "default" | "low" | "high";

const STORAGE_KEY = "reasoning-effort";
const listeners = new Set<() => void>();

export function supportsReasoningEffort(model: string) {
  return /^(gpt-5|gpt-6|o1|o3|o4)/.test(model);
}

export function getReasoningEffort(): ReasoningEffort {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "low" || v === "high" ? v : "default";
  } catch (e) {
    return "default";
  }
}

export function setReasoningEffort(v: ReasoningEffort) {
  try {
    window.localStorage.setItem(STORAGE_KEY, v);
  } catch (e) {}
  listeners.forEach((l) => l());
}

export function useReasoningEffort(): ReasoningEffort {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getReasoningEffort,
    () => "default" as ReasoningEffort,
  );
}
