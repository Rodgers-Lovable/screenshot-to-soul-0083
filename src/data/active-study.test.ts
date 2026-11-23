import { afterEach, describe, expect, it, vi } from "vitest";
import { activeStudyId, rememberStudy, savedStudyId, setActiveStudyId } from "./active-study";

afterEach(() => {
  setActiveStudyId(null);
  vi.unstubAllGlobals();
});

describe("active study", () => {
  it("throws until a study is set", () => {
    expect(() => activeStudyId()).toThrow("No active study");
    setActiveStudyId("s1");
    expect(activeStudyId()).toBe("s1");
  });

  it("remembers the choice in local storage", () => {
    rememberStudy("s2");
    expect(savedStudyId()).toBe("s2");
  });

  it("survives blocked storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => rememberStudy("s3")).not.toThrow();
    expect(savedStudyId()).toBeNull();
  });
});
