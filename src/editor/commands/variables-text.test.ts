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
import { createEmptyDocument, keyOnTop, makeText } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { TextNode, VariableCollectionNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { bindVariable, createCollection, createVariable, setVariableValue } from './variables';

let editor: Editor;
let text: string;

const node = () => editor.doc.getOrThrow(text) as TextNode;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  text = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeText({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Greeting', x: 0, y: 0, width: 200, height: 40 }));
    tx.set(id, 'characters', 'Hello world');
    // "world" is larger than the rest.
    tx.set(id, 'styleRuns', [{ start: 6, end: 11, style: { fontSize: 30 } }]);
    return id;
  });
});

describe('variables bound to text content', () => {
  test('the text takes the variable value, and style runs of the replaced text are dropped', () => {
    const strings = createCollection(editor, 'Copy');
    const mode = (editor.doc.getOrThrow(strings) as VariableCollectionNode).modes[0]!.modeId;
    const greeting = createVariable(editor, strings, 'STRING', 'greeting')!;
    setVariableValue(editor, greeting, mode, 'Hi there, everyone');

    expect(bindVariable(editor, [text], 'characters', greeting)).toBe(true);
    expect(node().characters).toBe('Hi there, everyone');
    // The old runs described ranges of the old text; they don't carry over to the new one.
    expect(node().styleRuns).toBeUndefined();

    setVariableValue(editor, greeting, mode, 'Bye');
    expect(node().characters).toBe('Bye');
    expect(node().styleRuns).toBeUndefined();
  });

  test('a number variable becomes the text of its value', () => {
    const numbers = createCollection(editor, 'Totals');
    const mode = (editor.doc.getOrThrow(numbers) as VariableCollectionNode).modes[0]!.modeId;
    const total = createVariable(editor, numbers, 'FLOAT', 'total')!;
    setVariableValue(editor, total, mode, 42.5);
    expect(bindVariable(editor, [text], 'characters', total)).toBe(true);
    expect(node().characters).toBe('42.5');
  });
});
