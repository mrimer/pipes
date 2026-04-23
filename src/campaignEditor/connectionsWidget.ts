/**
 * connectionsWidget – shared compass-layout (3×3 grid) connections toggle
 * widget used by both the level editor's TileParamsPanel and the chapter map
 * editor's ChapterEditorUI.
 */

import { Direction } from '../types';
import { EDITOR_INPUT_BG, RADIUS_SM } from '../uiConstants';

/**
 * Build a compass-layout N/E/S/W toggle widget.
 *
 * The widget is a 3×3 CSS grid: N in row 1, W and E in row 2, S in row 3.
 * An optional `centerEl` fills the centre cell; when omitted an empty span is
 * placed there instead.
 *
 * When `getFirstActive` and `onFirstToggle` are supplied (level editor only),
 * each direction button also shows a small "first / regulator" indicator
 * rectangle.  The indicator is drawn as a thin bordered overlay:
 * - Gray hollow (inactive): the direction is not a regulator.
 * - Solid red (active): the direction is a regulator for this chamber.
 * Clicking the indicator calls `onFirstToggle(dir)`.
 *
 * @param getActive       Returns `true` when the given direction is currently active.
 * @param onToggle        Called with the toggled direction when a button is clicked.
 * @param centerEl        Optional element to display in the centre of the compass.
 * @param getFirstActive  Optional: returns `true` when direction is a first/regulator connection.
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
  connGrid.style.cssText =
    'display:grid;grid-template-columns:repeat(3,28px);grid-template-rows:repeat(3,28px);gap:2px;';

  const makeBtn = (dir: Direction): HTMLElement => {
    const label = dir === Direction.North ? 'N'
                : dir === Direction.East  ? 'E'
                : dir === Direction.South ? 'S'
                : 'W';
    const active = getActive(dir);
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = `Toggle ${label} connection`;
    b.style.cssText =
      'width:28px;height:28px;font-size:0.75rem;display:flex;align-items:center;justify-content:center;' +
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
      // Portrait indicator for N/S (landscape strip at top/bottom edge);
      // Landscape indicator for W/E (portrait strip at left/right edge).
      const isNS = dir === Direction.North || dir === Direction.South;
      const indW = isNS ? '14px' : '5px';
      const indH = isNS ? '5px' : '14px';
      const top  = dir === Direction.North ? '1px'
                 : dir === Direction.South ? 'calc(100% - 6px)'
                 : 'calc(50% - 7px)';
      const left = dir === Direction.West  ? '1px'
                 : dir === Direction.East  ? 'calc(100% - 6px)'
                 : 'calc(50% - 7px)';
      indicator.style.cssText =
        `position:absolute;top:${top};left:${left};` +
        `width:${indW};height:${indH};` +
        `border:1.5px solid #555;border-radius:4px;` +
        `background:${firstActive ? '#cc0000' : 'transparent'};` +
        'pointer-events:all;cursor:pointer;box-sizing:border-box;';
      indicator.title = `Toggle ${label} as regulator (first connection)`;
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
