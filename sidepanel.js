/* Margin minimal — slim sidebar + write. No in-panel shortcuts. */
const noteList = document.getElementById('noteList');
const content = document.getElementById('content');
const btnNew = document.getElementById('btnNew');
const btnExport = document.getElementById('btnExport');
const btnImport = document.getElementById('btnImport');
const btnClip = document.getElementById('btnClip');
const fileInput = document.getElementById('fileInput');

let notes = [];
let activeId = null;
let saveTimer = null;

const uid = () => 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const active = () => notes.find((n) => n.id === activeId) || null;

async function load() {
  const data = await chrome.storage.local.get(['notes', 'activeId']);
  notes = Array.isArray(data.notes) ? data.notes : [];
  activeId = data.activeId || notes[0]?.id || null;
  if (!notes.length) {
    const n = { id: uid(), content: '', updatedAt: Date.now() };
    notes = [n];
    activeId = n.id;
    await chrome.storage.local.set({ notes, activeId });
  }
  render();
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ notes, activeId }), 200);
}

function render() {
  noteList.innerHTML = '';
  notes.forEach((n, i) => {
    const b = document.createElement('button');
    b.className = 'note-dot' + (n.id === activeId ? ' active' : '');
    b.textContent = i + 1;
    b.title = (n.content || '').split('\n')[0].slice(0, 40) || `Note ${i + 1}`;
    b.addEventListener('click', () => {
      activeId = n.id;
      persist(); render(); content.focus();
    });
    // right-click a dot to delete it — keeps UI chrome-free
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      deleteNote(n.id);
    });
    noteList.appendChild(b);
  });

  const n = active();
  if (document.activeElement !== content) {
    content.value = n?.content || '';
  }
}

function newNote() {
  const n = { id: uid(), content: '', updatedAt: Date.now() };
  notes.push(n);
  activeId = n.id;
  persist(); render();
  content.value = '';
  content.focus();
}

function deleteNote(id) {
  if (notes.length <= 1) {
    notes[0].content = '';
    content.value = '';
    persist(); render(); content.focus();
    return;
  }
  if (!confirm('Delete this note?')) return;
  notes = notes.filter((n) => n.id !== id);
  if (activeId === id) activeId = notes[notes.length - 1]?.id || null;
  persist(); render();
}

content.addEventListener('input', () => {
  const n = active();
  if (!n) return;
  n.content = content.value;
  n.updatedAt = Date.now();
  persist();
  clearTimeout(content._t);
  content._t = setTimeout(() => {
    const idx = notes.findIndex((x) => x.id === activeId);
    const dot = noteList.children[idx];
    if (dot) dot.title = (n.content || '').split('\n')[0].slice(0, 40) || `Note ${idx + 1}`;
  }, 500);
});

btnNew.addEventListener('click', newNote);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.clipMode) syncClipBtn(!!changes.clipMode.newValue);
  if (!changes.notes) return;
  notes = changes.notes.newValue || [];
  if (!notes.find((n) => n.id === activeId)) activeId = notes[0]?.id || null;
  const n = active();
  if (document.activeElement === content && n) {
    // a clip landed while typing: merge it in without moving the caret
    const s = content.selectionStart ?? content.value.length;
    const e = content.selectionEnd ?? s;
    const atEnd = s === content.value.length;
    content.value = n.content || '';
    try {
      if (atEnd) content.setSelectionRange(content.value.length, content.value.length);
      else content.setSelectionRange(Math.min(s, content.value.length), Math.min(e, content.value.length));
    } catch { /* ignore */ }
  } else {
    render();
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  // Other half of the toggle trick: close ourselves after a tick.
  // If the panel was closed, this message never arrives and open() wins.
  if (msg?.type === 'toggle-close') setTimeout(() => window.close(), 50);
});

/* ---------- backup: export downloads our format, import accepts ONLY it ---------- */
const BACKUP_VERSION = 1;

btnExport.addEventListener('click', () => {
  const payload = {
    app: 'margin',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    notes: notes.map((n) => ({ content: n.content || '', updatedAt: n.updatedAt || Date.now() })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `margin-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

btnImport.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  fileInput.value = '';
  if (!f) return;
  if (!/\.json$/i.test(f.name)) return badFile();
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || data.app !== 'margin' || data.version !== BACKUP_VERSION || !Array.isArray(data.notes)) {
        throw new Error('bad-format');
      }
      const clean = data.notes
        .filter((n) => n && typeof n.content === 'string')
        .map((n) => ({
          id: uid(),
          content: n.content.slice(0, 200000),
          updatedAt: typeof n.updatedAt === 'number' ? n.updatedAt : Date.now(),
        }));
      if (!clean.length) throw new Error('bad-format');
      if (!confirm(`Load backup with ${clean.length} note(s)? Current notes will be replaced.`)) return;
      notes = clean;
      activeId = notes[0].id;
      persist(); render(); content.focus();
    } catch {
      badFile();
    }
  };
  reader.readAsText(f);
});

function badFile() {
  alert('Not a Margin backup file. Only files exported by Margin (margin-backup-*.json) can be loaded.');
}

/* ---------- Clip mode: selections anywhere auto-save to the current note ---------- */
async function syncClipBtn(on) {
  if (on === undefined) ({ clipMode: on } = await chrome.storage.local.get('clipMode'));
  btnClip.classList.toggle('on', !!on);
  btnClip.title = on
    ? 'Clip mode ON — selected text auto-saves here (click to stop)'
    : 'Clip mode: auto-save selected text';
}

btnClip.addEventListener('click', async () => {
  const { clipMode } = await chrome.storage.local.get('clipMode');
  await chrome.storage.local.set({ clipMode: !clipMode });
  syncClipBtn(!clipMode);
});

load();
syncClipBtn();
