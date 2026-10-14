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

// Clip mode: selections sent by content.js land in the current note.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'clip' || typeof msg.text !== 'string') return;
  const text = msg.text.trim();
  if (text.length < 2) return;
  appendClip(text, sender.tab);
});

async function appendClip(text, tab) {
  const { notes = [], activeId } = await chrome.storage.local.get(['notes', 'activeId']);
  if (!notes.length) return;
  const note = notes.find((n) => n.id === activeId) || notes[notes.length - 1];
  // skip if this exact text was just clipped (double-fire guard)
  if ((note.content || '').slice(-600).includes(text.slice(0, 80))) return;
  const src = tab?.title ? `\n— ${tab.title}${tab?.url ? ` (${tab.url})` : ''}` : '';
  const block = `${text}${src}`;
  note.content = (note.content || '').replace(/\s+$/, '') + (note.content?.trim() ? '\n\n' : '') + block;
  note.updatedAt = Date.now();
  await chrome.storage.local.set({ notes, activeId: note.id });
}
