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

import { describe, expect, test } from 'vitest';
import type { CommandDefinition } from '@/editor/commands/registry';
import { BUILTIN_COMMANDS } from '@/editor/commands/builtin';
import { shortcutGroups } from './shortcut-groups';

const run = () => undefined;

describe('shortcutGroups', () => {
  test('groups commands with shortcuts in panel order and skips the rest', () => {
    const commands: CommandDefinition[] = [
      { id: 'a', label: 'Undo', category: 'Edit', shortcuts: ['Mod+Z'], run },
      { id: 'b', label: 'No keys', category: 'Edit', run },
      { id: 'c', label: 'Copy', category: 'Edit', displayShortcut: 'Mod+C', run },
      { id: 'd', label: 'Move', category: 'Tools', shortcuts: ['V'], run },
    ];
    expect(shortcutGroups(commands)).toEqual([
      { category: 'Tools', items: [{ id: 'd', label: 'Move', shortcuts: ['V'] }] },
      {
        category: 'Edit',
        items: [
          { id: 'a', label: 'Undo', shortcuts: ['Mod+Z'] },
          { id: 'c', label: 'Copy', shortcuts: ['Mod+C'] },
        ],
      },
    ]);
  });

  test('every built-in shortcut appears exactly once', () => {
    const groups = shortcutGroups(BUILTIN_COMMANDS);
    const ids = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('tools.rectangle');
    expect(ids).toContain('object.rename');
    expect(groups[0]!.category).toBe('Tools');
  });
});
