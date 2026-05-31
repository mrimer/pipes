interface SetupModalOptions {
  titleEl?: HTMLElement | null;
  onClose: () => void;
  canCloseOnEscape?: () => boolean;
}

interface SetupModalResult {
  closeModal: (skipOnCloseCallback?: boolean) => void;
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let modalTitleIdCounter = 0;

function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function getFocusableElements(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((node) => !node.hasAttribute('disabled') && node.tabIndex !== -1);
}

function focusInitialElement(el: HTMLElement): void {
  const [first] = getFocusableElements(el);
  first?.focus();
}

function restoreFocus(target: HTMLElement | null): void {
  if (target && target.isConnected) target.focus();
}

export function setupModal(el: HTMLElement, options: SetupModalOptions): SetupModalResult {
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');

  if (options.titleEl) {
    if (!options.titleEl.id) {
      modalTitleIdCounter += 1;
      options.titleEl.id = `modal-title-${modalTitleIdCounter}`;
    }
    el.setAttribute('aria-labelledby', options.titleEl.id);
  }

  let isOpen = false;
  let previouslyFocused: HTMLElement | null = null;

  const activate = (): void => {
    if (isOpen || !isVisible(el)) return;
    isOpen = true;
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => {
      if (!isOpen) return;
      focusInitialElement(el);
    });
  };

  const deactivate = (): void => {
    if (!isOpen || isVisible(el)) return;
    isOpen = false;
    restoreFocus(previouslyFocused);
    previouslyFocused = null;
  };

  const closeModal = (skipOnCloseCallback = false): void => {
    if (!skipOnCloseCallback) {
      options.onClose();
    }
    deactivate();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isOpen) return;

    if (event.key === 'Escape') {
      if (options.canCloseOnEscape && !options.canCloseOnEscape()) return;
      event.preventDefault();
      event.stopPropagation();
      closeModal();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements(el);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey) {
      if (active === first || !el.contains(active)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (active === last || !el.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  };

  el.addEventListener('keydown', onKeyDown);

  const visibilityObserver = new MutationObserver(() => {
    activate();
    deactivate();
  });
  visibilityObserver.observe(el, { attributes: true, attributeFilter: ['style', 'class', 'hidden', 'aria-hidden'] });

  const connectionObserver = new MutationObserver(() => {
    if (el.isConnected) {
      activate();
      return;
    }
    if (isOpen) {
      isOpen = false;
      restoreFocus(previouslyFocused);
      previouslyFocused = null;
    }
    el.removeEventListener('keydown', onKeyDown);
    visibilityObserver.disconnect();
    connectionObserver.disconnect();
  });
  connectionObserver.observe(document.body, { childList: true, subtree: true });

  activate();

  return { closeModal };
}
