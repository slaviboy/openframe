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

import type { Editor } from '../editor';

export type CommandCategory = 'File' | 'Edit' | 'View' | 'Object' | 'Arrange' | 'Tools' | 'Page' | 'Help';

export interface CommandDefinition {
  readonly id: string;
  readonly label: string;
  readonly category: CommandCategory;
  /** Default shortcuts in keymap syntax, e.g. "Mod+Shift+H". First is shown in menus. */
  readonly shortcuts?: readonly string[];
  /**
   * Shortcut shown in menus for commands whose keys are handled natively by the browser
   * (e.g. clipboard events). Not bound by the keymap.
   */
  readonly displayShortcut?: string;
  /** Whether the command can run now. Disabled commands are shown disabled, never hidden. */
  readonly enabled?: (editor: Editor) => boolean;
  /** Checked state for toggle commands (menus show a check mark). */
  readonly checked?: (editor: Editor) => boolean;
  /** Include in the command palette. Defaults to true. */
  readonly palette?: boolean;
  readonly run: (editor: Editor) => void;
}

/**
 * Single source of truth for user-invokable actions. Menus, context menus, the
 * toolbar, the command palette, keyboard shortcuts, and E2E tests all dispatch
 * through here, so a command behaves identically regardless of entry point.
 */
export class CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>();

  constructor(private readonly editor: Editor) {}

  /** Registers commands. Returns a function that unregisters exactly these commands. */
  register(...definitions: CommandDefinition[]): () => void {
    for (const def of definitions) {
      if (this.commands.has(def.id)) throw new Error(`Duplicate command id "${def.id}"`);
    }
    for (const def of definitions) this.commands.set(def.id, def);
    return () => {
      for (const def of definitions) {
        if (this.commands.get(def.id) === def) this.commands.delete(def.id);
      }
    };
  }

  get(id: string): CommandDefinition | undefined {
    return this.commands.get(id);
  }

  all(): CommandDefinition[] {
    return [...this.commands.values()];
  }

  isEnabled(id: string): boolean {
    const def = this.commands.get(id);
    return !!def && (def.enabled?.(this.editor) ?? true);
  }

  /** Runs a command if enabled. Returns whether it ran. */
  run(id: string): boolean {
    const def = this.commands.get(id);
    if (!def) throw new Error(`Unknown command "${id}"`);
    if (!(def.enabled?.(this.editor) ?? true)) return false;
    def.run(this.editor);
    return true;
  }
}
