import { useState, useCallback, useEffect } from "react";
import {
  translations,
  LanguageCode,
  DEFAULT_LANGUAGE,
  languages,
} from "../langs/index";

export const useTranslation = () => {
  const [lang, setLang] = useState<LanguageCode>(() => {
    return (
      (localStorage.getItem("language") as LanguageCode) ||
      (import.meta.env.VITE_DEFAULT_LANG as LanguageCode) ||
      DEFAULT_LANGUAGE
    );
  });

  const t = useCallback(
    (
      key: keyof (typeof translations)["en"],
      replacements?: Record<string, string | number>,
    ) => {
      let translation =
        (translations[lang] as any)[key] ||
        (translations["en"] as any)[key] ||
        key;

      if (replacements) {
        Object.entries(replacements).forEach(([k, v]) => {
          translation = translation.replace(`{{${k}}}`, String(v));
        });
      }

      return translation;
    },
    [lang],
  );

  useEffect(() => {
    const currentLang = languages.find((l) => l.code === lang);
    if (currentLang && "isRtl" in currentLang && currentLang.isRtl) {
      document.documentElement.dir = "rtl";
    } else {
      document.documentElement.dir = "ltr";
    }
  }, [lang]);

  const changeLanguage = (newLang: LanguageCode) => {
    setLang(newLang);
    localStorage.setItem("language", newLang);
  };

  return { t, lang, changeLanguage };
};
