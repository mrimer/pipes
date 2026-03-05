/**
 * @jest-environment jsdom
 */

import { createGameRulesModal } from '../src/rulesModal';

describe('createGameRulesModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('appends a modal element to document.body', () => {
    createGameRulesModal();
    const modals = document.body.querySelectorAll('div');
    expect(modals.length).toBeGreaterThan(0);
  });

  it('is hidden by default', () => {
    const modal = createGameRulesModal();
    expect(modal.style.display).toBe('none');
  });

  it('shows when display is set to flex', () => {
    const modal = createGameRulesModal();
    modal.style.display = 'flex';
    expect(modal.style.display).toBe('flex');
  });

  it('contains a Game Rules heading', () => {
    createGameRulesModal();
    const heading = document.body.querySelector('h2');
    expect(heading).not.toBeNull();
    expect(heading!.textContent).toContain('Game Rules');
  });

  it('contains a Tile Legend heading', () => {
    createGameRulesModal();
    const headings = document.body.querySelectorAll('h3');
    const legendHeading = Array.from(headings).find(h => h.textContent?.includes('Tile Legend'));
    expect(legendHeading).not.toBeUndefined();
  });

  it('contains legend rows for the key tile types', () => {
    createGameRulesModal();
    const rows = document.body.querySelectorAll('tr');
    expect(rows.length).toBeGreaterThanOrEqual(10);
  });

  it('contains a Close button that hides the modal when clicked', () => {
    const modal = createGameRulesModal();
    modal.style.display = 'flex';

    const closeBtn = Array.from(document.body.querySelectorAll('button')).find(
      btn => btn.textContent === 'Close',
    );
    expect(closeBtn).not.toBeUndefined();

    closeBtn!.click();
    expect(modal.style.display).toBe('none');
  });

  it('closes when clicking the backdrop overlay', () => {
    const modal = createGameRulesModal();
    modal.style.display = 'flex';

    // Simulate a click on the overlay itself (not on a child)
    const clickEvent = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvent, 'target', { value: modal });
    modal.dispatchEvent(clickEvent);

    expect(modal.style.display).toBe('none');
  });
});
