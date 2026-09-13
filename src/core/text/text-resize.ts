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

import type { Finalizer, Transaction } from '../history/history';
import type { Id } from '../ids/ids';
import type { TextNode } from '../schema/document';
import type { TextLayoutService } from './text-layout';

/** Fields whose change can change a text layer's box or name. */
const TEXT_FIELDS: ReadonlySet<string> = new Set(['characters', 'fontName', 'fontSize', 'lineHeight', 'letterSpacing', 'styleRuns', 'textCase', 'maxLines', 'textAutoResize', 'size', 'autoRename']);

/** Renames a layer; a text layer stops following its content once renamed. */
export function renameLayer(tx: Transaction, id: Id, name: string): void {
  tx.set(id, 'name', name);
  if (tx.store.get(id)?.type === 'TEXT') tx.set(id, 'autoRename', undefined);
}

/** Name of a text layer that follows its content: the first non-empty line, or "Text". */
export function autoTextName(characters: string): string {
  const line = characters.split('\n').find((l) => l.trim() !== '')?.trim() ?? '';
  return line === '' ? 'Text' : line.slice(0, 100);
}

/**
 * Fits a text layer's box to its content: auto width sets both dimensions (the box grows from its
 * left, center or right edge following the horizontal alignment), auto height only the height.
 * Fixed-size and truncated layers keep their size.
 */
export function fitTextBox(tx: Transaction, node: TextNode, layout: TextLayoutService): void {
  if (node.textAutoResize === 'WIDTH_AND_HEIGHT') {
    const size = layout.measure(node, null);
    if (size.width === node.size.width && size.height === node.size.height) return;
    tx.set(node.id, 'size', size);
    const dw = size.width - node.size.width;
    const shift = node.textAlignHorizontal === 'CENTER' ? dw / 2 : node.textAlignHorizontal === 'RIGHT' ? dw : 0;
    if (shift !== 0) {
      const [a, b, c, d, e, f] = node.transform;
      tx.set(node.id, 'transform', [a, b, c, d, e - a * shift, f - b * shift]);
    }
  } else if (node.textAutoResize === 'HEIGHT') {
    const { height } = layout.measure(node, node.size.width);
    if (height !== node.size.height) tx.set(node.id, 'size', { width: node.size.width, height });
  }
}

/**
 * History finalizer keeping text layers consistent at every commit: auto-resizing boxes fit their
 * text, and auto-named layers take their first line as the name. Without a layout service (before
 * the engine loads, or headless), only names are updated.
 */
export function createTextFinalizer(getLayout: () => TextLayoutService | null): Finalizer {
  return (tx) => {
    const ids = new Set<Id>();
    for (const op of tx.ops) {
      if (op.kind === 'create' && op.node.type === 'TEXT') ids.add(op.node.id);
      else if (op.kind === 'set' && TEXT_FIELDS.has(op.field)) ids.add(op.id);
    }
    if (ids.size === 0) return;
    const layout = getLayout();
    for (const id of ids) {
      const node = tx.store.get(id);
      if (node?.type !== 'TEXT') continue;
      if (node.autoRename) {
        const name = autoTextName(node.characters);
        if (name !== node.name) tx.set(id, 'name', name);
      }
      if (layout) fitTextBox(tx, node, layout);
    }
  };
}
