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
import { createEmptyDocument } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { VariableCollectionNode, VariableNode } from '@/core/schema/document';
import { collectionVariables } from '@/core/variables/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import {
  addMode,
  copyVariables,
  createCollection,
  createVariable,
  extendCollection,
  moveVariables,
  parseVariablesClipboard,
  pasteVariables,
  renameMode,
  setVariableAlias,
  setVariableDescription,
  setVariableValue,
} from './variables';

const red = { r: 1, g: 0, b: 0, a: 1 };
const blue = { r: 0, g: 0, b: 1, a: 1 };

let editor: Editor;

const collection = (id: string) => editor.doc.getOrThrow(id) as VariableCollectionNode;
const variable = (id: string) => editor.doc.getOrThrow(id) as VariableNode;
const order = (collectionId: string) => collectionVariables(editor.doc, collectionId).map((v) => v.id);

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
});

describe('copy and paste variables', () => {
  test('pasted variables take values by mode name, else the default value; names become unique; aliases stay', () => {
    const brand = createCollection(editor, 'Brand');
    const light = collection(brand).modes[0]!.modeId;
    renameMode(editor, brand, light, 'Light');
    const dark = addMode(editor, brand, 'Dark')!;
    const base = createVariable(editor, brand, 'COLOR', 'base')!;
    setVariableValue(editor, base, light, red);
    setVariableValue(editor, base, dark, blue);
    setVariableDescription(editor, base, 'Brand base');
    const accent = createVariable(editor, brand, 'COLOR', 'accent')!;
    setVariableAlias(editor, accent, light, base);

    const clipboard = copyVariables(editor, [base, accent])!;
    expect(parseVariablesClipboard(JSON.stringify(clipboard))).toEqual(clipboard);
    expect(parseVariablesClipboard('not variables')).toBeNull();
    expect(parseVariablesClipboard('{"kind":"other"}')).toBeNull();

    const other = createCollection(editor, 'Other');
    const first = collection(other).modes[0]!.modeId;
    const otherDark = addMode(editor, other, 'Dark')!;
    const [pastedBase, pastedAccent] = pasteVariables(editor, other, clipboard) as [string, string];
    // Dark matches by name; Mode 1 has no match and takes the default (Light) value.
    expect(variable(pastedBase)).toMatchObject({ name: 'base', description: 'Brand base', valuesByMode: { [first]: red, [otherDark]: blue } });
    expect(variable(pastedAccent).valuesByMode[first]).toEqual({ type: 'VARIABLE_ALIAS', id: base });

    const [again] = pasteVariables(editor, other, clipboard) as [string];
    expect(variable(again).name).toBe('base 2');
    expect(pasteVariables(editor, extendCollection(editor, other)!, clipboard)).toEqual([]);
  });
});

describe('moving variables', () => {
  test('variables are reordered, and join the group of the variable they are moved next to', () => {
    const tokens = createCollection(editor);
    const small = createVariable(editor, tokens, 'FLOAT', 'space/sm')!;
    const medium = createVariable(editor, tokens, 'FLOAT', 'space/md')!;
    const radius = createVariable(editor, tokens, 'FLOAT', 'radius')!;

    expect(moveVariables(editor, [radius], small, 'before')).toBe(true);
    expect(order(tokens)).toEqual([radius, small, medium]);
    expect(variable(radius).name).toBe('space/radius');

    expect(moveVariables(editor, [small, medium], radius, 'before')).toBe(true);
    expect(order(tokens)).toEqual([small, medium, radius]);
    expect(moveVariables(editor, [radius], radius, 'after')).toBe(false);
    editor.history.undo();
    expect(order(tokens)).toEqual([radius, small, medium]);
  });
});
