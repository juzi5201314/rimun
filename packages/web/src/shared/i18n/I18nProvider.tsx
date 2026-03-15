import { useHostApi } from "@/shared/host/HostApiProvider";
import {
  DEFAULT_LOCALE,
  type UiLocale,
  detectSystemLocale,
  readStoredLocale,
  toHtmlLangAttribute,
  writeStoredLocale,
} from "@/shared/i18n/locale";
import { translate } from "@/shared/i18n/translate";
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

type TranslationDictionary = Record<string, unknown>;

const EMPTY_DICTIONARIES: Record<UiLocale, TranslationDictionary> = {
  "en-us": {},
  "zh-cn": {},
};

export function I18nProvider({ children }: PropsWithChildren) {
  const getHostApi = useHostApi();
  const storedLocale = readStoredLocale();
  const systemLocale = detectSystemLocale();
  const initialLocale = storedLocale ?? systemLocale ?? DEFAULT_LOCALE;
  const [locale, setLocale] = useState<UiLocale>(initialLocale);
  const [dictionaries, setDictionaries] = useState<
    Record<UiLocale, TranslationDictionary> | null
  >(null);

  useEffect(() => {
    if (!storedLocale) {
      writeStoredLocale(initialLocale);
    }
  }, [initialLocale, storedLocale]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const hostApi = await getHostApi();
        const next = await hostApi.getI18nDictionaries();

        if (cancelled) {
          return;
        }

        setDictionaries(next);
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (import.meta.env.DEV) {
          // biome-ignore lint/suspicious/noConsole: dev-only load failure hint
          console.warn(
            "[i18n] Failed to load dictionaries from host; falling back to keys.",
            error,
          );
        }

        setDictionaries(EMPTY_DICTIONARIES);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getHostApi]);

  useEffect(() => {
    writeStoredLocale(locale);
    document.documentElement.lang = toHtmlLangAttribute(locale);
  }, [locale]);

  const t = useCallback(
    (key: string, params?: Record<string, unknown>) => {
      return dictionaries ? translate(dictionaries, locale, key, params) : key;
    },
    [dictionaries, locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, t],
  );

  if (!dictionaries) {
    return null;
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);

  if (!value) {
    throw new Error("I18nProvider is missing.");
  }

  return value;
}
