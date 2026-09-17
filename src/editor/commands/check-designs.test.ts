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
import { createEmptyDocument, keyOnTop, makeRectangle, solid } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { Editor } from '../editor';
import { checkDesigns } from './check-designs';
import { applyPaintVariable, bindVariable, createCollection, createVariable, setVariableValue } from './variables';

let editor: Editor;
let rect: string;

beforeEach(() => {
  const ids = new IdGenerator('k');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Card', x: 0, y: 0, width: 120, height: 80 }));
    return id;
  });
});

/** A variable of a kind, carrying a value in every mode of a fresh collection. */
function makeVariable(type: 'COLOR' | 'FLOAT', name: string, value: unknown): string {
  const collection = createCollection(editor, `${name} collection`);
  const id = createVariable(editor, collection, type, name)!;
  for (const mode of (editor.doc.getOrThrow(collection) as { modes: { modeId: string }[] }).modes) setVariableValue(editor, id, mode.modeId, value as never);
  return id;
}

describe('checking a page against what the file has to build from', () => {
  test('a file with nothing to suggest reports nothing', () => {
    expect(checkDesigns(editor)).toEqual([]);
  });

  test('a colour written out where a variable carries it is reported, with the variable to use', () => {
    const blue = makeVariable('COLOR', 'Brand/Blue', { r: 0, g: 0.4, b: 1, a: 1 });
    editor.history.run('fill', (tx) => tx.set(rect, 'fills', [solid({ r: 0, g: 0.4, b: 1, a: 1 })]));

    const issues = checkDesigns(editor);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ nodeId: rect, kind: 'colour', field: 'Fill', suggestion: { variableId: blue, name: 'Brand/Blue' } });

    // A colour no variable carries is not something it can put right, so it is not reported.
    editor.history.run('fill', (tx) => tx.set(rect, 'fills', [solid({ r: 1, g: 0, b: 0, a: 1 })]));
    expect(checkDesigns(editor)).toEqual([]);
  });

  test('a corner radius written out where a number variable carries it is reported', () => {
    makeVariable('FLOAT', 'Radius/Card', 8);
    editor.history.run('radius', (tx) => tx.set(rect, 'cornerRadius', 8));
    expect(checkDesigns(editor).map((issue) => issue.kind)).toEqual(['radius']);
  });

  test('only the layers asked about are checked', () => {
    makeVariable('FLOAT', 'Radius/Card', 8);
    editor.history.run('radius', (tx) => tx.set(rect, 'cornerRadius', 8));
    expect(checkDesigns(editor, editor.pageId, [rect])).toHaveLength(1);
    expect(checkDesigns(editor, editor.pageId, [])).toEqual([]);
  });
});

describe('an issue that has been put right', () => {
  test('leaves the list once the variable is bound', () => {
    const radius = makeVariable('FLOAT', 'Radius/Card', 8);
    editor.history.run('radius', (tx) => tx.set(rect, 'cornerRadius', 8));
    expect(checkDesigns(editor)).toHaveLength(1);

    bindVariable(editor, [rect], 'cornerRadius', radius);
    expect(checkDesigns(editor)).toEqual([]);
  });

  test('a colour bound to a variable is no longer written out by hand', () => {
    const blue = makeVariable('COLOR', 'Brand/Blue', { r: 0, g: 0.4, b: 1, a: 1 });
    editor.history.run('fill', (tx) => tx.set(rect, 'fills', [solid({ r: 0, g: 0.4, b: 1, a: 1 })]));
    expect(checkDesigns(editor)).toHaveLength(1);

    applyPaintVariable(editor, [rect], 'fills', blue);
    expect(checkDesigns(editor)).toEqual([]);
  });
});
