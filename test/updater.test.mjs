import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// The updater module is mostly logic flow over an injected
// (check, relaunch, isTauriAvailable) seam, plus a tiny UI surface.
// A fresh jsdom is enough to satisfy the few document.* calls the
// (UI-recording) test ui uses.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.document = dom.window.document;
globalThis.window = dom.window;

const { checkAndPromptForUpdate } = await import("../src/updater.js");

const flush = () => new Promise((r) => setTimeout(r, 0));

// Builds a recording ui plus a default-deny set of deps. Tests override
// what they need (the rest stay benign defaults). Returns the ui's call
// records so assertions can read them directly.
function harness({
  isTauri = true,
  check = async () => null,
  relaunch = async () => {},
} = {}) {
  const calls = {
    showAvailable: [],
    showError: [],
    showUpToDate: [],
    hide: [],
    downloadAndInstall: [],
    relaunch: [],
  };
  const ui = {
    showAvailable: (version, onInstall) =>
      calls.showAvailable.push({ version, onInstall }),
    showError: (msg) => calls.showError.push(msg),
    showUpToDate: () => calls.showUpToDate.push(true),
    hide: () => calls.hide.push(true),
  };
  const deps = {
    isTauriAvailable: () => isTauri,
    check,
    relaunch: async () => {
      calls.relaunch.push(true);
      await relaunch();
    },
  };
  return { ui, deps, calls };
}

// --- top-level checks ---

test("checkAndPromptForUpdate is a no-op when Tauri runtime is absent", async () => {
  // npm run dev / standalone browser: no Tauri bridge → no updater story.
  // Should resolve cleanly without touching check() or the ui.
  let checkCalled = false;
  const { ui, deps, calls } = harness({
    isTauri: false,
    check: async () => {
      checkCalled = true;
      return null;
    },
  });
  await checkAndPromptForUpdate({ deps, ui });
  await flush();
  assert.equal(checkCalled, false, "check() must not be invoked off-Tauri");
  assert.equal(calls.showAvailable.length, 0);
  assert.equal(calls.showError.length, 0);
});

test("checkAndPromptForUpdate silently swallows check() rejections", async () => {
  // Offline / GitHub unreachable / no release yet — the updater is best-
  // effort. A failure here must not surface as an error to the user;
  // their actual document workflow is unaffected.
  const { ui, deps, calls } = harness({
    check: async () => {
      throw new Error("network down");
    },
  });
  await checkAndPromptForUpdate({ deps, ui });
  await flush();
  assert.equal(calls.showAvailable.length, 0);
  assert.equal(calls.showError.length, 0, "no error overlay for a check fail");
});

test("checkAndPromptForUpdate does nothing when no update is available", async () => {
  // tauri-plugin-updater's check() resolves to null when the running
  // version is already the latest. The banner must stay hidden.
  const { ui, deps, calls } = harness({ check: async () => null });
  await checkAndPromptForUpdate({ deps, ui });
  await flush();
  assert.equal(calls.showAvailable.length, 0);
});

// --- interactive (menu-triggered) checks -----------------------------------

// The boot-time check is best-effort and silent, but a user who clicks
// "Güncellemeleri Denetle" asked a question and deserves an answer in
// every outcome: update found (same banner flow), already up to date,
// or the check itself failing.

test("an interactive check reports up-to-date when no update is available", async () => {
  const { ui, deps, calls } = harness({ check: async () => null });
  await checkAndPromptForUpdate({ deps, ui, interactive: true });
  await flush();
  assert.equal(calls.showUpToDate.length, 1);
  assert.equal(calls.showAvailable.length, 0);
  assert.equal(calls.showError.length, 0);
});

test("an interactive check surfaces check() failures through ui.showError", async () => {
  const { ui, deps, calls } = harness({
    check: async () => {
      throw new Error("network down");
    },
  });
  await checkAndPromptForUpdate({ deps, ui, interactive: true });
  await flush();
  assert.equal(calls.showError.length, 1);
  assert.match(calls.showError[0], /network down/);
  assert.equal(calls.showUpToDate.length, 0);
});

test("an interactive check still shows the banner when an update exists", async () => {
  const { ui, deps, calls } = harness({
    check: async () => ({
      available: true,
      version: "1.3.0",
      downloadAndInstall: async () => {},
    }),
  });
  await checkAndPromptForUpdate({ deps, ui, interactive: true });
  await flush();
  assert.equal(calls.showAvailable.length, 1);
  assert.equal(calls.showAvailable[0].version, "1.3.0");
  assert.equal(calls.showUpToDate.length, 0);
});

test("the silent boot check never calls showUpToDate", async () => {
  const { ui, deps, calls } = harness({ check: async () => null });
  await checkAndPromptForUpdate({ deps, ui });
  await flush();
  assert.equal(calls.showUpToDate.length, 0, "no up-to-date noise at boot");
});

// --- update available path ---

test("checkAndPromptForUpdate shows the banner with the update version", async () => {
  const { ui, deps, calls } = harness({
    check: async () => ({
      available: true,
      version: "1.2.0",
      downloadAndInstall: async () => {},
    }),
  });
  await checkAndPromptForUpdate({ deps, ui });
  await flush();
  assert.equal(calls.showAvailable.length, 1);
  assert.equal(calls.showAvailable[0].version, "1.2.0");
  assert.equal(typeof calls.showAvailable[0].onInstall, "function");
});

test("the install handler downloads, installs, and relaunches", async () => {
  let downloadInstallCount = 0;
  const update = {
    available: true,
    version: "1.2.0",
    downloadAndInstall: async () => {
      downloadInstallCount += 1;
    },
  };
  const { ui, deps, calls } = harness({ check: async () => update });
  await checkAndPromptForUpdate({ deps, ui });
  await flush();
  const onInstall = calls.showAvailable[0].onInstall;
  await onInstall();
  assert.equal(downloadInstallCount, 1, "downloadAndInstall called once");
  assert.equal(calls.relaunch.length, 1, "relaunch called after install");
  assert.equal(calls.showError.length, 0);
});

test("the install handler surfaces install errors to ui.showError", async () => {
  // If the download or install fails (signature mismatch, disk full, etc.)
  // the user needs to know; relaunch must not fire on a half-installed
  // update.
  const update = {
    available: true,
    version: "1.2.0",
    downloadAndInstall: async () => {
      throw new Error("signature mismatch");
    },
  };
  const { ui, deps, calls } = harness({ check: async () => update });
  await checkAndPromptForUpdate({ deps, ui });
  await flush();
  await calls.showAvailable[0].onInstall();
  assert.equal(calls.relaunch.length, 0, "no relaunch after a failed install");
  assert.equal(calls.showError.length, 1);
  assert.match(calls.showError[0], /signature mismatch/);
});
