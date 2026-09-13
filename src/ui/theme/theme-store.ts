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

import type { CommandDefinition } from '@/editor/commands/registry';
import { Observable } from '@/editor/stores/observable';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/** Tiny UI setting: localStorage is appropriate and avoids a theme flash before IndexedDB loads. */
const STORAGE_KEY = 'openframe.theme';

interface ThemeState {
  readonly preference: ThemePreference;
  /** Operating-system appearance; the editor uses dark when the OS doesn't prefer light. */
  readonly system: ResolvedTheme;
}

function readStoredPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch {
    return 'system';
  }
}

const systemTheme = (): ResolvedTheme =>
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

class ThemeStore extends Observable<ThemeState> {
  setPreference(preference: ThemePreference): void {
    this.setState({ preference });
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Storage unavailable (e.g. private mode): the choice still applies for this session.
    }
  }

  setSystem(system: ResolvedTheme): void {
    this.setState({ system });
  }

  resolved(): ResolvedTheme {
    return this.state.preference === 'system' ? this.state.system : this.state.preference;
  }
}

export const themeStore = new ThemeStore({ preference: readStoredPreference(), system: systemTheme() });

export const THEME_COMMANDS: CommandDefinition[] = (
  [
    ['view.themeSystem', 'System theme', 'system'],
    ['view.themeLight', 'Light theme', 'light'],
    ['view.themeDark', 'Dark theme', 'dark'],
  ] as const
).map(([id, label, preference]) => ({
  id,
  label,
  category: 'View',
  checked: () => themeStore.getSnapshot().preference === preference,
  run: () => themeStore.setPreference(preference),
}));
