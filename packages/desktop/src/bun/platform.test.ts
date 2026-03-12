import { describe, expect, it } from "bun:test";
import { detectPaths, validatePath, windowsPathToWslPath } from "./platform";

describe("platform helpers", () => {
  it("converts a Windows path to a WSL path", () => {
    expect(windowsPathToWslPath("D:\\Games\\RimWorld")).toBe(
      "/mnt/d/Games/RimWorld",
    );
  });

  it("reports validation issues for a missing path", () => {
    const result = validatePath({
      kind: "installation",
      channel: "steam",
      windowsPath: "Z:\\Definitely\\Missing",
    });

    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("returns a structured detection result", () => {
    const result = detectPaths({
      preferredChannels: ["steam"],
      allowFallbackToManual: true,
    });

    expect(Array.isArray(result.candidates)).toBe(true);
    expect(result.environment.platform).toBeDefined();
  });
});
