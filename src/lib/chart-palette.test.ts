import { describe, expect, it } from "vitest";

import { assignHues, HUE_COUNT, hueAt, hueVariable } from "./chart-palette";

/** Groups as the palette needs them: ids, in the order they were created. */
function groups(...ids: string[]) {
  return ids.map((id) => ({ id }));
}

describe("handing out hues", () => {
  it("gives the first group the first hue", () => {
    expect(assignHues(groups("employment")).get("employment")).toBe(0);
  });

  it("assigns by position in creation order, not by name", () => {
    const hues = assignHues(groups("zebra", "apple"));

    expect(hues.get("zebra")).toBe(0);
    expect(hues.get("apple")).toBe(1);
  });

  /**
   * The promise the ADR makes: creating a group never restates an existing
   * one's history in a different colour.
   */
  it("leaves every existing group's hue alone when a new one is created", () => {
    const before = assignHues(groups("employment", "freelance"));
    const after = assignHues(groups("employment", "freelance", "investments"));

    expect(after.get("employment")).toBe(before.get("employment"));
    expect(after.get("freelance")).toBe(before.get("freelance"));
    expect(after.get("investments")).toBe(2);
  });

  /** An archived group spends its hue permanently, so nobody else moves. */
  it("keeps an archived group's hue and shifts nobody", () => {
    const hues = assignHues(groups("employment", "side-projects", "investments"));

    expect(hues.get("side-projects")).toBe(1);
    expect(hues.get("investments")).toBe(2);
  });

  it("wraps the seventh group onto the first hue", () => {
    const hues = assignHues(groups("a", "b", "c", "d", "e", "f", "g"));

    expect(hues.get("f")).toBe(HUE_COUNT - 1);
    expect(hues.get("g")).toBe(hues.get("a"));
  });

  it("has no hue for a group that is not in the list", () => {
    expect(assignHues(groups("employment")).get("nope")).toBeUndefined();
  });
});

describe("a hue as CSS", () => {
  it("is a custom property numbered from one", () => {
    expect(hueVariable(0)).toBe("var(--chart-1)");
    expect(hueVariable(HUE_COUNT - 1)).toBe(`var(--chart-${HUE_COUNT})`);
  });

  it("wraps rather than naming a property that does not exist", () => {
    expect(hueAt(HUE_COUNT)).toBe(0);
    expect(hueVariable(HUE_COUNT)).toBe("var(--chart-1)");
  });
});
