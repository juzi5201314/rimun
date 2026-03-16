export const DEFAULT_LOCALE = "en-us" as const;

export const SUPPORTED_LOCALES = ["en-us", "zh-cn"] as const;

export type UiLocale = (typeof SUPPORTED_LOCALES)[number];

export const UI_LOCALE_STORAGE_KEY = "rimun.ui_locale";

function normalizeLocaleId(input: string) {
  return input.trim().replaceAll("_", "-").toLowerCase();
}

function tryMatchSupportedLocale(candidate: string): UiLocale | null {
  const normalized = normalizeLocaleId(candidate);

  if ((SUPPORTED_LOCALES as readonly string[]).includes(normalized)) {
    return normalized as UiLocale;
  }

  const [language] = normalized.split("-", 1);

  switch (language) {
    case "en":
      return "en-us";
    case "zh":
      return "zh-cn";
    default:
      return null;
  }
}

export function readStoredLocale(): UiLocale | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(UI_LOCALE_STORAGE_KEY);

    if (!stored) {
      return null;
    }

    return tryMatchSupportedLocale(stored);
  } catch {
    return null;
  }
}

export function writeStoredLocale(locale: UiLocale) {
  try {
    window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

export function detectSystemLocale(): UiLocale | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const candidates: string[] = [];

  if (Array.isArray(navigator.languages)) {
    candidates.push(...navigator.languages);
  }

  if (navigator.language) {
    candidates.push(navigator.language);
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const matched = tryMatchSupportedLocale(candidate);

    if (matched) {
      return matched;
    }
  }

  return null;
}

export function toHtmlLangAttribute(locale: UiLocale) {
  switch (locale) {
    case "en-us":
      return "en-US";
    case "zh-cn":
      return "zh-CN";
  }
}
