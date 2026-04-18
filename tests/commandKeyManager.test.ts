/**
 * @jest-environment jsdom
 */

import { CommandKeyManager } from '../src/commandKeyManager';
import { clearCommandKeyAssignments, loadCommandKeyAssignments } from '../src/persistence';

describe('CommandKeyManager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with default bindings', () => {
    const mgr = new CommandKeyManager();
    expect(mgr.getBindingDisplay('rotateCCW')).toBe('Q');
    expect(mgr.getBindingDisplay('rotateCW')).toBe('W');
    expect(mgr.getBindingDisplay('restartLevel')).toBe('R');
    expect(mgr.getBindingDisplay('undo')).toBe('Ctrl+Z');
    expect(mgr.getBindingDisplay('redo')).toBe('Ctrl+Y');
  });

  it('rejects assigning pure modifier keys', () => {
    const mgr = new CommandKeyManager();
    const result = mgr.assignBinding('undo', { key: 'Shift', ctrl: false, shift: false, alt: false, meta: false });
    expect(result.ok).toBe(false);
    expect(mgr.getBindingDisplay('undo')).toBe('Ctrl+Z');
  });

  it('rejects conflicting assignments', () => {
    const mgr = new CommandKeyManager();
    const result = mgr.assignBinding('rotateCW', { key: 'q', ctrl: false, shift: false, alt: false, meta: false });
    expect(result.ok).toBe(false);
    expect(mgr.getBindingDisplay('rotateCW')).toBe('W');
  });

  it('persists successful assignment and can reload it', () => {
    const mgr = new CommandKeyManager();
    const result = mgr.assignBinding('redo', { key: 'r', ctrl: true, shift: false, alt: false, meta: false });
    expect(result.ok).toBe(true);
    const stored = loadCommandKeyAssignments();
    expect(stored?.redo).toBe('Ctrl+R');

    const reloaded = new CommandKeyManager();
    expect(reloaded.getBindingDisplay('redo')).toBe('Ctrl+R');
  });

  it('resetToDefaults removes custom assignments from storage', () => {
    const mgr = new CommandKeyManager();
    mgr.assignBinding('rotateCW', { key: 'e', ctrl: false, shift: false, alt: false, meta: false });
    expect(loadCommandKeyAssignments()).not.toBeNull();
    mgr.resetToDefaults();
    expect(loadCommandKeyAssignments()).toBeNull();
    expect(mgr.getBindingDisplay('rotateCW')).toBe('W');
  });

  it('matches keyboard events against current bindings', () => {
    const mgr = new CommandKeyManager();
    const evt = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true });
    const wrong = new KeyboardEvent('keydown', { key: 'z', ctrlKey: false });
    expect(mgr.matches('undo', evt)).toBe(true);
    expect(mgr.matches('undo', wrong)).toBe(false);
  });

  afterEach(() => {
    clearCommandKeyAssignments();
  });
});
