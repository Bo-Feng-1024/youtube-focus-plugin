/*
 * YouTube Focus — content script (run_at: document_start)
 *
 * Responsibilities:
 *   1. Apply the last on/off state as early as possible to avoid a flash of
 *      the full UI before things are hidden (FOUC). chrome.storage is async and
 *      unreadable at document_start, so we keep a synchronous mirror in the
 *      page's localStorage to set the class instantly, then reconcile with
 *      chrome.storage (the cross-tab source of truth).
 *   2. Tag locale-dependent / third-party-injected buttons (the Create button,
 *      PocketTube's "Tags") with data-ytfocus-hide so hide.css can hide them.
 *   3. Handle the toggle (shortcut / icon click) and sync state across tabs.
 */

const FOCUS_CLASS = 'yt-focus-on'; // toggle class on <html>
const LS_KEY = 'ytFocusOn';        // localStorage mirror ('1' / '0')
const STORE_KEY = 'focusOn';       // chrome.storage.local source of truth (boolean)

let focusOn = false;

function applyClass(on) {
  document.documentElement.classList.toggle(FOCUS_CLASS, on);
}

// —— 1a. Apply the local mirror instantly, zero flash ——
try {
  focusOn = localStorage.getItem(LS_KEY) === '1';
} catch (e) {
  /* localStorage may be unavailable in some contexts; fall back to false */
}
applyClass(focusOn);

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
  applyClass(on);
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

/* ------------------------------------------------------------------ *
 * 2. Tag locale-dependent / dynamically injected buttons
 * ------------------------------------------------------------------ */

// aria-label of the Create button across languages. Add locales here as needed.
// The second regex matches the Chinese Create labels (chuangjian / jianli /
// xinzeng), written with \u escapes so the source stays ASCII while still
// matching a Chinese-language YouTube UI.
const CREATE_ARIA = [/create/i, /\u521b\u5efa|\u5efa\u7acb|\u65b0\u589e/];
// PocketTube-injected button whose text is exactly "Tags".
const TAGS_TEXT = /^\s*tags\s*$/i;

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

  // Create button: match aria-label across locales, walk up to a hideable container
  end.querySelectorAll('[aria-label]').forEach((el) => {
    const label = el.getAttribute('aria-label') || '';
    if (CREATE_ARIA.some((re) => re.test(label))) {
      mark(
        el.closest(
          'ytd-button-renderer, ytd-topbar-menu-button-renderer, yt-button-shape, button'
        ) || el
      );
    }
  });

  // PocketTube "Tags": match by text, restricted to leaf-level buttons so we
  // don't accidentally hide a parent container.
  end
    .querySelectorAll('a, button, tp-yt-paper-button, yt-button-shape, span, div')
    .forEach((el) => {
      const t = (el.textContent || '').trim();
      if (TAGS_TEXT.test(t) && el.querySelectorAll('*').length <= 4) {
        mark(el.closest('ytd-button-renderer, yt-button-shape, button') || el);
      }
    });
}

// The masthead renders asynchronously and PocketTube injects even later —
// keep scanning with a MutationObserver.
const observer = new MutationObserver(() => scanMasthead());
function startObserving() {
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  scanMasthead();
}
if (document.body) startObserving();
else document.addEventListener('DOMContentLoaded', startObserving, { once: true });
