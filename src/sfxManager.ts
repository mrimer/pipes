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

// ─── Sound effect identifiers ─────────────────────────────────────────────────

/** Logical identifiers for each sound effect. */
export const enum SfxId {
  PipePlacement = 0,
  RotateCW      = 1,
  RotateCCW     = 2,
  Delete        = 3,
}

// ─── File mappings ────────────────────────────────────────────────────────────

/**
 * Map from SfxId to the set of URL variants for that effect.
 * When multiple URLs are listed, one is chosen at random (avoiding the last
 * played file) each time the sound is triggered.
 */
const SFX_FILES: { [K in SfxId]: string[] } = {
  [SfxId.PipePlacement]: [pipe1Url, pipe2Url, pipe3Url, pipe4Url],
  [SfxId.RotateCW]:      [swishCwUrl],
  [SfxId.RotateCCW]:     [swishCcwUrl],
  [SfxId.Delete]:        [erasePuffUrl],
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
    [SfxId.PipePlacement]: -1,
    [SfxId.RotateCW]:      -1,
    [SfxId.RotateCCW]:     -1,
    [SfxId.Delete]:        -1,
  };

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
