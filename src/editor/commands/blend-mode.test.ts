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
import { createEmptyDocument, keyOnTop, makeGroup, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { BlendModeSchema, type SceneNode } from '@/core/schema/document';
import { deserializeDocument, serializeDocument } from '@/core/serialize/serialize';
import { Editor } from '../editor';
import { setBlendMode } from './properties';
import { LAYER_BLEND_OPTIONS } from '@/ui/panels/inspector/blend-modes';

describe('layer blend mode', () => {
  test('sets, undoes and survives serialization', () => {
    const ids = new IdGenerator('b');
    const editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
    const id = editor.history.run('seed', (tx) => {
      const nid = editor.ids.next();
      tx.create(makeRectangle({ id: nid, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'R', x: 0, y: 0, width: 10, height: 10 }));
      return nid;
    });
    const node = () => editor.doc.getOrThrow(id) as SceneNode;
    expect(node().blendMode).toBe('PASS_THROUGH');
    editor.history.run('Change blend mode', (tx) => setBlendMode(tx, node(), 'MULTIPLY'));
    expect(node().blendMode).toBe('MULTIPLY');
    expect((deserializeDocument(serializeDocument(editor.doc)).getOrThrow(id) as SceneNode).blendMode).toBe('MULTIPLY');
    editor.history.undo();
    expect(node().blendMode).toBe('PASS_THROUGH');
    expect(makeGroup({ id: 'b:99', parent: { id: editor.pageId, key: 'V' }, name: 'G', x: 0, y: 0, width: 0, height: 0 }).blendMode).toBe('PASS_THROUGH');
  });

  test('the menu lists every document blend mode exactly once', () => {
    const modes = LAYER_BLEND_OPTIONS.map(([mode]) => mode);
    expect(new Set(modes).size).toBe(modes.length);
    expect([...modes].sort()).toEqual([...BlendModeSchema.options].sort());
  });
});
