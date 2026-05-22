/**
 * Player Profile Screen – the full-screen overlay that lets the player choose,
 * create, delete, import, and export player profiles.
 *
 * Rendered as a flex row of four profile cards:
 *   - Empty slot  → shows "New Player" and "Import" buttons.
 *   - Occupied slot → shows name, last-played date, stats, and action buttons.
 *   - Active slot gets a bright white border; others get a dim gray border.
 *
 * This screen sits at z-index 50 (below modals at z-index 100, above the
 * level-select screen).
 */

import {
  PROFILE_SLOT_COUNT,
  ProfileSlotMeta,
  ProfileSlotStats,
  saveSlotMeta,
  deleteSlotMeta,
  loadAllSlotMetas,
  loadSlotMeta,
  saveActiveSlotIndex,
  clearActiveSlotIndex,
  generateGuid,
  loadSlotStats,
} from './playerProfileSlots';
import { setActiveSlotIndex, getActiveSlotIndex, withSlot } from './activeProfile';
import { savePlayerName, loadSfxVolume, loadTouchUiEnabled } from './persistence';
import { sfxManager, SfxId } from './sfxManager';
import { hasTouchUiSupport, setTouchUiEnabledOverride } from './deviceUtils';
import { importPlayerProfile, exportPlayerProfile, exportPlayerProfileWithRecordings } from './profileIO';
import { buildNewPlayerModal, buildConfirmModal, buildEditPlayerNameModal, showPlayerImportResultModal } from './gameModals';
import { attachHoverWaveAnimation } from './visuals/chapterWaves';
import type { CampaignDef } from './types';
import { applyScrollingPipeBackground } from './uiBackground';

// ─── Styling constants ────────────────────────────────────────────────────────

const SCREEN_BG         = '#0d1117';
const CARD_BG           = '#141b24';
const CARD_BORDER_EMPTY  = '#333';
const CARD_BORDER_ACTIVE = '#ffffff';
const CARD_BORDER_IDLE   = '#4a5a6a';
const BTN_PRIMARY_BG     = '#1a4a9a';
const BTN_PRIMARY_BORDER = '#4a90d9';
const BTN_DANGER_BG      = '#7a1a1a';
const BTN_DANGER_BORDER  = '#c0392b';
const BTN_MUTED_BG       = '#1e2a3a';
const BTN_MUTED_BORDER   = '#3a4a5a';
const TEXT_MUTED         = '#8899aa';
const TEXT_ACCENT        = '#74b9ff';

/** Alpha for the hover wave overlay on occupied profile cards. */
const CARD_HOVER_WAVE_ALPHA = 0.25;

// ─── Helper ───────────────────────────────────────────────────────────────────

function btn(
  label: string,
  bgColor: string,
  borderColor: string,
  onClick: () => void,
  extraCss = '',
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.style.cssText =
    `padding:7px 14px;font-size:0.82rem;background:${bgColor};color:#eee;` +
    `border:1px solid ${borderColor};border-radius:6px;cursor:pointer;` +
    `font-family:inherit;${extraCss}`;
  b.addEventListener('click', () => {
    sfxManager.play(SfxId.Click);
    onClick();
  });
  return b;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return 'Unknown';
  }
}

// ─── PlayerProfileScreen class ────────────────────────────────────────────────

/**
 * Manages the player profile selection overlay.
 *
 * Lifecycle:
 *   1. `show()` – renders the overlay; the caller should hide the level-select
 *      screen before calling this.
 *   2. `hide()` – hides the overlay.
 *   3. On "Select": calls `onProfileSelected(slotIndex)` so the caller can
 *      activate the slot and navigate to the main menu.
 *   4. On active-card click or Escape (when a profile is active): calls
 *      `onReturnToMenu()` so the caller can show the main menu directly.
 */
export class PlayerProfileScreen {
  private readonly _el: HTMLDivElement;
  private readonly _cardsEl: HTMLDivElement;

  private _campaigns: CampaignDef[] = [];

  /** Bound Escape-key handler (stored so it can be removed on hide). */
  private readonly _onKeyDown: (e: KeyboardEvent) => void;

  /**
   * Called when the player selects a profile slot.  The caller is responsible
   * for activating the slot (calling `setActiveSlotIndex`) and navigating to
   * the main menu.
   */
  onProfileSelected: (slotIndex: number) => void = () => { /* no-op */ };

  /**
   * Called when the player dismisses the screen by clicking the active profile
   * card or pressing Escape while a profile is active.  The caller should
   * navigate back to the main menu without changing the active slot.
   */
  onReturnToMenu: () => void = () => { /* no-op */ };

  constructor() {
    // Outer overlay
    this._el = document.createElement('div');
    this._el.id = 'player-profile-screen';
    this._el.style.cssText =
      'display:none;position:fixed;inset:0;' +
      'z-index:50;overflow-y:auto;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;box-sizing:border-box;gap:24px;';
    applyScrollingPipeBackground(this._el, {
      baseColor: SCREEN_BG,
      overlayAlpha: 0.8,
    });

    // Title
    const titleEl = document.createElement('h1');
    titleEl.textContent = '👤 Select Player';
    titleEl.style.cssText = 'color:#eee;font-size:1.6rem;margin:0;text-align:center;';
    this._el.appendChild(titleEl);

    // Cards container – responsive flex row that wraps to 2×2 on narrow screens
    this._cardsEl = document.createElement('div');
    this._cardsEl.style.cssText =
      'display:flex;flex-wrap:wrap;gap:16px;justify-content:center;max-width:960px;width:100%;';
    this._el.appendChild(this._cardsEl);

    document.body.appendChild(this._el);

    // Escape key returns to the main menu when a profile is active.
    this._onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && getActiveSlotIndex() !== null) {
        sfxManager.play(SfxId.Back);
        this.hide();
        this.onReturnToMenu();
      }
    };
  }

  /** Show the screen and re-render all slot cards. */
  show(campaigns: CampaignDef[] = []): void {
    this._campaigns = campaigns;
    this._render();
    this._el.style.display = 'flex';
    this._el.scrollTop = 0;
    document.addEventListener('keydown', this._onKeyDown);
  }

  /** Hide the screen. */
  hide(): void {
    this._el.style.display = 'none';
    document.removeEventListener('keydown', this._onKeyDown);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private _render(): void {
    this._cardsEl.innerHTML = '';
    const metas = loadAllSlotMetas();
    const activeIdx = getActiveSlotIndex();
    for (let i = 0; i < PROFILE_SLOT_COUNT; i++) {
      const meta = metas[i];
      const card = meta
        ? this._buildOccupiedCard(i, meta, i === activeIdx)
        : this._buildEmptyCard(i);
      this._cardsEl.appendChild(card);
    }
  }

  private _buildEmptyCard(slotIndex: number): HTMLDivElement {
    const card = this._card(slotIndex, false);

    const emptyLabel = document.createElement('div');
    emptyLabel.textContent = 'Empty';
    emptyLabel.style.cssText = `color:${TEXT_MUTED};font-size:1rem;flex:1;display:flex;align-items:center;justify-content:center;`;
    card.appendChild(emptyLabel);

    const actions = this._actionsRow();

    actions.appendChild(btn('➕ New Player', BTN_PRIMARY_BG, BTN_PRIMARY_BORDER, () => {
      buildNewPlayerModal('Player', (name) => {
        this._createProfile(slotIndex, name);
      }, () => { /* cancelled */ });
    }));

    actions.appendChild(btn('📥 Import', BTN_MUTED_BG, BTN_MUTED_BORDER, () => {
      this._importIntoSlot(slotIndex);
    }));

    card.appendChild(actions);
    return card;
  }

  private _buildOccupiedCard(slotIndex: number, meta: ProfileSlotMeta, isActive: boolean): HTMLDivElement {
    const card = this._card(slotIndex, isActive);

    // Clicking the active card returns to the main menu.
    if (isActive) {
      card.style.cursor = 'pointer';
      // Note: this listener is attached to the card element itself.  _render()
      // always calls `_cardsEl.innerHTML = ''` before rebuilding, which removes
      // the card from the DOM and lets it be garbage-collected along with its
      // listeners — no detachment step is necessary.
      card.addEventListener('click', (e) => {
        // Only act on clicks that land directly on the card (not on a button inside it).
        if (e.target === card || (e.target instanceof HTMLElement && !e.target.closest('button'))) {
          sfxManager.play(SfxId.Click);
          this.hide();
          this.onReturnToMenu();
        }
      });
    }

    // Hover wave animation on all occupied cards.
    attachHoverWaveAnimation(card, CARD_HOVER_WAVE_ALPHA);

    // Name row
    const nameEl = document.createElement('div');
    nameEl.textContent = meta.name;
    nameEl.style.cssText =
      `font-size:1.15rem;font-weight:bold;color:${isActive ? '#ffffff' : '#ddeeff'};text-align:center;`;

    const pencilBtn = document.createElement('button');
    pencilBtn.type = 'button';
    pencilBtn.textContent = '✏️';
    pencilBtn.title = 'Edit player name';
    pencilBtn.style.cssText =
      'background:none;border:none;cursor:pointer;font-size:0.9rem;padding:0 0 0 4px;line-height:1;vertical-align:middle;opacity:0.7;';
    pencilBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sfxManager.play(SfxId.Click);
      buildEditPlayerNameModal(meta.name, (newName) => {
        withSlot(slotIndex, () => savePlayerName(newName));
        saveSlotMeta(slotIndex, { ...meta, name: newName });
        this._render();
      }, () => { /* cancelled */ });
    });

    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:4px;';
    nameRow.appendChild(nameEl);
    nameRow.appendChild(pencilBtn);
    card.appendChild(nameRow);

    // Last played
    const lastPlayedEl = document.createElement('div');
    lastPlayedEl.textContent = `Last played: ${formatDate(meta.lastPlayedAt)}`;
    lastPlayedEl.style.cssText = `font-size:0.8rem;color:${TEXT_MUTED};text-align:center;`;
    card.appendChild(lastPlayedEl);

    // Stats block (lazy-loaded from that slot's namespaced keys)
    const statsEl = document.createElement('div');
    statsEl.style.cssText =
      `flex:1;display:flex;flex-direction:column;gap:4px;font-size:0.82rem;color:${TEXT_MUTED};` +
      'margin:8px 0;align-items:center;';
    this._populateStats(statsEl, slotIndex);
    card.appendChild(statsEl);

    // Active badge
    if (isActive) {
      const badge = document.createElement('div');
      badge.className = 'player-profile-active-badge';
      badge.textContent = '✅ Active';
      badge.style.cssText = 'font-size:0.8rem;color:#7ed321;font-weight:bold;text-align:center;';
      card.appendChild(badge);
    }

    // ── Primary action buttons ─────────────────────────────────────────────
    const actions = this._actionsRow();

    if (!isActive) {
      actions.appendChild(btn('▶ Select', BTN_PRIMARY_BG, BTN_PRIMARY_BORDER, () => {
        this._selectSlot(slotIndex, meta);
      }));
    }

    actions.appendChild(btn('📤 Export', BTN_MUTED_BG, BTN_MUTED_BORDER, () => {
      this._exportSlot(slotIndex);
    }));

    actions.appendChild(btn('📤 Export + Recordings', BTN_MUTED_BG, BTN_MUTED_BORDER, () => {
      this._exportSlotWithRecordings(slotIndex);
    }));

    actions.appendChild(btn('📥 Import Merge', BTN_MUTED_BG, BTN_MUTED_BORDER, () => {
      this._importIntoSlot(slotIndex);
    }));

    card.appendChild(actions);

    // ── Delete row – separated by vertical buffer ─────────────────────────
    const deleteRow = this._actionsRow();
    deleteRow.style.marginTop = '8px';

    deleteRow.appendChild(btn('🗑 Delete', BTN_DANGER_BG, BTN_DANGER_BORDER, () => {
      buildConfirmModal(
        `Delete profile "${meta.name}"? All progress for this profile will be lost.`,
        () => { this._deleteSlot(slotIndex); },
        () => { /* cancelled */ },
      );
    }));

    card.appendChild(deleteRow);
    return card;
  }

  private _populateStats(container: HTMLElement, slotIndex: number): void {
    let stats: ProfileSlotStats;
    try {
      stats = loadSlotStats(slotIndex);
    } catch {
      return;
    }

    if (stats.activeCampaignId) {
      const campaign = this._campaigns.find((c) => c.id === stats.activeCampaignId);
      if (campaign) {
        const campaignEl = document.createElement('div');
        campaignEl.textContent = `📋 ${campaign.name}`;
        campaignEl.style.color = TEXT_ACCENT;
        container.appendChild(campaignEl);
      }

      if (stats.levelsCompleted > 0) {
        const levelsEl = document.createElement('div');
        levelsEl.textContent = `✅ ${stats.levelsCompleted} levels`;
        container.appendChild(levelsEl);
      }
      if (stats.chaptersCompleted > 0) {
        const chapEl = document.createElement('div');
        chapEl.textContent = `📖 ${stats.chaptersCompleted} chapters`;
        container.appendChild(chapEl);
      }
      if (stats.starsCollected > 0) {
        const starEl = document.createElement('div');
        starEl.textContent = `⭐ ${stats.starsCollected} stars`;
        container.appendChild(starEl);
      }
      if (stats.waterTotal > 0) {
        const waterEl = document.createElement('div');
        waterEl.textContent = `💧 ${stats.waterTotal} water`;
        container.appendChild(waterEl);
      }
    }

    if (container.children.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No campaign progress';
      container.appendChild(empty);
    }
  }

  // ── Card shell helpers ────────────────────────────────────────────────────

  private _card(slotIndex: number, isActive: boolean): HTMLDivElement {
    const d = document.createElement('div');
    const borderColor = slotIndex >= PROFILE_SLOT_COUNT
      ? CARD_BORDER_EMPTY
      : isActive
        ? CARD_BORDER_ACTIVE
        : CARD_BORDER_IDLE;
    d.style.cssText =
      `background:${CARD_BG};border:2px solid ${borderColor};border-radius:12px;` +
      `padding:20px 18px;display:flex;flex-direction:column;gap:10px;` +
      `min-width:200px;max-width:220px;flex:1 1 200px;`;
    return d;
  }

  private _actionsRow(): HTMLDivElement {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;justify-content:center;';
    return d;
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  private _createProfile(slotIndex: number, name: string): void {
    const meta: ProfileSlotMeta = {
      guid:         generateGuid(),
      name:         name.trim() || 'Player',
      lastPlayedAt: null,
    };
    saveSlotMeta(slotIndex, meta);
    // Save the player name in the new slot's namespace.
    withSlot(slotIndex, () => savePlayerName(meta.name));
    this._render();
  }

  private _selectSlot(slotIndex: number, meta: ProfileSlotMeta): void {
    // Persist the active slot selection.
    saveActiveSlotIndex(slotIndex);
    setActiveSlotIndex(slotIndex);

    // Update last-played timestamp.
    saveSlotMeta(slotIndex, { ...meta, lastPlayedAt: new Date().toISOString() });

    // Apply this slot's audio / UI settings.
    sfxManager.setVolume(loadSfxVolume());
    const touchUiPref = loadTouchUiEnabled();
    if (touchUiPref !== null && hasTouchUiSupport()) {
      setTouchUiEnabledOverride(touchUiPref);
    }

    this.hide();
    this.onProfileSelected(slotIndex);
  }

  private _deleteSlot(slotIndex: number): void {
    // Delete slot metadata.
    deleteSlotMeta(slotIndex);

    // Clear all namespaced keys for this slot.
    const prefix = `pipes_p${slotIndex}_`;
    const keysToDelete = Object.keys(localStorage).filter((k) => k.startsWith(prefix));
    for (const k of keysToDelete) {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    }

    // If this was the active slot, deactivate it.
    if (getActiveSlotIndex() === slotIndex) {
      setActiveSlotIndex(null);
      clearActiveSlotIndex();
    }

    this._render();
  }

  private _exportSlot(slotIndex: number): void {
    withSlot(slotIndex, () => {
      void exportPlayerProfile(this._campaigns);
    });
  }

  private _exportSlotWithRecordings(slotIndex: number): void {
    withSlot(slotIndex, () => {
      void exportPlayerProfileWithRecordings(this._campaigns);
    });
  }

  private _importIntoSlot(slotIndex: number): void {
    // The import function handles GUID-matching and will pick the best target
    // slot.  We pass our slot preference via a temporary active-slot switch so
    // the import lands here when the GUID is new.
    const prevActive = getActiveSlotIndex();
    setActiveSlotIndex(slotIndex);

    // For occupied slots (Import Merge), require the file's GUID to match this
    // slot's GUID so we don't accidentally merge a different player's data.
    const existingMeta = loadSlotMeta(slotIndex);
    const requiredSlotGuid = existingMeta?.guid;

    importPlayerProfile(this._campaigns, (outcomes, targetSlotIndex, isNewSlot, importedPlayerName) => {
      setActiveSlotIndex(prevActive);
      void targetSlotIndex; // Slot meta was already updated by importPlayerProfile.
      showPlayerImportResultModal(outcomes, isNewSlot, importedPlayerName);
      this._render();
    }, requiredSlotGuid);
  }
}
