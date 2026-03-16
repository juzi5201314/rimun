import { describe, expect, it } from "vitest";
import { createTestHostApi } from "./createTestHostApi";

describe("createTestHostApi", () => {
  it("returns bundled i18n dictionaries for development fixtures", async () => {
    const hostApi = createTestHostApi();
    const dictionaries = await hostApi.getI18nDictionaries();

    expect(dictionaries["zh-cn"]["mod_library_dialogs"]).toMatchObject({
      apply_sort_skipped_error_feedback:
        "已保留当前顺序；但仍有 {count} 条加载顺序错误。请按右侧“执行顺序提示”调整。",
    });
    expect(dictionaries["en-us"]["mod_details"]).toMatchObject({
      selected_order_conflicts_title: "{count} order conflicts for this mod",
    });
  });
});
