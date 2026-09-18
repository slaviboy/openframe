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

import { Observable } from '@/editor/stores/observable';

/** The shortcuts a designer has set for themselves, by command id; a command with none keeps its own. */
export type ShortcutOverrides = Readonly<Record<string, readonly string[]>>;

const STORAGE_KEY = 'openframe.shortcuts';

function readStored(): ShortcutOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: Record<string, readonly string[]> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value) && value.every((s) => typeof s === 'string' && s.length > 0 && s.length < 64)) out[id] = value as string[];
    }
    return out;
  } catch {
    return {};
  }
}

/** The store holds the whole set under one key, so setting one command's shortcut replaces the set. */
class ShortcutOverridesStore extends Observable<{ readonly overrides: ShortcutOverrides }> {
  /** Sets a command's shortcut, or gives it back its own when the chord is empty. */
  set(commandId: string, chord: string | null): void {
    const current = this.getSnapshot().overrides;
    const cleared = chord === null || chord.trim() === '';
    const next = Object.fromEntries(Object.entries(current).filter(([id]) => id !== commandId));
    if (!cleared) next[commandId] = [chord];
    this.write(next);
  }

  /** Gives every command its own shortcuts back. */
  clear(): void {
    this.write({});
  }

  private write(next: ShortcutOverrides): void {
    this.setState({ overrides: next });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // A device that won't store them still uses them for this session.
    }
  }
}

export const shortcutOverrides = new ShortcutOverridesStore({ overrides: readStored() });

/** The overrides as the keymap takes them. */
export const overridesMap = (overrides: ShortcutOverrides): ReadonlyMap<string, readonly string[]> => new Map(Object.entries(overrides));
