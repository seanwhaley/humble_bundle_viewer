/**
 * Persistent state backed by browser storage when available.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type StorageKind = "local" | "session";

type UsePersistentStateOptions<T> = {
  storage?: StorageKind;
  serialize?: (value: T) => string;
  deserialize?: (value: string) => T;
  legacyKeys?: string[];
};

const canUseWindow = () => typeof window !== "undefined";

const getStorage = (kind: StorageKind): Storage | null => {
  if (!canUseWindow()) return null;

  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
};

const resolveInitialValue = <T,>(value: T | (() => T)) =>
  typeof value === "function" ? (value as () => T)() : value;

export function usePersistentState<T>(
  key: string,
  initialValue: T | (() => T),
  options?: UsePersistentStateOptions<T>,
) {
  const {
    storage = "local",
    serialize = JSON.stringify,
    deserialize = JSON.parse as (value: string) => T,
    legacyKeys = [],
  } = options ?? {};
  const skipNextPersistRef = useRef(false);

  const [state, setState] = useState<T>(() => {
    const fallback = resolveInitialValue(initialValue);
    const storageObject = getStorage(storage);
    if (!storageObject) return fallback;

    try {
      const storageKeys = [key, ...legacyKeys];
      for (const storageKey of storageKeys) {
        const raw = storageObject.getItem(storageKey);
        if (raw === null) {
          continue;
        }

        const value = deserialize(raw);
        if (storageKey !== key) {
          try {
            storageObject.setItem(key, serialize(value));
            storageObject.removeItem(storageKey);
          } catch {
            // Ignore migration failures and still use the recovered value.
          }
        }

        return value;
      }

      return fallback;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    const storageObject = getStorage(storage);
    if (!storageObject) return;

    try {
      if (skipNextPersistRef.current) {
        storageObject.removeItem(key);
        skipNextPersistRef.current = false;
        return;
      }

      storageObject.setItem(key, serialize(state));
    } catch {
      // Best-effort persistence only; UI state still works in memory.
    }
  }, [key, serialize, state, storage]);

  const reset = useCallback(() => {
    const fallback = resolveInitialValue(initialValue);
    skipNextPersistRef.current = true;
    setState(fallback);

    const storageObject = getStorage(storage);
    if (!storageObject) return;

    try {
      legacyKeys.forEach((legacyKey) => storageObject.removeItem(legacyKey));
      storageObject.removeItem(key);
    } catch {
      // Ignore storage failures and keep the in-memory reset.
    }
  }, [initialValue, key, legacyKeys, storage]);

  return [state, setState, reset] as const;
}