/**
 * MusicScheduler – pure playlist and group-selection logic for background music.
 *
 * No audio APIs are used here; this module is fully testable in Node/Jest.
 *
 * Responsibilities:
 *  - Hold the group registry and current group id.
 *  - Select the appropriate group for the current game context.
 *  - Maintain a shuffled play order per group with avoid-consecutive-repeat.
 *  - Return switch instructions to the audio layer (musicManager).
 *
 * Adding music for a new group:
 *  1. Drop the .ogg file(s) into data/music/.
 *  2. Import the URL(s) at the top of this file.
 *  3. Add the group id to {@link MusicGroupId} and the URLs to {@link MUSIC_REGISTRY}.
 */

import menuUrl      from '../data/music/mainmenu-waterpipes.ogg';
import overworldUrl from '../data/music/mysterious-guitar.ogg';

// Spring tracks
import happinessUrl    from '../data/music/Happiness.ogg';

// Summer tracks
import alanWalkerPracticeUrl  from '../data/music/Alan_Walker_Practice.ogg';

// Fall tracks
import reminiscenceUrl        from '../data/music/Reminiscence.ogg';

// Winter tracks
import reverentReflectionsUrl from '../data/music/Reverent Reflections.ogg';

// Dark tracks
import centerOfTheEarthUrl    from '../data/music/Center of the Earth.ogg';

// Challenge tracks
import eightBitEDMUrl from '../data/music/8-bit EDM.ogg';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Identifies a background music group. Mirrors the LevelStyle values plus 'menu' and 'challenge'. */
export type MusicGroupId = 'menu' | 'overworld' | 'Spring' | 'Summer' | 'Fall' | 'Winter' | 'Dark' | 'challenge';

/** A single track entry in the music registry. */
export interface TrackEntry {
  id: string;
  url: string;
}

/**
 * Instruction returned by {@link MusicScheduler.requestGroup}.
 * The audio layer uses this to decide whether to start/cross-fade playback.
 */
export interface GroupSwitchInstruction {
  /** True when the requested group differs from the previously active one. */
  switched: boolean;
  /** The now-active group (may be unchanged when switched === false). */
  groupId: MusicGroupId;
  /**
   * URL of the track to start.  Populated only when switched === true and the
   * group has at least one track.
   */
  trackUrl: string | null;
}

/** Arguments passed to {@link selectGroupForContext}. */
export interface SelectGroupArgs {
  /** When true the level is a challenge level, which always maps to 'challenge'. */
  isChallenge?: boolean;
  /** Visual style of the current level, chapter, or campaign map. */
  style?: string;
  /** When true the context is the campaign-overview map, which always maps to 'overworld'. */
  isCampaignMap?: boolean;
}

// ─── Registry ────────────────────────────────────────────────────────────────

/** The canonical music track registry, one array of tracks per group. */
export const MUSIC_REGISTRY: Record<MusicGroupId, TrackEntry[]> = {
  menu:      [{ id: 'menu',      url: menuUrl }],
  overworld: [{ id: 'overworld', url: overworldUrl }],
  Spring:    [{ id: 'spring',    url: happinessUrl }],
  Summer:    [{ id: 'summer',    url: alanWalkerPracticeUrl }],
  Fall:      [{ id: 'fall',      url: reminiscenceUrl }],
  Winter:    [{ id: 'winter',    url: reverentReflectionsUrl }],
  Dark:      [{ id: 'dark',      url: centerOfTheEarthUrl }],
  challenge: [{ id: 'challenge', url: eightBitEDMUrl }],
};

/**
 * Set of valid group IDs for runtime membership checks, derived from the
 * registry so it can never drift out of sync with {@link MUSIC_REGISTRY}.
 */
const VALID_GROUP_IDS = new Set<string>(Object.keys(MUSIC_REGISTRY));

// ─── Group selection ──────────────────────────────────────────────────────────

/**
 * Determine the music group appropriate for the current game context.
 *
 * Priority (highest first):
 * 1. {@link SelectGroupArgs.isCampaignMap} is true → 'overworld'
 * 2. {@link SelectGroupArgs.isChallenge} is true → 'challenge'
 * 3. {@link SelectGroupArgs.style} is a valid LevelStyle → that style's group
 * 4. Otherwise → 'Summer' (default style for levels and chapter maps)
 */
export function selectGroupForContext(args: SelectGroupArgs): MusicGroupId {
  if (args.isCampaignMap) return 'overworld';
  if (args.isChallenge) return 'challenge';
  if (args.style && VALID_GROUP_IDS.has(args.style)) {
    return args.style as MusicGroupId;
  }
  return 'Summer';
}

// ─── Scheduler class ─────────────────────────────────────────────────────────

/** Manages the play order and group state for background music playback. */
export class MusicScheduler {
  /** Track registry (injectable for deterministic testing). */
  private readonly _registry: Record<MusicGroupId, TrackEntry[]>;

  /**
   * Random number generator, injected so tests can supply a deterministic one.
   * Defaults to {@link Math.random}.
   */
  private readonly _rng: () => number;

  /** Currently active group, or null before any group has been requested. */
  private _currentGroupId: MusicGroupId | null = null;

  /** Shuffled index order for the current group. */
  private _playOrder: number[] = [];

  /** Current cursor position within {@link _playOrder}. */
  private _playOrderPos = 0;

  /**
   * Index (within the current group's track array) of the most recently
   * started track.  -1 means no track has been played yet in this group.
   * Used to avoid starting the same track when reshuffling.
   */
  private _lastPlayedIndex = -1;

  constructor(
    registry: Record<MusicGroupId, TrackEntry[]> = MUSIC_REGISTRY,
    rng: () => number = Math.random,
  ) {
    this._registry = registry;
    this._rng = rng;
  }

  /** The currently active group ID, or null when no group has been requested. */
  get currentGroupId(): MusicGroupId | null {
    return this._currentGroupId;
  }

  /**
   * Request a group switch.
   *
   * When the requested group is already active, returns a no-op instruction
   * ({@link GroupSwitchInstruction.switched} === false).  Otherwise updates the
   * current group, reshuffles the play order, and returns the first track URL.
   */
  requestGroup(groupId: MusicGroupId): GroupSwitchInstruction {
    if (groupId === this._currentGroupId) {
      return { switched: false, groupId, trackUrl: null };
    }

    this._currentGroupId = groupId;
    // Reset last-played when switching groups: the avoidance applies only within
    // a single group's reshuffle cycle.
    this._lastPlayedIndex = -1;
    this._buildShuffledOrder(groupId, -1);
    this._playOrderPos = 0;

    const tracks = this._registry[groupId] ?? [];
    if (tracks.length === 0) {
      return { switched: true, groupId, trackUrl: null };
    }

    const trackIndex = this._playOrder[0] ?? 0;
    const trackUrl = tracks[trackIndex]?.url ?? null;
    this._lastPlayedIndex = trackIndex;

    return { switched: true, groupId, trackUrl };
  }

  /**
   * Advance to the next track in the current group and return its URL.
   *
   * When the end of the shuffled order is reached the group reshuffles,
   * guaranteeing the first track of the new cycle differs from the last-played
   * one (when the group has more than one track).
   *
   * Returns null when no group is active or the group has no tracks.
   */
  nextTrack(): string | null {
    if (!this._currentGroupId) return null;

    const groupId = this._currentGroupId;
    const tracks = this._registry[groupId] ?? [];
    if (tracks.length === 0) return null;

    this._playOrderPos++;
    if (this._playOrderPos >= this._playOrder.length) {
      // End of cycle: reshuffle, avoiding the just-played track as the opener.
      this._buildShuffledOrder(groupId, this._lastPlayedIndex);
      this._playOrderPos = 0;
    }

    const trackIndex = this._playOrder[this._playOrderPos] ?? 0;
    const trackUrl = tracks[trackIndex]?.url ?? null;
    this._lastPlayedIndex = trackIndex;
    return trackUrl;
  }

  /** Reset the scheduler to its initial state (no current group). */
  reset(): void {
    this._currentGroupId = null;
    this._playOrder = [];
    this._playOrderPos = 0;
    this._lastPlayedIndex = -1;
  }

  /**
   * Build and store a Fisher-Yates-shuffled play order for the given group.
   *
   * When {@link avoidIndex} is ≥ 0 and the group has more than one track, the
   * element at position 0 of the new order is guaranteed to differ from
   * {@link avoidIndex} (swap it with a randomly chosen other element if needed).
   */
  private _buildShuffledOrder(groupId: MusicGroupId, avoidIndex: number): void {
    const n = (this._registry[groupId] ?? []).length;
    if (n === 0) {
      this._playOrder = [];
      return;
    }

    // Fisher-Yates in-place shuffle of [0 .. n-1]
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(this._rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    // Avoid the just-played index landing at position 0 again
    if (n > 1 && order[0] === avoidIndex) {
      // Pick any index in [1, n-1] to swap with position 0
      const swapWith = 1 + Math.floor(this._rng() * (n - 1));
      [order[0], order[swapWith]] = [order[swapWith], order[0]];
    }

    this._playOrder = order;
  }
}
