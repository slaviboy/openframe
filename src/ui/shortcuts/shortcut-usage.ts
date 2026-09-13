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

/** Shortcuts the user has pressed at least once (highlighted in the shortcuts panel), per device. */
interface ShortcutUsage {
  readonly used: ReadonlySet<string>;
}

const STORAGE_KEY = 'openframe.shortcuts.used';

function readStored(): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

class ShortcutUsageStore extends Observable<ShortcutUsage> {
  markUsed(commandId: string): void {
    if (this.state.used.has(commandId)) return;
    const used = new Set(this.state.used).add(commandId);
    this.setState({ used });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...used]));
    } catch {
      // Storage unavailable: usage still highlights for this session.
    }
  }
}

export const shortcutUsage = new ShortcutUsageStore({ used: readStored() });
