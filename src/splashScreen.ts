/**
 * Splash screen shown before the title intro.
 *
 * Displays the Caravel Games logo fading in with a horizontal sine-wave
 * deformation (each row offset by A·sin(spatialFreq·y + temporalPhase), where
 * A reduces to zero as the image reaches full opacity).  A Play button with a
 * steady gold glow sits below the logo; clicking it plays the Click SFX and
 * resolves the promise so the title intro can start.
 */

import { sfxManager, SfxId } from './sfxManager';
import { BG_COLOR } from './colors';
import { UI_GOLD } from './uiConstants';
import { t } from './i18n';
import logoUrl from '../data/images/CaravelLogo_RectBlack.png';

// ─── Timing ────────────────────────────────────────────────────────────────────

/** Duration of the logo fade-in in milliseconds. */
const FADE_IN_MS = 2500;
/** How long after start before the Play button starts appearing (ms). */
const PLAY_BTN_APPEAR_MS = 800;
/** Duration of the Play button fade-in once it starts appearing (ms). */
const PLAY_BTN_FADE_MS = 700;

// ─── Sine-wave deformation ─────────────────────────────────────────────────────

/** Peak horizontal displacement in logical pixels at the start of the fade. */
const MAX_AMPLITUDE = 38;
/** Spatial frequency of the wave: full cycles per pixel of image height. */
const SPATIAL_FREQ = 0.022;
/** Temporal frequency of the wave in Hz (phase cycles per second). */
const TEMPORAL_FREQ_HZ = 1.4;
/** Height of each horizontal strip used when drawing the deformed image. */
const STRIP_HEIGHT = 4;

// ─── Layout ────────────────────────────────────────────────────────────────────

/** Intrinsic width of the logo PNG. */
const LOGO_INTRINSIC_W = 552;
/** Intrinsic height of the logo PNG. */
const LOGO_INTRINSIC_H = 894;
/** Logo occupies this fraction of the smaller viewport dimension. */
const LOGO_VIEWPORT_FRACTION = 0.42;
/** z-index for the entire splash overlay. */
const SPLASH_Z_INDEX = 3000;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Show the Caravel Games splash screen and return a promise that resolves
 * when the player clicks the Play button.
 */
export function showSplashScreen(): Promise<void> {
  return new Promise((resolve) => {
    // ── Overlay ──────────────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      `background:${BG_COLOR}`,
      `z-index:${SPLASH_Z_INDEX}`,
      'user-select:none',
    ].join(';');

    // ── Canvas (logo animation) ───────────────────────────────────────────────
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;';
    overlay.appendChild(canvas);

    // ── Play button ───────────────────────────────────────────────────────────
    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.textContent = t('splash.play');
    playBtn.style.cssText = [
      'margin-top:32px',
      'padding:14px 56px',
      'font-size:1.35rem',
      'font-family:Georgia,"Times New Roman",serif',
      'font-weight:bold',
      `color:${UI_GOLD}`,
      'background:transparent',
      `border:2px solid ${UI_GOLD}`,
      'border-radius:8px',
      'cursor:pointer',
      `box-shadow:0 0 12px ${UI_GOLD},0 0 28px rgba(240,192,64,0.45)`,
      'opacity:0',
      'transition:none',
      'pointer-events:none',
    ].join(';');
    overlay.appendChild(playBtn);

    document.body.appendChild(overlay);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      overlay.remove();
      resolve();
      return;
    }

    // ── Load logo image ───────────────────────────────────────────────────────
    const img = new Image();
    let imgReady = false;
    img.onload = () => { imgReady = true; };
    img.onerror = () => { imgReady = true; }; // proceed even if image fails
    img.src = logoUrl;

    // ── Animation state ───────────────────────────────────────────────────────
    const startMs = performance.now();
    let rafId: number | null = null;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      overlay.remove();
      resolve();
    };

    playBtn.addEventListener('click', () => {
      sfxManager.play(SfxId.Click);
      finish();
    });

    // ── Draw loop ─────────────────────────────────────────────────────────────
    const draw = (now: number) => {
      if (finished) return;
      const elapsed = now - startMs;

      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const vw = Math.max(1, window.innerWidth);
      const vh = Math.max(1, window.innerHeight);

      // Scale logo to fit while maintaining aspect ratio.
      const smallerDim = Math.min(vw, vh);
      const logoW = Math.round(Math.min(smallerDim * LOGO_VIEWPORT_FRACTION, vw * 0.72));
      const logoH = Math.round(logoW * (LOGO_INTRINSIC_H / LOGO_INTRINSIC_W));

      const canvasW = Math.round(logoW * dpr);
      const canvasH = Math.round(logoH * dpr);
      if (canvas.width !== canvasW || canvas.height !== canvasH) {
        canvas.width = canvasW;
        canvas.height = canvasH;
      }
      canvas.style.width = `${logoW}px`;
      canvas.style.height = `${logoH}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, logoW, logoH);

      const alpha = clamp01(elapsed / FADE_IN_MS);

      // Amplitude shrinks to zero as alpha reaches 1, so the image settles
      // into place undistorted by the time it is fully opaque.
      const amplitude = MAX_AMPLITUDE * (1 - alpha);
      const temporalPhase = (elapsed / 1000) * 2 * Math.PI * TEMPORAL_FREQ_HZ;

      if (imgReady && img.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = alpha;

        const scaleY = logoH / LOGO_INTRINSIC_H;

        // Draw the logo in thin horizontal strips, each horizontally displaced
        // by a sine function of its vertical position (spatial wave) plus the
        // advancing temporal phase so the wave appears to oscillate.
        for (let srcY = 0; srcY < LOGO_INTRINSIC_H; srcY += STRIP_HEIGHT) {
          const srcH = Math.min(STRIP_HEIGHT, LOGO_INTRINSIC_H - srcY);
          const destY = Math.floor(srcY * scaleY);
          // Add a 1px overlap to avoid hairline gaps between strips.
          const destStripH = Math.ceil(srcH * scaleY) + 1;

          const xOff = amplitude * Math.sin(SPATIAL_FREQ * destY + temporalPhase);

          ctx.drawImage(
            img,
            0,    srcY,             // source x, y
            LOGO_INTRINSIC_W, srcH, // source w, h (full width strip)
            xOff, destY,            // dest x (shifted), y
            logoW, destStripH,      // dest w, h
          );
        }
        ctx.restore();
      }

      // Fade the Play button in once the logo is partially visible.
      const btnAlpha = clamp01((elapsed - PLAY_BTN_APPEAR_MS) / PLAY_BTN_FADE_MS);
      playBtn.style.opacity = String(btnAlpha);
      playBtn.style.pointerEvents = btnAlpha > 0 ? 'auto' : 'none';

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
  });
}
