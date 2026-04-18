/** Builds and manages the "Game Rules" modal overlay. */

import { shapeIcon } from './renderer';
import { PipeShape } from './types';
import { isTouchDevice } from './deviceUtils';
import { RADIUS_LG, UI_BG, UI_BORDER, UI_OVERLAY_BG } from './uiConstants';
import { createButton } from './uiHelpers';
import { CommandAction, CommandKeyManager, commandKeyManager } from './commandKeyManager';
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
  ONE_WAY_BG_COLOR, ONE_WAY_ARROW_COLOR, ONE_WAY_ARROW_BORDER,
  LEAKY_PIPE_COLOR, LEAKY_RUST_COLOR,
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
  /** Command action key when this row should reflect a rebindable command. */
  commandAction?: CommandAction;
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

/** Return a one-way tile icon (dark-red background with a red upward arrow) as an inline HTML string. */
function oneWaySwatch(): string {
  return (
    `<svg width="28" height="28" viewBox="0 0 28 28">` +
    `<rect x="2" y="2" width="24" height="24" rx="2" ry="2" fill="${ONE_WAY_BG_COLOR}" stroke="${ONE_WAY_ARROW_BORDER}" stroke-width="1.5"/>` +
    `<polygon points="14,4 24,14 19,14 19,24 9,24 9,14 4,14" fill="${ONE_WAY_ARROW_COLOR}" stroke="${ONE_WAY_ARROW_BORDER}" stroke-width="1" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

/** Return a leaky pipe tile icon (rust-brown pipe with rust spots) as an inline HTML string. */
function leakyPipeSwatch(): string {
  const S = 28;
  const H = S / 2;
  const sw = 4;
  // Pipe body: a simple straight pipe icon
  const pipeStroke = LEAKY_PIPE_COLOR;
  const rustFill = LEAKY_RUST_COLOR;
  return (
    `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">` +
    `<line x1="${H}" y1="0" x2="${H}" y2="${S}" stroke="${pipeStroke}" stroke-width="${sw}" stroke-linecap="round"/>` +
    `<circle cx="${H}" cy="${H * 0.5}" r="3" fill="${rustFill}" opacity="0.85"/>` +
    `<circle cx="${H}" cy="${H * 1.5}" r="3" fill="${rustFill}" opacity="0.85"/>` +
    `</svg>`
  );
}

/** Controls reference table rows. */
function getControlRows(manager: CommandKeyManager): ControlRow[] {
  return [
    { input: 'Left Click',         action: 'Place selected pipe on an empty cell, or rotate an existing pipe.' },
    { input: 'Shift + Left Click', action: 'Rotate a placed pipe counter-clockwise.' },
    { input: 'Right Click',        action: 'Remove a placed pipe and return it to the inventory. Right-clicking a selected inventory tile deselects it.' },
    { input: 'Scroll Wheel',       action: 'Rotate the selected (pending) pipe piece before placing.' },
    { input: 'Hover + Scroll Wheel', action: 'Queue a placed pipe for rotation when no inventory item is selected.' },
    { input: manager.getBindingDisplay('rotateCCW'), action: 'Rotate the selected pipe piece counter-clockwise.', commandAction: 'rotateCCW' },
    { input: manager.getBindingDisplay('rotateCW'), action: 'Rotate the selected pipe piece clockwise.', commandAction: 'rotateCW' },
    { input: manager.getBindingDisplay('restartLevel'), action: 'Retry the current level from scratch.', commandAction: 'restartLevel' },
    { input: manager.getBindingDisplay('undo'), action: 'Undo the last move.', commandAction: 'undo' },
    { input: manager.getBindingDisplay('redo'), action: 'Redo the last undone move.', commandAction: 'redo' },
    { input: 'Shift',              action: 'Selects the next inventory piece.' },
    { input: 'Shift (hold)',       action: 'Show raw (unadjusted) ice/snow/sandstone tile values: raw temperature threshold and unmodified cost.' },
    { input: 'Ctrl + Hover',       action: 'Show a tooltip with tile details at the cursor position.' },
    { input: 'Escape',             action: 'Return to the level-select screen.' },
  ];
}

/** Controls reference table rows for touch / mobile devices. */
const TOUCH_CONTROL_ROWS: ControlRow[] = [
  { input: 'Tap',                    action: 'Place the selected pipe on an empty cell, or rotate an existing pipe.' },
  { input: 'Tap inventory item',     action: 'Select that pipe piece. Tap it again to deselect.' },
  { input: 'Drag from inventory',    action: 'Drag a pipe from the inventory bar and drop it onto a grid cell to place it.' },
  { input: 'Swipe left on tile',     action: 'Rotate a placed pipe counter-clockwise.' },
  { input: 'Swipe right on tile',    action: 'Rotate a placed pipe clockwise.' },
  { input: 'Long-press placed pipe', action: 'Remove the pipe and return it to the inventory.' },
  { input: 'Two-finger tap',         action: 'Deselect the currently selected inventory piece.' },
  { input: 'Long-press map tile',    action: 'Show level name tooltip on the chapter map.' },
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
    iconHtml: oneWaySwatch(),
    name: 'One-Way',
    description: 'Open background tile — any pipe may be placed on it. Water cannot flow into or out of a pipe on this tile in the direction opposite the arrow. Perpendicular flow (sideways) is always permitted. Blocked pipe arms are displayed without water even when connected.',
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
    iconHtml: leakyPipeSwatch(),
    name: 'Leaky Pipe',
    description: 'Behaves like a normal pipe but has corroded spots. On the first turn connected it costs 1 water like a standard pipe. On every subsequent turn it remains connected, it loses 1 additional water (permanently — this water is not returned when the pipe is disconnected). An animated drip shows water escaping from the rusty spots.',
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
export function createGameRulesModal(manager: CommandKeyManager = commandKeyManager): HTMLElement {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'display:none;position:fixed;inset:0;background:' + UI_OVERLAY_BG + ';' +
    'justify-content:center;align-items:flex-start;z-index:100;' +
    'overflow-y:auto;padding:24px 16px;';

  const box = document.createElement('div');
  box.style.cssText =
    `background:${UI_BG};border:3px solid ${UI_BORDER};border-radius:${RADIUS_LG};` +
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
  if (isTouchDevice()) {
    playLoop.textContent =
      'Select a pipe from the inventory bar, then tap an empty cell to place it. ' +
      'You can also drag a pipe from the inventory directly to a grid cell. ' +
      'Swipe left or right on a placed pipe to rotate it. ' +
      'Water flows automatically once a complete path exists. ' +
      'Long-press a placed pipe to remove it and return it to your inventory.';
  } else {
    playLoop.textContent =
      'Select a pipe piece from the inventory panel, then click an empty cell to place it. ' +
      'Scroll the mouse wheel to rotate the piece before placing. ' +
      'Rotate placed pipes to update your route. ' +
      'Water flows automatically once a complete path exists. ' +
      'Some chambers add water, waste it, or grant extra pieces when reached. ' +
      'Removing pieces returns water and reverts connections to their original state.';
  }

  // ── Controls header ────────────────────────────────────────────────────────
  const controlsHeader = document.createElement('h3');
  controlsHeader.style.cssText = 'font-size:1rem;color:#7ed321;margin-bottom:4px;';
  controlsHeader.textContent = 'Controls';

  // ── Controls table ─────────────────────────────────────────────────────────
  const controlsTable = document.createElement('table');
  controlsTable.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.88rem;';

  const activeControlRows = isTouchDevice() ? TOUCH_CONTROL_ROWS : getControlRows(manager);
  for (const row of activeControlRows) {
    const tr = document.createElement('tr');
    tr.style.cssText = 'border-bottom:1px solid #2a3a5e;';

    const tdInput = document.createElement('td');
    tdInput.style.cssText =
      'padding:6px 12px 6px 0;white-space:nowrap;color:#eee;font-weight:bold;vertical-align:middle;';
    tdInput.textContent = row.input;
    if (row.commandAction) tdInput.dataset.commandAction = row.commandAction;

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
  const closeBtn = createButton(
    'Close', UI_BORDER, '#fff',
    () => { overlay.style.display = 'none'; },
    'align-self:center;padding:10px 32px;font-size:1rem;border:none;margin-top:4px;',
  );

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

/** Refresh command-key rows in an existing rules modal after assignments change. */
export function refreshGameRulesModalCommands(
  modalEl: HTMLElement,
  manager: CommandKeyManager = commandKeyManager,
): void {
  const commandCells = modalEl.querySelectorAll<HTMLElement>('td[data-command-action]');
  commandCells.forEach((cell) => {
    const action = cell.dataset.commandAction as CommandAction | undefined;
    if (!action) return;
    cell.textContent = manager.getBindingDisplay(action);
  });
}
