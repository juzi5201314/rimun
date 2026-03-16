import * as toml from "@iarna/toml";
import type { I18nDictionariesPayload } from "@rimun/shared";
import { rimunRpcSchemas } from "@rimun/shared";
import { EN_US_TOML, ZH_CN_TOML } from "./locales";

function parseTomlDictionary(payload: string) {
  const parsed = toml.parse(payload);

  if (!parsed || typeof parsed !== "object") {
    return {};
  }

  // Ensure the response is JSON-serializable and strips prototype/Date values.
  return JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;
}

let cachedPromise: Promise<I18nDictionariesPayload> | null = null;

export function loadI18nDictionaries(): Promise<I18nDictionariesPayload> {
  cachedPromise ??= (async () => {
    const dictionaries = {
      "en-us": parseTomlDictionary(EN_US_TOML),
      "zh-cn": parseTomlDictionary(ZH_CN_TOML),
    };

    return rimunRpcSchemas.bun.requests.getI18nDictionaries.response.parse(
      dictionaries,
    );
  })();

  return cachedPromise;
}
