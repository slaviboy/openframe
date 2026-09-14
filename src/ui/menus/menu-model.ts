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

import type { Id } from '@/core/ids/ids';
import type { Editor } from '@/editor/editor';
import { formatShortcut } from '@/editor/keymap/keymap';
import { IS_MAC } from '../keyboard/keyboard-controller';
import type { MenuEntry } from '../primitives/Menu';

/** A menu item bound to a registered command; null when the command is not registered. */
export function commandItem(editor: Editor, id: string): MenuEntry | null {
  const def = editor.commands.get(id);
  if (!def) return null;
  const shortcut = def.shortcuts?.[0] ?? def.displayShortcut;
  return {
    kind: 'item',
    id,
    label: def.label,
    ...(shortcut ? { shortcut: formatShortcut(shortcut, IS_MAC) } : {}),
    ...(def.checked ? { checked: def.checked(editor) } : {}),
    disabled: !editor.commands.isEnabled(id),
    onSelect: () => editor.commands.run(id),
  };
}

/** Command items grouped into sections separated by dividers (empty sections are dropped). */
export function commandSections(editor: Editor, sections: readonly (readonly string[])[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  sections.forEach((ids, index) => {
    const items = ids.map((id) => commandItem(editor, id)).filter((item): item is MenuEntry => item !== null);
    if (items.length === 0) return;
    if (out.length > 0) out.push({ kind: 'separator', id: `separator-${index}` });
    out.push(...items);
  });
  return out;
}

const MAIN_MENU: readonly (readonly [string, readonly (readonly string[])[]])[] = [
  ['File', [['file.colorProfileSrgb', 'file.colorProfileP3']]],
  [
    'Edit',
    [
      ['edit.undo', 'edit.redo'],
      ['edit.copy', 'edit.cut', 'edit.paste', 'edit.pasteOverSelection', 'edit.pasteReplace'],
      ['edit.duplicate', 'edit.delete'],
      ['edit.find'],
      ['edit.selectAll', 'edit.selectInverse', 'edit.selectMatching'],
      ['edit.selectSameFill', 'edit.selectSameStroke', 'edit.selectSameProperties'],
    ],
  ],
  [
    'View',
    [
      ['view.commandPalette'],
      ['view.toggleHideUi', 'view.toggleMinimizeUi'],
      ['view.toggleRulers', 'view.toggleOutlines', 'view.toggleOutlineHidden', 'view.toggleMaskOutlines'],
      ['view.togglePixelGrid', 'view.toggleSnapToPixelGrid', 'view.togglePropertyLabels'],
      ['view.themeSystem', 'view.themeLight', 'view.themeDark'],
      ['view.zoomIn', 'view.zoomOut', 'view.zoomToFit', 'view.zoomToSelection'],
      ['view.zoom50', 'view.zoom100', 'view.zoom200'],
    ],
  ],
  [
    'Object',
    [
      ['object.group', 'object.frameSelection', 'object.wrapInSection', 'object.ungroup', 'object.removeSection', 'object.useAsMask'],
      ['object.flipHorizontal', 'object.flipVertical'],
      ['object.toggleVisible', 'object.toggleLocked', 'object.rename'],
    ],
  ],
  ['Text', [['text.bold', 'text.italic'], ['text.bulletedList', 'text.numberedList', 'text.createLink'], ['text.directionLtr', 'text.directionRtl']]],
  [
    'Arrange',
    [
      ['arrange.bringToFront', 'arrange.bringForward', 'arrange.sendBackward', 'arrange.sendToBack'],
      ['arrange.alignLeft', 'arrange.alignHorizontalCenters', 'arrange.alignRight', 'arrange.alignTop', 'arrange.alignVerticalCenters', 'arrange.alignBottom'],
      ['arrange.distributeHorizontal', 'arrange.distributeVertical', 'arrange.tidyUp'],
    ],
  ],
  ['Page', [['page.add', 'page.duplicate', 'page.delete']]],
  ['Preferences', [['preferences.spellCheck', 'preferences.smartSymbols', 'preferences.nudgeAmount']]],
  ['Help', [['help.keyboardShortcuts']]],
];

export function mainMenuEntries(editor: Editor): MenuEntry[] {
  return MAIN_MENU.map(([label, sections]): MenuEntry | null => {
    const entries = commandSections(editor, sections);
    return entries.length > 0 ? { kind: 'submenu', id: label, label, entries } : null;
  }).filter((entry): entry is MenuEntry => entry !== null);
}

/** Context menu for selected layers (canvas and layers panel). */
export function objectMenuEntries(editor: Editor): MenuEntry[] {
  return commandSections(editor, [
    ['edit.copy', 'edit.cut', 'edit.paste', 'edit.pasteReplace'],
    ['edit.copyProperties', 'edit.pasteProperties'],
    ['edit.duplicate', 'edit.delete'],
    ['arrange.bringToFront', 'arrange.bringForward', 'arrange.sendBackward', 'arrange.sendToBack'],
    ['object.group', 'object.frameSelection', 'object.wrapInSection', 'object.ungroup', 'object.removeSection', 'object.useAsMask'],
    ['object.flipHorizontal', 'object.flipVertical'],
    ['object.toggleVisible', 'object.toggleLocked', 'object.rename'],
  ]);
}

/** "Select layer" submenu listing the layers under the pointer (canvas context menu only). */
export function selectLayerEntries(editor: Editor, layers: readonly Id[]): MenuEntry[] {
  if (layers.length === 0) return [];
  return [
    {
      kind: 'submenu',
      id: 'select-layer',
      label: 'Select layer',
      entries: layers.map(
        (id): MenuEntry => ({
          kind: 'item',
          id: `select-layer-${id}`,
          label: editor.doc.get(id)?.name ?? id,
          checked: editor.selection.includes(id),
          onSelect: () => editor.state.select([id]),
        }),
      ),
    },
    { kind: 'separator', id: 'select-layer-separator' },
  ];
}

/** "Paste here" for the canvas context menu: pastes centered on the right-clicked point. */
export function pasteHereEntries(canPaste: boolean, onPaste: () => void): MenuEntry[] {
  return [
    { kind: 'item', id: 'edit.pasteHere', label: 'Paste here', disabled: !canPaste, onSelect: onPaste },
    { kind: 'separator', id: 'paste-here-separator' },
  ];
}

/** Context menu for a selected ruler guide. */
export function guideMenuEntries(editor: Editor): MenuEntry[] {
  return commandSections(editor, [['guide.remove']]);
}

/** Context menu for empty canvas. */
export function canvasMenuEntries(editor: Editor): MenuEntry[] {
  return commandSections(editor, [['edit.paste'], ['edit.selectAll'], ['view.zoomToFit', 'view.zoom100'], ['view.commandPalette']]);
}
