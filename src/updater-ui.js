// DOM adapter for the updater module. Owns the banner's three visible
// strings (the version-interpolated headline, the install button label,
// and the in-flight 'Installing…' state) and the dismiss / install click
// handlers. checkAndPromptForUpdate calls this through the
// { showAvailable, showError, hide } shape it expects; nothing else in
// the app touches the banner directly.
//
// Banner state (currentVersion / currentError) lives here, not in main.js,
// so the locale toggle can re-render the version message without
// reaching across module boundaries. The exposed refreshLocale() is the
// hook main.js's refreshLocale() calls after applyTranslations sweeps
// the static data-i18n nodes.

import { t } from "./i18n.js";

export function createUpdaterUi(els) {
  // All three null/false = banner not currently announcing anything.
  let currentVersion = null;
  let currentError = null;
  let upToDate = false;

  // The headline is runtime-interpolated, so the static data-i18n sweep
  // can't render it. Called from showAvailable / showError / showUpToDate
  // and from refreshLocale() when the user toggles TR ↔ EN.
  function renderMessage() {
    if (currentError !== null) {
      els.updateBannerMessage.textContent = t("updater.failed", {
        cause: currentError,
      });
    } else if (currentVersion !== null) {
      els.updateBannerMessage.textContent = t("updater.available", {
        version: currentVersion,
      });
    } else if (upToDate) {
      els.updateBannerMessage.textContent = t("updater.upToDate");
    }
  }

  return {
    showAvailable(version, onInstall) {
      currentVersion = version;
      currentError = null;
      upToDate = false;
      renderMessage();
      els.updateInstall.hidden = false;
      els.updateInstall.disabled = false;
      els.updateInstall.textContent = t("updater.install");
      els.updateBanner.hidden = false;
      els.updateInstall.onclick = async () => {
        els.updateInstall.disabled = true;
        els.updateInstall.textContent = t("updater.installing");
        await onInstall();
      };
      els.updateDismiss.onclick = () => {
        els.updateBanner.hidden = true;
        currentVersion = null;
        currentError = null;
        upToDate = false;
      };
    },
    // Answer to a menu-triggered check when there's nothing to install:
    // same banner, no install button — just the message and dismiss.
    showUpToDate() {
      currentVersion = null;
      currentError = null;
      upToDate = true;
      renderMessage();
      els.updateInstall.hidden = true;
      els.updateBanner.hidden = false;
      els.updateDismiss.onclick = () => {
        els.updateBanner.hidden = true;
        upToDate = false;
      };
    },
    showError(cause) {
      currentError = cause;
      upToDate = false;
      renderMessage();
      els.updateInstall.hidden = false;
      // Defensive: the normal flow has the banner already visible from
      // showAvailable, but a future code path (or a race that hides it
      // before the install error fires) would otherwise write the error
      // into a hidden element. Force-show so the error always reaches
      // the user.
      els.updateBanner.hidden = false;
      els.updateInstall.disabled = false;
      els.updateInstall.textContent = t("updater.install");
    },
    hide() {
      els.updateBanner.hidden = true;
      currentVersion = null;
      currentError = null;
      upToDate = false;
    },
    // Hook for main.js's refreshLocale() to re-render the version /
    // failure message in the new language. No-op when the banner is
    // not currently showing anything.
    refreshLocale() {
      renderMessage();
    },
  };
}
