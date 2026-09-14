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

import { beforeEach, describe, expect, test } from 'vitest';
import { createEmptyDocument, keyOnTop, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { BUILTIN_COMMANDS } from '../commands/builtin';
import { Editor } from '../editor';
import { worldToScreen } from '../viewport/viewport';
import { addVariantButtonRect, hitAddVariantButton } from './selection-geometry';

let editor: Editor;
let first: string;
let second: string;

function component(x: number): string {
  const rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Shape', x, y: 0, width: 60, height: 40 }));
    return id;
  });
  editor.state.select([rect]);
  editor.commands.run('object.createComponent');
  return editor.selection[0]!;
}

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  first = component(0);
  second = component(200);
});

describe('the + button below a component set', () => {
  test('shows centered below a single selected component set, under its size label', () => {
    editor.state.select([first]);
    expect(addVariantButtonRect(editor)).toBeNull();
    editor.state.select([first, second]);
    expect(addVariantButtonRect(editor)).toBeNull();

    editor.commands.run('object.combineAsVariants');
    const set = editor.doc.getOrThrow(editor.selection[0]!) as SceneNode;
    const rect = addVariantButtonRect(editor)!;
    const v = editor.state.viewport;
    const topLeft = worldToScreen(v, { x: set.transform[4], y: set.transform[5] });
    const bottomRight = worldToScreen(v, { x: set.transform[4] + set.size.width, y: set.transform[5] + set.size.height });
    expect(rect.y).toBeGreaterThanOrEqual(Math.floor(bottomRight.y + 22));
    expect(Math.abs(rect.x + rect.width / 2 - (topLeft.x + bottomRight.x) / 2)).toBeLessThanOrEqual(1);

    expect(hitAddVariantButton(editor, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })).toBe(true);
    expect(hitAddVariantButton(editor, { x: rect.x - 5, y: rect.y - 5 })).toBe(false);
  });
});
