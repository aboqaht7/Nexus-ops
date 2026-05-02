import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import ar from "./locales/ar.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";
import ru from "./locales/ru.json";

export const SUPPORTED_LANGUAGES = [
  { code: "ar", label: "العربية", flag: "🇸🇦", dir: "rtl" as const },
  { code: "en", label: "English", flag: "🇺🇸", dir: "ltr" as const },
  { code: "es", label: "Español", flag: "🇪🇸", dir: "ltr" as const },
  { code: "fr", label: "Français", flag: "🇫🇷", dir: "ltr" as const },
  { code: "de", label: "Deutsch", flag: "🇩🇪", dir: "ltr" as const },
  { code: "zh", label: "中文", flag: "🇨🇳", dir: "ltr" as const },
  { code: "ja", label: "日本語", flag: "🇯🇵", dir: "ltr" as const },
  { code: "ru", label: "Русский", flag: "🇷🇺", dir: "ltr" as const },
];

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ar: { translation: ar },
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      de: { translation: de },
      zh: { translation: zh },
      ja: { translation: ja },
      ru: { translation: ru },
    },
    fallbackLng: "ar",
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "nexusops-lang",
    },
    interpolation: { escapeValue: false },
  });

function applyDir(lang: string) {
  const cfg = SUPPORTED_LANGUAGES.find((l) => l.code === lang) ?? SUPPORTED_LANGUAGES[0];
  document.documentElement.lang = cfg.code;
  document.documentElement.dir = cfg.dir;
}

applyDir(i18n.language);
i18n.on("languageChanged", applyDir);

export default i18n;
