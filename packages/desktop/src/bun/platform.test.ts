import { describe, expect, it } from "bun:test";
import {
  detectPaths,
  parseSteamLibraryFoldersVdf,
  resolveSteamLibraryRoots,
  validatePath,
  windowsPathToWslPath,
} from "./platform";

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

  it("parses steam secondary library roots from libraryfolders.vdf", () => {
    const parsed = parseSteamLibraryFoldersVdf(`
      "libraryfolders"
      {
        "0"
        {
          "path"    "C:\\Program Files (x86)\\Steam"
        }
        "1"
        {
          "path"    "E:\\SteamLibrary"
        }
      }
    `);

    expect(parsed).toContain("E:\\SteamLibrary");
  });

  it("includes secondary steam libraries and SteamLibrary fallbacks", () => {
    const roots = resolveSteamLibraryRoots(
      {
        platform: "linux",
        isWsl: true,
        wslDistro: "Ubuntu",
      },
      {
        pathExists: (path) =>
          path ===
          "/mnt/c/Program Files (x86)/Steam/steamapps/libraryfolders.vdf",
        readTextFile: () => `
          "libraryfolders"
          {
            "0"
            {
              "path"    "C:\\Program Files (x86)\\Steam"
            }
            "1"
            {
              "path"    "E:\\SteamLibrary"
            }
          }
        `,
      },
    );

    expect(roots).toContain("E:\\SteamLibrary");
    expect(roots).toContain("D:\\SteamLibrary");
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
