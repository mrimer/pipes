/**
 * connectionsWidget – shared compass-layout (3×3 grid) connections toggle
 * widget used by both the level editor's TileParamsPanel and the chapter map
 * editor's ChapterEditorUI.
 */

import { Direction } from '../types';
import { EDITOR_INPUT_BG, RADIUS_SM } from '../uiConstants';

// Button dimensions for the compass layout.
// W/E buttons are wider; N/S buttons are taller, giving more surface area for
// both the connection button itself and the valve-indicator rectangles inside.
const BTN_NS_W = 28; // N and S button width  (px)
const BTN_NS_H = 40; // N and S button height (px)
const BTN_WE_W = 40; // W and E button width  (px)
const BTN_WE_H = 28; // W and E button height (px)
const BTN_CTR  = 28; // center cell size      (px)

// Valve indicator dimensions (the clickable rectangle drawn inside each button).
const IND_NS_W = '20px'; // landscape strip width  for N/S buttons
const IND_NS_H =  '7px'; // landscape strip height for N/S buttons
const IND_WE_W =  '7px'; // portrait  strip width  for W/E buttons
const IND_WE_H = '20px'; // portrait  strip height for W/E buttons
// Gap from the inward button edge to the near edge of the indicator strip (px).
const IND_EDGE_OFFSET = 2;
// indicator height (7) + IND_EDGE_OFFSET (2) = the CSS 'calc(100% - 9px)' used on the far edge.
const IND_FAR_OFFSET = parseInt(IND_NS_H) + IND_EDGE_OFFSET; // 9

/**
 * Build a compass-layout N/E/S/W toggle widget.
 *
 * The widget is a 3×3 CSS grid: N in row 1, W and E in row 2, S in row 3.
 * An optional `centerEl` fills the centre cell; when omitted an empty span is
 * placed there instead.
 *
 * When `getFirstActive` and `onFirstToggle` are supplied (level editor only),
 * each direction button also shows a small "first / valve" indicator
 * rectangle.  The indicator is drawn as a thin bordered overlay:
 * - Gray hollow (inactive): the direction is not a valve.
 * - Solid red (active): the direction is a valve for this chamber.
 * Clicking the indicator calls `onFirstToggle(dir)`.
 *
 * @param getActive       Returns `true` when the given direction is currently active.
 * @param onToggle        Called with the toggled direction when a button is clicked.
 * @param centerEl        Optional element to display in the centre of the compass.
 * @param getFirstActive  Optional: returns `true` when direction is a first/valve connection.
 * @param onFirstToggle   Optional: called when the first-flag indicator is clicked.
 */
export function buildCompassConnectionsWidget(
  getActive: (dir: Direction) => boolean,
  onToggle: (dir: Direction) => void,
  centerEl?: HTMLElement,
  getFirstActive?: (dir: Direction) => boolean,
  onFirstToggle?: (dir: Direction) => void,
): HTMLElement {
  const connWrap = document.createElement('div');
  connWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

  const connLbl = document.createElement('div');
  connLbl.style.cssText = 'font-size:0.78rem;color:#aaa;';
  connLbl.textContent = 'Connections';
  connWrap.appendChild(connLbl);

  const connGrid = document.createElement('div');
  // Asymmetric grid: W/E columns are wider, N/S rows are taller.
  connGrid.style.cssText =
    `display:grid;` +
    `grid-template-columns:${BTN_WE_W}px ${BTN_CTR}px ${BTN_WE_W}px;` +
    `grid-template-rows:${BTN_NS_H}px ${BTN_WE_H}px ${BTN_NS_H}px;` +
    `gap:2px;`;

  const makeBtn = (dir: Direction): HTMLElement => {
    const label = dir === Direction.North ? 'N'
                : dir === Direction.East  ? 'E'
                : dir === Direction.South ? 'S'
                : 'W';
    const active = getActive(dir);
    const isNS = dir === Direction.North || dir === Direction.South;
    const btnW = isNS ? BTN_NS_W : BTN_WE_W;
    const btnH = isNS ? BTN_NS_H : BTN_WE_H;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = `Toggle ${label} connection`;
    b.style.cssText =
      `width:${btnW}px;height:${btnH}px;font-size:0.75rem;display:flex;align-items:center;justify-content:center;` +
      'position:relative;' +
      'background:' + (active ? '#1a3a1a' : EDITOR_INPUT_BG) + ';' +
      'color:'      + (active ? '#7ed321' : '#555')    + ';' +
      'border:1px solid ' + (active ? '#7ed321' : '#4a90d9') + ';' +
      `border-radius:${RADIUS_SM};cursor:pointer;padding:0;`;
    b.addEventListener('click', () => onToggle(dir));

    // Optional first-flag indicator overlay
    if (getFirstActive && onFirstToggle) {
      const firstActive = getFirstActive(dir);
      const indicator = document.createElement('span');
      // N/S: horizontal bar near the inward edge; W/E: vertical bar near the inward edge.
      const indW = isNS ? IND_NS_W : IND_WE_W;
      const indH = isNS ? IND_NS_H : IND_WE_H;
      const top  = dir === Direction.North ? `calc(100% - ${IND_FAR_OFFSET}px)`
                 : dir === Direction.South ? `${IND_EDGE_OFFSET}px`
                 : `calc(50% - ${parseInt(IND_WE_H) / 2}px)`;
      const left = dir === Direction.West  ? `calc(100% - ${IND_FAR_OFFSET}px)`
                 : dir === Direction.East  ? `${IND_EDGE_OFFSET}px`
                 : `calc(50% - ${parseInt(IND_NS_W) / 2}px)`;
      indicator.style.cssText =
        `position:absolute;top:${top};left:${left};` +
        `width:${indW};height:${indH};` +
        `border:1.5px solid #555;border-radius:4px;` +
        `background:${firstActive ? '#cc0000' : 'transparent'};` +
        'pointer-events:all;cursor:pointer;box-sizing:border-box;';
      indicator.title = `Toggle ${label} as valve (first connection)`;
      indicator.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent toggling the connection button
        onFirstToggle(dir);
      });
      b.appendChild(indicator);
    }

    return b;
  };

  // Row 1: [empty] [N] [empty]
  connGrid.appendChild(document.createElement('span'));
  connGrid.appendChild(makeBtn(Direction.North));
  connGrid.appendChild(document.createElement('span'));
  // Row 2: [W] [center] [E]
  connGrid.appendChild(makeBtn(Direction.West));
  connGrid.appendChild(centerEl ?? document.createElement('span'));
  connGrid.appendChild(makeBtn(Direction.East));
  // Row 3: [empty] [S] [empty]
  connGrid.appendChild(document.createElement('span'));
  connGrid.appendChild(makeBtn(Direction.South));
  connGrid.appendChild(document.createElement('span'));

  connWrap.appendChild(connGrid);
  return connWrap;
}
