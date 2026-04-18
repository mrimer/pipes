import {
  clearCommandKeyAssignments,
  loadCommandKeyAssignments,
  saveCommandKeyAssignments,
} from './persistence';

export type CommandAction = 'rotateCW' | 'rotateCCW' | 'restartLevel' | 'undo' | 'redo';

export interface CommandBinding {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

export const COMMAND_LABELS: Record<CommandAction, string> = {
  rotateCW: 'Rotate CW',
  rotateCCW: 'Rotate CCW',
  restartLevel: 'Restart Level',
  undo: 'Undo',
  redo: 'Redo',
};

const COMMAND_ORDER: CommandAction[] = ['rotateCW', 'rotateCCW', 'restartLevel', 'undo', 'redo'];

const PURE_MODIFIER_KEYS = new Set(['control', 'ctrl', 'shift', 'alt', 'meta', 'os']);

function normalizeKey(key: string): string {
  if (key === ' ') return 'space';
  return key.trim().toLowerCase();
}

function keyDisplayName(key: string): string {
  const k = normalizeKey(key);
  if (k === ' ') return 'Space';
  if (k === 'space') return 'Space';
  if (k === 'arrowup') return 'ArrowUp';
  if (k === 'arrowdown') return 'ArrowDown';
  if (k === 'arrowleft') return 'ArrowLeft';
  if (k === 'arrowright') return 'ArrowRight';
  if (k.length === 1) return k.toUpperCase();
  return k.charAt(0).toUpperCase() + k.slice(1);
}

function toBindingString(binding: CommandBinding): string {
  const parts: string[] = [];
  if (binding.ctrl) parts.push('Ctrl');
  if (binding.shift) parts.push('Shift');
  if (binding.alt) parts.push('Alt');
  if (binding.meta) parts.push('Meta');
  parts.push(keyDisplayName(binding.key));
  return parts.join('+');
}

function parseBindingString(raw: string): CommandBinding | null {
  const parts = raw.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const keyPart = parts[parts.length - 1];
  const modParts = parts.slice(0, -1).map((p) => p.toLowerCase());
  const mods = new Set(modParts);
  const unknownMods = modParts.filter((p) => p !== 'ctrl' && p !== 'shift' && p !== 'alt' && p !== 'meta');
  if (unknownMods.length > 0) return null;
  return {
    key: normalizeKey(keyPart),
    ctrl: mods.has('ctrl'),
    shift: mods.has('shift'),
    alt: mods.has('alt'),
    meta: mods.has('meta'),
  };
}

function bindingEquals(a: CommandBinding, b: CommandBinding): boolean {
  return a.key === b.key &&
    a.ctrl === b.ctrl &&
    a.shift === b.shift &&
    a.alt === b.alt &&
    a.meta === b.meta;
}

function isPureModifierBinding(binding: CommandBinding): boolean {
  return PURE_MODIFIER_KEYS.has(binding.key);
}

function eventToBinding(e: KeyboardEvent): CommandBinding {
  return {
    key: normalizeKey(e.key),
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    meta: e.metaKey,
  };
}

export class CommandKeyManager {
  private static readonly DEFAULT_BINDINGS: Record<CommandAction, CommandBinding> = {
    rotateCW: { key: 'w', ctrl: false, shift: false, alt: false, meta: false },
    rotateCCW: { key: 'q', ctrl: false, shift: false, alt: false, meta: false },
    restartLevel: { key: 'r', ctrl: false, shift: false, alt: false, meta: false },
    undo: { key: 'z', ctrl: true, shift: false, alt: false, meta: false },
    redo: { key: 'y', ctrl: true, shift: false, alt: false, meta: false },
  };

  private _bindings: Record<CommandAction, CommandBinding>;

  constructor() {
    this._bindings = this._loadBindings();
  }

  private _loadBindings(): Record<CommandAction, CommandBinding> {
    const fromStorage = loadCommandKeyAssignments();
    const loaded = this.getDefaultBindings();
    if (!fromStorage) return loaded;
    for (const action of COMMAND_ORDER) {
      const raw = fromStorage[action];
      if (!raw) continue;
      const parsed = parseBindingString(raw);
      if (!parsed || isPureModifierBinding(parsed)) continue;
      loaded[action] = parsed;
    }
    if (this._hasConflicts(loaded)) return this.getDefaultBindings();
    return loaded;
  }

  private _hasConflicts(bindings: Record<CommandAction, CommandBinding>): boolean {
    for (let i = 0; i < COMMAND_ORDER.length; i++) {
      for (let j = i + 1; j < COMMAND_ORDER.length; j++) {
        if (bindingEquals(bindings[COMMAND_ORDER[i]], bindings[COMMAND_ORDER[j]])) return true;
      }
    }
    return false;
  }

  private _save(): void {
    const serialized: Record<CommandAction, string> = {
      rotateCW: toBindingString(this._bindings.rotateCW),
      rotateCCW: toBindingString(this._bindings.rotateCCW),
      restartLevel: toBindingString(this._bindings.restartLevel),
      undo: toBindingString(this._bindings.undo),
      redo: toBindingString(this._bindings.redo),
    };
    saveCommandKeyAssignments(serialized);
  }

  getDefaultBindings(): Record<CommandAction, CommandBinding> {
    return {
      rotateCW: { ...CommandKeyManager.DEFAULT_BINDINGS.rotateCW },
      rotateCCW: { ...CommandKeyManager.DEFAULT_BINDINGS.rotateCCW },
      restartLevel: { ...CommandKeyManager.DEFAULT_BINDINGS.restartLevel },
      undo: { ...CommandKeyManager.DEFAULT_BINDINGS.undo },
      redo: { ...CommandKeyManager.DEFAULT_BINDINGS.redo },
    };
  }

  getBindings(): Record<CommandAction, CommandBinding> {
    return {
      rotateCW: { ...this._bindings.rotateCW },
      rotateCCW: { ...this._bindings.rotateCCW },
      restartLevel: { ...this._bindings.restartLevel },
      undo: { ...this._bindings.undo },
      redo: { ...this._bindings.redo },
    };
  }

  getBindingDisplay(action: CommandAction): string {
    return toBindingString(this._bindings[action]);
  }

  matches(action: CommandAction, e: KeyboardEvent): boolean {
    const b = this._bindings[action];
    const key = normalizeKey(e.key);
    return b.key === key &&
      b.ctrl === e.ctrlKey &&
      b.shift === e.shiftKey &&
      b.alt === e.altKey &&
      b.meta === e.metaKey;
  }

  assignFromEvent(action: CommandAction, e: KeyboardEvent): { ok: boolean; error?: string } {
    return this.assignBinding(action, eventToBinding(e));
  }

  assignBinding(action: CommandAction, binding: CommandBinding): { ok: boolean; error?: string } {
    const normalized: CommandBinding = {
      key: normalizeKey(binding.key),
      ctrl: !!binding.ctrl,
      shift: !!binding.shift,
      alt: !!binding.alt,
      meta: !!binding.meta,
    };
    if (isPureModifierBinding(normalized)) {
      return { ok: false, error: 'Choose a non-modifier key, optionally with modifiers.' };
    }
    for (const otherAction of COMMAND_ORDER) {
      if (otherAction === action) continue;
      if (bindingEquals(this._bindings[otherAction], normalized)) {
        return { ok: false, error: `That key is already assigned to ${COMMAND_LABELS[otherAction]}.` };
      }
    }
    this._bindings[action] = normalized;
    this._save();
    return { ok: true };
  }

  resetToDefaults(): void {
    this._bindings = this.getDefaultBindings();
    clearCommandKeyAssignments();
  }
}

export const commandKeyManager = new CommandKeyManager();
