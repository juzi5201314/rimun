import enUsRaw from "@/shared/i18n/locales/en-us.toml?raw";
import zhCnRaw from "@/shared/i18n/locales/zh-cn.toml?raw";
import {
  DEFAULT_LOCALE,
  type UiLocale,
  detectSystemLocale,
  readStoredLocale,
  toHtmlLangAttribute,
  writeStoredLocale,
} from "@/shared/i18n/locale";
import { translate } from "@/shared/i18n/translate";
import * as toml from "@iarna/toml";
import {
  type PropsWithChildren,
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type I18nContextValue = {
  locale: UiLocale;
  setLocale: (next: UiLocale) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function parseTomlDictionary(payload: string) {
  const parsed = toml.parse(payload);

  if (!parsed || typeof parsed !== "object") {
    return {};
  }

  return parsed as Record<string, unknown>;
}

const DICTIONARIES = {
  "en-us": parseTomlDictionary(enUsRaw),
  "zh-cn": parseTomlDictionary(zhCnRaw),
} satisfies Record<UiLocale, Record<string, unknown>>;

export function I18nProvider({ children }: PropsWithChildren) {
  const storedLocale = readStoredLocale();
  const systemLocale = detectSystemLocale();
  const initialLocale = storedLocale ?? systemLocale ?? DEFAULT_LOCALE;
  const [locale, setLocale] = useState<UiLocale>(initialLocale);

  useEffect(() => {
    if (!storedLocale) {
      writeStoredLocale(initialLocale);
    }
  }, [initialLocale, storedLocale]);

  useEffect(() => {
    writeStoredLocale(locale);
    document.documentElement.lang = toHtmlLangAttribute(locale);
  }, [locale]);

  const t = useCallback(
    (key: string, params?: Record<string, unknown>) =>
      translate(DICTIONARIES, locale, key, params),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);

  if (!value) {
    throw new Error("I18nProvider is missing.");
  }

  return value;
}
