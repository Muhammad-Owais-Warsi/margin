/* Margin clipper — when Clip mode is on, selected text auto-saves to the note. */
let lastSent = '';
let timer = null;

document.addEventListener('mouseup', schedule);
document.addEventListener('keyup', schedule);
document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) lastSent = '';
});

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(capture, 700);
}

async function capture() {
  try {
    const { clipMode } = await chrome.storage.local.get('clipMode');
    if (!clipMode) return;
    const sel = window.getSelection();
    let text = sel ? sel.toString().trim() : '';
    if (text.length < 2 || text === lastSent) return;
    text = text.slice(0, 5000);
    lastSent = text;
    chrome.runtime.sendMessage({ type: 'clip', text }).catch(() => {});
  } catch {
    /* extension reloaded mid-page: ignore */
  }
}
