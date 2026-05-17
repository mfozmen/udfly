// Auto-update flow: on every app boot main.js fires this once, in the
// background. If a newer release is published on GitHub, tauri-plugin-
// updater's check() resolves to a non-null Update object whose signature
// has already been verified against the pubkey baked into
// tauri.conf.json. We then ask the ui (a thin abstraction over the
// topbar-adjacent banner) to surface the version and an install action;
// the user decides whether to apply now or dismiss for next launch.
//
// Failures of any kind — offline, GitHub unreachable, no release yet,
// signature mismatch — are best-effort. A blocked check must never
// interrupt the actual document workflow the user came to do.
//
// Two seams are injected so the module can be unit-tested in jsdom
// without a live Tauri runtime:
//   deps: { isTauriAvailable, check, relaunch }
//   ui:   { showAvailable(version, onInstall), showError(msg), hide() }
// main.js wires the real implementations from @tauri-apps/plugin-updater
// and @tauri-apps/plugin-process.

export async function checkAndPromptForUpdate({ deps, ui }) {
  if (!deps.isTauriAvailable()) return;

  let update;
  try {
    update = await deps.check();
  } catch {
    // Network / GitHub / no-manifest failures are silent. Surfacing them
    // would spam users with errors they can't act on; the next launch
    // tries again.
    return;
  }
  if (!update?.available) return;

  ui.showAvailable(update.version, async () => {
    try {
      await update.downloadAndInstall();
      await deps.relaunch();
    } catch (cause) {
      // Install-time failures (signature mismatch, disk full, permission
      // denied) are user-actionable, so they DO surface — through the
      // banner's own error slot rather than a global alert, which would
      // pull focus away from the document.
      ui.showError(cause?.message || String(cause));
    }
  });
}
