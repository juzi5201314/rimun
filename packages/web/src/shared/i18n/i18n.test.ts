import {
  DEFAULT_LOCALE,
  detectSystemLocale,
  readStoredLocale,
  toHtmlLangAttribute,
  writeStoredLocale,
} from "@/shared/i18n/locale";
import enUsRaw from "@/shared/i18n/locales/en-us.toml?raw";
import zhCnRaw from "@/shared/i18n/locales/zh-cn.toml?raw";
import { translate } from "@/shared/i18n/translate";
import * as toml from "@iarna/toml";
import { describe, expect, it, vi } from "vitest";

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

  it("includes the mod order error translations in both locales", () => {
    const dictionaries = {
      "en-us": toml.parse(enUsRaw) as Record<string, unknown>,
      "zh-cn": toml.parse(zhCnRaw) as Record<string, unknown>,
    } as const;
    const keys = [
      "mod_details.author_version_label",
      "mod_details.supported_game_versions_label",
      "mod_details.no_supported_game_versions",
      "mod_details.unsupported_game_version_badge",
      "mod_details.unsupported_game_version_title",
      "mod_details.unsupported_game_version_description",
      "mod_details.selected_order_conflicts_title",
      "mod_details.order_violation_move_before",
      "mod_details.order_violation_move_after",
      "mod_details.order_violation_summary_before",
      "mod_details.order_violation_summary_after",
      "mod_details.order_violation_reason_dependency",
      "mod_details.order_violation_reason_load_after",
      "mod_details.order_violation_reason_force_load_after",
      "mod_details.order_violation_reason_load_before",
      "mod_details.order_violation_reason_force_load_before",
      "mod_details.order_violation_reason_official_anchor",
      "mod_library_dialogs.apply_sort_skipped_error_feedback",
      "mod_list_row.unsupported_game_version_title",
      "mod_list_row.unsupported_game_version_badge",
      "mod_list_row.unsupported_game_version_inline",
    ];
    const params = {
      count: 1,
      subject: "Harmony",
      target: "Core",
    };

    for (const key of keys) {
      expect(translate(dictionaries, "en-us", key, params)).not.toBe(key);
      expect(translate(dictionaries, "zh-cn", key, params)).not.toBe(key);
    }
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
