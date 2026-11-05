"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import en from "./en";
import ar from "./ar";

export type Language = "en" | "ar";
type I18nValue = { language: Language; direction: "ltr" | "rtl"; setLanguage: (language: Language) => void; t: (text: string) => string };
const I18nContext = createContext<I18nValue>({ language: "en", direction: "ltr", setLanguage: () => undefined, t: text => text });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");
  const direction = language === "ar" ? "rtl" : "ltr";
  useEffect(() => { document.documentElement.lang = language; document.documentElement.dir = direction; }, [language, direction]);
  const dictionary = language === "ar" ? ar : en;
  const t = (text: string) => dictionary[text] ?? text;
  return <I18nContext.Provider value={{ language, direction, setLanguage, t }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export function Tx({ children }: { children: string }) { const { t } = useI18n(); return <>{t(children)}</>; }
