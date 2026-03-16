import type { UiLocale } from "@/shared/i18n/locale";
import { DEFAULT_LOCALE } from "@/shared/i18n/locale";

type TranslationDictionary = Record<string, unknown>;

function resolvePath(dictionary: TranslationDictionary, key: string) {
  const segments = key.split(".").filter(Boolean);
  let current: unknown = dictionary;

  for (const segment of segments) {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function interpolate(template: string, params?: Record<string, unknown>) {
  if (!params) {
    return template;
  }

  return template.replaceAll(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) {
      return match;
    }

    const value = params[name];

    if (value === null || value === undefined) {
      return "";
    }

    return String(value);
  });
}

export function translate(
  dictionaries: Record<UiLocale, TranslationDictionary>,
  locale: UiLocale,
  key: string,
  params?: Record<string, unknown>,
) {
  const value = resolvePath(dictionaries[locale], key);

  if (typeof value === "string") {
    return interpolate(value, params);
  }

  const fallbackValue = resolvePath(dictionaries[DEFAULT_LOCALE], key);

  if (typeof fallbackValue === "string") {
    return interpolate(fallbackValue, params);
  }

  if (import.meta.env.DEV) {
    console.warn(`[i18n] Missing translation key: ${key}`);
  }

  return key;
}
