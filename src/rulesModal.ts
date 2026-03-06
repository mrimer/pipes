/** Builds and manages the "Game Rules" modal overlay. */

import { shapeIcon } from './renderer';
import { PipeShape } from './types';
import {
  SOURCE_COLOR, SINK_COLOR, EMPTY_COLOR,
  PIPE_COLOR, TANK_COLOR, DIRT_COST_COLOR,
  CONTAINER_COLOR, GRANITE_FILL_COLOR, GRANITE_COLOR,
  GOLD_SPACE_BASE_COLOR, GOLD_PIPE_COLOR,
  HEATER_COLOR, ICE_COLOR,
} from './colors';

/** A single row in the tile legend. */
interface LegendRow {
  /** Inline HTML for the icon cell. */
  iconHtml: string;
  /** Display name of the tile. */
  name: string;
  /** Brief description of the tile's role. */
  description: string;
}

/** A single row in the controls reference table. */
interface ControlRow {
  /** Short label for the key/input (e.g. "Left Click"). */
  input: string;
  /** What the control does. */
  action: string;
}

/** Return a small colored square as an inline HTML string. */
function colorSwatch(fill: string, border = fill): string {
  return (
    `<svg width="28" height="28" viewBox="0 0 28 28">` +
    `<rect x="2" y="2" width="24" height="24" rx="4" ry="4" ` +
    `fill="${fill}" stroke="${border}" stroke-width="2"/>` +
    `</svg>`
  );
}

/** Return a small colored circle as an inline HTML string. */
function colorCircle(fill: string): string {
  return (
    `<svg width="28" height="28" viewBox="0 0 28 28">` +
    `<circle cx="14" cy="14" r="11" fill="${fill}"/>` +
    `</svg>`
  );
}

/** Controls reference table rows. */
const CONTROL_ROWS: ControlRow[] = [
  { input: 'Left Click',         action: 'Place selected pipe on an empty cell, or rotate an existing pipe.' },
  { input: 'Right Click',        action: 'Remove a placed pipe and return it to the inventory.' },
  { input: 'Scroll Wheel',       action: 'Rotate the selected (pending) pipe piece before placing.' },
  { input: 'Arrow Keys',         action: 'Move the keyboard focus cursor across the grid.' },
  { input: 'Enter / Space',      action: 'Place or replace a pipe at the focused cell; rotate if nothing is selected.' },
  { input: 'Tab',                action: 'Rotate the selected pipe piece clockwise.' },
  { input: 'R',                  action: 'Retry the current level from scratch.' },
  { input: 'Ctrl + Hover',       action: 'Show a tooltip with tile details at the cursor position.' },
  { input: 'Escape',             action: 'Return to the level-select screen.' },
];

/** Legend rows covering every tile type players will encounter. */
const LEGEND_ROWS: LegendRow[] = [
  {
    iconHtml: colorCircle(SOURCE_COLOR),
    name: 'Source',
    description: 'Starting point of water flow. The number shows how much water is available.',
  },
  {
    iconHtml: colorCircle(SINK_COLOR),
    name: 'Sink',
    description: 'Water destination — connect this tile with water remaining to win the level.',
  },
  {
    iconHtml: colorSwatch(EMPTY_COLOR),
    name: 'Empty Cell',
    description: 'Select a pipe from your inventory, then click here to place it.',
  },
  {
    iconHtml: shapeIcon(PipeShape.Straight, PIPE_COLOR),
    name: 'Straight Pipe',
    description: 'Connects two opposite sides (North–South or East–West).',
  },
  {
    iconHtml: shapeIcon(PipeShape.Elbow, PIPE_COLOR),
    name: 'Elbow Pipe',
    description: 'Connects two adjacent sides. Rotate to point in the right direction.',
  },
  {
    iconHtml: shapeIcon(PipeShape.Tee, PIPE_COLOR),
    name: 'T-Junction',
    description: 'Connects three sides — useful at branch points.',
  },
  {
    iconHtml: shapeIcon(PipeShape.Cross, PIPE_COLOR),
    name: 'Cross Junction',
    description: 'Connects all four sides.',
  },
  {
    iconHtml: colorSwatch(GRANITE_FILL_COLOR, GRANITE_COLOR),
    name: 'Granite Block',
    description: 'Impassable obstacle — water cannot flow through and it cannot be moved.',
  },
  {
    iconHtml: colorSwatch(GOLD_SPACE_BASE_COLOR, GOLD_PIPE_COLOR),
    name: 'Gold Space',
    description: 'Special background tile — only gold pipe pieces may be placed here.',
  },
  {
    iconHtml: shapeIcon(PipeShape.Straight, GOLD_PIPE_COLOR),
    name: 'Gold Pipe',
    description: 'Behaves like a normal pipe and can be placed on gold spaces.',
  },
  {
    iconHtml: colorSwatch(TANK_COLOR),
    name: 'Chamber — Tank',
    description: 'Contains extra water. Adds to your supply when connected to it.',
  },
  {
    iconHtml: colorSwatch(DIRT_COST_COLOR),
    name: 'Chamber — Dirt',
    description: 'Wastes water when filled. The number shows how much water is consumed.',
  },
  {
    iconHtml: colorSwatch(CONTAINER_COLOR),
    name: 'Chamber — Item',
    description: 'Grants bonus pipe pieces from your inventory when water flows through it.',
  },
  {
    iconHtml: colorSwatch(HEATER_COLOR),
    name: 'Chamber — Heater',
    description: 'Raises the water temperature by the shown amount (°) when connected. Higher temperature reduces ice block costs.',
  },
  {
    iconHtml: colorSwatch(ICE_COLOR),
    name: 'Chamber — Ice',
    description: 'Reduces water capacity by cost × max(0, threshold° − current temp°). Costs nothing when temperature meets or exceeds the threshold.',
  },
];

/**
 * Create the game-rules modal element and append it to the document body.
 * Returns the overlay element so the caller can show/hide it.
 */
export function createGameRulesModal(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);' +
    'justify-content:center;align-items:flex-start;z-index:100;' +
    'overflow-y:auto;padding:24px 16px;';

  const box = document.createElement('div');
  box.style.cssText =
    'background:#16213e;border:3px solid #4a90d9;border-radius:10px;' +
    'padding:28px 32px;max-width:560px;width:100%;' +
    'display:flex;flex-direction:column;gap:16px;margin:auto;';

  // ── Title ──────────────────────────────────────────────────────────────────
  const title = document.createElement('h2');
  title.style.cssText = 'font-size:1.5rem;text-align:center;';
  title.textContent = '📋 Game Rules';

  // ── Summary ────────────────────────────────────────────────────────────────
  const summary = document.createElement('p');
  summary.style.cssText = 'font-size:0.95rem;color:#ccc;line-height:1.5;';
  summary.textContent =
    'Connect pipes from the Source to the Sink before the water runs out. ' +
    'Each pipe you connect costs one unit of water — plan your route wisely!';

  // ── Play loop ──────────────────────────────────────────────────────────────
  const playLoop = document.createElement('p');
  playLoop.style.cssText = 'font-size:0.9rem;color:#aaa;line-height:1.5;';
  playLoop.textContent =
    'Select a pipe piece from the inventory panel, then click an empty cell to place it. ' +
    'Scroll the mouse wheel to rotate the piece before placing. ' +
    'Water flows automatically once a complete path exists. ' +
    'Some chambers add water, waste it, or grant extra pieces when reached. ' +
    'Removing pieces returns water and reverts connections to their original state.';

  // ── Controls header ────────────────────────────────────────────────────────
  const controlsHeader = document.createElement('h3');
  controlsHeader.style.cssText = 'font-size:1rem;color:#7ed321;margin-bottom:4px;';
  controlsHeader.textContent = 'Controls';

  // ── Controls table ─────────────────────────────────────────────────────────
  const controlsTable = document.createElement('table');
  controlsTable.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.88rem;';

  for (const row of CONTROL_ROWS) {
    const tr = document.createElement('tr');
    tr.style.cssText = 'border-bottom:1px solid #2a3a5e;';

    const tdInput = document.createElement('td');
    tdInput.style.cssText =
      'padding:6px 12px 6px 0;white-space:nowrap;color:#eee;font-weight:bold;vertical-align:middle;';
    tdInput.textContent = row.input;

    const tdAction = document.createElement('td');
    tdAction.style.cssText = 'padding:6px 0;color:#aaa;vertical-align:middle;';
    tdAction.textContent = row.action;

    tr.appendChild(tdInput);
    tr.appendChild(tdAction);
    controlsTable.appendChild(tr);
  }

  // ── Legend header ──────────────────────────────────────────────────────────
  const legendHeader = document.createElement('h3');
  legendHeader.style.cssText = 'font-size:1rem;color:#7ed321;margin-bottom:4px;';
  legendHeader.textContent = 'Tile Legend';

  // ── Legend table ──────────────────────────────────────────────────────────
  const table = document.createElement('table');
  table.style.cssText =
    'width:100%;border-collapse:collapse;font-size:0.88rem;';

  for (const row of LEGEND_ROWS) {
    const tr = document.createElement('tr');
    tr.style.cssText = 'border-bottom:1px solid #2a3a5e;';

    const tdIcon = document.createElement('td');
    tdIcon.style.cssText =
      'padding:6px 10px 6px 0;width:36px;text-align:center;vertical-align:middle;';
    tdIcon.innerHTML = row.iconHtml;

    const tdName = document.createElement('td');
    tdName.style.cssText =
      'padding:6px 12px 6px 0;white-space:nowrap;color:#eee;font-weight:bold;vertical-align:middle;';
    tdName.textContent = row.name;

    const tdDesc = document.createElement('td');
    tdDesc.style.cssText = 'padding:6px 0;color:#aaa;vertical-align:middle;';
    tdDesc.textContent = row.description;

    tr.appendChild(tdIcon);
    tr.appendChild(tdName);
    tr.appendChild(tdDesc);
    table.appendChild(tr);
  }

  // ── Close button ──────────────────────────────────────────────────────────
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText =
    'align-self:center;padding:10px 32px;font-size:1rem;' +
    'background:#4a90d9;color:#fff;border:none;border-radius:6px;' +
    'cursor:pointer;margin-top:4px;';
  closeBtn.addEventListener('click', () => {
    overlay.style.display = 'none';
  });

  // Allow closing by clicking the backdrop
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.style.display = 'none';
  });

  box.appendChild(title);
  box.appendChild(summary);
  box.appendChild(playLoop);
  box.appendChild(controlsHeader);
  box.appendChild(controlsTable);
  box.appendChild(legendHeader);
  box.appendChild(table);
  box.appendChild(closeBtn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  return overlay;
}
