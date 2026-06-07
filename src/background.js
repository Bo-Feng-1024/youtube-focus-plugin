/*
 * YouTube Focus — service worker (MV3)
 *
 * Does one thing: translate the keyboard shortcut and toolbar-icon clicks into
 * a single toggle message sent to the active tab's content script. The actual
 * state change and cross-tab sync live in content.js + chrome.storage.
 */

function sendToggleToActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || tab.id == null) return;
    chrome.tabs.sendMessage(tab.id, { type: 'toggle-focus' }, () => {
      // If the current page isn't YouTube (no content script), lastError fires;
      // just swallow it.
      void chrome.runtime.lastError;
    });
  });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-focus') sendToggleToActiveTab();
});

// With no default_popup, clicking the icon fires onClicked — treat it as a toggle.
chrome.action.onClicked.addListener(() => sendToggleToActiveTab());
