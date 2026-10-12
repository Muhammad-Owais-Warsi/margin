// Margin background — single shortcut toggles the panel.
chrome.runtime.onInstalled.addListener(() => {
  // Make toolbar-icon clicks toggle the panel too (Chrome 114+).
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

// Fallback for older Chrome where the behavior above is unsupported.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.id == null) return;
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Toggle trick (Chrome has no sidePanel.toggle()):
// 1. Fire the close-message FIRST — it only lands if the panel is open,
//    and the panel then closes itself after a tick.
// 2. Call open() synchronously right after — no-op if already open,
//    opens if closed. No awaits before it, so the keyboard gesture stays valid.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'toggle-panel') return;
  chrome.runtime.sendMessage({ type: 'toggle-close' }).catch(() => {});
  try {
    if (tab?.id != null) chrome.sidePanel.open({ tabId: tab.id });
    else chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
  } catch {
    /* older Chrome: ignore */
  }
});
