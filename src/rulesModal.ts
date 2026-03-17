/** Builds and manages the "Game Rules" modal overlay. */

import { shapeIcon } from './renderer';
import { PipeShape } from './types';
import {
  SOURCE_COLOR, SINK_COLOR, EMPTY_COLOR,
  PIPE_COLOR, TANK_COLOR, DIRT_COST_COLOR,
  GRANITE_FILL_COLOR, GRANITE_COLOR,
  TREE_COLOR, TREE_LEAF_COLOR, TREE_LEAF_ALT_COLOR, TREE_TRUNK_COLOR,
  CEMENT_FILL_COLOR, CEMENT_COLOR,
  GOLD_SPACE_BASE_COLOR, GOLD_PIPE_COLOR,
  HEATER_COLOR, ICE_COLOR,
  PUMP_COLOR, SNOW_COLOR, SANDSTONE_COLOR,
  STAR_COLOR, HOT_PLATE_COLOR,
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

/** Return a small granite block icon (fill + crack lines) as an inline HTML string. */
function graniteSwatch(): string {
  return (
    `<svg width="28" height="28" viewBox="0 0 28 28">` +
    `<rect x="2" y="2" width="24" height="24" rx="2" ry="2" fill="${GRANITE_FILL_COLOR}" stroke="${GRANITE_COLOR}" stroke-width="2"/>` +
    `<line x1="4" y1="9" x2="20" y2="11" stroke="${GRANITE_COLOR}" stroke-width="1.5" stroke-linecap="round"/>` +
    `<line x1="5" y1="15" x2="21" y2="17" stroke="${GRANITE_COLOR}" stroke-width="1.5" stroke-linecap="round"/>` +
    `<line x1="4" y1="21" x2="20" y2="23" stroke="${GRANITE_COLOR}" stroke-width="1.5" stroke-linecap="round"/>` +
    `</svg>`
  );
}

/** Return a small tree icon (top-down canopy view) as an inline HTML string. */
function treeSwatch(): string {
  return (
    `<svg width="28" height="28" viewBox="0 0 28 28">` +
    `<rect x="0" y="0" width="28" height="28" fill="#1a4a0e"/>` +
    `<circle cx="14" cy="14" r="10" fill="${TREE_LEAF_COLOR}"/>` +
    `<circle cx="14" cy="5"  r="5" fill="${TREE_LEAF_ALT_COLOR}"/>` +
    `<circle cx="23" cy="14" r="5" fill="${TREE_LEAF_ALT_COLOR}"/>` +
    `<circle cx="14" cy="23" r="5" fill="${TREE_LEAF_ALT_COLOR}"/>` +
    `<circle cx="5"  cy="14" r="5" fill="${TREE_LEAF_ALT_COLOR}"/>` +
    `<circle cx="14" cy="14" r="2" fill="${TREE_TRUNK_COLOR}"/>` +
    `<circle cx="14" cy="14" r="10" fill="none" stroke="${TREE_COLOR}" stroke-width="1.5"/>` +
    `</svg>`
  );
}

/** Return a cement tile icon (light-gray background + three diagonal wavy lines) as an inline HTML string. */
function cementSwatch(): string {
  return (
    `<svg width="28" height="28" viewBox="0 0 28 28">` +
    `<rect x="2" y="2" width="24" height="24" rx="2" ry="2" fill="${CEMENT_FILL_COLOR}" stroke="${CEMENT_COLOR}" stroke-width="2"/>` +
    `<path d="M 4 22 Q 14 14 24 6" stroke="${CEMENT_COLOR}" stroke-width="1.5" fill="none" stroke-linecap="round"/>` +
    `<path d="M 2 28 Q 14 18 26 10" stroke="${CEMENT_COLOR}" stroke-width="1.5" fill="none" stroke-linecap="round"/>` +
    `<path d="M 6 16 Q 16 8 26 2" stroke="${CEMENT_COLOR}" stroke-width="1.5" fill="none" stroke-linecap="round"/>` +
    `</svg>`
  );
}

/** Return a small colored square with a text label overlaid, as an inline HTML string. */
function chamberSwatch(fill: string, label: string, border = fill): string {
  return (
    `<svg width="28" height="28" viewBox="0 0 28 28">` +
    `<rect x="2" y="2" width="24" height="24" rx="4" ry="4" ` +
    `fill="${fill}" stroke="${border}" stroke-width="2"/>` +
    `<text x="14" y="19" text-anchor="middle" font-family="Arial" ` +
    `font-weight="bold" font-size="11" fill="white">${label}</text>` +
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
  { input: 'Shift + Left Click', action: 'Rotate a placed pipe counter-clockwise.' },
  { input: 'Right Click',        action: 'Remove a placed pipe and return it to the inventory. Right-clicking a selected inventory tile deselects it.' },
  { input: 'Scroll Wheel',       action: 'Rotate the selected (pending) pipe piece before placing.' },
  { input: 'Hover + Scroll Wheel', action: 'Queue a placed pipe for rotation when no inventory item is selected.' },
  { input: 'Q',                  action: 'Rotate the selected pipe piece counter-clockwise.' },
  { input: 'W',                  action: 'Rotate the selected pipe piece clockwise.' },
  { input: 'R',                  action: 'Retry the current level from scratch.' },
  { input: 'Ctrl+Z',             action: 'Undo the last move.' },
  { input: 'Ctrl+Y',             action: 'Redo the last undone move.' },
  { input: 'Shift',              action: 'Selects the next inventory piece.' },
  { input: 'Shift (hold)',       action: 'Show raw (unadjusted) ice/snow/sandstone tile values: raw temperature threshold and unmodified cost.' },
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
    iconHtml: cementSwatch(),
    name: 'Cement',
    description: 'Open background tile. Any pipe may be placed here. When Drying Time (T) = 0, placed pipes are hardened in cement and may not be removed or rotated. When T > 0, adjustments are allowed but decrement T by 1.',
  },
  {
    iconHtml: graniteSwatch(),
    name: 'Granite Block',
    description: 'Impassable obstacle — water cannot flow through and it cannot be moved.',
  },
  {
    iconHtml: treeSwatch(),
    name: 'Tree',
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
    iconHtml: chamberSwatch(TANK_COLOR, '~'),
    name: 'Tank',
    description: 'Contains extra water. Adds to your supply when connected to it.',
  },
  {
    iconHtml: chamberSwatch(DIRT_COST_COLOR, '−'),
    name: 'Dirt',
    description: 'Wastes water when filled. The number shows how much water is consumed.',
  },
  {
    iconHtml: chamberSwatch(PIPE_COLOR, '+'),
    name: 'Item',
    description: 'Grants bonus pipe pieces from your inventory when water flows through it.',
  },
  {
    iconHtml: chamberSwatch(HEATER_COLOR, '+°'),
    name: 'Heater',
    description: 'Raises the water temperature by the shown amount (°) when connected. Higher temperature reduces ice block costs.',
  },
  {
    iconHtml: chamberSwatch(ICE_COLOR, '❄'),
    name: 'Ice',
    description: 'Reduces water capacity by cost × max(0, threshold° − current temp°). Costs nothing when temperature meets or exceeds the threshold.',
  },
  {
    iconHtml: chamberSwatch(PUMP_COLOR, '+P'),
    name: 'Pump',
    description: 'Increases the game Pressure variable by the shown amount (+P) when connected. Higher Pressure reduces the cost of Snow blocks.',
  },
  {
    iconHtml: chamberSwatch(SNOW_COLOR, '❄'),
    name: 'Snow',
    description: 'Like Ice, but its effective cost is ⌈cost÷Pressure⌉ × max(0, threshold° − current temp°). Higher Pressure lowers the cost.',
  },
  {
    iconHtml: chamberSwatch(SANDSTONE_COLOR, '≈'),
    name: 'Sandstone',
    description: 'Like Snow, but uses deltaDamage (Pressure − Hardness) as the cost divisor: ⌈cost÷deltaDamage⌉ × max(0, threshold° − temp°). Connecting is blocked when Pressure ≤ Hardness. When a Shatter value (> Hardness) is set and Pressure ≥ Shatter, the tile has no cost.',
  },
  {
    iconHtml: chamberSwatch(HOT_PLATE_COLOR, 'HP'),
    name: 'Hot Plate',
    description: 'Consumes water based on mass and temperature. Effective cost = mass × (boiling temp° − current temp°). First drains frozen water (restoring it to liquid); remaining cost draws from regular water. Boiling temp is displayed as temp°.',
  },
  {
    iconHtml: chamberSwatch(STAR_COLOR, '★'),
    name: 'Star',
    description: 'A bonus collectible. Connect it to the water path before winning to count it as a collected star for the level. Stars are tracked per-level and shown on the level select screen.',
  },
];

/**
 * Create the game-rules modal element and append it to the document body.
 * Returns the overlay element so the caller can show/hide it.
 */
export function createGameRulesModal(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);' +
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
    'Rotate placed pipes to update your route. ' +
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
