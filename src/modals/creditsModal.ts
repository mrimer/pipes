import { RADIUS_LG, UI_BG, UI_BORDER, UI_INPUT_BORDER, UI_OVERLAY_BG } from '../uiConstants';
import { createButton } from '../uiHelpers';
import { t } from '../i18n';
import { setupModal } from './modalUtils';

interface CreditRow {
  icon: string;
  roleKey: string;
  namesKey: string;
}

const CREDIT_ROWS: readonly CreditRow[] = [
  { icon: '🎬', roleKey: 'credits.productionConceptDesign.role', namesKey: 'credits.productionConceptDesign.names' },
  { icon: '🧩', roleKey: 'credits.levelDesign.role', namesKey: 'credits.levelDesign.names' },
  { icon: '🎨', roleKey: 'credits.graphicsSfx.role', namesKey: 'credits.graphicsSfx.names' },
  { icon: '🌈', roleKey: 'credits.styleAesthetic.role', namesKey: 'credits.styleAesthetic.names' },
  { icon: '🎵', roleKey: 'credits.music.role', namesKey: 'credits.music.names' },
  { icon: '🧪', roleKey: 'credits.playtesting.role', namesKey: 'credits.playtesting.names' },
];

/** Build the credits modal element and append it to the document body. */
export function createCreditsModal(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'display:none;position:fixed;inset:0;background:' + UI_OVERLAY_BG + ';' +
    'justify-content:center;align-items:flex-start;z-index:100;' +
    'overflow-y:auto;padding:24px 16px;';

  const box = document.createElement('div');
  box.style.cssText =
    `background:${UI_BG};border:3px solid ${UI_BORDER};border-radius:${RADIUS_LG};` +
    'padding:28px 32px;width:100%;max-width:640px;min-width:min(560px, 100%);' +
    'display:flex;flex-direction:column;gap:18px;margin:auto;';

  const title = document.createElement('h2');
  title.style.cssText = 'font-size:1.5rem;text-align:center;margin:0;';
  title.textContent = t('credits.title');

  const { closeModal } = setupModal(overlay, {
    titleEl: title,
    onClose: () => { overlay.style.display = 'none'; },
  });

  const grid = document.createElement('div');
  grid.style.cssText =
    'display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);gap:10px 18px;align-items:start;';

  for (const row of CREDIT_ROWS) {
    const roleEl = document.createElement('div');
    roleEl.style.cssText = 'display:flex;align-items:flex-start;gap:8px;color:#eee;font-weight:bold;';

    const iconEl = document.createElement('span');
    iconEl.textContent = row.icon;
    iconEl.setAttribute('aria-hidden', 'true');

    const roleTextEl = document.createElement('span');
    roleTextEl.textContent = t(row.roleKey);

    roleEl.appendChild(iconEl);
    roleEl.appendChild(roleTextEl);

    const namesEl = document.createElement('div');
    namesEl.style.cssText = `color:#ccc;border-bottom:1px solid ${UI_INPUT_BORDER};padding-bottom:10px;`;
    namesEl.textContent = t(row.namesKey);

    grid.appendChild(roleEl);
    grid.appendChild(namesEl);
  }

  const closeBtn = createButton(
    t('common.close'),
    UI_BORDER,
    '#fff',
    () => { closeModal(); },
    'align-self:center;padding:10px 32px;font-size:1rem;border:none;margin-top:4px;',
  );

  box.appendChild(title);
  box.appendChild(grid);
  box.appendChild(closeBtn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  return overlay;
}
