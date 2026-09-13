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
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { applyRename, previewRename, renameTargets } from './rename';

let editor: Editor;
let ids: string[];

beforeEach(() => {
  const gen = new IdGenerator('r');
  const doc = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids: gen });
  editor = new Editor({ doc, ids: gen, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  ids = ['Icon_003', 'Icon_010', 'Home'].map((name, i) =>
    editor.history.run('seed', (tx) => {
      const id = editor.ids.next();
      tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name, x: i * 50, y: 0, width: 10, height: 10 }));
      return id;
    }),
  );
});

describe('batch rename', () => {
  test('targets are in layers-panel order and counters follow it', () => {
    editor.state.select(ids);
    expect(renameTargets(editor)).toEqual([...ids].reverse());
    expect(previewRename(editor, { match: '', replace: 'Card $n', start: 1 }).to).toEqual(['Card 1', 'Card 2', 'Card 3']);
  });

  test('applies in one undo step, keeps names that would become empty', () => {
    editor.state.select(ids);
    expect(applyRename(editor, { match: '([a-zA-Z]+)_(\\d+)', replace: '$2_$1', start: 1 })).toBe(2);
    expect(ids.map((id) => editor.doc.get(id)?.name)).toEqual(['003_Icon', '010_Icon', 'Home']);
    editor.history.undo();
    expect(ids.map((id) => editor.doc.get(id)?.name)).toEqual(['Icon_003', 'Icon_010', 'Home']);
    expect(applyRename(editor, { match: '', replace: '', start: 1 })).toBe(0);
    expect(applyRename(editor, { match: '(', replace: 'x', start: 1 })).toBe(0);
  });

  test('⌘R renames one layer inline and opens the dialog for several', () => {
    editor.state.select([ids[0]!]);
    editor.commands.run('object.rename');
    expect(editor.state.getSnapshot().renamingId).toBe(ids[0]);
    editor.state.select(ids);
    editor.commands.run('object.rename');
    expect(editor.state.getSnapshot().dialog).toBe('batchRename');
  });
});
