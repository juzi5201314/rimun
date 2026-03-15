import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LOCALE,
  detectSystemLocale,
  readStoredLocale,
  toHtmlLangAttribute,
  writeStoredLocale,
} from "@/shared/i18n/locale";
import { translate } from "@/shared/i18n/translate";

describe("i18n translate", () => {
  it("falls back to default locale when entry is missing", () => {
    const dictionaries = {
      "en-us": {
        greeting: {
          hello: "Hello",
        },
      },
      "zh-cn": {},
    } as const;

    expect(translate(dictionaries, "zh-cn", "greeting.hello")).toBe("Hello");
    expect(translate(dictionaries, DEFAULT_LOCALE, "greeting.hello")).toBe(
      "Hello",
    );
  });

  it("interpolates simple params", () => {
    const dictionaries = {
      "en-us": {
        greeting: {
          hello: "Hello {name}",
        },
      },
      "zh-cn": {},
    } as const;

    expect(
      translate(dictionaries, "en-us", "greeting.hello", { name: "Alice" }),
    ).toBe("Hello Alice");
  });

  it("returns key when missing in both locales", () => {
    const dictionaries = {
      "en-us": {},
      "zh-cn": {},
    } as const;

    expect(translate(dictionaries, "zh-cn", "missing.key")).toBe("missing.key");
  });
});

describe("i18n locale selection", () => {
  it("stores and reads locale id normalized", () => {
    writeStoredLocale("en-us");
    expect(readStoredLocale()).toBe("en-us");

    window.localStorage.setItem("rimun.ui_locale", "zh-CN");
    expect(readStoredLocale()).toBe("zh-cn");
  });

  it("detects system locale from navigator.language and navigator.languages", () => {
    const originalNavigator = globalThis.navigator;
    const nextNavigator = {
      language: "zh-CN",
      languages: ["zh-CN", "en-US"],
    } as unknown as Navigator;

    vi.stubGlobal("navigator", nextNavigator);
    expect(detectSystemLocale()).toBe("zh-cn");

    vi.stubGlobal("navigator", originalNavigator);
  });

  it("formats html lang attribute", () => {
    expect(toHtmlLangAttribute("en-us")).toBe("en-US");
    expect(toHtmlLangAttribute("zh-cn")).toBe("zh-CN");
  });
});

