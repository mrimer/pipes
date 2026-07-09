/**
 * @jest-environment jsdom
 */

import { createCreditsModal } from '../src/modals/creditsModal';

describe('createCreditsModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the localized credits title, rows, and close button', () => {
    const modal = createCreditsModal();
    modal.style.display = 'flex';

    expect(modal.textContent).toContain('Credits');
    expect(modal.textContent).toContain('Production, Concept, Design');
    expect(modal.textContent).toContain('Michael Rimer');
    expect(modal.textContent).toContain('Olga Rimer, Kieran Millar');

    const closeBtn = Array.from(modal.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Close');
    expect(closeBtn).not.toBeNull();
  });

  it('uses a dialog width at least as wide as the rules modal target width', () => {
    const modal = createCreditsModal();
    const box = modal.firstElementChild as HTMLElement | null;

    expect(box).not.toBeNull();
    expect(box!.style.minWidth).toBe('min(560px, 100%)');
  });
});
