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
import { createEmptyDocument, keyOnTop, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { RectangleNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';

function setup() {
  const ids = new IdGenerator('n');
  const editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  const id = editor.history.run('seed', (tx) => {
    const nid = editor.ids.next();
    tx.create(makeRectangle({ id: nid, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'R', x: 0, y: 0, width: 10, height: 10 }));
    return nid;
  });
  editor.state.select([id]);
  const pos = () => (editor.doc.getOrThrow(id) as RectangleNode).transform.slice(4);
  return { editor, pos };
}

describe('nudge amounts', () => {
  test('arrow and Shift+arrow commands use the configured amounts', () => {
    const { editor, pos } = setup();
    editor.commands.run('object.nudgeRight');
    editor.commands.run('object.nudgeDownBig');
    expect(pos()).toEqual([1, 10]);
    editor.setNudgeAmounts(4, 40);
    editor.commands.run('object.nudgeLeft');
    editor.commands.run('object.nudgeUpBig');
    expect(pos()).toEqual([-3, -30]);
  });

  test('invalid amounts fall back to the defaults', () => {
    const { editor } = setup();
    editor.setNudgeAmounts(0, Number.NaN);
    expect(editor.nudgeAmounts).toEqual({ small: 1, big: 10 });
  });
});
