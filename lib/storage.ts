"use client";
import { useSyncExternalStore } from "react";

/**
 * LocalStorage を useSyncExternalStore で購読する小さなストア。
 * - サーバー/初回レンダーは initial を返す（静的エクスポートでも hydration mismatch を避ける）
 * - 値はキャッシュして参照を安定させる
 */
export function createLocalStore<T>(key: string, initial: T) {
  const listeners = new Set<() => void>();
  let cache: T | undefined;
  let loaded = false;

  const read = (): T => {
    if (typeof window === "undefined") return initial;
    if (!loaded) {
      loaded = true;
      try {
        const raw = window.localStorage.getItem(key);
        cache = raw ? { ...initial, ...(JSON.parse(raw) as T) } : initial;
      } catch {
        cache = initial;
      }
    }
    return cache as T;
  };

  const write = (next: T) => {
    cache = next;
    loaded = true;
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* quota / private mode */
    }
    listeners.forEach((l) => l());
  };

  const subscribe = (l: () => void) => {
    listeners.add(l);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        loaded = false;
        l();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(l);
      window.removeEventListener("storage", onStorage);
    };
  };

  const useStore = () => useSyncExternalStore(subscribe, read, () => initial);

  return {
    useStore,
    get: read,
    set: write,
    update: (fn: (prev: T) => T) => write(fn(read())),
    reset: () => {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* noop */
      }
      cache = initial;
      loaded = true;
      listeners.forEach((l) => l());
    },
  };
}

/** 端末内だけで軽く難読化（平文で LocalStorage に置かないため。暗号化ではない） */
export const obfuscate = (s: string) => (s ? btoa(unescape(encodeURIComponent(s.split("").reverse().join("")))) : "");
export const deobfuscate = (s: string) => {
  try {
    return s ? decodeURIComponent(escape(atob(s))).split("").reverse().join("") : "";
  } catch {
    return "";
  }
};
