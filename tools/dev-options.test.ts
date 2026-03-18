import { describe, expect, it } from "bun:test";
import { parseDevOptions } from "./dev-options";

describe("parseDevOptions", () => {
  it("uses auto mode by default", () => {
    expect(parseDevOptions([])).toEqual({
      cefAutomation: false,
      mode: "auto",
    });
  });

  it("supports explicit mode and cef automation", () => {
    expect(parseDevOptions(["--mode", "web", "--cef-automation"])).toEqual({
      cefAutomation: true,
      mode: "web",
    });
  });

  it("supports equals syntax", () => {
    expect(parseDevOptions(["--mode=desktop"])).toEqual({
      cefAutomation: false,
      mode: "desktop",
    });
  });

  it("rejects unknown options", () => {
    expect(() => parseDevOptions(["--wat"])).toThrow("Unknown option: --wat");
  });
});
