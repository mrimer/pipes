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
 * @param getActive  Returns `true` when the given direction is currently active.
 * @param onToggle   Called with the toggled direction when a button is clicked.
 * @param centerEl   Optional element to display in the centre of the compass.
 */
export function buildCompassConnectionsWidget(
  getActive: (dir: Direction) => boolean,
  onToggle: (dir: Direction) => void,
  centerEl?: HTMLElement,
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

  const makeBtn = (dir: Direction): HTMLButtonElement => {
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
      'background:' + (active ? '#1a3a1a' : EDITOR_INPUT_BG) + ';' +
      'color:'      + (active ? '#7ed321' : '#555')    + ';' +
      'border:1px solid ' + (active ? '#7ed321' : '#4a90d9') + ';' +
      `border-radius:${RADIUS_SM};cursor:pointer;padding:0;`;
    b.addEventListener('click', () => onToggle(dir));
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
