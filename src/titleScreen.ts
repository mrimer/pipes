import { drawPipeBody } from './renderer';
import { BG_COLOR, PIPE_COLOR, TILE_BG, WATER_COLOR } from './colors';
import { Direction, PipeShape, Rotation } from './types';
import { oppositeDirection } from './tile';

type TitleLetter = 'C' | 'O' | 'L' | 'P' | 'I' | 'E' | 'S';

interface GlyphCell {
  readonly row: number;
  readonly col: number;
  readonly letterIndex: number;
  readonly directions: ReadonlySet<Direction>;
  readonly shape: PipeShape;
  readonly rotation: Rotation;
}

interface GlyphLayout {
  readonly cells: readonly GlyphCell[];
  readonly rows: number;
  readonly cols: number;
  readonly letterCount: number;
}

const TITLE_TEXT = 'COOL PIPES';
const WORD_GAP_COLUMNS = 2;
const LETTER_GAP_COLUMNS = 1;
const TILE_PADDING_RATIO = 0.08;
const MIN_TILE_SIZE = 16;
/** Generous upper bound; the width-driven sizing will normally cap tiles below this. */
const MAX_TILE_SIZE = 56;
const LETTER_FILL_STEP_MS = 100;
const LETTER_GAP_MS = 150;
const PROMPT_FADE_MS = 900;
const OVERLAY_ALPHA = 0.96;
/** Pixel height of each glyph bitmap (rows in every GLYPHS entry). */
const GLYPH_ROWS = 7;
const PRESS_PROMPT_COLOR = '#d6e8ff';
const PRESS_PROMPT_FONT_WEIGHT = 600;
const PRESS_PROMPT_FONT_FAMILY = 'Arial, sans-serif';
const PRESS_PROMPT_FONT_SIZE_RATIO = 0.95;

const GLYPHS: Record<TitleLetter, readonly string[]> = {
  C: [
    '01110',
    '11011',
    '11000',
    '11000',
    '11000',
    '11011',
    '01110',
  ],
  O: [
    '01110',
    '11011',
    '11011',
    '11011',
    '11011',
    '11011',
    '01110',
  ],
  L: [
    '11000',
    '11000',
    '11000',
    '11000',
    '11000',
    '11000',
    '11111',
  ],
  P: [
    '11110',
    '11011',
    '11011',
    '11110',
    '11000',
    '11000',
    '11000',
  ],
  I: [
    '11111',
    '00110',
    '00110',
    '00110',
    '00110',
    '00110',
    '11111',
  ],
  E: [
    '11111',
    '11000',
    '11000',
    '11110',
    '11000',
    '11000',
    '11111',
  ],
  S: [
    '01111',
    '11000',
    '11000',
    '01110',
    '00011',
    '00011',
    '11110',
  ],
};

const DIRECTION_DELTAS: ReadonlyArray<readonly [Direction, number, number]> = [
  [Direction.North, -1, 0],
  [Direction.East, 0, 1],
  [Direction.South, 1, 0],
  [Direction.West, 0, -1],
];
const DIRECTION_TO_DELTA = new Map<Direction, readonly [number, number]>(
  DIRECTION_DELTAS.map(([direction, dr, dc]) => [direction, [dr, dc] as const]),
);

function key(row: number, col: number): string {
  return `${row},${col}`;
}

function decodeKey(encoded: string): { row: number; col: number } {
  const [rowText, colText] = encoded.split(',');
  return { row: Number(rowText), col: Number(colText) };
}

function deltaForDirection(direction: Direction): readonly [number, number] {
  return DIRECTION_TO_DELTA.get(direction) ?? [0, 0];
}

function pipeShapeFromDirections(directions: ReadonlySet<Direction>): { shape: PipeShape; rotation: Rotation } {
  const hasN = directions.has(Direction.North);
  const hasE = directions.has(Direction.East);
  const hasS = directions.has(Direction.South);
  const hasW = directions.has(Direction.West);
  const degree = directions.size;

  if (degree >= 4) {
    return { shape: PipeShape.Cross, rotation: 0 };
  }
  if (degree === 3) {
    if (!hasW) return { shape: PipeShape.Tee, rotation: 0 };
    if (!hasN) return { shape: PipeShape.Tee, rotation: 90 };
    if (!hasE) return { shape: PipeShape.Tee, rotation: 180 };
    return { shape: PipeShape.Tee, rotation: 270 };
  }
  if (degree === 2) {
    if ((hasN && hasS) || (hasE && hasW)) {
      return { shape: PipeShape.Straight, rotation: hasN ? 0 : 90 };
    }
    if (hasN && hasE) return { shape: PipeShape.Elbow, rotation: 0 };
    if (hasE && hasS) return { shape: PipeShape.Elbow, rotation: 90 };
    if (hasS && hasW) return { shape: PipeShape.Elbow, rotation: 180 };
    return { shape: PipeShape.Elbow, rotation: 270 };
  }
  if (hasE || hasW) {
    return { shape: PipeShape.Straight, rotation: 90 };
  }
  return { shape: PipeShape.Straight, rotation: 0 };
}

export function buildTitleGlyphLayout(text = TITLE_TEXT): GlyphLayout {
  const cells: GlyphCell[] = [];
  let letterIndex = 0;
  let colOffset = 0;
  let seenLetter = false;

  for (const rawChar of text) {
    const glyph = GLYPHS[rawChar as TitleLetter];
    if (!glyph) {
      // Unrecognised character (space) → word gap.
      if (seenLetter) {
        colOffset += WORD_GAP_COLUMNS;
      }
      continue;
    }

    if (seenLetter) {
      colOffset += LETTER_GAP_COLUMNS;
    }
    seenLetter = true;

    const occupied = new Set<string>();
    for (let row = 0; row < glyph.length; row++) {
      const rowText = glyph[row];
      for (let col = 0; col < rowText.length; col++) {
        if (rowText[col] === '1') {
          occupied.add(key(row, colOffset + col));
        }
      }
    }

    for (const posKey of occupied) {
      const { row, col } = decodeKey(posKey);
      const directions = new Set<Direction>();
      for (const [direction, dr, dc] of DIRECTION_DELTAS) {
        if (occupied.has(key(row + dr, col + dc))) {
          directions.add(direction);
        }
      }
      const { shape, rotation } = pipeShapeFromDirections(directions);
      cells.push({ row, col, letterIndex, directions, shape, rotation });
    }

    letterIndex++;
    colOffset += glyph[0]?.length ?? 0;
  }

  return {
    cells,
    rows: GLYPH_ROWS,
    cols: colOffset,
    letterCount: letterIndex,
  };
}

function buildLetterDepthMap(layout: GlyphLayout): {
  readonly depths: Map<string, number>;
  readonly letterStarts: readonly number[];
  readonly allLettersDoneAt: number;
} {
  const byLetter = new Map<number, GlyphCell[]>();
  for (const cell of layout.cells) {
    const existing = byLetter.get(cell.letterIndex);
    if (existing) {
      existing.push(cell);
    } else {
      byLetter.set(cell.letterIndex, [cell]);
    }
  }

  const cellLookup = new Map<string, GlyphCell>();
  for (const cell of layout.cells) {
    cellLookup.set(key(cell.row, cell.col), cell);
  }

  const depths = new Map<string, number>();
  const letterStarts: number[] = [];
  let currentStart = 0;
  for (let i = 0; i < layout.letterCount; i++) {
    letterStarts.push(currentStart);
    const letterCells = byLetter.get(i) ?? [];
    if (letterCells.length === 0) continue;
    const sorted = [...letterCells].sort((a, b) => (a.row - b.row) || (a.col - b.col));
    const start = sorted[0];
    const startKey = key(start.row, start.col);
    const queue: Array<{ encoded: string; depth: number }> = [{ encoded: startKey, depth: 0 }];
    const seen = new Set<string>([startKey]);
    let maxDepth = 0;

    for (let qi = 0; qi < queue.length; qi++) {
      const { encoded, depth } = queue[qi];
      depths.set(encoded, depth);
      if (depth > maxDepth) maxDepth = depth;
      const current = cellLookup.get(encoded);
      if (!current) continue;
      for (const direction of current.directions) {
        const [dr, dc] = deltaForDirection(direction);
        const nextKey = key(current.row + dr, current.col + dc);
        if (seen.has(nextKey)) continue;
        const neighbor = cellLookup.get(nextKey);
        if (!neighbor || neighbor.letterIndex !== i) continue;
        if (!neighbor.directions.has(oppositeDirection(direction))) continue;
        seen.add(nextKey);
        queue.push({ encoded: nextKey, depth: depth + 1 });
      }
    }

    currentStart += (maxDepth + 1) * LETTER_FILL_STEP_MS + LETTER_GAP_MS;
  }

  return { depths, letterStarts, allLettersDoneAt: currentStart };
}

function clamp01(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

function anyGamepadButtonPressed(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return false;
  const pads = navigator.getGamepads();
  for (const pad of pads) {
    if (!pad) continue;
    if (pad.buttons.some((button) => button.pressed)) {
      return true;
    }
  }
  return false;
}

export function showIntroTitleScreen(): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'z-index:2000',
      'user-select:none',
      `background:rgba(26,26,46,${OVERLAY_ALPHA})`,
    ].join(';');

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;';
    overlay.appendChild(canvas);
    document.body.appendChild(overlay);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      overlay.remove();
      resolve();
      return;
    }

    const layout = buildTitleGlyphLayout();
    const flow = buildLetterDepthMap(layout);
    const startMs = performance.now();
    let rafId: number | null = null;
    let cleaned = false;

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('resize', renderFrame);
      window.removeEventListener('keydown', onAnyInput, true);
      window.removeEventListener('pointerdown', onAnyInput, true);
      window.removeEventListener('mousedown', onAnyInput, true);
      window.removeEventListener('touchstart', onAnyInput, true);
      overlay.remove();
    };

    const finish = () => {
      cleanup();
      resolve();
    };

    const onAnyInput = () => {
      finish();
    };

    const draw = (now: number) => {
      if (cleaned) return;
      const elapsed = now - startMs;
      const rawDpr = typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1;
      const dpr = Math.max(1, Math.floor(rawDpr));
      const width = Math.max(1, Math.floor(window.innerWidth));
      const height = Math.max(1, Math.floor(window.innerHeight));
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, width, height);

      // Logo is a single wide row – give it most of the viewport width and
      // up to ~55% of the height so tiles can be generously sized on landscape.
      const availableWidth = Math.max(1, width * 0.96);
      const availableHeight = Math.max(1, height * 0.55);
      const tileSize = Math.max(
        MIN_TILE_SIZE,
        Math.min(
          MAX_TILE_SIZE,
          Math.floor(
            Math.min(
              availableWidth / Math.max(1, layout.cols),
              availableHeight / Math.max(1, layout.rows),
            ),
          ),
        ),
      );
      const titleWidth = layout.cols * tileSize;
      const titleHeight = layout.rows * tileSize;
      const originX = Math.floor((width - titleWidth) / 2);
      const originY = Math.floor(height * 0.16);
      const half = tileSize / 2;
      const pad = Math.max(1, Math.floor(tileSize * TILE_PADDING_RATIO));

      for (const cell of layout.cells) {
        const cellKey = key(cell.row, cell.col);
        const depth = flow.depths.get(cellKey) ?? 0;
        const letterStart = flow.letterStarts[cell.letterIndex] ?? 0;
        const isFilled = elapsed >= letterStart + depth * LETTER_FILL_STEP_MS;
        const x = originX + cell.col * tileSize;
        const y = originY + cell.row * tileSize;
        ctx.fillStyle = TILE_BG;
        ctx.fillRect(x + pad, y + pad, tileSize - pad * 2, tileSize - pad * 2);

        ctx.save();
        ctx.translate(x + half, y + half);
        ctx.rotate((cell.rotation * Math.PI) / 180);
        drawPipeBody(ctx, cell.shape, half - pad, undefined, isFilled ? WATER_COLOR : PIPE_COLOR);
        ctx.restore();
      }

      const pressFade = clamp01((elapsed - flow.allLettersDoneAt) / PROMPT_FADE_MS);
      if (pressFade > 0) {
        ctx.save();
        ctx.globalAlpha = pressFade;
        ctx.fillStyle = PRESS_PROMPT_COLOR;
        const fontSize = Math.max(20, Math.floor(tileSize * PRESS_PROMPT_FONT_SIZE_RATIO));
        ctx.font = `${PRESS_PROMPT_FONT_WEIGHT} ${fontSize}px ${PRESS_PROMPT_FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('Press any key', Math.floor(width / 2), originY + titleHeight + Math.floor(tileSize * 1.6));
        ctx.restore();
      }

      if (anyGamepadButtonPressed()) {
        finish();
        return;
      }
      rafId = requestAnimationFrame(draw);
    };

    const renderFrame = () => {
      draw(performance.now());
    };

    window.addEventListener('resize', renderFrame);
    window.addEventListener('keydown', onAnyInput, true);
    window.addEventListener('pointerdown', onAnyInput, true);
    window.addEventListener('mousedown', onAnyInput, true);
    window.addEventListener('touchstart', onAnyInput, true);

    rafId = requestAnimationFrame(draw);
  });
}
