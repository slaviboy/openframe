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
import { hasLayerSelection } from '@/editor/commands/structure';
import type { ClipboardController } from './clipboard-controller';

/**
 * Clipboard commands for menus and the command palette. Their keyboard shortcuts are
 * handled by native copy/cut/paste events (see ClipboardController), so they are listed
 * as display shortcuts only.
 */
export function clipboardCommands(clipboard: ClipboardController): CommandDefinition[] {
  return [
    { id: 'edit.copy', label: 'Copy', category: 'Edit', displayShortcut: 'Mod+C', enabled: hasLayerSelection, run: () => void clipboard.copy() },
    { id: 'edit.cut', label: 'Cut', category: 'Edit', displayShortcut: 'Mod+X', enabled: hasLayerSelection, run: () => void clipboard.copy(true) },
    { id: 'edit.paste', label: 'Paste', category: 'Edit', displayShortcut: 'Mod+V', enabled: () => clipboard.canPaste(), run: () => void clipboard.paste('default') },
    {
      id: 'edit.pasteOverSelection',
      label: 'Paste over selection',
      category: 'Edit',
      displayShortcut: 'Mod+Shift+V',
      enabled: (e) => clipboard.canPaste() && hasLayerSelection(e),
      run: () => void clipboard.paste('over-selection'),
    },
    {
      id: 'edit.pasteInPlace',
      label: 'Paste in place',
      category: 'Edit',
      // ⌥⌘V: the content goes back at the very coordinates it was copied from, in view or not.
      shortcuts: ['Mod+Alt+V'],
      enabled: () => clipboard.canPaste(),
      run: () => void clipboard.paste('in-place'),
    },
    {
      id: 'edit.copyProperties',
      label: 'Copy properties',
      category: 'Edit',
      // ⌥⌘C / Ctrl+Alt+C: no native clipboard event fires for these, so they are real shortcuts.
      shortcuts: ['Mod+Alt+C'],
      enabled: (e) => e.selection.length === 1 && hasLayerSelection(e),
      run: () => void clipboard.copyProperties(),
    },
    {
      id: 'edit.copyAsPng',
      label: 'Copy as PNG',
      category: 'Edit',
      // ⇧⌘C / Ctrl+Shift+C fire no native clipboard event, so this is a real shortcut.
      shortcuts: ['Mod+Shift+C'],
      enabled: (e) => e.selection.length === 1 && hasLayerSelection(e),
      run: () => void clipboard.copyAsPng(),
    },
    {
      id: 'edit.copyAsSvg',
      label: 'Copy as SVG',
      category: 'Edit',
      enabled: (e) => e.selection.length === 1 && hasLayerSelection(e),
      run: () => void clipboard.copyAsSvg(),
    },
    {
      id: 'edit.copyAsCode',
      label: 'Copy as code',
      category: 'Edit',
      enabled: (e) => e.selection.length === 1 && hasLayerSelection(e),
      run: () => void clipboard.copyAsCode(),
    },
    {
      id: 'edit.pasteProperties',
      label: 'Paste properties',
      category: 'Edit',
      shortcuts: ['Mod+Alt+V'],
      enabled: (e) => hasLayerSelection(e) && clipboard.canPasteProperties(),
      run: () => void clipboard.pasteProperties(),
    },
    {
      id: 'edit.pasteReplace',
      label: 'Paste to replace',
      category: 'Edit',
      displayShortcut: 'Mod+Shift+R',
      enabled: (e) => clipboard.canPaste() && hasLayerSelection(e),
      run: () => void clipboard.paste('replace'),
    },
  ];
}
