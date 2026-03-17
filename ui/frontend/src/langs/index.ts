import en from "./en.json";
import ar from "./ar.json";
import de from "./de.json";
import es from "./es.json";
import fr from "./fr.json";
import id from "./id.json";

export const translations = {
  en,
  ar,
  de,
  es,
  fr,
  id,
} as const;

export type LanguageCode = keyof typeof translations;

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export const languages = [
  {
    language: "English",
    code: "en",
    file: "en.json",
  },
  {
    language: "Arabic",
    code: "ar",
    file: "ar.json",
  },
  {
    language: "German",
    code: "de",
    file: "de.json",
  },
  {
    language: "Spanish",
    code: "es",
    file: "es.json",
  },
  {
    language: "French",
    code: "fr",
    file: "fr.json",
  },
  {
    language: "Indonesian",
    code: "id",
    file: "id.json",
  },
] as const;

export default translations;
