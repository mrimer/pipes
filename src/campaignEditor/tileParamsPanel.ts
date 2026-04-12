/**
 * TileParamsPanel – self-contained UI component that owns the tile palette,
 * the parameter editing panel, the connections widget, and the collapsible
 * section expand state.
 *
 * It reads/writes LevelEditorState through the callback interface and notifies
 * the level editor when visual updates are needed.
 */

import { PipeShape, TEMP_CHAMBER_CONTENTS } from '../types';
import { PIPE_SHAPES, SPIN_CEMENT_SHAPES } from '../board';
import {
  EditorPalette,
  ChamberPalette,
  ChamberContent,
  TileParams,
  isChamberPalette,
  chamberPaletteContent,
  PALETTE_ITEM_SELECTED_BORDER,
  PALETTE_ITEM_UNSELECTED_BORDER,
  PALETTE_ITEM_SELECTED_BG,
  PALETTE_ITEM_UNSELECTED_BG,
  PALETTE_ITEM_SELECTED_COLOR,
  PALETTE_ITEM_UNSELECTED_COLOR,
  EDITOR_PANEL_BASE_CSS,
  EDITOR_PANEL_TITLE_CSS,
  EDITOR_FLEX_ROW_CSS,
} from './types';
import { LevelEditorState } from './levelEditorState';
import { TILE_SIZE } from '../renderer';
import { drawEditorTile } from './renderer';
import { sfxManager, SfxId } from '../sfxManager';
import { buildCompassConnectionsWidget } from './connectionsWidget';

// ─── Callback interface ───────────────────────────────────────────────────────

export interface TileParamsPanelCallbacks {
  getState(): LevelEditorState;
  renderCanvas(): void;
  updateUndoRedoButtons(): void;
}

// ─── Chamber parameter descriptors ───────────────────────────────────────────

/** A single numeric parameter shown in the tile-params panel for a Chamber tile. */
interface ChamberParamDescriptor {
  /** Label text rendered to the left of the input. */
  label: string;
  /** Which field of {@link TileParams} this input controls. */
  field: keyof Pick<TileParams, 'temperature' | 'cost' | 'pressure' | 'hardness' | 'shatter'>;
  /**
   * When provided, the input value is clamped to this minimum (via `Math.max`).
   * When omitted, the raw `parseInt` result is used (allowing negative values).
   */
  clampMin?: number;
}

/**
 * Declarative map from Chamber content type → ordered list of numeric param inputs.
 * Drives {@link TileParamsPanel._buildChamberContentParams} so each new content
 * type only needs an entry here rather than a new `if` branch.
 *
 * Content types with no numeric params (tank, star) are omitted – the method
 * is a no-op for them.  The `item` type is handled separately (it has a shape
 * selector in addition to a numeric count field).
 */
const CHAMBER_PARAM_DESCRIPTORS: Partial<Record<ChamberContent, ChamberParamDescriptor[]>> = {
  dirt:      [{ label: 'Mass',      field: 'cost' }],
  heater:    [{ label: 'Temp',      field: 'temperature' }],
  ice:       [{ label: 'Temp °',    field: 'temperature', clampMin: 0 }, { label: 'Mass', field: 'cost', clampMin: 0 }],
  snow:      [{ label: 'Temp °',    field: 'temperature', clampMin: 0 }, { label: 'Mass', field: 'cost', clampMin: 0 }],
  sandstone: [
    { label: 'Temp °',   field: 'temperature', clampMin: 0 },
    { label: 'Mass',     field: 'cost',        clampMin: 0 },
    { label: 'Hardness', field: 'hardness',    clampMin: 0 },
    { label: 'Shatter',  field: 'shatter',     clampMin: 0 },
  ],
  pump:      [{ label: 'Pressure',  field: 'pressure' }],
  hot_plate: [{ label: 'Boiling °', field: 'temperature', clampMin: 0 }, { label: 'Mass', field: 'cost', clampMin: 0 }],
};

// ─── Palette item arrays ──────────────────────────────────────────────────────

const PALETTE_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
  { palette: PipeShape.Source,   label: '💧 Source' },
  { palette: PipeShape.Sink,     label: '🏁 Sink' },
];

const PIPES_PALETTE_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
  { palette: PipeShape.Straight,     label: '━ Straight' },
  { palette: PipeShape.Elbow,        label: '┗ Elbow' },
  { palette: PipeShape.Tee,          label: '┣ Tee' },
  { palette: PipeShape.Cross,        label: '╋ Cross' },
];

const SPIN_PALETTE_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
  { palette: PipeShape.SpinStraight,       label: '↻ Spin Straight' },
  { palette: PipeShape.SpinElbow,          label: '↻ Spin Elbow' },
  { palette: PipeShape.SpinTee,            label: '↻ Spin Tee' },
  { palette: PipeShape.SpinStraightCement, label: '↻ Spin Straight (Cement)' },
  { palette: PipeShape.SpinElbowCement,    label: '↻ Spin Elbow (Cement)' },
  { palette: PipeShape.SpinTeeCement,      label: '↻ Spin Tee (Cement)' },
];

const CHAMBER_PALETTE_ITEMS: Array<{ palette: ChamberPalette; label: string }> = [
  { palette: 'chamber:item',      label: '🎁 Item' },
  { palette: 'chamber:tank',      label: '💧 Tank' },
  { palette: 'chamber:heater',    label: '🔥 Heater / Cooler' },
  { palette: 'chamber:pump',      label: '⬆ Pump / Vacuum' },
  { palette: 'chamber:dirt',      label: '🟫 Dirt' },
  { palette: 'chamber:ice',       label: '🧊 Ice' },
  { palette: 'chamber:snow',      label: '❄ Snow' },
  { palette: 'chamber:sandstone', label: '🪨 Sandstone' },
  { palette: 'chamber:hot_plate', label: '🌡 Hot Plate' },
  { palette: 'chamber:star',      label: '⭐ Star' },
];

const GOLD_PALETTE_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
  { palette: PipeShape.GoldStraight, label: '━ Gold Straight' },
  { palette: PipeShape.GoldElbow,    label: '┗ Gold Elbow' },
  { palette: PipeShape.GoldTee,      label: '┣ Gold Tee' },
  { palette: PipeShape.GoldCross,    label: '╋ Gold Cross' },
];

const LEAKY_PALETTE_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
  { palette: PipeShape.LeakyStraight, label: '━ Leaky Straight' },
  { palette: PipeShape.LeakyElbow,    label: '┗ Leaky Elbow' },
  { palette: PipeShape.LeakyTee,      label: '┣ Leaky Tee' },
  { palette: PipeShape.LeakyCross,    label: '╋ Leaky Cross' },
];

const FLOOR_PALETTE_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
  { palette: PipeShape.Empty,     label: '🟩 Empty - Grass' },
  { palette: PipeShape.EmptyDirt, label: '🟫 Empty - Dirt' },
  { palette: PipeShape.EmptyDark, label: '⬛ Empty - Dark' },
  { palette: PipeShape.Granite,   label: '▪ Granite' },
  { palette: PipeShape.Tree,      label: '🌿 Tree' },
  { palette: PipeShape.Sea,       label: '🌊 Sea' },
  { palette: PipeShape.Cement,    label: '🪧 Cement' },
  { palette: PipeShape.GoldSpace, label: '✦ Gold Space' },
  { palette: PipeShape.OneWay,    label: '→ One-Way' },
];

// ─── TileParamsPanel class ────────────────────────────────────────────────────

export class TileParamsPanel {
  // ── Section expand flags ──────────────────────────────────────────────────
  goldSectionExpanded = false;
  leakySectionExpanded = false;
  chamberSectionExpanded = false;
  pipesSectionExpanded = false;
  floorSectionExpanded = false;
  spinSectionExpanded = false;

  constructor(private readonly _cb: TileParamsPanelCallbacks) {}

  /**
   * Build the full palette panel with collapsible sections.
   * The returned element has id='editor-palette-panel'.
   */
  buildPalette(): HTMLElement {
    const state = this._cb.getState();
    const panel = document.createElement('div');
    panel.id = 'editor-palette-panel';
    panel.style.cssText =
      EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:4px;';

    const title = document.createElement('div');
    title.style.cssText = EDITOR_PANEL_TITLE_CSS + 'margin-bottom:4px;';
    title.textContent = 'TILE PALETTE';
    panel.appendChild(title);

    const isGoldSelected = GOLD_PALETTE_ITEMS.some(i => i.palette === state.palette);
    const isLeakySelected = LEAKY_PALETTE_ITEMS.some(i => i.palette === state.palette);
    const isFloorSelected = FLOOR_PALETTE_ITEMS.some(i => i.palette === state.palette);
    // Auto-expand the gold section if a gold item is currently selected
    if (isGoldSelected) this.goldSectionExpanded = true;
    // Auto-expand the leaky section if a leaky item is currently selected
    if (isLeakySelected) this.leakySectionExpanded = true;
    // Auto-expand the floor section if a floor item is currently selected
    if (isFloorSelected) this.floorSectionExpanded = true;
    // Auto-expand the chamber section if a chamber item is currently selected
    if (isChamberPalette(state.palette)) this.chamberSectionExpanded = true;
    // Auto-expand the pipes section if a pipe item is currently selected
    if (PIPES_PALETTE_ITEMS.some(i => i.palette === state.palette)) this.pipesSectionExpanded = true;
    // Auto-expand the spin section if a spin item is currently selected
    if (SPIN_PALETTE_ITEMS.some(i => i.palette === state.palette)) this.spinSectionExpanded = true;

    const makeItemBtn = (item: { palette: EditorPalette; label: string }, indent = false): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label;
      btn.dataset['palette'] = String(item.palette);
      const isSelected = state.palette === item.palette;
      btn.style.cssText =
        'padding:5px 8px;font-size:0.78rem;text-align:left;border-radius:4px;cursor:pointer;' +
        (indent ? 'margin-left:12px;' : '') +
        'border:1px solid ' + (isSelected ? PALETTE_ITEM_SELECTED_BORDER : PALETTE_ITEM_UNSELECTED_BORDER) + ';' +
        'background:' + (isSelected ? PALETTE_ITEM_SELECTED_BG : PALETTE_ITEM_UNSELECTED_BG) + ';' +
        'color:' + (isSelected ? PALETTE_ITEM_SELECTED_COLOR : PALETTE_ITEM_UNSELECTED_COLOR) + ';';

      btn.addEventListener('click', () => {
        const changed = state.palette !== item.palette;
        state.palette = item.palette;
        state.clearLink();
        if (isChamberPalette(item.palette)) {
          state.params.chamberContent = chamberPaletteContent(item.palette);
        }
        if (changed) sfxManager.play(SfxId.InventorySelect);
        const newPanel = this.buildPalette();
        panel.replaceWith(newPanel);
        const paramPanel = document.getElementById('editor-param-panel');
        if (paramPanel) {
          const newParam = this.buildParamPanel();
          newParam.id = 'editor-param-panel';
          paramPanel.replaceWith(newParam);
        }
        this._cb.renderCanvas();
      });
      return btn;
    };

    for (const item of PALETTE_ITEMS) {
      panel.appendChild(makeItemBtn(item));
    }

    // Collapsible sections: Floor, Pipes, Spin, Gold, Leaky, Blocks (chambers)
    this._buildCollapsibleSection(
      panel, 'Floor', this.floorSectionExpanded,
      () => { this.floorSectionExpanded = !this.floorSectionExpanded; panel.replaceWith(this.buildPalette()); },
      '#888', '#1a1a1a', '#ccc', FLOOR_PALETTE_ITEMS, makeItemBtn,
    );
    this._buildCollapsibleSection(
      panel, 'Pipes', this.pipesSectionExpanded,
      () => { this.pipesSectionExpanded = !this.pipesSectionExpanded; panel.replaceWith(this.buildPalette()); },
      '#4a90d9', '#0a1520', '#4a90d9', PIPES_PALETTE_ITEMS, makeItemBtn,
    );
    this._buildCollapsibleSection(
      panel, 'Spin', this.spinSectionExpanded,
      () => { this.spinSectionExpanded = !this.spinSectionExpanded; panel.replaceWith(this.buildPalette()); },
      '#5a7fbf', '#0a1528', '#7090c0', SPIN_PALETTE_ITEMS, makeItemBtn,
    );
    this._buildCollapsibleSection(
      panel, 'Gold', this.goldSectionExpanded,
      () => { this.goldSectionExpanded = !this.goldSectionExpanded; panel.replaceWith(this.buildPalette()); },
      '#b8860b', '#1a1400', '#ffd700', GOLD_PALETTE_ITEMS, makeItemBtn,
    );
    this._buildCollapsibleSection(
      panel, 'Leaky', this.leakySectionExpanded,
      () => { this.leakySectionExpanded = !this.leakySectionExpanded; panel.replaceWith(this.buildPalette()); },
      '#7a2c10', '#1a0c08', '#b07840', LEAKY_PALETTE_ITEMS, makeItemBtn,
    );
    this._buildCollapsibleSection(
      panel, 'Blocks', this.chamberSectionExpanded,
      () => { this.chamberSectionExpanded = !this.chamberSectionExpanded; panel.replaceWith(this.buildPalette()); },
      '#74b9ff', '#0a1520', '#74b9ff', CHAMBER_PALETTE_ITEMS, makeItemBtn,
    );

    // Erase at the end of the palette
    panel.appendChild(makeItemBtn({ palette: 'erase', label: '🗑 Erase (→ Empty)' }));

    return panel;
  }

  /**
   * Build the parameter editing panel for the current palette selection.
   * The returned element has id='editor-param-panel'.
   */
  buildParamPanel(): HTMLElement {
    const state = this._cb.getState();
    const panel = document.createElement('div');
    panel.id = 'editor-param-panel';
    panel.style.cssText =
      EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:8px;';

    const title = document.createElement('div');
    title.style.cssText = EDITOR_PANEL_TITLE_CSS;
    title.textContent = 'TILE PARAMS';
    panel.appendChild(title);

    const p = state.palette;
    const isChm = isChamberPalette(p);
    // Spin-cement shapes are in PIPE_SHAPES but do have a parameter (Drying Time), so exclude them
    // from the "no parameters" early-return check.
    const isParamFreePipe = PIPE_SHAPES.has(p as PipeShape) && !SPIN_CEMENT_SHAPES.has(p as PipeShape);
    if (p === 'erase' || p === PipeShape.Granite || p === PipeShape.Tree || p === PipeShape.Sea || p === PipeShape.GoldSpace ||
        p === PipeShape.OneWay || isParamFreePipe) {
      const none = document.createElement('div');
      none.style.cssText = 'font-size:0.8rem;color:#555;';
      none.textContent = 'No parameters';
      panel.appendChild(none);
      return panel;
    }

    // Cement: show only Drying Time input.
    // Spin-cement tiles: show Drying Time; rotation is adjusted via wheel/Q/W in the editor.
    if (p === PipeShape.Cement || SPIN_CEMENT_SHAPES.has(p as PipeShape)) {
      panel.appendChild(this.labeledInput('Drying Time', String(state.params.dryingTime), (v) => {
        state.params.dryingTime = Math.max(0, parseInt(v) || 0);
        state.applyParamsToLinkedTile();
        this._cb.updateUndoRedoButtons();
        this._cb.renderCanvas();
      }, 'number', '90px'));
      return panel;
    }

    // Source/Chamber(tank): capacity
    const cc = isChm ? chamberPaletteContent(p as ChamberPalette) : null;
    if (p === PipeShape.Source || cc === 'tank') {
      panel.appendChild(this.labeledInput('Capacity', String(state.params.capacity), (v) => {
        state.params.capacity = Math.max(0, parseInt(v) || 0);
        state.applyParamsToLinkedTile();
        this._cb.updateUndoRedoButtons();
        this._cb.renderCanvas();
      }, 'number', '90px'));
    }

    // Source: temperature and pressure
    if (p === PipeShape.Source) {
      panel.appendChild(this.labeledInput('Base Temp', String(state.params.temperature), (v) => {
        state.params.temperature = Math.max(0, parseInt(v) || 0);
        state.applyParamsToLinkedTile();
        this._cb.updateUndoRedoButtons();
        this._cb.renderCanvas();
      }, 'number', '90px'));
      panel.appendChild(this.labeledInput('Base Pressure', String(state.params.pressure), (v) => {
        state.params.pressure = Math.max(0, parseInt(v) || 0);
        state.applyParamsToLinkedTile();
        this._cb.updateUndoRedoButtons();
        this._cb.renderCanvas();
      }, 'number', '90px'));
    }

    // Chamber: content type selector + content-specific param inputs
    if (p === PipeShape.Chamber) {
      panel.appendChild(this._buildChamberContentSelector(panel));
    }
    if (isChm) {
      this._buildChamberContentParams(panel, chamberPaletteContent(p as ChamberPalette));
    }

    // Connections (Source, Sink, Chamber) – positional compass layout
    if (p === PipeShape.Source || p === PipeShape.Sink || isChm) {
      panel.appendChild(this._buildConnectionsWidget(panel));
    }

    return panel;
  }

  /** Rebuild and replace both the palette and param panels in the DOM. */
  refresh(): void {
    const palettePanel = document.getElementById('editor-palette-panel');
    if (palettePanel) {
      palettePanel.replaceWith(this.buildPalette());
    }
    const paramPanel = document.getElementById('editor-param-panel');
    if (paramPanel) {
      const newParam = this.buildParamPanel();
      newParam.id = 'editor-param-panel';
      paramPanel.replaceWith(newParam);
    }
  }

  /**
   * Create a labeled input row: a `<label>` and an `<input>` side by side.
   * Used by palette/param panel methods and exposed for level metadata inputs.
   */
  labeledInput(labelText: string, value: string, onInput: (v: string) => void, type = 'text', inputWidth?: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = EDITOR_FLEX_ROW_CSS;
    const lbl = document.createElement('label');
    lbl.textContent = labelText;
    lbl.style.cssText = 'font-size:0.85rem;color:#aaa;min-width:80px;';
    const inp = document.createElement('input');
    inp.type = type;
    inp.value = value;
    inp.style.cssText =
      'padding:6px 10px;font-size:0.9rem;background:#0d1a30;color:#eee;' +
      'border:1px solid #4a90d9;border-radius:4px;' +
      (inputWidth ? `width:${inputWidth};` : 'flex:1;');
    inp.addEventListener('input', () => onInput(inp.value));
    wrap.appendChild(lbl);
    wrap.appendChild(inp);
    return wrap;
  }

  /**
   * Build a collapsible section toggle button plus its items and append both to
   * `parent`.  The toggle button uses the supplied `borderColor`/`bgColor`/`textColor`
   * for its visual style.  When expanded, each item is added via `makeItemBtn`.
   */
  private _buildCollapsibleSection(
    parent: HTMLElement,
    label: string,
    expanded: boolean,
    onToggle: () => void,
    borderColor: string,
    bgColor: string,
    textColor: string,
    items: { palette: EditorPalette; label: string }[],
    makeItemBtn: (item: { palette: EditorPalette; label: string }, indent?: boolean) => HTMLButtonElement,
  ): void {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = (expanded ? '▾' : '▸') + ' ' + label;
    toggle.style.cssText =
      'padding:5px 8px;font-size:0.78rem;text-align:left;border-radius:4px;cursor:pointer;' +
      `border:1px solid ${borderColor};background:${bgColor};color:${textColor};font-weight:bold;margin-top:2px;`;
    toggle.addEventListener('click', onToggle);
    parent.appendChild(toggle);

    if (expanded) {
      for (const item of items) {
        parent.appendChild(makeItemBtn(item, true));
      }
    }
  }

  /**
   * Build the chamber content-type `<select>` element (shown only when the
   * palette selection is the generic Chamber tool, not a specific content type).
   * When the selection changes the param panel rebuilds itself.
   */
  private _buildChamberContentSelector(panel: HTMLElement): HTMLElement {
    const state = this._cb.getState();
    const sel = document.createElement('select');
    sel.style.cssText =
      'padding:5px 8px;font-size:0.85rem;background:#0d1a30;color:#eee;' +
      'border:1px solid #4a90d9;border-radius:4px;flex:1;';
    const CHAMBER_DISPLAY_NAMES: Record<string, string> = {
      tank: 'Tank', dirt: 'Dirt', item: 'Item', heater: 'Heater',
      ice: 'Ice', pump: 'Pump', snow: 'Snow', sandstone: 'Sandstone', star: 'Star', hot_plate: 'Hot Plate',
    };
    for (const opt of ['tank', 'dirt', 'item', 'heater', 'ice', 'pump', 'snow', 'sandstone', 'star', 'hot_plate']) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = CHAMBER_DISPLAY_NAMES[opt] ?? opt;
      if (state.params.chamberContent === opt) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      state.params.chamberContent = sel.value as TileParams['chamberContent'];
      if ((TEMP_CHAMBER_CONTENTS as ReadonlySet<string>).has(sel.value)) {
        if (state.params.temperature === 0) state.params.temperature = 1;
      }
      state.applyParamsToLinkedTile();
      this._cb.updateUndoRedoButtons();
      this._cb.renderCanvas();
      const newPanel = this.buildParamPanel();
      newPanel.id = 'editor-param-panel';
      panel.replaceWith(newPanel);
    });
    const selWrap = document.createElement('div');
    selWrap.style.cssText = EDITOR_FLEX_ROW_CSS;
    const selLbl = document.createElement('span');
    selLbl.style.cssText = 'font-size:0.78rem;color:#aaa;min-width:56px;';
    selLbl.textContent = 'Content:';
    selWrap.appendChild(selLbl);
    selWrap.appendChild(sel);
    return selWrap;
  }

  /**
   * Append content-type-specific parameter inputs for a Chamber tile to `parent`.
   * Called when the active palette is a `ChamberPalette` entry (not the generic
   * Chamber tool), so `cc` is always the concrete content type.
   */
  private _buildChamberContentParams(parent: HTMLElement, cc: ChamberContent): void {
    const state = this._cb.getState();
    const descriptors = CHAMBER_PARAM_DESCRIPTORS[cc];
    if (descriptors) {
      for (const { label, field, clampMin } of descriptors) {
        parent.appendChild(this.labeledInput(label, String(state.params[field]), (v) => {
          const parsed = parseInt(v) || 0;
          state.params[field] = clampMin !== undefined ? Math.max(clampMin, parsed) : parsed;
          state.applyParamsToLinkedTile();
          this._cb.updateUndoRedoButtons();
          this._cb.renderCanvas();
        }, 'number', '90px'));
      }
    }
    if (cc === 'item') {
      parent.appendChild(this._buildItemShapeSelector());
      parent.appendChild(this.labeledInput('Count', String(state.params.itemCount), (v) => {
        const parsed = parseInt(v);
        state.params.itemCount = isNaN(parsed) ? 1 : parsed;
        state.applyParamsToLinkedTile();
        this._cb.updateUndoRedoButtons();
        this._cb.renderCanvas();
      }, 'number', '90px'));
    }
  }

  /**
   * Build the item-shape `<select>` widget for Chamber-item tiles.
   * Extracted to keep {@link _buildChamberContentParams} focused.
   */
  private _buildItemShapeSelector(): HTMLElement {
    const state = this._cb.getState();
    const itemSel = document.createElement('select');
    itemSel.style.cssText =
      'padding:5px 8px;font-size:0.85rem;background:#0d1a30;color:#eee;' +
      'border:1px solid #4a90d9;border-radius:4px;flex:1;';
    for (const shp of [PipeShape.Straight, PipeShape.Elbow, PipeShape.Tee, PipeShape.Cross,
                       PipeShape.GoldStraight, PipeShape.GoldElbow, PipeShape.GoldTee, PipeShape.GoldCross,
                       PipeShape.LeakyStraight, PipeShape.LeakyElbow, PipeShape.LeakyTee, PipeShape.LeakyCross]) {
      const o = document.createElement('option');
      o.value = shp;
      o.textContent = shp;
      if (state.params.itemShape === shp) o.selected = true;
      itemSel.appendChild(o);
    }
    itemSel.addEventListener('change', () => {
      state.params.itemShape = itemSel.value as PipeShape;
      state.applyParamsToLinkedTile();
      this._cb.updateUndoRedoButtons();
      this._cb.renderCanvas();
    });
    const itemSelWrap = document.createElement('div');
    itemSelWrap.style.cssText = EDITOR_FLEX_ROW_CSS;
    const itemLbl = document.createElement('span');
    itemLbl.style.cssText = 'font-size:0.78rem;color:#aaa;min-width:56px;';
    itemLbl.textContent = 'Shape:';
    itemSelWrap.appendChild(itemLbl);
    itemSelWrap.appendChild(itemSel);
    return itemSelWrap;
  }

  /**
   * Build the compass-layout connections widget for Source, Sink, and Chamber tiles.
   * Each direction button toggles the connection and rebuilds the param panel when clicked.
   * @param replaceTarget - The outer param panel element that connection-change rebuilds replace.
   */
  private _buildConnectionsWidget(replaceTarget: HTMLElement): HTMLElement {
    const state = this._cb.getState();

    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = TILE_SIZE;
    previewCanvas.height = TILE_SIZE;
    previewCanvas.style.cssText = 'width:28px;height:28px;border:1px solid #4a90d9;border-radius:4px;';
    const previewCtx = previewCanvas.getContext('2d');
    if (previewCtx) {
      drawEditorTile(previewCtx, 0, 0, state.buildTileDef());
    }

    return buildCompassConnectionsWidget(
      (dir) => state.params.connections[dir as keyof TileParams['connections']],
      (dir) => {
        const key = dir as keyof TileParams['connections'];
        state.params.connections[key] = !state.params.connections[key];
        state.applyParamsToLinkedTile();
        this._cb.updateUndoRedoButtons();
        this._cb.renderCanvas();
        const newPanel = this.buildParamPanel();
        newPanel.id = 'editor-param-panel';
        replaceTarget.replaceWith(newPanel);
      },
      previewCanvas,
    );
  }
}
