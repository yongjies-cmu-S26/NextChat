import { useSyncExternalStore } from "react";

// on/off switch for OpenAI's built-in web search, kept per browser
const STORAGE_KEY = "web-search";
const listeners = new Set<() => void>();

export function getWebSearchEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch (e) {
    return false;
  }
}

export function setWebSearchEnabled(on: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch (e) {}
  listeners.forEach((l) => l());
}

export function useWebSearchEnabled(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getWebSearchEnabled,
    () => false,
  );
}
