/**
 * Modal builders for the recording and playback features.
 *
 * Extracted from gameModals.ts to keep that file focused on core game modals.
 * Contains:
 *  - buildRecordModal      – "Record Play Sequence" dialog
 *  - buildPlaybackListModal – "Saved Recordings" list dialog
 *  - showReplayImportSuccessModal – transient confirmation after import
 */

import { RADIUS_LG, UI_BG } from './uiConstants';
import { createModalOverlay } from './gameModals';
import type { PlaySequenceRecord } from './types';

// ─── Record modal ─────────────────────────────────────────────────────────────

/**
 * Metadata passed to {@link buildRecordModal} describing the current game state
 * so the modal can show an accurate summary before recording.
 */
export interface RecordModalInfo {
  outcome: 'success' | 'failure' | 'partial';
  playerName: string;
  timestamp: number;
  moveCount: number;
  waterScore?: number;
  stars?: number;
}

/**
 * Build and immediately show the "Record Play Sequence" modal.
 *
 * The modal presents a summary of the current game state, an optional
 * annotation textarea, and Record / Cancel buttons.  It appends itself to
 * `document.body` and auto-removes when the player closes it.
 *
 * @param info     - Current game-state metadata shown as a summary.
 * @param onRecord - Called with the optional annotation when Record is clicked.
 * @param onCancel - Called when Cancel is clicked.
 */
export function buildRecordModal(
  info: RecordModalInfo,
  onRecord: (annotation: string) => void,
  onCancel: () => void,
): HTMLElement {
  const el = createModalOverlay(0.6);

  const box = document.createElement('div');
  box.className = 'modal-box';
  box.style.minWidth = '320px';
  box.style.maxWidth = '480px';

  const title = document.createElement('h2');
  title.textContent = '📼 Record Play Sequence';
  box.appendChild(title);

  // Summary row
  const summaryEl = document.createElement('div');
  summaryEl.style.cssText =
    'font-size:0.85rem;color:#aaa;display:flex;flex-direction:column;gap:4px;text-align:left;';

  const outcomeLabel = info.outcome === 'success' ? '✅ Success'
    : info.outcome === 'failure' ? '❌ Failure' : '⏸ Partial';
  const rows: [string, string][] = [
    ['Outcome', outcomeLabel],
    ['Moves', String(info.moveCount)],
    ['Player', info.playerName],
    ['Time', new Date(info.timestamp).toLocaleString()],
  ];
  if (info.waterScore !== undefined) rows.push(['💧 Water', String(info.waterScore)]);
  if (info.stars !== undefined && info.stars > 0) rows.push(['⭐ Stars', String(info.stars)]);

  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;';
    const labelEl = document.createElement('span');
    labelEl.style.cssText = 'min-width:80px;color:#888;';
    labelEl.textContent = label + ':';
    const valueEl = document.createElement('span');
    valueEl.style.cssText = 'color:#ddd;';
    valueEl.textContent = value;
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    summaryEl.appendChild(row);
  }
  box.appendChild(summaryEl);

  // Annotation input
  const annotationLabel = document.createElement('label');
  annotationLabel.style.cssText = 'font-size:0.9rem;color:#aaa;text-align:left;';
  annotationLabel.textContent = 'Annotation (optional):';
  box.appendChild(annotationLabel);

  const annotationInput = document.createElement('textarea');
  annotationInput.rows = 3;
  annotationInput.placeholder = 'Add a note about this recording…';
  annotationInput.style.cssText =
    'width:100%;box-sizing:border-box;padding:8px 10px;font-size:0.9rem;' +
    'background:#0d1a30;color:#eee;border:1px solid #2a3a5e;border-radius:6px;resize:vertical;font-family:inherit;';
  box.appendChild(annotationInput);

  // Buttons
  const actionsEl = document.createElement('div');
  actionsEl.className = 'modal-actions';

  const recordBtn = document.createElement('button');
  recordBtn.textContent = 'Record';
  recordBtn.className = 'modal-btn primary';
  recordBtn.type = 'button';
  recordBtn.addEventListener('click', () => {
    el.remove();
    onRecord(annotationInput.value.trim());
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className = 'modal-btn secondary';
  cancelBtn.type = 'button';
  cancelBtn.addEventListener('click', () => {
    el.remove();
    onCancel();
  });

  actionsEl.appendChild(recordBtn);
  actionsEl.appendChild(cancelBtn);
  box.appendChild(actionsEl);

  el.appendChild(box);
  document.body.appendChild(el);
  el.style.display = 'flex';

  // Focus annotation input after brief delay to avoid focus conflicts
  setTimeout(() => annotationInput.focus(), 50);

  return el;
}

// ─── Playback list modal ──────────────────────────────────────────────────────

/**
 * Callbacks used by the playback-list modal to interact with the game.
 */
export interface PlaybackListCallbacks {
  /** Called with the selected record when Replay is clicked or a list item is double-clicked. */
  onReplay: (record: PlaySequenceRecord) => void;
  /** Called when Return is clicked (dismisses modal). */
  onReturn: () => void;
  /** Called with the selected record when Delete is clicked. */
  onDelete: (record: PlaySequenceRecord) => void;
  /** Called with the selected record when Export is clicked. */
  onExport: (record: PlaySequenceRecord) => void;
  /** Called when Import is clicked (opens file picker). */
  onImport: () => void;
  /** Returns the list of recordings to display (called each time the list must be refreshed). */
  getRecords: () => PlaySequenceRecord[];
}

/**
 * Format a `PlaySequenceRecord`'s metadata as a human-readable summary string
 * for display in the playback list.
 */
function formatRecordSummary(r: PlaySequenceRecord): string {
  const outcomeLabel = r.outcome === 'success' ? '✅'
    : r.outcome === 'failure' ? '❌' : '⏸';
  const corruptedTag = r.corrupted ? ' ⚠️ corrupted' : '';
  const autoTag = r.autoRecorded ? ' (auto)' : '';
  const waterPart = r.waterScore !== undefined ? `  💧${r.waterScore}` : '';
  const starsPart = r.stars !== undefined && r.stars > 0 ? `  ⭐×${r.stars}` : '';
  const annotationPart = r.annotation ? `  "${r.annotation}"` : '';
  const date = new Date(r.timestamp).toLocaleString();
  return `${outcomeLabel}${corruptedTag}${autoTag}  ${r.playerName}  ${date}  ${r.moves.length} moves${waterPart}${starsPart}${annotationPart}`;
}

/**
 * Build and immediately show the "Saved Recordings" modal.
 *
 * Presents a scrollable list of saved recordings for the current level with
 * metadata summaries.  Appends itself to `document.body` and auto-removes when
 * closed.
 *
 * @param callbacks - Action callbacks for list interactions.
 * @returns The overlay element (retained by caller so it can be closed externally).
 */
export function buildPlaybackListModal(callbacks: PlaybackListCallbacks): HTMLElement {
  const el = createModalOverlay(0.6);

  const box = document.createElement('div');
  box.className = 'modal-box';
  box.style.cssText +=
    'min-width:min(560px,calc(100vw - 32px));max-width:min(720px,calc(100vw - 32px));';

  const title = document.createElement('h2');
  title.textContent = '▶️ Saved Recordings';
  box.appendChild(title);

  // Scrollable recording list
  let selectedRecord: PlaySequenceRecord | null = null;

  const listContainer = document.createElement('div');
  listContainer.style.cssText =
    'max-height:300px;overflow-y:auto;border:1px solid #2a3a5e;border-radius:6px;background:#0d1a30;';

  const listEl = document.createElement('ul');
  listEl.style.cssText = 'list-style:none;margin:0;padding:0;';
  listContainer.appendChild(listEl);
  box.appendChild(listContainer);

  // Buttons row
  const actionsEl = document.createElement('div');
  actionsEl.className = 'modal-actions';
  actionsEl.style.cssText += 'flex-wrap:wrap;';

  const makeBtn = (text: string, primary: boolean): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.type = 'button';
    btn.className = primary ? 'modal-btn primary' : 'modal-btn secondary';
    return btn;
  };

  const replayBtn  = makeBtn('Replay',  true);
  const returnBtn  = makeBtn('Return',  false);
  const deleteBtn  = makeBtn('Delete',  false);
  const exportBtn  = makeBtn('Export',  false);
  const importBtn  = makeBtn('Import',  false);

  replayBtn.disabled = true;
  deleteBtn.disabled = true;
  exportBtn.disabled = true;

  actionsEl.appendChild(replayBtn);
  actionsEl.appendChild(returnBtn);
  actionsEl.appendChild(deleteBtn);
  actionsEl.appendChild(exportBtn);
  actionsEl.appendChild(importBtn);
  box.appendChild(actionsEl);

  el.appendChild(box);
  document.body.appendChild(el);
  el.style.display = 'flex';

  // ── Helper: render the list ──────────────────────────────────────────────
  function renderList(): void {
    const records = callbacks.getRecords();
    listEl.innerHTML = '';
    selectedRecord = null;
    replayBtn.disabled = true;
    deleteBtn.disabled = true;
    exportBtn.disabled = true;

    if (records.length === 0) {
      const emptyMsg = document.createElement('li');
      emptyMsg.style.cssText = 'padding:16px;color:#666;text-align:center;font-size:0.9rem;';
      emptyMsg.textContent = 'No recordings saved for this level.';
      listEl.appendChild(emptyMsg);
      return;
    }

    for (const record of records) {
      const li = document.createElement('li');
      li.style.cssText =
        'padding:10px 14px;border-bottom:1px solid #1a2a40;cursor:pointer;font-size:0.82rem;' +
        'color:#ccc;white-space:pre-wrap;word-break:break-word;transition:background 0.1s;';
      li.textContent = formatRecordSummary(record);
      li.title = 'Click to select · Double-click to replay';

      li.addEventListener('click', () => {
        // Deselect all
        for (const sib of listEl.querySelectorAll<HTMLElement>('li')) {
          sib.style.background = '';
        }
        li.style.background = '#1a3a5e';
        selectedRecord = record;
        replayBtn.disabled = false;
        deleteBtn.disabled = false;
        exportBtn.disabled = false;
      });

      li.addEventListener('dblclick', () => {
        el.remove();
        callbacks.onReplay(record);
      });

      listEl.appendChild(li);
    }
  }

  renderList();

  // ── Button handlers ──────────────────────────────────────────────────────
  replayBtn.addEventListener('click', () => {
    if (!selectedRecord) return;
    const rec = selectedRecord;
    el.remove();
    callbacks.onReplay(rec);
  });

  returnBtn.addEventListener('click', () => {
    el.remove();
    callbacks.onReturn();
  });

  deleteBtn.addEventListener('click', () => {
    if (!selectedRecord) return;
    callbacks.onDelete(selectedRecord);
    renderList();
  });

  exportBtn.addEventListener('click', () => {
    if (!selectedRecord) return;
    callbacks.onExport(selectedRecord);
  });

  importBtn.addEventListener('click', () => {
    el.remove();
    callbacks.onImport();
  });

  return el;
}

// ─── Replay import result modal ───────────────────────────────────────────────

/**
 * Show a brief transient modal after a successful replay file import,
 * displaying the campaign name, chapter number, and level number the recording
 * belongs to.  Auto-removes itself when the player closes it.
 *
 * @param campaignName  - Name of the campaign the recording belongs to.
 * @param chapterNumber - Chapter number (1-based), or null if not determinable.
 * @param levelNumber   - Level number within the chapter (1-based), or null.
 */
export function showReplayImportSuccessModal(
  campaignName: string,
  chapterNumber: number | null,
  levelNumber: number | null,
): void {
  const el = createModalOverlay(0.7);
  const box = document.createElement('div');
  box.style.cssText =
    `background:${UI_BG};border:3px solid #4a90d9;border-radius:${RADIUS_LG};` +
    'padding:28px 36px;display:flex;flex-direction:column;gap:12px;' +
    'min-width:280px;max-width:420px;text-align:center;';

  const title = document.createElement('h2');
  title.style.cssText = 'margin:0;font-size:1.2rem;color:#4a90d9;';
  title.textContent = '📥 Recording Imported';
  box.appendChild(title);

  const infoEl = document.createElement('p');
  infoEl.style.cssText = 'font-size:0.95rem;color:#ddd;margin:0;';
  const chapterStr = chapterNumber !== null ? `Chapter ${chapterNumber}` : 'Unknown chapter';
  const levelStr   = levelNumber   !== null ? `Level ${levelNumber}` : 'Unknown level';
  infoEl.textContent = `Campaign: ${campaignName}\n${chapterStr} · ${levelStr}`;
  infoEl.style.whiteSpace = 'pre-line';
  box.appendChild(infoEl);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'OK';
  closeBtn.className = 'modal-btn primary';
  closeBtn.type = 'button';
  closeBtn.addEventListener('click', () => { el.remove(); });
  box.appendChild(closeBtn);

  el.appendChild(box);
  document.body.appendChild(el);
  el.style.display = 'flex';
}
