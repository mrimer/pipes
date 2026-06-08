/** Builds and manages the "Game Rules" modal overlay. */

import { buildShapeIcon } from './renderer';
import { PipeShape } from './types';
import { isTouchDevice } from './deviceUtils';
import { RADIUS_LG, UI_BG, UI_BORDER, UI_INPUT_BORDER, UI_OVERLAY_BG } from './uiConstants';
import { createButton } from './uiHelpers';
import type { CommandAction, CommandKeyManager} from './commandKeyManager';
import { commandKeyManager } from './commandKeyManager';
import { setupModal } from './modalUtils';
import { t } from './i18n';
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
  REGULATOR_COLOR,
  GEL_COLOR, SIPHON_COLOR,
  ONE_WAY_BG_COLOR, ONE_WAY_ARROW_COLOR, ONE_WAY_ARROW_BORDER,
  LEAKY_PIPE_COLOR, LEAKY_RUST_COLOR,
} from './colors';
import { svgEl, svgRoot } from './svgUtils';

/** A single row in the tile legend. */
interface LegendRow {
  /** Icon element factory for the icon cell. */
  iconEl: () => SVGElement;
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

/** Return a small colored square swatch. */
function colorSwatch(fill: string, border = fill): SVGSVGElement {
  return svgRoot(28, [
    svgEl('rect', { x: 2, y: 2, width: 24, height: 24, rx: 4, ry: 4, fill, stroke: border, 'stroke-width': 2 }),
  ]);
}

/** Return a small granite block icon (fill + crack lines). */
function graniteSwatch(): SVGSVGElement {
  return svgRoot(28, [
    svgEl('rect', {
      x: 2, y: 2, width: 24, height: 24, rx: 2, ry: 2,
      fill: GRANITE_FILL_COLOR, stroke: GRANITE_COLOR, 'stroke-width': 2,
    }),
    svgEl('line', { x1: 4, y1: 9, x2: 20, y2: 11, stroke: GRANITE_COLOR, 'stroke-width': 1.5, 'stroke-linecap': 'round' }),
    svgEl('line', { x1: 5, y1: 15, x2: 21, y2: 17, stroke: GRANITE_COLOR, 'stroke-width': 1.5, 'stroke-linecap': 'round' }),
    svgEl('line', { x1: 4, y1: 21, x2: 20, y2: 23, stroke: GRANITE_COLOR, 'stroke-width': 1.5, 'stroke-linecap': 'round' }),
  ]);
}

/** Return a small tree icon (top-down canopy view). */
function treeSwatch(): SVGSVGElement {
  return svgRoot(28, [
    svgEl('rect', { x: 0, y: 0, width: 28, height: 28, fill: '#1a4a0e' }),
    svgEl('circle', { cx: 14, cy: 14, r: 10, fill: TREE_LEAF_COLOR }),
    svgEl('circle', { cx: 14, cy: 5, r: 5, fill: TREE_LEAF_ALT_COLOR }),
    svgEl('circle', { cx: 23, cy: 14, r: 5, fill: TREE_LEAF_ALT_COLOR }),
    svgEl('circle', { cx: 14, cy: 23, r: 5, fill: TREE_LEAF_ALT_COLOR }),
    svgEl('circle', { cx: 5, cy: 14, r: 5, fill: TREE_LEAF_ALT_COLOR }),
    svgEl('circle', { cx: 14, cy: 14, r: 2, fill: TREE_TRUNK_COLOR }),
    svgEl('circle', { cx: 14, cy: 14, r: 10, fill: 'none', stroke: TREE_COLOR, 'stroke-width': 1.5 }),
  ]);
}

/** Return a cement tile icon (light-gray background + three diagonal wavy lines). */
function cementSwatch(): SVGSVGElement {
  return svgRoot(28, [
    svgEl('rect', {
      x: 2, y: 2, width: 24, height: 24, rx: 2, ry: 2,
      fill: CEMENT_FILL_COLOR, stroke: CEMENT_COLOR, 'stroke-width': 2,
    }),
    svgEl('path', { d: 'M 4 22 Q 14 14 24 6', stroke: CEMENT_COLOR, 'stroke-width': 1.5, fill: 'none', 'stroke-linecap': 'round' }),
    svgEl('path', { d: 'M 2 28 Q 14 18 26 10', stroke: CEMENT_COLOR, 'stroke-width': 1.5, fill: 'none', 'stroke-linecap': 'round' }),
    svgEl('path', { d: 'M 6 16 Q 16 8 26 2', stroke: CEMENT_COLOR, 'stroke-width': 1.5, fill: 'none', 'stroke-linecap': 'round' }),
  ]);
}

/** Return a small colored square with a text label overlaid. */
function chamberSwatch(fill: string, label: string, border = fill): SVGSVGElement {
  const text = svgEl('text', {
    x: 14, y: 19, 'text-anchor': 'middle', 'font-family': 'Arial',
    'font-weight': 'bold', 'font-size': 11, fill: 'white',
  });
  text.textContent = label;
  return svgRoot(28, [
    svgEl('rect', { x: 2, y: 2, width: 24, height: 24, rx: 4, ry: 4, fill, stroke: border, 'stroke-width': 2 }),
    text,
  ]);
}

/** Return a small colored circle. */
function colorCircle(fill: string): SVGSVGElement {
  return svgRoot(28, [svgEl('circle', { cx: 14, cy: 14, r: 11, fill })]);
}

/** Return a one-way tile icon (dark-red background with a red upward arrow). */
function oneWaySwatch(): SVGSVGElement {
  return svgRoot(28, [
    svgEl('rect', {
      x: 2, y: 2, width: 24, height: 24, rx: 2, ry: 2,
      fill: ONE_WAY_BG_COLOR, stroke: ONE_WAY_ARROW_BORDER, 'stroke-width': 1.5,
    }),
    svgEl('polygon', {
      points: '14,4 24,14 19,14 19,24 9,24 9,14 4,14',
      fill: ONE_WAY_ARROW_COLOR,
      stroke: ONE_WAY_ARROW_BORDER,
      'stroke-width': 1,
      'stroke-linejoin': 'round',
    }),
  ]);
}

/** Return a leaky pipe tile icon (rust-brown pipe with rust spots). */
function leakyPipeSwatch(): SVGSVGElement {
  const S = 28;
  const H = S / 2;
  const sw = 4;
  return svgRoot(S, [
    svgEl('line', { x1: H, y1: 0, x2: H, y2: S, stroke: LEAKY_PIPE_COLOR, 'stroke-width': sw, 'stroke-linecap': 'round' }),
    svgEl('circle', { cx: H, cy: H * 0.5, r: 3, fill: LEAKY_RUST_COLOR, opacity: 0.85 }),
    svgEl('circle', { cx: H, cy: H * 1.5, r: 3, fill: LEAKY_RUST_COLOR, opacity: 0.85 }),
  ]);
}

/** Controls reference table rows. */
function getControlRows(manager: CommandKeyManager): ControlRow[] {
  return [
    { input: t('rules.controls.input.leftClick'), action: t('rules.controls.action.leftClick') },
    { input: t('rules.controls.input.shiftLeftClick'), action: t('rules.controls.action.shiftLeftClick') },
    { input: t('rules.controls.input.rightClick'), action: t('rules.controls.action.rightClick') },
    { input: t('rules.controls.input.scrollWheel'), action: t('rules.controls.action.scrollWheel') },
    { input: t('rules.controls.input.hoverScrollWheel'), action: t('rules.controls.action.hoverScrollWheel') },
    { input: manager.getBindingDisplay('rotateCCW'), action: t('rules.controls.action.rotateCCW'), commandAction: 'rotateCCW' },
    { input: manager.getBindingDisplay('rotateCW'), action: t('rules.controls.action.rotateCW'), commandAction: 'rotateCW' },
    { input: manager.getBindingDisplay('restartLevel'), action: t('rules.controls.action.restartLevel'), commandAction: 'restartLevel' },
    { input: manager.getBindingDisplay('undo'), action: t('rules.controls.action.undo'), commandAction: 'undo' },
    { input: manager.getBindingDisplay('redo'), action: t('rules.controls.action.redo'), commandAction: 'redo' },
    { input: t('rules.controls.input.shift'), action: t('rules.controls.action.shift') },
    { input: t('rules.controls.input.shiftHold'), action: t('rules.controls.action.shiftHold') },
    { input: t('rules.controls.input.ctrlHover'), action: t('rules.controls.action.ctrlHover') },
    { input: t('rules.controls.input.escape'), action: t('rules.controls.action.escape') },
  ];
}

/** Controls reference table rows for touch / mobile devices. */
function getTouchControlRows(): ControlRow[] {
  return [
    { input: t('rules.touchControls.input.tap'), action: t('rules.touchControls.action.tap') },
    { input: t('rules.touchControls.input.tapInventoryItem'), action: t('rules.touchControls.action.tapInventoryItem') },
    { input: t('rules.touchControls.input.dragFromInventory'), action: t('rules.touchControls.action.dragFromInventory') },
    { input: t('rules.touchControls.input.swipeLeftOnTile'), action: t('rules.touchControls.action.swipeLeftOnTile') },
    { input: t('rules.touchControls.input.swipeRightOnTile'), action: t('rules.touchControls.action.swipeRightOnTile') },
    { input: t('rules.touchControls.input.longPressPlacedPipe'), action: t('rules.touchControls.action.longPressPlacedPipe') },
    { input: t('rules.touchControls.input.twoFingerTap'), action: t('rules.touchControls.action.twoFingerTap') },
    { input: t('rules.touchControls.input.longPressMapTile'), action: t('rules.touchControls.action.longPressMapTile') },
  ];
}

/** Legend rows covering every tile type players will encounter. */
function getLegendRows(): LegendRow[] {
  return [
  {
    iconEl: () => colorCircle(SOURCE_COLOR),
    name: t('rules.legend.source.name'),
    description: t('rules.legend.source.description'),
  },
  {
    iconEl: () => colorCircle(SINK_COLOR),
    name: t('rules.legend.sink.name'),
    description: t('rules.legend.sink.description'),
  },
  {
    iconEl: () => colorSwatch(EMPTY_COLOR),
    name: t('rules.legend.emptyCell.name'),
    description: t('rules.legend.emptyCell.description'),
  },
  {
    iconEl: () => buildShapeIcon(PipeShape.Straight, PIPE_COLOR),
    name: t('rules.legend.straightPipe.name'),
    description: t('rules.legend.straightPipe.description'),
  },
  {
    iconEl: () => buildShapeIcon(PipeShape.Elbow, PIPE_COLOR),
    name: t('rules.legend.elbowPipe.name'),
    description: t('rules.legend.elbowPipe.description'),
  },
  {
    iconEl: () => buildShapeIcon(PipeShape.Tee, PIPE_COLOR),
    name: t('rules.legend.tJunction.name'),
    description: t('rules.legend.tJunction.description'),
  },
  {
    iconEl: () => buildShapeIcon(PipeShape.Cross, PIPE_COLOR),
    name: t('rules.legend.crossJunction.name'),
    description: t('rules.legend.crossJunction.description'),
  },
  {
    iconEl: () => cementSwatch(),
    name: t('rules.legend.cement.name'),
    description: t('rules.legend.cement.description'),
  },
  {
    iconEl: () => oneWaySwatch(),
    name: t('rules.legend.oneWay.name'),
    description: t('rules.legend.oneWay.description'),
  },
  {
    iconEl: () => graniteSwatch(),
    name: t('rules.legend.graniteBlock.name'),
    description: t('rules.legend.graniteBlock.description'),
  },
  {
    iconEl: () => treeSwatch(),
    name: t('rules.legend.tree.name'),
    description: t('rules.legend.tree.description'),
  },
  {
    iconEl: () => colorSwatch(GOLD_SPACE_BASE_COLOR, GOLD_PIPE_COLOR),
    name: t('rules.legend.goldSpace.name'),
    description: t('rules.legend.goldSpace.description'),
  },
  {
    iconEl: () => buildShapeIcon(PipeShape.Straight, GOLD_PIPE_COLOR),
    name: t('rules.legend.goldPipe.name'),
    description: t('rules.legend.goldPipe.description'),
  },
  {
    iconEl: () => leakyPipeSwatch(),
    name: t('rules.legend.leakyPipe.name'),
    description: t('rules.legend.leakyPipe.description'),
  },
  {
    iconEl: () => chamberSwatch(TANK_COLOR, '~'),
    name: t('rules.legend.tank.name'),
    description: t('rules.legend.tank.description'),
  },
  {
    iconEl: () => chamberSwatch(DIRT_COST_COLOR, '−'),
    name: t('rules.legend.dirt.name'),
    description: t('rules.legend.dirt.description'),
  },
  {
    iconEl: () => chamberSwatch(PIPE_COLOR, '+'),
    name: t('rules.legend.item.name'),
    description: t('rules.legend.item.description'),
  },
  {
    iconEl: () => chamberSwatch(HEATER_COLOR, '+°'),
    name: t('rules.legend.heater.name'),
    description: t('rules.legend.heater.description'),
  },
  {
    iconEl: () => chamberSwatch(ICE_COLOR, '❄'),
    name: t('rules.legend.ice.name'),
    description: t('rules.legend.ice.description'),
  },
  {
    iconEl: () => chamberSwatch(PUMP_COLOR, '+P'),
    name: t('rules.legend.pump.name'),
    description: t('rules.legend.pump.description'),
  },
  {
    iconEl: () => chamberSwatch(SNOW_COLOR, '❄'),
    name: t('rules.legend.snow.name'),
    description: t('rules.legend.snow.description'),
  },
  {
    iconEl: () => chamberSwatch(SANDSTONE_COLOR, '≈'),
    name: t('rules.legend.sandstone.name'),
    description: t('rules.legend.sandstone.description'),
  },
  {
    iconEl: () => chamberSwatch(HOT_PLATE_COLOR, 'HP'),
    name: t('rules.legend.hotPlate.name'),
    description: t('rules.legend.hotPlate.description'),
  },
  {
    iconEl: () => chamberSwatch(REGULATOR_COLOR, '>N\u2026'),
    name: t('rules.legend.regulator.name'),
    description: t('rules.legend.regulator.description'),
  },
  {
    iconEl: () => chamberSwatch(STAR_COLOR, '★'),
    name: t('rules.legend.star.name'),
    description: t('rules.legend.star.description'),
  },
  {
    iconEl: () => chamberSwatch(GEL_COLOR, '\u00BD'),
    name: t('rules.legend.gel.name'),
    description: t('rules.legend.gel.description'),
  },
  {
    iconEl: () => chamberSwatch(SIPHON_COLOR, '\u00D72'),
    name: t('rules.legend.siphon.name'),
    description: t('rules.legend.siphon.description'),
  },
  ];
}

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
  title.textContent = t('rules.title');
  const { closeModal } = setupModal(overlay, { titleEl: title, onClose: () => { overlay.style.display = 'none'; } });
  const createCloseButton = (): HTMLButtonElement => createButton(
    t('rules.close'),
    UI_BORDER,
    '#fff',
    () => { closeModal(); },
    'align-self:center;padding:10px 32px;font-size:1rem;border:none;margin-top:4px;',
  );

  // ── Summary ────────────────────────────────────────────────────────────────
  const summary = document.createElement('p');
  summary.style.cssText = 'font-size:0.95rem;color:#ccc;line-height:1.5;';
  summary.textContent = t('rules.summary');

  // ── Play loop ──────────────────────────────────────────────────────────────
  const playLoop = document.createElement('p');
  playLoop.style.cssText = 'font-size:0.9rem;color:#aaa;line-height:1.5;';
  if (isTouchDevice()) {
    playLoop.textContent = t('rules.playLoop.touch');
  } else {
    playLoop.textContent = t('rules.playLoop.desktop');
  }

  // ── Controls header ────────────────────────────────────────────────────────
  const controlsHeader = document.createElement('h3');
  controlsHeader.style.cssText = 'font-size:1rem;color:#7ed321;margin-bottom:4px;';
  controlsHeader.textContent = t('rules.controls.title');

  // ── Controls table ─────────────────────────────────────────────────────────
  const controlsTable = document.createElement('table');
  controlsTable.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.88rem;';

  const activeControlRows = isTouchDevice() ? getTouchControlRows() : getControlRows(manager);
  for (const row of activeControlRows) {
    const tr = document.createElement('tr');
    tr.style.cssText = `border-bottom:1px solid ${UI_INPUT_BORDER};`;

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
  legendHeader.textContent = t('rules.legend.title');

  // ── Legend table ──────────────────────────────────────────────────────────
  const table = document.createElement('table');
  table.style.cssText =
    'width:100%;border-collapse:collapse;font-size:0.88rem;';

  for (const row of getLegendRows()) {
    const tr = document.createElement('tr');
    tr.style.cssText = `border-bottom:1px solid ${UI_INPUT_BORDER};`;

    const tdIcon = document.createElement('td');
    tdIcon.style.cssText =
      'padding:6px 10px 6px 0;width:36px;text-align:center;vertical-align:middle;';
    tdIcon.replaceChildren(row.iconEl());

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

  // ── Close buttons ─────────────────────────────────────────────────────────
  const topCloseBtn = createCloseButton();
  const bottomCloseBtn = createCloseButton();

  // Allow closing by clicking the backdrop
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  box.appendChild(title);
  box.appendChild(topCloseBtn);
  box.appendChild(summary);
  box.appendChild(playLoop);
  box.appendChild(controlsHeader);
  box.appendChild(controlsTable);
  box.appendChild(legendHeader);
  box.appendChild(table);
  box.appendChild(bottomCloseBtn);
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
