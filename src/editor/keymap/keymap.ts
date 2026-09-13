/*
 * Copyright (C) 2026 Stanislav Georgiev
 * https://github.com/slaviboy
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Keyboard shortcut parsing and matching.
 *
 * Syntax: modifiers joined with "+" then a key, e.g. "Mod+Shift+H", "Alt+A", "Shift+1",
 * "Delete", "[" . `Mod` is ⌘ on macOS and Ctrl elsewhere. Letter and digit keys match on
 * `KeyboardEvent.code` so Alt/Option combinations (which change `key` on macOS) still work.
 */
export interface KeyChord {
  readonly mod: boolean;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  /** Normalized key: letters uppercase ("H"), digits ("1"), or named keys ("Delete", "ArrowUp", "[", "Space"). */
  readonly key: string;
}

export interface KeyEventLike {
  readonly key: string;
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

const KEY_ALIASES: Record<string, string> = {
  Esc: 'Escape',
  Del: 'Delete',
  // Pressed Backspace normalizes to Delete (see eventKey), so both spellings bind the same key.
  Backspace: 'Delete',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Plus: '=',
  Minus: '-',
};

export function parseChord(shortcut: string): KeyChord {
  const parts = shortcut.split('+');
  // "Mod+Shift++" style is not used; "=" / "-" are spelled Plus / Minus.
  const keyPart = parts.pop();
  if (!keyPart) throw new Error(`Invalid shortcut "${shortcut}"`);
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  for (const m of mods) {
    if (!['mod', 'ctrl', 'shift', 'alt'].includes(m)) throw new Error(`Unknown modifier "${m}" in "${shortcut}"`);
  }
  const key = KEY_ALIASES[keyPart] ?? (keyPart.length === 1 ? keyPart.toUpperCase() : keyPart);
  return { mod: mods.has('mod'), ctrl: mods.has('ctrl'), shift: mods.has('shift'), alt: mods.has('alt'), key };
}

/** Normalizes the pressed key, preferring physical codes for letters/digits. */
export function eventKey(e: KeyEventLike): string {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
  if (e.code === 'Space' || e.key === ' ') return 'Space';
  if (e.code === 'BracketLeft') return '[';
  if (e.code === 'BracketRight') return ']';
  if (e.code === 'Equal') return '=';
  if (e.code === 'Minus') return '-';
  if (e.code === 'Backslash') return '\\';
  if (e.code === 'Slash') return '/';
  if (e.code === 'Quote') return "'";
  if (e.key === 'Backspace') return 'Delete';
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

export function matches(chord: KeyChord, e: KeyEventLike, isMac: boolean): boolean {
  if (isMac) {
    if (chord.mod !== e.metaKey || chord.ctrl !== e.ctrlKey) return false;
  } else {
    // Off macOS, Mod is Control, so "Ctrl+…" and "Mod+…" name the same chord.
    if ((chord.mod || chord.ctrl) !== e.ctrlKey || e.metaKey) return false;
  }
  if (chord.shift !== e.shiftKey || chord.alt !== e.altKey) return false;
  return chord.key === eventKey(e);
}

/** Human-readable shortcut label for menus and tooltips. */
export function formatShortcut(shortcut: string, isMac: boolean): string {
  const c = parseChord(shortcut);
  const keyLabel = KEY_LABELS[c.key] ?? c.key;
  if (isMac) return `${c.ctrl ? '⌃' : ''}${c.alt ? '⌥' : ''}${c.shift ? '⇧' : ''}${c.mod ? '⌘' : ''}${keyLabel}`;
  return [c.mod || c.ctrl ? 'Ctrl' : '', c.alt ? 'Alt' : '', c.shift ? 'Shift' : '', keyLabel].filter(Boolean).join('+');
}

const KEY_LABELS: Record<string, string> = {
  Delete: '⌫',
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: '↵',
  Space: 'Space',
  '=': '+',
};

export interface Binding {
  readonly commandId: string;
  readonly chord: KeyChord;
  readonly source: string;
}

/** Resolves key events to command ids. User overrides replace a command's defaults. */
export class Keymap {
  private bindings: Binding[] = [];

  constructor(private readonly isMac: boolean) {}

  setBindings(defaults: ReadonlyMap<string, readonly string[]>, overrides: ReadonlyMap<string, readonly string[]> = new Map()): void {
    this.bindings = [];
    for (const [commandId, shortcuts] of defaults) {
      for (const s of overrides.get(commandId) ?? shortcuts) this.bindings.push({ commandId, chord: parseChord(s), source: s });
    }
    for (const [commandId, shortcuts] of overrides) {
      if (defaults.has(commandId)) continue;
      for (const s of shortcuts) this.bindings.push({ commandId, chord: parseChord(s), source: s });
    }
  }

  resolve(e: KeyEventLike): string | null {
    return this.bindings.find((b) => matches(b.chord, e, this.isMac))?.commandId ?? null;
  }

  /** Every command bound to the pressed chord, in binding order; callers run the first one that is enabled. */
  resolveAll(e: KeyEventLike): string[] {
    return this.bindings.filter((b) => matches(b.chord, e, this.isMac)).map((b) => b.commandId);
  }

  /** Commands that share an identical chord (for the shortcuts settings UI). */
  conflicts(): Map<string, string[]> {
    const byChord = new Map<string, string[]>();
    for (const b of this.bindings) {
      const k = JSON.stringify(b.chord);
      byChord.set(k, [...(byChord.get(k) ?? []), b.commandId]);
    }
    return new Map([...byChord].filter(([, ids]) => new Set(ids).size > 1));
  }
}
