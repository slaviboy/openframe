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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from '@/core/document/factory';
import { collectionVariables } from '@/core/variables/document';
import { IdGenerator, ROOT_ID } from '@/core/ids/ids';
import type { VariableCollectionNode, VariableNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import {
  addMode,
  bindPaintVariable,
  bindVariable,
  createCollection,
  createVariable,
  deleteMode,
  deleteVariables,
  detachAlias,
  duplicateMode,
  duplicateVariables,
  exportCollectionMode,
  importMode,
  renameMode,
  renameVariable,
  setDefaultMode,
  setExplicitVariableMode,
  setVariableAlias,
  setVariableCodeSyntax,
  setVariableScopes,
  setVariableValue,
  unbindVariable,
  variablesFor,
} from './variables';

const red = { r: 1, g: 0, b: 0, a: 1 };
const green = { r: 0, g: 1, b: 0, a: 1 };
const blue = { r: 0, g: 0, b: 1, a: 1 };

let editor: Editor;
let frame: string;
let rect: string;

const node = (id: string) => editor.doc.getOrThrow(id) as unknown as Record<string, unknown>;
const collection = (id: string) => editor.doc.getOrThrow(id) as VariableCollectionNode;
const variable = (id: string) => editor.doc.getOrThrow(id) as VariableNode;
const fill = () => (node(rect).fills as Array<Record<string, unknown>>)[0]!;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  [frame, rect] = editor.history.run('create', (tx) => {
    const page = editor.pageId;
    const f = editor.ids.next();
    tx.create(makeFrame({ id: f, parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Card', x: 0, y: 0, width: 200, height: 200 }));
    const r = editor.ids.next();
    tx.create(makeRectangle({ id: r, parent: { id: f, key: keyOnTop(tx.store, f) }, name: 'Box', x: 10, y: 10, width: 40, height: 40 }));
    return [f, r];
  });
});

describe('variables', () => {
  test('collections and variables are document nodes, not pages', () => {
    const theme = createCollection(editor, 'Theme');
    expect(editor.doc.parentOf(theme)).toBe(ROOT_ID);
    expect(editor.doc.pages()).toEqual([editor.pageId]);
    const color = createVariable(editor, theme, 'COLOR')!;
    expect(editor.doc.parentOf(color)).toBe(theme);
    expect(variable(color)).toMatchObject({ name: 'Color', resolvedType: 'COLOR', valuesByMode: { [collection(theme).modes[0]!.modeId]: { r: 1, g: 1, b: 1, a: 1 } } });
  });

  test('bound properties follow the mode set on the layer, its containers or the page, and Auto falls back to the default', () => {
    const theme = createCollection(editor, 'Theme');
    const light = collection(theme).modes[0]!.modeId;
    const dark = addMode(editor, theme, 'Dark')!;
    expect(renameMode(editor, theme, light, 'Light')).toBe(true);
    const radius = createVariable(editor, theme, 'FLOAT', 'radius')!;
    setVariableValue(editor, radius, light, 4);
    setVariableValue(editor, radius, dark, 12);

    expect(bindVariable(editor, [rect], 'cornerRadius', radius)).toBe(true);
    expect(node(rect).cornerRadius).toBe(4);
    expect(setExplicitVariableMode(editor, [frame], theme, dark)).toBe(true);
    expect(node(rect).cornerRadius).toBe(12);
    setExplicitVariableMode(editor, [frame], theme, null);
    expect(node(rect).cornerRadius).toBe(4);
    setExplicitVariableMode(editor, [editor.pageId], theme, dark);
    expect(node(rect).cornerRadius).toBe(12);
    // The layer's own mode wins over the page's.
    setExplicitVariableMode(editor, [rect], theme, light);
    expect(node(rect).cornerRadius).toBe(4);
    setExplicitVariableMode(editor, [rect], theme, null);

    expect(setDefaultMode(editor, theme, dark)).toBe(true);
    expect(collection(theme).modes.map((m) => m.name)).toEqual(['Dark', 'Light']);
    expect(duplicateMode(editor, theme, dark)).not.toBeNull();
    expect(collection(theme).modes.map((m) => m.name)).toEqual(['Dark', 'Dark copy', 'Light']);

    // Deleting Dark sets the page back to Auto, which now uses the new default mode, Dark copy (with Dark's values).
    expect(deleteMode(editor, theme, dark)).toBe(true);
    expect(node(editor.pageId).explicitVariableModes).toBeUndefined();
    expect(node(rect).cornerRadius).toBe(12);
    setVariableValue(editor, radius, light, 6);
    setExplicitVariableMode(editor, [frame], theme, light);
    expect(node(rect).cornerRadius).toBe(6);
    editor.history.undo();
    expect(node(rect).cornerRadius).toBe(12);
  });

  test('aliases follow their target, refuse cycles and other types, and detach to the value they had', () => {
    const primitives = createCollection(editor, 'Primitives');
    const base = collection(primitives).modes[0]!.modeId;
    const brand = createVariable(editor, primitives, 'COLOR', 'blue')!;
    setVariableValue(editor, brand, base, blue);
    const theme = createCollection(editor, 'Theme');
    const mode = collection(theme).modes[0]!.modeId;
    const accent = createVariable(editor, theme, 'COLOR', 'accent')!;

    expect(setVariableAlias(editor, accent, mode, brand)).toBe(true);
    expect(setVariableAlias(editor, brand, base, accent)).toBe(false);
    expect(setVariableAlias(editor, accent, mode, accent)).toBe(false);
    const count = createVariable(editor, theme, 'FLOAT')!;
    expect(setVariableAlias(editor, count, mode, brand)).toBe(false);
    expect(setVariableValue(editor, count, mode, 'text' as unknown as number)).toBe(false);

    expect(bindPaintVariable(editor, [rect], 'fills', 0, accent)).toBe(true);
    expect(fill()).toMatchObject({ type: 'SOLID', color: blue, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: accent } } });
    setVariableValue(editor, brand, base, red);
    expect(fill().color).toEqual(red);

    expect(detachAlias(editor, accent, mode)).toBe(true);
    expect(variable(accent).valuesByMode[mode]).toEqual(red);

    // Changing the fill's color directly detaches the variable.
    editor.history.run('Change fill', (tx) => tx.set(rect, 'fills', [{ ...fill(), color: green }]));
    expect(fill().color).toEqual(green);
    expect(fill().boundVariables).toBeUndefined();
  });

  test('editing a bound property detaches it; detaching or deleting the variable keeps the value', () => {
    const tokens = createCollection(editor);
    const mode = collection(tokens).modes[0]!.modeId;
    const opacity = createVariable(editor, tokens, 'FLOAT', 'opacity')!;
    setVariableValue(editor, opacity, mode, 150);
    bindVariable(editor, [rect], 'opacity', opacity);
    expect(node(rect).opacity).toBe(1);
    setVariableValue(editor, opacity, mode, 50);
    expect(node(rect).opacity).toBe(0.5);

    editor.history.run('Opacity', (tx) => tx.set(rect, 'opacity', 0.8));
    expect(node(rect).boundVariables).toBeUndefined();
    expect(node(rect).opacity).toBe(0.8);

    bindVariable(editor, [rect], 'opacity', opacity);
    expect(unbindVariable(editor, [rect], 'opacity')).toBe(true);
    expect(node(rect)).toMatchObject({ opacity: 0.5 });
    bindVariable(editor, [rect], 'opacity', opacity);
    expect(deleteVariables(editor, [opacity])).toBe(true);
    expect(node(rect).boundVariables).toBeUndefined();
    expect(node(rect).opacity).toBe(0.5);

    const hidden = createVariable(editor, tokens, 'BOOLEAN', 'hidden')!;
    expect(bindVariable(editor, [rect], 'visible', hidden)).toBe(true);
    expect(node(rect).visible).toBe(false);
    expect(bindVariable(editor, [rect], 'characters', hidden)).toBe(false);
    const gap = createVariable(editor, tokens, 'FLOAT', 'gap')!;
    setVariableValue(editor, gap, mode, 24);
    expect(bindVariable(editor, [frame], 'itemSpacing', gap)).toBe(true);
    expect(bindVariable(editor, [frame], 'width', gap)).toBe(true);
    expect(node(frame)).toMatchObject({ itemSpacing: 24, size: { width: 24, height: 200 } });
  });

  test('names are unique in a collection; scopes limit where variables are offered; code syntax', () => {
    const tokens = createCollection(editor);
    const small = createVariable(editor, tokens, 'FLOAT')!;
    const other = createVariable(editor, tokens, 'FLOAT')!;
    expect([variable(small).name, variable(other).name]).toEqual(['Number', 'Number 2']);
    expect(renameVariable(editor, other, 'Number')).toBe(false);
    expect(renameVariable(editor, small, ' radius / sm ')).toBe(true);
    expect(variable(small).name).toBe('radius/sm');

    expect(setVariableScopes(editor, [small], ['CORNER_RADIUS', 'FONT_FAMILY'])).toBe(true);
    expect(variable(small).scopes).toEqual(['CORNER_RADIUS']);
    expect(variablesFor(editor, [rect], 'cornerRadius').map((v) => v.id)).toEqual([small, other]);
    expect(variablesFor(editor, [rect], 'opacity').map((v) => v.id)).toEqual([other]);
    setVariableScopes(editor, [small], ['ALL_SCOPES']);
    expect(variable(small).scopes).toBeUndefined();

    const [copy] = duplicateVariables(editor, [small]) as [string];
    expect(collectionVariables(editor.doc, tokens).map((v) => v.id)).toEqual([small, copy, other]);
    expect(variable(copy).name).toBe('radius/sm 2');

    expect(setVariableCodeSyntax(editor, small, 'WEB', 'var(--radius-sm)')).toBe(true);
    expect(variable(small).codeSyntax).toEqual({ WEB: 'var(--radius-sm)' });
    setVariableCodeSyntax(editor, small, 'WEB', '');
    expect(variable(small).codeSyntax).toBeUndefined();
  });

  test('design tokens import as a new mode or into a mode, and a mode exports as tokens', () => {
    const tokens = createCollection(editor, 'Tokens');
    const result = importMode(
      editor,
      tokens,
      {
        red: { $type: 'color', $value: { colorSpace: 'srgb', components: [1, 0, 0], alpha: 1 } },
        danger: { $type: 'color', $value: '{red}' },
        space: { sm: { $type: 'dimension', $value: { value: 4, unit: 'px' } } },
      },
      { name: 'Light' },
    );
    expect(result).toEqual({ created: 3, updated: 0 });
    expect(collection(tokens).modes.map((m) => m.name)).toEqual(['Mode 1', 'Light']);
    const light = collection(tokens).modes[1]!.modeId;
    const [redVar, danger, small] = collectionVariables(editor.doc, tokens);
    expect([redVar!.name, danger!.name, small!.name]).toEqual(['red', 'danger', 'space/sm']);
    expect(danger!.valuesByMode[light]).toEqual({ type: 'VARIABLE_ALIAS', id: redVar!.id });

    expect(importMode(editor, tokens, { space: { sm: { $type: 'dimension', $value: { value: 8, unit: 'px' } } }, extra: { $type: 'number', $value: 1 } }, { modeId: light })).toEqual({ created: 0, updated: 1 });
    expect(variable(small!.id).valuesByMode[light]).toBe(8);

    expect(exportCollectionMode(editor, tokens, light)).toMatchObject({
      red: { $type: 'color', $value: { hex: '#FF0000' } },
      danger: { $type: 'color', $value: '{red}' },
      space: { sm: { $type: 'number', $value: 8 } },
    });
  });
});
