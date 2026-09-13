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

import type { CommandCategory, CommandDefinition } from '@/editor/commands/registry';

export interface ShortcutItem {
  readonly id: string;
  readonly label: string;
  /** Shortcuts in keymap syntax; the first is the primary one. */
  readonly shortcuts: readonly string[];
}

export interface ShortcutGroup {
  readonly category: CommandCategory;
  readonly items: readonly ShortcutItem[];
}

/** Tab order of the shortcuts panel. */
export const SHORTCUT_CATEGORY_ORDER: readonly CommandCategory[] = ['Tools', 'Edit', 'View', 'Object', 'Text', 'Arrange', 'Page', 'File', 'Help'];

/**
 * Commands that have a keyboard shortcut (bound or browser-handled), grouped by category in
 * panel order. Items keep registration order within a category; empty categories are omitted.
 */
export function shortcutGroups(commands: readonly CommandDefinition[]): ShortcutGroup[] {
  const byCategory = new Map<CommandCategory, ShortcutItem[]>();
  for (const command of commands) {
    const shortcuts = command.shortcuts?.length ? command.shortcuts : command.displayShortcut ? [command.displayShortcut] : [];
    if (shortcuts.length === 0) continue;
    const items = byCategory.get(command.category) ?? [];
    items.push({ id: command.id, label: command.label, shortcuts });
    byCategory.set(command.category, items);
  }
  return SHORTCUT_CATEGORY_ORDER.filter((category) => byCategory.has(category)).map((category) => ({ category, items: byCategory.get(category)! }));
}
