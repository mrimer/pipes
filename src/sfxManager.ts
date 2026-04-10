/**
 * SfxManager – loads and plays sound effects.
 *
 * OGG audio files are bundled via webpack (asset/resource) and imported as URL
 * strings.  The manager supports multi-file effects (random selection that
 * avoids consecutive repeats for variety) and a global volume control.
 *
 * Playback uses the Web Audio API so that decoded {@link AudioBuffer} objects
 * are kept in JS heap memory.  This prevents browsers from evicting the cached
 * audio data when the tab is backgrounded, eliminating the stutter/delay that
 * occurs when sound effects need to be re-fetched after the tab resumes.
 * A {@link visibilitychange} listener resumes a suspended {@link AudioContext}
 * and plays a silent 1 ms buffer to rewarm the audio graph whenever the tab
 * becomes visible again.  A plain {@link Audio} element is used as a fallback
 * in environments that do not support the Web Audio API.
 *
 * Adding a new sound effect:
 *  1. Drop the .ogg file(s) into data/sfx/.
 *  2. Import the URL(s) at the top of this file.
 *  3. Add a new entry to the {@link SfxId} enum.
 *  4. Add the URL array to {@link SFX_FILES} keyed by that enum value.
 *  5. Call `sfxManager.play(SfxId.YourNew)` wherever the sound should trigger.
 */

import pipe1Url        from '../data/sfx/pipe1.ogg';
import pipe2Url        from '../data/sfx/pipe2.ogg';
import pipe3Url        from '../data/sfx/pipe3.ogg';
import pipe4Url        from '../data/sfx/pipe4.ogg';
import pipe1FullUrl    from '../data/sfx/pipe1-full.ogg';
import pipe2FullUrl    from '../data/sfx/pipe2-full.ogg';
import pipe3FullUrl    from '../data/sfx/pipe3-full.ogg';
import pipe4FullUrl    from '../data/sfx/pipe4-full.ogg';
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
import winChapterUrl from '../data/sfx/win-chapter-scale.ogg';
import masterChapterUrl from '../data/sfx/master-chapter.ogg';
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
import pickupUrl from '../data/sfx/pickup.ogg';
import chapterSelectUrl from '../data/sfx/chapter-select.ogg';
import snow0Url from '../data/sfx/snow0.ogg';
import snow1Url from '../data/sfx/snow1.ogg';
import snow2Url from '../data/sfx/snow2.ogg';
import snow3Url from '../data/sfx/snow3.ogg';
import disconnectUrl from '../data/sfx/disconnect.ogg';
import cementSquishUrl from '../data/sfx/cement-squish.ogg';
import coolerUrl from '../data/sfx/cooler.ogg';
import vacuumUrl from '../data/sfx/vacuum.ogg';
import sizzleIceUrl from '../data/sfx/sizzle-ice.ogg';
import errorThumpUrl from '../data/sfx/error-thump.ogg';
import boxSlideUrl from '../data/sfx/box-slide.ogg';
import sandstoneHardUrl from '../data/sfx/sandstone-hard.ogg';
import sandstoneShatterUrl from '../data/sfx/sandstone-shatter.ogg';
import sandstone1Url from '../data/sfx/sandstone-1.ogg';
import sandstone2Url from '../data/sfx/sandstone-2.ogg';
import sandstone3Url from '../data/sfx/sandstone-3.ogg';

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
  Pickup           = 37,
  ChapterSelect    = 38,
  Snow0            = 39,
  Snow1            = 40,
  Snow2            = 41,
  Snow3            = 42,
  Disconnect       = 43,
  Cement           = 44,
  Cooler           = 45,
  Vacuum           = 46,
  SizzleIce        = 47,
  PipeConnected    = 48,
  BadConnection    = 49,
  BoardSlide       = 50,
  SandstoneHard    = 51,
  SandstoneShatter = 52,
  Sandstone1       = 53,
  Sandstone2       = 54,
  Sandstone3       = 55,
  MasterChapter    = 56,
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
  [SfxId.Pickup]:           [pickupUrl],
  [SfxId.ChapterSelect]:    [chapterSelectUrl],
  [SfxId.Snow0]:            [snow0Url],
  [SfxId.Snow1]:            [snow1Url],
  [SfxId.Snow2]:            [snow2Url],
  [SfxId.Snow3]:            [snow3Url],
  [SfxId.Disconnect]:       [disconnectUrl],
  [SfxId.Cement]:           [cementSquishUrl],
  [SfxId.Cooler]:           [coolerUrl],
  [SfxId.Vacuum]:           [vacuumUrl],
  [SfxId.SizzleIce]:        [sizzleIceUrl],
  [SfxId.PipeConnected]:    [pipe1FullUrl, pipe2FullUrl, pipe3FullUrl, pipe4FullUrl],
  [SfxId.BadConnection]:    [errorThumpUrl],
  [SfxId.BoardSlide]:       [boxSlideUrl],
  [SfxId.SandstoneHard]:    [sandstoneHardUrl],
  [SfxId.SandstoneShatter]: [sandstoneShatterUrl],
  [SfxId.Sandstone1]:       [sandstone1Url],
  [SfxId.Sandstone2]:       [sandstone2Url],
  [SfxId.Sandstone3]:       [sandstone3Url],
  [SfxId.MasterChapter]:    [masterChapterUrl],
};

// ─── SfxManager class ─────────────────────────────────────────────────────────

/** Manages playback and volume for all in-game sound effects. */
export class SfxManager {
  /** Volume as a linear factor in [0, 1]. */
  private _volume = 1.0;

  /** Lazily-created Web Audio context. */
  private _ctx: AudioContext | null = null;

  /** Master gain node; volume changes are applied here. */
  private _gainNode: GainNode | null = null;

  /**
   * Decoded audio buffers keyed by asset URL.  Storing them in JS memory
   * prevents the browser from evicting them when the tab is backgrounded.
   */
  private readonly _buffers = new Map<string, AudioBuffer>();

  /** Currently playing Web Audio source nodes; used by {@link stopAll}. */
  private readonly _activeSources = new Set<AudioBufferSourceNode>();

  /** Whether the {@link visibilitychange} listener has been registered. */
  private _visibilityListenerAdded = false;

  /** When true, fetch/decode/play errors are logged via {@link console.warn}. */
  private _debug = false;

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
    [SfxId.Pickup]:           -1,
    [SfxId.ChapterSelect]:    -1,
    [SfxId.Snow0]:            -1,
    [SfxId.Snow1]:            -1,
    [SfxId.Snow2]:            -1,
    [SfxId.Snow3]:            -1,
    [SfxId.Disconnect]:       -1,
    [SfxId.Cement]:           -1,
    [SfxId.Cooler]:           -1,
    [SfxId.Vacuum]:           -1,
    [SfxId.SizzleIce]:        -1,
    [SfxId.PipeConnected]:    -1,
    [SfxId.BadConnection]:    -1,
    [SfxId.BoardSlide]:       -1,
    [SfxId.SandstoneHard]:    -1,
    [SfxId.SandstoneShatter]: -1,
    [SfxId.Sandstone1]:       -1,
    [SfxId.Sandstone2]:       -1,
    [SfxId.Sandstone3]:       -1,
    [SfxId.MasterChapter]:    -1,
  };

  /**
   * Preload all sound effect files so they are decoded and cached in memory,
   * ready to play without any delay on first use.
   *
   * Uses the Web Audio API when available so that the decoded
   * {@link AudioBuffer} data lives in JS heap memory and is never evicted by
   * the browser.  Falls back to `<audio>` preloading otherwise.
   */
  preload(): void {
    if (this._getContext()) {
      // Collect every unique URL across all effects and decode them all.
      const urls = new Set<string>();
      for (const files of Object.values(SFX_FILES) as string[][]) {
        for (const url of files) urls.add(url);
      }
      for (const url of urls) {
        this._fetchBuffer(url).catch((err) => { this._warn(`Preload failed: ${url}`, err); });
      }
    } else if (typeof Audio !== 'undefined') {
      // Web Audio unavailable – fall back to HTMLAudioElement preloading.
      for (const files of Object.values(SFX_FILES) as string[][]) {
        for (const url of files) {
          const audio = new Audio(url);
          audio.preload = 'auto';
          audio.load();
        }
      }
    }
  }

  /**
   * Play the given sound effect.
   *
   * When multiple files are mapped to the effect, one is chosen at random
   * from the variants that differ from the previously played file.  If
   * neither Web Audio nor `Audio` is available (e.g. unit tests) or the
   * volume is zero, the call is a silent no-op.
   */
  play(id: SfxId): void {
    if (this._volume === 0) return;

    const files = SFX_FILES[id];
    if (!files || files.length === 0) return;

    const idx = this._pickIndex(id, files.length);
    this._lastIndex[id] = idx;
    const url = files[idx];

    const ctx = this._getContext();
    if (ctx && this._gainNode) {
      // Resume a browser-suspended context before playing (browsers may
      // suspend AudioContext when the page loses focus).
      if (ctx.state === 'suspended') {
        ctx.resume().catch((err) => { this._warn('AudioContext resume failed', err); });
      }
      const buf = this._buffers.get(url);
      if (buf) {
        this._playBuffer(buf);
      } else {
        // Buffer not yet decoded; fetch, cache, then play.
        this._fetchBuffer(url)
          .then(b => { if (b) this._playBuffer(b); })
          .catch((err) => { this._warn(`Playback fetch failed: ${url}`, err); });
      }
    } else if (typeof Audio !== 'undefined') {
      // Web Audio unavailable – fall back to HTMLAudioElement.
      const audio = new Audio(url);
      audio.volume = this._volume;
      try {
        const playResult = audio.play();
        if (playResult !== undefined) {
          playResult.catch((err) => { this._warn('HTMLAudio play failed', err); });
        }
      } catch (err) {
        // Ignore synchronous errors (e.g. not-implemented in test environments).
        this._warn('HTMLAudio play threw synchronously', err);
      }
    }
  }

  /**
   * Play the given sound effect and invoke {@link onDone} once playback ends.
   *
   * Behaves like {@link play} but additionally calls {@link onDone} after the
   * audio finishes.  When audio is unavailable or the volume is zero,
   * {@link onDone} is called synchronously so the caller is never left waiting.
   */
  playWithDoneCallback(id: SfxId, onDone: () => void): void {
    if (this._volume === 0) { onDone(); return; }

    const files = SFX_FILES[id];
    if (!files || files.length === 0) { onDone(); return; }

    const idx = this._pickIndex(id, files.length);
    this._lastIndex[id] = idx;
    const url = files[idx];

    const ctx = this._getContext();
    if (ctx && this._gainNode) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch((err) => { this._warn('AudioContext resume failed', err); });
      }
      const buf = this._buffers.get(url);
      if (buf) {
        this._playBufferWithCallback(buf, onDone);
      } else {
        this._fetchBuffer(url)
          .then(b => {
            if (b) { this._playBufferWithCallback(b, onDone); }
            else { onDone(); }
          })
          .catch((err) => { this._warn(`Playback fetch failed: ${url}`, err); onDone(); });
      }
    } else if (typeof Audio !== 'undefined') {
      const audio = new Audio(url);
      audio.volume = this._volume;
      audio.addEventListener('ended', () => onDone(), { once: true });
      audio.addEventListener('error', () => onDone(), { once: true });
      try {
        const playResult = audio.play();
        if (playResult !== undefined) {
          playResult.catch((err) => { this._warn('HTMLAudio play failed', err); onDone(); });
        }
      } catch (err) {
        this._warn('HTMLAudio play threw synchronously', err);
        onDone();
      }
    } else {
      onDone();
    }
  }

  /**
   * Set the playback volume.
   * @param volume - An integer in [0, 100]; 0 is silent, 100 is full volume.
   */
  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(100, volume)) / 100;
    if (this._gainNode) {
      this._gainNode.gain.value = this._volume;
    }
  }

  /**
   * Release all resources held by this manager (AudioContext, cached buffers,
   * event listeners).  Call this if the manager instance is no longer needed.
   */
  destroy(): void {
    if (this._visibilityListenerAdded && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
      this._visibilityListenerAdded = false;
    }
    this._buffers.clear();
    if (this._ctx) {
      this._ctx.close().catch((err) => { this._warn('AudioContext close failed', err); });
      this._ctx = null;
      this._gainNode = null;
    }
  }

  /**
   * Return the current volume as an integer in [0, 100].
   */
  getVolume(): number {
    return Math.round(this._volume * 100);
  }

  /**
   * Stop all currently playing sounds immediately.
   * Call this on screen transitions or level restarts to silence any sounds
   * that are still playing from the previous state.
   */
  stopAll(): void {
    for (const source of this._activeSources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    this._activeSources.clear();
  }

  /**
   * Enable or disable debug mode.
   * When enabled, fetch, decode, and playback errors that are normally
   * swallowed silently will be logged via {@link console.warn}, making it
   * easier to diagnose audio issues without affecting production behavior.
   */
  setDebugMode(enabled: boolean): void {
    this._debug = enabled;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /** Emit a warning when debug mode is enabled; silent no-op otherwise. */
  private _warn(message: string, err?: unknown): void {
    if (this._debug) {
      // eslint-disable-next-line no-console
      console.warn(`[SfxManager] ${message}`, err ?? '');
    }
  }

  /**
   * Return the shared {@link AudioContext}, creating it lazily on first call.
   * Returns `null` when the Web Audio API is not available.
   */
  private _getContext(): AudioContext | null {
    if (this._ctx) return this._ctx;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AC: typeof AudioContext | undefined =
      typeof AudioContext !== 'undefined' ? AudioContext
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : typeof (globalThis as any).webkitAudioContext !== 'undefined' ? (globalThis as any).webkitAudioContext
      : undefined;
    if (!AC) return null;

    this._ctx = new AC();
    this._gainNode = this._ctx.createGain();
    this._gainNode.gain.value = this._volume;
    this._gainNode.connect(this._ctx.destination);

    if (!this._visibilityListenerAdded && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._onVisibilityChange);
      this._visibilityListenerAdded = true;
    }

    return this._ctx;
  }

  /**
   * Handle tab-visibility changes: resume a suspended context and rewarm the
   * audio graph by playing a silent 1 ms buffer so the next real sound plays
   * without any start-up latency.
   */
  private readonly _onVisibilityChange = (): void => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    const ctx = this._ctx;
    if (!ctx) return;

    const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
    resume
      .then(() => this._playWarmup())
      .catch((err) => { this._warn('AudioContext resume (visibility) failed', err); });
  };

  /** Play a 1 ms silent buffer to warm up the audio graph after a resume. */
  private _playWarmup(): void {
    const ctx = this._ctx;
    const gainNode = this._gainNode;
    if (!ctx || !gainNode) return;

    /** Duration of the warmup buffer in seconds (1 ms). */
    const WARMUP_DURATION_S = 0.001;
    const silentBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * WARMUP_DURATION_S), ctx.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = silentBuffer;
    source.connect(gainNode);
    source.start();
  }

  /**
   * Fetch the audio file at {@link url}, decode it, store it in
   * {@link _buffers}, and return the resulting {@link AudioBuffer}.
   * Returns `null` if the context is unavailable or the decode fails.
   */
  private async _fetchBuffer(url: string): Promise<AudioBuffer | null> {
    const ctx = this._getContext();
    if (!ctx) return null;

    // Return already-cached buffer immediately.
    const cached = this._buffers.get(url);
    if (cached) return cached;

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this._buffers.set(url, audioBuffer);
      return audioBuffer;
    } catch (err) {
      this._warn(`Failed to fetch/decode audio: ${url}`, err);
      return null;
    }
  }

  /** Schedule an {@link AudioBuffer} for immediate playback. */
  private _playBuffer(buf: AudioBuffer): void {
    const ctx = this._ctx;
    const gainNode = this._gainNode;
    if (!ctx || !gainNode) return;

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(gainNode);
    this._activeSources.add(source);
    source.onended = () => { this._activeSources.delete(source); };
    source.start();
  }

  /**
   * Schedule an {@link AudioBuffer} for immediate playback, invoking
   * {@link onDone} once the source node fires its `ended` event.
   */
  private _playBufferWithCallback(buf: AudioBuffer, onDone: () => void): void {
    const ctx = this._ctx;
    const gainNode = this._gainNode;
    if (!ctx || !gainNode) { onDone(); return; }

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(gainNode);
    this._activeSources.add(source);
    source.onended = () => {
      this._activeSources.delete(source);
      onDone();
    };
    source.start();
  }

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
