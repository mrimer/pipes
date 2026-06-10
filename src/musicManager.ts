/**
 * MusicManager – streams background music tracks via HTMLAudioElement routed
 * through Web Audio for gain control and cross-fading.
 *
 * Architecture:
 *  - Two audio slots (A / B) each hold: HTMLAudioElement +
 *    MediaElementAudioSourceNode + per-track GainNode.  Only the
 *    MediaElementAudioSourceNode → GainNode → masterMusicGain → destination
 *    chain is ever live; the slots alternate on each group switch.
 *  - Cross-fade: 2-second linearRamp on the outgoing slot's gain (→ 0) and
 *    the incoming slot's gain (→ 1).  The master gain carries the user's volume
 *    setting, independent of fades.
 *  - Autoplay policy: AudioContext starts suspended; playback is queued until
 *    the first user gesture (pointerdown / keydown).  A visibilitychange listener
 *    resumes a suspended context when the tab becomes visible again.
 *  - Node/jsdom safety: every audio-API call is guarded by capability checks so
 *    the module loads without errors in the test environment.
 *
 * The scheduler (pure logic, fully tested) lives in musicScheduler.ts.
 */

import { MusicScheduler, selectGroupForContext } from './musicScheduler';
import type { MusicGroupId, SelectGroupArgs } from './musicScheduler';

export { selectGroupForContext };
export type { MusicGroupId, SelectGroupArgs };

// ─── Types ───────────────────────────────────────────────────────────────────

/** One audio slot in the two-slot pool. */
interface AudioSlot {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

// ─── MusicManager class ───────────────────────────────────────────────────────

/** Duration (seconds) of the cross-fade between groups. */
const CROSSFADE_DURATION = 2;

/** Duration (seconds) of the fade between same-group tracks (track ended → next). */
const SAME_GROUP_FADE = 0.3;

class MusicManager {
  /** Volume as a linear factor in [0, 1]. Initialized to 0.5 (50%). */
  private _volume = 0.5;

  /** Lazily created AudioContext. */
  private _ctx: AudioContext | null = null;

  /** Master gain that carries the user's volume setting. */
  private _masterGain: GainNode | null = null;

  /** Two-slot pool; index 0 = slot A, index 1 = slot B. */
  private _slots: [AudioSlot | null, AudioSlot | null] = [null, null];

  /** Index of the currently active slot (0 or 1). */
  private _activeSlot = 0;

  /** Pure scheduler – owns group/shuffle logic. */
  private readonly _scheduler = new MusicScheduler();

  /** Whether there is a track currently playing (or fading in). */
  private _isPlaying = false;

  /**
   * Group requested before a user gesture was available.
   * Flushed on the first pointerdown/keydown that arrives.
   */
  private _pendingGroupId: MusicGroupId | null = null;

  /** Whether the gesture-gating listeners have been attached to the document. */
  private _gestureListenerAdded = false;

  /** Whether the visibilitychange listener has been registered. */
  private _visibilityListenerAdded = false;

  /** Bound handlers (kept for later removeEventListener calls). */
  private readonly _onGesture = (): void => { this._flushPendingGroup(); };
  private readonly _onVisibilityChange = (): void => {
    if (typeof document === 'undefined' || document.hidden) return;
    const ctx = this._ctx;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {/* silently ignore */});
    }
  };

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Set the master music volume.
   * @param volume - Integer in [0, 100]; 0 is silent, 100 is full volume.
   */
  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(100, volume)) / 100;
    if (this._masterGain) {
      this._masterGain.gain.value = this._volume;
    }
  }

  /** Return the current music volume as an integer in [0, 100]. */
  getVolume(): number {
    return Math.round(this._volume * 100);
  }

  /**
   * Request playback of the given music group.
   *
   * Fires immediately if the AudioContext is running, or queues the group until
   * the first user gesture if the context is still suspended (autoplay policy).
   * A no-op when the requested group is already playing.
   */
  playGroup(groupId: MusicGroupId): void {
    if (!_hasAudioSupport()) return;

    const ctx = this._getContext();
    if (!ctx || ctx.state === 'suspended') {
      // AudioContext not yet available or waiting for a gesture.
      this._pendingGroupId = groupId;
      this._attachGestureListeners();
      // Attempt resume in case the context exists but was auto-suspended.
      if (ctx) ctx.resume().catch(() => {/* ignore */});
      return;
    }

    this._startGroup(groupId);
  }

  /** Stop all music immediately (hard stop, no fade). */
  stopAll(): void {
    this._isPlaying = false;
    this._pendingGroupId = null;
    this._scheduler.reset();

    for (let i = 0; i < 2; i++) {
      const slot = this._slots[i];
      if (slot) {
        try {
          slot.gain.gain.cancelScheduledValues(0);
          slot.gain.gain.value = 0;
          slot.audio.pause();
          slot.audio.src = '';
        } catch { /* ignore */ }
        this._slots[i] = null;
      }
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /** Start playing a group, cross-fading from the current slot to the new one. */
  private _startGroup(groupId: MusicGroupId): void {
    const instruction = this._scheduler.requestGroup(groupId);
    if (!instruction.switched) return; // already playing this group
    if (!instruction.trackUrl) return; // group has no tracks

    this._playTrackInNewSlot(instruction.trackUrl, CROSSFADE_DURATION);
  }

  /**
   * Load a track URL into the idle slot and cross-fade to it.
   * @param url          - Track to load.
   * @param fadeDuration - Seconds for the fade (0 = instant).
   */
  private _playTrackInNewSlot(url: string, fadeDuration: number): void {
    const ctx = this._getContext();
    if (!ctx || !this._masterGain) return;
    if (!url) return;

    const outgoingSlotIdx = this._activeSlot;
    const incomingSlotIdx = 1 - this._activeSlot;

    // Tear down the incoming slot so we can rebuild it (a MediaElementAudioSourceNode
    // can only be created once per HTMLAudioElement; rebuilding ensures a clean state).
    const prevIncoming = this._slots[incomingSlotIdx];
    if (prevIncoming) {
      try {
        prevIncoming.gain.gain.cancelScheduledValues(0);
        prevIncoming.gain.gain.value = 0;
        prevIncoming.audio.pause();
        prevIncoming.audio.src = '';
        prevIncoming.source.disconnect();
        prevIncoming.gain.disconnect();
      } catch { /* ignore */ }
    }

    // Build new audio element and Web Audio chain for the incoming slot.
    const audio = new Audio();
    audio.src = url;
    audio.loop = false;
    audio.preload = 'auto';

    // MediaElementAudioSourceNode requires the audio element to be connected once
    // to this context; do not reuse elements across contexts.
    const source = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(this._masterGain);

    const newSlot: AudioSlot = { audio, source, gain };
    this._slots[incomingSlotIdx] = newSlot;
    this._activeSlot = incomingSlotIdx;

    // Ramp the incoming gain from 0 → 1
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    if (fadeDuration > 0) {
      gain.gain.linearRampToValueAtTime(1, now + fadeDuration);
    } else {
      gain.gain.value = 1;
    }

    // Ramp the outgoing gain from its current value → 0
    const outgoing = this._slots[outgoingSlotIdx];
    if (outgoing && outgoing !== newSlot) {
      const currentGain = outgoing.gain.gain.value;
      outgoing.gain.gain.setValueAtTime(currentGain, now);
      if (fadeDuration > 0) {
        outgoing.gain.gain.linearRampToValueAtTime(0, now + fadeDuration);
      } else {
        outgoing.gain.gain.value = 0;
      }
      // Stop the outgoing audio element after the fade completes
      const outgoingRef = outgoing;
      setTimeout(() => {
        try {
          outgoingRef.audio.pause();
          outgoingRef.audio.src = '';
        } catch { /* ignore */ }
      }, fadeDuration * 1000 + 100);
    }

    // When this track ends, advance to the next in the group.
    audio.addEventListener('ended', () => {
      // Only advance if this is still the active slot.
      if (this._slots[this._activeSlot] !== newSlot) return;
      const nextUrl = this._scheduler.nextTrack();
      if (nextUrl) {
        this._playTrackInNewSlot(nextUrl, SAME_GROUP_FADE);
      }
    }, { once: true });

    this._isPlaying = true;
    const playResult = audio.play();
    if (playResult !== undefined) {
      playResult.catch(() => {
        // Autoplay blocked: queue for next gesture
        this._pendingGroupId = this._scheduler.currentGroupId;
        this._attachGestureListeners();
      });
    }
  }

  /** Flush the pending group request now that a gesture is available. */
  private _flushPendingGroup(): void {
    this._detachGestureListeners();
    const ctx = this._getContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume()
        .then(() => {
          if (this._pendingGroupId) {
            const g = this._pendingGroupId;
            this._pendingGroupId = null;
            this._startGroup(g);
          }
        })
        .catch(() => {/* ignore */});
    } else if (this._pendingGroupId) {
      const g = this._pendingGroupId;
      this._pendingGroupId = null;
      this._startGroup(g);
    }
  }

  /**
   * Return the shared AudioContext, creating it lazily on first call.
   * Returns null when the Web Audio API is unavailable.
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
    this._masterGain = this._ctx.createGain();
    this._masterGain.gain.value = this._volume;
    this._masterGain.connect(this._ctx.destination);

    if (!this._visibilityListenerAdded && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._onVisibilityChange);
      this._visibilityListenerAdded = true;
    }

    return this._ctx;
  }

  /** Attach gesture listeners (once) for autoplay policy. */
  private _attachGestureListeners(): void {
    if (this._gestureListenerAdded || typeof document === 'undefined') return;
    document.addEventListener('pointerdown', this._onGesture, { once: true });
    document.addEventListener('keydown',     this._onGesture, { once: true });
    this._gestureListenerAdded = true;
  }

  /** Remove gesture listeners (called after the first gesture fires). */
  private _detachGestureListeners(): void {
    if (!this._gestureListenerAdded || typeof document === 'undefined') return;
    document.removeEventListener('pointerdown', this._onGesture);
    document.removeEventListener('keydown',     this._onGesture);
    this._gestureListenerAdded = false;
  }
}

// ─── Capability guard ────────────────────────────────────────────────────────

/** Returns true when the environment supports HTMLAudioElement and Web Audio. */
function _hasAudioSupport(): boolean {
  return typeof Audio !== 'undefined';
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const musicManager = new MusicManager();
