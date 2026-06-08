/*
 * YouTube Focus — content script (run_at: document_start)
 *
 * Responsibilities:
 *   1. Apply hiding only on the watch page (/watch), and as early as possible to
 *      avoid a flash of the full UI (FOUC). chrome.storage is async and unreadable
 *      at document_start, so we keep a synchronous mirror in the page's
 *      localStorage to set the class instantly, then reconcile with chrome.storage
 *      (the cross-tab source of truth). Re-evaluated on SPA navigation.
 *   2. Tag the locale-dependent Create button with data-ytfocus-hide so hide.css
 *      can hide it. (PocketTube's "Tags" has a stable wrapper class .ysm-tags
 *      and is hidden purely in CSS — no JS needed.)
 *   3. Handle the toggle (shortcut / icon click) and sync state across tabs.
 */

const FOCUS_CLASS = 'yt-focus-on'; // toggle class on <html>
const LS_KEY = 'ytFocusOn';        // localStorage mirror ('1' / '0')
const STORE_KEY = 'focusOn';       // chrome.storage.local source of truth (boolean)

let focusOn = false;

function isWatchPage() {
  return location.pathname === '/watch';
}

// Hiding only takes effect on the watch page. Browse pages (home, search,
// channel, subscriptions, …) are left untouched even when focus mode is on.
// `focusOn` is the global preference; the class is only added when both
// focusOn AND we're on /watch.
function render() {
  document.documentElement.classList.toggle(FOCUS_CLASS, focusOn && isWatchPage());
}

// —— 1a. Apply the local mirror instantly, zero flash ——
try {
  focusOn = localStorage.getItem(LS_KEY) === '1';
} catch (e) {
  /* localStorage may be unavailable in some contexts; fall back to false */
}
render();

// —— 1b. Reconcile with chrome.storage (consistent across tabs) ——
chrome.storage.local.get(STORE_KEY, (res) => {
  const stored = res[STORE_KEY];
  if (typeof stored === 'boolean') {
    setLocalState(stored);
  } else {
    // First run: write the current state into the source of truth
    chrome.storage.local.set({ [STORE_KEY]: focusOn });
  }
});

function setLocalState(on) {
  focusOn = on;
  try {
    localStorage.setItem(LS_KEY, on ? '1' : '0');
  } catch (e) {
    /* ignore */
  }
  render();
}

// Toggle initiated by this tab: update the source of truth ->
// storage.onChanged then syncs every other tab.
function toggleFocus() {
  const next = !focusOn;
  setLocalState(next);
  chrome.storage.local.set({ [STORE_KEY]: next });
}

// —— 3. Toggle message from background (shortcut / icon click) ——
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'toggle-focus') toggleFocus();
});

// —— 3b. Cross-tab sync ——
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORE_KEY]) return;
  const on = changes[STORE_KEY].newValue;
  if (on !== focusOn) setLocalState(on);
});

// —— 3c. Page-level shortcut fallback (Alt+Shift+F) ——
// chrome.commands requires the shortcut to be registered in Chrome, which can be
// left unassigned or conflict with another binding. This page listener makes
// Alt+Shift+F work on YouTube out of the box. e.code (not e.key) is used so it's
// independent of macOS Option-key remapping. When the command IS registered,
// Chrome consumes the combo before it reaches the page, so this won't double-fire.
window.addEventListener(
  'keydown',
  (e) => {
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyF') {
      e.preventDefault();
      toggleFocus();
    }
  },
  true
);

// —— 3d. Re-evaluate on SPA navigation ——
// YouTube is a single-page app: moving between a video and a channel doesn't
// reload. On each route change we re-apply/remove hiding and (cheaply) re-tag
// the Create button in case the masthead was rebuilt. yt-navigate-finish is
// YouTube's own post-nav event; popstate covers back/forward.
function onNavigate() {
  render();
  scanMasthead();
}
window.addEventListener('yt-navigate-finish', onNavigate);
window.addEventListener('popstate', onNavigate);

/* ------------------------------------------------------------------ *
 * 2. Tag locale-dependent / dynamically injected buttons
 * ------------------------------------------------------------------ */

// aria-label of the Create button across languages. Add locales here as needed.
// The second regex matches the Chinese Create labels (chuangjian / jianli /
// xinzeng), written with \u escapes so the source stays ASCII while still
// matching a Chinese-language YouTube UI.
const CREATE_ARIA = [/create/i, /\u521b\u5efa|\u5efa\u7acb|\u65b0\u589e/];

// Becomes true once the Create button has been found & tagged, which lets the
// startup observer disconnect (see below).
let createTagged = false;

function mark(el) {
  if (el && !el.hasAttribute('data-ytfocus-hide')) {
    el.setAttribute('data-ytfocus-hide', '');
  }
}

function scanMasthead() {
  const end =
    document.querySelector('ytd-masthead #end') ||
    document.querySelector('#masthead #end');
  if (!end) return;

  // Create button: locale-dependent, so match by aria-label. Hide the whole
  // button wrapper (falling back to the <button> itself) to avoid a leftover gap.
  end.querySelectorAll('[aria-label]').forEach((el) => {
    const label = el.getAttribute('aria-label') || '';
    if (CREATE_ARIA.some((re) => re.test(label))) {
      mark(
        el.closest(
          'ytd-button-renderer, ytd-topbar-menu-button-renderer, yt-button-view-model'
        ) ||
          el.closest('button') ||
          el
      );
      createTagged = true;
    }
  });
}

// The masthead renders a moment after document_start, so we briefly watch the
// DOM to tag the Create button when it appears — then DISCONNECT. A persistent
// whole-document observer is expensive on a page as mutation-heavy as YouTube
// (it caused jank during watch<->channel navigation) and isn't needed: the
// masthead persists across SPA navigation, and onNavigate() re-tags after any
// route change that rebuilds it. Mutation bursts are coalesced to one scan/frame.
let scanScheduled = false;
function scheduleScan() {
  if (scanScheduled) return;
  scanScheduled = true;
  requestAnimationFrame(() => {
    scanScheduled = false;
    scanMasthead();
    if (createTagged) observer.disconnect();
  });
}
const observer = new MutationObserver(scheduleScan);
function startObserving() {
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scanMasthead();
  if (createTagged) observer.disconnect();
  // Safety net: never observe forever (e.g. logged-out users have no Create button).
  else setTimeout(() => observer.disconnect(), 15000);
}
if (document.body) startObserving();
else document.addEventListener('DOMContentLoaded', startObserving, { once: true });
