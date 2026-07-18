// Native window menu: Dosya > Aç / Son Açılanlar / Dışa Aktar / Yazdır /
// Çıkış. Rebuilt wholesale by refresh() whenever anything it displays
// changes (locale, recent list, document-loaded state) — the menu is tiny,
// and rebuilding beats tracking per-item handles for dynamic updates.
//
// The Tauri menu API is dynamic-imported inside refresh() so this module
// stays loadable in Node and is a no-op in plain-browser dev, mirroring
// the updater's pattern.
//
// ponytail: no accelerator strings on menu items — the webview keydown
// handler in main.js already owns Ctrl+O / Ctrl+P, and registering the
// same chords natively would risk double-firing both paths. Revisit if
// the missing shortcut hints in the menu ever matter.
import { getRecentFiles, clearRecentFiles } from "./recent.js";
import { basename } from "./path.js";
import { t } from "./i18n.js";

function defaultIsTauriAvailable() {
  return (
    typeof window !== "undefined" &&
    typeof window.__TAURI_INTERNALS__ !== "undefined"
  );
}

// actions: { open, openRecent(path), exportTxt, exportHtml, exportPdf,
// print } — all fire-and-forget callbacks into main.js wiring.
// isDocumentLoaded() gates the export/print items the same way the topbar
// buttons' disabled state does.
export function setupAppMenu({
  actions,
  isDocumentLoaded,
  isTauriAvailable = defaultIsTauriAvailable,
}) {
  // Rebuilds can overlap (locale toggle during a recents refresh); only the
  // newest build may install itself, or a stale menu would win the race.
  let refreshSeq = 0;

  async function refresh() {
    if (!isTauriAvailable()) return;
    const seq = ++refreshSeq;
    try {
      const { Menu, MenuItem, Submenu, PredefinedMenuItem } = await import(
        "@tauri-apps/api/menu"
      );
      const separator = () => PredefinedMenuItem.new({ item: "Separator" });

      const recents = getRecentFiles();
      const recentItems = recents.length
        ? [
            ...(await Promise.all(
              recents.map((path) =>
                MenuItem.new({
                  // Basename keeps the submenu narrow; the full path lives
                  // in the store and rides along in the closure.
                  text: basename(path),
                  action: () => actions.openRecent(path),
                }),
              ),
            )),
            await separator(),
            await MenuItem.new({
              text: t("menu.openRecent.clear"),
              action: () => {
                clearRecentFiles();
                refresh();
              },
            }),
          ]
        : [
            await MenuItem.new({
              text: t("menu.openRecent.empty"),
              enabled: false,
            }),
          ];

      const docLoaded = isDocumentLoaded();
      const fileMenu = await Submenu.new({
        text: t("menu.file"),
        items: [
          await MenuItem.new({
            text: t("topbar.open"),
            action: () => actions.open(),
          }),
          await Submenu.new({
            text: t("menu.openRecent"),
            items: recentItems,
          }),
          await separator(),
          await Submenu.new({
            text: t("topbar.export"),
            enabled: docLoaded,
            items: [
              await MenuItem.new({
                text: t("topbar.export.txt"),
                enabled: docLoaded,
                action: () => actions.exportTxt(),
              }),
              await MenuItem.new({
                text: t("topbar.export.html"),
                enabled: docLoaded,
                action: () => actions.exportHtml(),
              }),
              await MenuItem.new({
                text: t("topbar.export.pdf"),
                enabled: docLoaded,
                action: () => actions.exportPdf(),
              }),
            ],
          }),
          await MenuItem.new({
            text: t("topbar.print"),
            enabled: docLoaded,
            action: () => actions.print(),
          }),
          await separator(),
          await PredefinedMenuItem.new({
            item: "Quit",
            text: t("menu.quit"),
          }),
        ],
      });

      const menu = await Menu.new({ items: [fileMenu] });
      if (seq !== refreshSeq) return; // superseded by a newer refresh
      await menu.setAsAppMenu();
    } catch (cause) {
      // The menu is chrome, not workflow: a failure (missing capability,
      // older runtime) must never break document viewing. Logged so it's
      // visible in devtools rather than silently absent.
      console.error("app menu setup failed:", cause);
    }
  }

  return { refresh };
}
