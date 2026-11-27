import { describe, expect, it } from "vitest";
import { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { useOnChange } from "./use-on-change";

function useDraft(id: string) {
  const [draft, setDraft] = useState("");
  useOnChange(id, () => setDraft(""));
  return { draft, setDraft };
}

describe("useOnChange", () => {
  it("resets state when the value changes, and not before", () => {
    const { result, rerender } = renderHook(({ id }) => useDraft(id), {
      initialProps: { id: "a" },
    });
    act(() => result.current.setDraft("typed"));
    rerender({ id: "a" });
    expect(result.current.draft).toBe("typed");
    rerender({ id: "b" });
    expect(result.current.draft).toBe("");
  });
});
