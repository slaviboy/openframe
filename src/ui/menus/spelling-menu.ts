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

import type { Editor } from '@/editor/editor';
import { insertText, setTextSelection } from '@/editor/interactions/text-edit';
import type { MenuEntry } from '../primitives/Menu';
import type { CanvasContextMenu } from '../canvas/CanvasHost';

/** Spelling suggestions for a misspelled word right-clicked while editing: each replaces the word. */
export function spellingEntries(editor: Editor, spelling: CanvasContextMenu['spelling']): MenuEntry[] {
  if (!spelling) return [];
  const replace = (word: string) => {
    setTextSelection(editor, { anchor: spelling.start, focus: spelling.end });
    insertText(editor, word);
  };
  const suggestions: MenuEntry[] =
    spelling.suggestions.length > 0
      ? spelling.suggestions.map((word) => ({ kind: 'item', id: `spelling-${word}`, label: word, onSelect: () => replace(word) }))
      : [{ kind: 'item', id: 'spelling-none', label: 'No spelling suggestions', disabled: true, onSelect: () => undefined }];
  return [...suggestions, { kind: 'separator', id: 'spelling-separator' }];
}
