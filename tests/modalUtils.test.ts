/** @jest-environment jsdom */
import { setupModal } from '../src/modalUtils';

describe('setupModal', () => {
  let el: HTMLDivElement;
  let onClose: jest.Mock;

  beforeEach(() => {
    document.body.innerHTML = '';
    el = document.createElement('div');
    onClose = jest.fn();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('sets role="dialog" and aria-modal="true"', () => {
    document.body.appendChild(el);
    setupModal(el, { onClose });
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-modal')).toBe('true');
  });

  it('sets aria-labelledby when titleEl provided', () => {
    const title = document.createElement('h2');
    title.textContent = 'Hello';
    el.appendChild(title);
    document.body.appendChild(el);
    setupModal(el, { titleEl: title, onClose });
    expect(title.id).toBeTruthy();
    expect(el.getAttribute('aria-labelledby')).toBe(title.id);
  });

  it('Esc keydown invokes onClose', () => {
    // el must be document.body.lastElementChild for the Escape handler to fire
    document.body.appendChild(el);
    setupModal(el, { onClose });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('restores focus to previously focused element on close', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    // el must come after trigger so it is body's last child (needed for Escape handler)
    document.body.appendChild(el);

    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // onClose removes the element so deactivate() can pass the isVisible check
    onClose.mockImplementation(() => { el.remove(); });
    const { closeModal } = setupModal(el, { onClose });
    closeModal();

    expect(document.activeElement).toBe(trigger);
  });

  it('traps Tab inside the modal — wraps from last to first', () => {
    const a = document.createElement('button'); a.textContent = 'a';
    const b = document.createElement('button'); b.textContent = 'b';
    el.appendChild(a);
    el.appendChild(b);
    document.body.appendChild(el);
    setupModal(el, { onClose });

    b.focus();
    expect(document.activeElement).toBe(b);

    // Tab on the last focusable element should wrap to the first
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(a);
  });
});
