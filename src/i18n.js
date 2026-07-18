// UI localization for the chrome (topbar, states, statusbar, drop overlay,
// alert messages). Tracks two locales, 'tr' (default — target audience is
// Turkish lawyers) and 'en' (option for foreign users). The current
// selection persists across launches in localStorage; first launch with no
// stored preference falls back to 'tr'.
//
// Document content (everything inside .page) is rendered from the parsed
// UDF and is NOT translated — it's already in the source document's
// language (almost always Turkish). Only chrome strings live here.
//
// Strings are flat key/value pairs, namespaced by dotted path
// ('topbar.open', 'empty.title'). Pluralization isn't needed — every
// localizable string in the chrome today is a fixed label.

const STORAGE_KEY = "udfly.locale";
const SUPPORTED_LOCALES = ["tr", "en"];
const DEFAULT_LOCALE = "tr";

export const translations = {
  tr: {
    // --- topbar ---
    "topbar.open": "Aç",
    "topbar.open.aria": "Aç (Ctrl+O)",
    "topbar.export": "Dışa Aktar",
    "topbar.export.txt": "TXT Olarak Dışa Aktar",
    "topbar.export.html": "HTML Olarak Dışa Aktar",
    "topbar.export.pdf": "PDF Olarak Dışa Aktar",
    "topbar.print": "Yazdır",
    "topbar.print.aria": "Yazdır (Ctrl+P)",
    "topbar.lang.toggle.aria": "Dili değiştir (şu an Türkçe)",

    // --- native window menu ---
    "menu.file": "Dosya",
    "menu.openRecent": "Son Açılanlar",
    "menu.openRecent.empty": "(Boş)",
    "menu.openRecent.clear": "Listeyi Temizle",
    "menu.quit": "Çıkış",
    "menu.checkUpdates": "Güncellemeleri Denetle",

    // --- empty / error / drop ---
    "empty.title": "Başlamak için bir .udf dosyası bırakın",
    "empty.hint.prefix": "veya açmak için",
    "empty.hint.suffix": "tuşlarına basın",
    "state.empty.aria": "Belge yok",
    "state.page.aria": "Belge",
    "state.error.aria": "Hata",
    "error.title": "Bu dosya açılamadı",
    "error.retry": "Başka bir dosya deneyin",
    "drop.release": "Açmak için bırakın",
    "drop.notUdf": "Sadece .udf dosyaları desteklenir.",
    "load.readFailed": "{name} okunamadı: {message}",

    // --- statusbar ---
    "statusbar.aria": "Belge özellikleri",
    "statusbar.pages": "Sayfa",
    "statusbar.size": "Boyut",
    "statusbar.verification": "Doğrulama",

    // --- alerts (export failure paths) ---
    "alert.exportFailed": "Dışa aktarma başarısız: {cause}",
    "alert.saveFailed": "Kaydetme başarısız: {cause}",
    "alert.pdfExportFailed": "PDF dışa aktarma başarısız: {cause}",

    // --- updater banner ---
    "updater.available": "Udfly {version} mevcut",
    "updater.install": "Şimdi Güncelle",
    "updater.dismiss": "Daha Sonra",
    "updater.dismiss.aria": "Güncellemeyi yok say",
    "updater.installing": "Yükleniyor…",
    "updater.failed": "Güncelleme başarısız: {cause}",
    "updater.upToDate": "Udfly güncel — en son sürümü kullanıyorsunuz",
  },
  en: {
    // --- topbar ---
    "topbar.open": "Open",
    "topbar.open.aria": "Open (Ctrl+O)",
    "topbar.export": "Export",
    "topbar.export.txt": "Export as TXT",
    "topbar.export.html": "Export as HTML",
    "topbar.export.pdf": "Export as PDF",
    "topbar.print": "Print",
    "topbar.print.aria": "Print (Ctrl+P)",
    "topbar.lang.toggle.aria": "Switch language (currently English)",

    // --- native window menu ---
    "menu.file": "File",
    "menu.openRecent": "Open Recent",
    "menu.openRecent.empty": "(Empty)",
    "menu.openRecent.clear": "Clear List",
    "menu.quit": "Exit",
    "menu.checkUpdates": "Check for Updates",

    // --- empty / error / drop ---
    "empty.title": "Drop a .udf file to begin",
    "empty.hint.prefix": "or press",
    "empty.hint.suffix": "to open",
    "state.empty.aria": "No document",
    "state.page.aria": "Document",
    "state.error.aria": "Error",
    "error.title": "Couldn’t open this file",
    "error.retry": "Try another file",
    "drop.release": "Release to open",
    "drop.notUdf": "Only .udf files are supported.",
    "load.readFailed": "Failed to read {name}: {message}",

    // --- statusbar ---
    "statusbar.aria": "Document properties",
    "statusbar.pages": "Pages",
    "statusbar.size": "Size",
    "statusbar.verification": "Verification",

    // --- alerts (export failure paths) ---
    "alert.exportFailed": "Export failed: {cause}",
    "alert.saveFailed": "Failed to save: {cause}",
    "alert.pdfExportFailed": "PDF export failed: {cause}",

    // --- updater banner ---
    "updater.available": "Udfly {version} is available",
    "updater.install": "Update Now",
    "updater.dismiss": "Later",
    "updater.dismiss.aria": "Dismiss update",
    "updater.installing": "Installing…",
    "updater.failed": "Update failed: {cause}",
    "updater.upToDate": "Udfly is up to date — you are on the latest version",
  },
};

// getLocale reads localStorage; falls back to 'tr' both when nothing is
// stored and when the stored value isn't in SUPPORTED_LOCALES. The latter
// guards against stale preferences from removed locales.
export function getLocale() {
  if (typeof localStorage === "undefined") return DEFAULT_LOCALE;
  const stored = localStorage.getItem(STORAGE_KEY);
  return SUPPORTED_LOCALES.includes(stored) ? stored : DEFAULT_LOCALE;
}

// setLocale silently ignores unsupported locales. Callers don't need to
// validate — the i18n module owns the canonical list.
export function setLocale(locale) {
  if (typeof localStorage === "undefined") return;
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  localStorage.setItem(STORAGE_KEY, locale);
}

// t looks up a key in the current locale (or a specific one) and
// optionally interpolates {name}-style placeholders. Missing keys return
// the key itself rather than undefined — keeps typo-broken translations
// visible during dev without crashing the UI.
//
// Second argument is overloaded for ergonomics at call sites:
//   t("topbar.open")                         → current locale, no vars
//   t("topbar.open", "en")                   → explicit locale (tests)
//   t("load.readFailed", { name, message })  → vars in current locale
// Production code rarely needs the explicit-locale form; tests use it
// extensively, so both shapes are first-class.
export function t(key, varsOrLocale) {
  let locale = getLocale();
  let vars = null;
  if (typeof varsOrLocale === "string") {
    locale = varsOrLocale;
  } else if (varsOrLocale && typeof varsOrLocale === "object") {
    vars = varsOrLocale;
  }
  const table = translations[locale] || translations[DEFAULT_LOCALE];
  let str = table[key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.split(`{${k}}`).join(String(v));
    }
  }
  return str;
}

// applyTranslations walks the root subtree and updates:
//   - textContent for elements with [data-i18n]
//   - aria-label for elements with [data-i18n-aria-label]
// Both attributes can coexist on the same element. Missing keys fall
// through t()'s key-as-fallback behavior.
//
// Called once at boot (after parsing localStorage) and again on every
// language-toggle click. Cheap enough to re-run on the whole document:
// the chrome has ~25 translatable nodes total.
export function applyTranslations(root, locale) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.getAttribute("data-i18n"), locale);
  }
  for (const el of root.querySelectorAll("[data-i18n-aria-label]")) {
    el.setAttribute(
      "aria-label",
      t(el.getAttribute("data-i18n-aria-label"), locale),
    );
  }
}
