import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { usePersistentState } from "../../../src/hooks/usePersistentState";

describe("usePersistentState", () => {
  it("hydrates from localStorage and writes updates back", () => {
    window.localStorage.setItem("humble.test.value", JSON.stringify("saved"));

    const { result } = renderHook(() =>
      usePersistentState("humble.test.value", "default"),
    );

    expect(result.current[0]).toBe("saved");

    act(() => {
      result.current[1]("updated");
    });

    expect(window.localStorage.getItem("humble.test.value")).toBe(
      JSON.stringify("updated"),
    );
  });

  it("supports sessionStorage and reset", () => {
    const { result } = renderHook(() =>
      usePersistentState("humble.session.value", "idle", { storage: "session" }),
    );

    act(() => {
      result.current[1]("running");
    });

    expect(window.sessionStorage.getItem("humble.session.value")).toBe(
      JSON.stringify("running"),
    );

    act(() => {
      result.current[2]();
    });

    expect(result.current[0]).toBe("idle");
    expect(window.sessionStorage.getItem("humble.session.value")).toBeNull();
  });

  it("falls back to the initial value when persisted data cannot be parsed", () => {
    window.localStorage.setItem("humble.test.invalid", "not-json");

    const { result } = renderHook(() =>
      usePersistentState("humble.test.invalid", "fallback"),
    );

    expect(result.current[0]).toBe("fallback");
  });

  it("supports custom serialization and deserialization", () => {
    window.localStorage.setItem("humble.test.custom", "wrapped:4");

    const { result } = renderHook(() =>
      usePersistentState("humble.test.custom", 1, {
        serialize: (value) => `wrapped:${value}`,
        deserialize: (value) => Number(value.replace("wrapped:", "")),
      }),
    );

    expect(result.current[0]).toBe(4);

    act(() => {
      result.current[1](9);
    });

    expect(window.localStorage.getItem("humble.test.custom")).toBe("wrapped:9");
  });

  it("falls back to in-memory state when storage access throws", () => {
    const storageGetter = vi
      .spyOn(window, "localStorage", "get")
      .mockImplementation(() => {
        throw new Error("storage blocked");
      });

    try {
      const { result } = renderHook(() =>
        usePersistentState("humble.test.blocked", "fallback"),
      );

      expect(result.current[0]).toBe("fallback");

      act(() => {
        result.current[1]("updated in memory");
      });

      expect(result.current[0]).toBe("updated in memory");
    } finally {
      storageGetter.mockRestore();
    }
  });
});
