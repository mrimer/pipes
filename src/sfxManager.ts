/**
 * SfxManager – loads and plays sound effects.
 *
 * OGG audio files are bundled via webpack (asset/resource) and imported as URL
 * strings.  The manager supports multi-file effects (random selection that
 * avoids consecutive repeats for variety) and a global volume control.
 *
 * Adding a new sound effect:
 *  1. Drop the .ogg file(s) into data/sfx/.
 *  2. Import the URL(s) at the top of this file.
 *  3. Add a new entry to the {@link SfxId} enum.
 *  4. Add the URL array to {@link SFX_FILES} keyed by that enum value.
 *  5. Call `sfxManager.play(SfxId.YourNew)` wherever the sound should trigger.
 */

import pipe1Url   from '../data/sfx/pipe1.ogg';
import pipe2Url   from '../data/sfx/pipe2.ogg';
import pipe3Url   from '../data/sfx/pipe3.ogg';
import pipe4Url   from '../data/sfx/pipe4.ogg';
import swishCwUrl  from '../data/sfx/swish-cw.ogg';
import swishCcwUrl from '../data/sfx/swish-ccw.ogg';
import erasePuffUrl from '../data/sfx/erase-puff.ogg';
import challengeUrl from '../data/sfx/challenge.ogg';
import levelSelectUrl from '../data/sfx/level-select.ogg';
import lockedUrl from '../data/sfx/locked.ogg';
import invalidSelectionUrl from '../data/sfx/invalid-selection.ogg';
import inventorySelectUrl from '../data/sfx/inventory-select.ogg';
import inventoryUnselectUrl from '../data/sfx/inventory-unselect.ogg';
import pumpMotorUrl from '../data/sfx/pump-motor.ogg';
import dryPuffUrl from '../data/sfx/dry-puff.ogg';
import winLevelUrl from '../data/sfx/win-level.ogg';
import starUrl from '../data/sfx/star.ogg';
import newChapterUrl from '../data/sfx/new-chapter.ogg';
import undoUrl from '../data/sfx/undo.ogg';
import heaterUrl from '../data/sfx/heater.ogg';
import redoUrl from '../data/sfx/redo.ogg';
import waterTankUrl from '../data/sfx/water-tank.ogg';
import bubblesUrl from '../data/sfx/bubbles.ogg';
import backClickUrl from '../data/sfx/back-click.ogg';
import goldenUrl from '../data/sfx/golden.ogg';
import dropletUrl from '../data/sfx/droplet.ogg';
import winChapterUrl from '../data/sfx/win-chapter.ogg';
import sizzleUrl from '../data/sfx/sizzle.ogg';
import pendingCwUrl from '../data/sfx/pending-cw.ogg';
import pendingCcwUrl from '../data/sfx/pending-ccw.ogg';
import iceCrack0Url from '../data/sfx/ice-crack0.ogg';
import iceCrack1Url from '../data/sfx/ice-crack1.ogg';
import iceCrack2Url from '../data/sfx/ice-crack2.ogg';
import iceCrack3Url from '../data/sfx/ice-crack3.ogg';
import clickUrl from '../data/sfx/click.ogg';
import negativePartsUrl from '../data/sfx/negative-parts.ogg';
import undoRestoreUrl from '../data/sfx/undo-restore.ogg';
import dirt1Url from '../data/sfx/dirt1.ogg';
import dirt2Url from '../data/sfx/dirt2.ogg';
import dirt3Url from '../data/sfx/dirt3.ogg';

// ─── Sound effect identifiers ─────────────────────────────────────────────────

/** Logical identifiers for each sound effect. */
export const enum SfxId {
  PipePlacement    = 0,
  RotateCW         = 1,
  RotateCCW        = 2,
  Delete           = 3,
  Challenge        = 4,
  LevelSelect      = 5,
  Locked           = 6,
  InvalidSelection = 7,
  InventorySelect  = 8,
  InventoryUnselect = 9,
  Pump             = 10,
  Dry              = 11,
  WinLevel         = 12,
  Star             = 13,
  NewChapter       = 14,
  Undo             = 15,
  Heater           = 16,
  Redo             = 17,
  Tank             = 18,
  Rings            = 19,
  Back             = 20,
  Gold             = 21,
  Leak             = 22,
  WinChapter       = 23,
  Sizzle           = 24,
  PendingCW        = 25,
  PendingCCW       = 26,
  Ice0             = 27,
  Ice1             = 28,
  Ice2             = 29,
  Ice3             = 30,
  Click            = 31,
  NegativeCount    = 32,
  UndoBeforeRestart = 33,
  Dirt1            = 34,
  Dirt2            = 35,
  Dirt3            = 36,
}

// ─── File mappings ────────────────────────────────────────────────────────────

/**
 * Map from SfxId to the set of URL variants for that effect.
 * When multiple URLs are listed, one is chosen at random (avoiding the last
 * played file) each time the sound is triggered.
 */
const SFX_FILES: { [K in SfxId]: string[] } = {
  [SfxId.PipePlacement]:    [pipe1Url, pipe2Url, pipe3Url, pipe4Url],
  [SfxId.RotateCW]:         [swishCwUrl],
  [SfxId.RotateCCW]:        [swishCcwUrl],
  [SfxId.Delete]:           [erasePuffUrl],
  [SfxId.Challenge]:        [challengeUrl],
  [SfxId.LevelSelect]:      [levelSelectUrl],
  [SfxId.Locked]:           [lockedUrl],
  [SfxId.InvalidSelection]: [invalidSelectionUrl],
  [SfxId.InventorySelect]:  [inventorySelectUrl],
  [SfxId.InventoryUnselect]: [inventoryUnselectUrl],
  [SfxId.Pump]:             [pumpMotorUrl],
  [SfxId.Dry]:              [dryPuffUrl],
  [SfxId.WinLevel]:         [winLevelUrl],
  [SfxId.Star]:             [starUrl],
  [SfxId.NewChapter]:       [newChapterUrl],
  [SfxId.Undo]:             [undoUrl],
  [SfxId.Heater]:           [heaterUrl],
  [SfxId.Redo]:             [redoUrl],
  [SfxId.Tank]:             [waterTankUrl],
  [SfxId.Rings]:            [bubblesUrl],
  [SfxId.Back]:             [backClickUrl],
  [SfxId.Gold]:             [goldenUrl],
  [SfxId.Leak]:             [dropletUrl],
  [SfxId.WinChapter]:       [winChapterUrl],
  [SfxId.Sizzle]:           [sizzleUrl],
  [SfxId.PendingCW]:        [pendingCwUrl],
  [SfxId.PendingCCW]:       [pendingCcwUrl],
  [SfxId.Ice0]:             [iceCrack0Url],
  [SfxId.Ice1]:             [iceCrack1Url],
  [SfxId.Ice2]:             [iceCrack2Url],
  [SfxId.Ice3]:             [iceCrack3Url],
  [SfxId.Click]:            [clickUrl],
  [SfxId.NegativeCount]:    [negativePartsUrl],
  [SfxId.UndoBeforeRestart]: [undoRestoreUrl],
  [SfxId.Dirt1]:            [dirt1Url],
  [SfxId.Dirt2]:            [dirt2Url],
  [SfxId.Dirt3]:            [dirt3Url],
};

// ─── SfxManager class ─────────────────────────────────────────────────────────

/** Manages playback and volume for all in-game sound effects. */
export class SfxManager {
  /** Volume as a linear factor in [0, 1]. */
  private _volume = 1.0;

  /**
   * Last-played variant index per SfxId, used to avoid repeating the same
   * file consecutively.  -1 means no file has been played yet for that effect.
   */
  private readonly _lastIndex: { [K in SfxId]: number } = {
    [SfxId.PipePlacement]:    -1,
    [SfxId.RotateCW]:         -1,
    [SfxId.RotateCCW]:        -1,
    [SfxId.Delete]:           -1,
    [SfxId.Challenge]:        -1,
    [SfxId.LevelSelect]:      -1,
    [SfxId.Locked]:           -1,
    [SfxId.InvalidSelection]: -1,
    [SfxId.InventorySelect]:  -1,
    [SfxId.InventoryUnselect]: -1,
    [SfxId.Pump]:             -1,
    [SfxId.Dry]:              -1,
    [SfxId.WinLevel]:         -1,
    [SfxId.Star]:             -1,
    [SfxId.NewChapter]:       -1,
    [SfxId.Undo]:             -1,
    [SfxId.Heater]:           -1,
    [SfxId.Redo]:             -1,
    [SfxId.Tank]:             -1,
    [SfxId.Rings]:            -1,
    [SfxId.Back]:             -1,
    [SfxId.Gold]:             -1,
    [SfxId.Leak]:             -1,
    [SfxId.WinChapter]:       -1,
    [SfxId.Sizzle]:           -1,
    [SfxId.PendingCW]:        -1,
    [SfxId.PendingCCW]:       -1,
    [SfxId.Ice0]:             -1,
    [SfxId.Ice1]:             -1,
    [SfxId.Ice2]:             -1,
    [SfxId.Ice3]:             -1,
    [SfxId.Click]:            -1,
    [SfxId.NegativeCount]:    -1,
    [SfxId.UndoBeforeRestart]: -1,
    [SfxId.Dirt1]:            -1,
    [SfxId.Dirt2]:            -1,
    [SfxId.Dirt3]:            -1,
  };

  /**
   * Preload all sound effect files so they are cached and ready to play
   * without any delay on first use.
   */
  preload(): void {
    if (typeof Audio === 'undefined') return;
    for (const files of Object.values(SFX_FILES) as string[][]) {
      for (const url of files) {
        const audio = new Audio(url);
        audio.preload = 'auto';
        audio.load();
      }
    }
  }

  /**
   * Play the given sound effect.
   *
   * When multiple files are mapped to the effect, one is chosen at random
   * from the variants that differ from the previously played file.  If
   * `Audio` is not available in the current environment (e.g. unit tests)
   * or the volume is zero, the call is a silent no-op.
   */
  play(id: SfxId): void {
    if (this._volume === 0) return;
    if (typeof Audio === 'undefined') return;

    const files = SFX_FILES[id];
    if (!files || files.length === 0) return;

    const idx = this._pickIndex(id, files.length);
    this._lastIndex[id] = idx;

    const audio = new Audio(files[idx]);
    audio.volume = this._volume;
    try {
      const playResult = audio.play();
      if (playResult !== undefined) {
        playResult.catch(() => { /* ignore autoplay or decode errors */ });
      }
    } catch {
      // Ignore synchronous errors (e.g. not-implemented in test environments).
    }
  }

  /**
   * Set the playback volume.
   * @param volume - An integer in [0, 100]; 0 is silent, 100 is full volume.
   */
  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(100, volume)) / 100;
  }

  /**
   * Return the current volume as an integer in [0, 100].
   */
  getVolume(): number {
    return Math.round(this._volume * 100);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Pick a random variant index for the given effect, excluding the last
   * played index so the same file is not repeated consecutively.
   */
  private _pickIndex(id: SfxId, count: number): number {
    if (count === 1) return 0;
    const last = this._lastIndex[id];
    const candidates: number[] = [];
    for (let i = 0; i < count; i++) {
      if (i !== last) candidates.push(i);
    }
    // Fallback: if all candidates were excluded (shouldn't happen) play index 0.
    if (candidates.length === 0) return 0;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
}

// ─── Module-level singleton ───────────────────────────────────────────────────

/** Shared SfxManager instance used throughout the application. */
export const sfxManager = new SfxManager();
