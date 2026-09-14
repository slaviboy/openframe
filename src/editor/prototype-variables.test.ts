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
import { IdGenerator } from '@/core/ids/ids';
import { runReaction, startPlayer, type PlayerState } from '@/core/prototype/player';
import { evaluateAt, NO_VARIABLES } from '@/core/prototype/variables-runtime';
import type { PrototypeAction, Reaction, SceneNode, VariableCollectionNode } from '@/core/schema/document';
import { bindVariable, createCollection, createVariable, setVariableValue } from './commands/variables';
import { Editor } from './editor';
import { buildRuntime } from './prototype-runtime';

let editor: Editor;
let collection: string;
let mode: string;
let count: string;
let label: string;
let flag: string;
let tint: string;
let state: PlayerState;

const set = (variableId: string, expression: string): PrototypeAction => ({ type: 'SET_VARIABLE', variableId, expression });
const go = (destinationId: string): PrototypeAction => ({ type: 'NODE', navigation: 'NAVIGATE', destinationId, transition: { type: 'INSTANT' } });
const on = (...actions: PrototypeAction[]): Reaction => ({ trigger: { type: 'ON_CLICK' }, actions });
const valueOf = (s: PlayerState, variableId: string) => s.variables?.values[variableId]?.[mode];

beforeEach(() => {
  const ids = new IdGenerator('v');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  collection = createCollection(editor, 'App');
  mode = (editor.doc.getOrThrow(collection) as VariableCollectionNode).modes[0]!.modeId;
  count = createVariable(editor, collection, 'FLOAT', 'count')!;
  setVariableValue(editor, count, mode, 1);
  label = createVariable(editor, collection, 'STRING', 'label')!;
  setVariableValue(editor, label, mode, 'Hi');
  flag = createVariable(editor, collection, 'BOOLEAN', 'flag')!;
  setVariableValue(editor, flag, mode, false);
  tint = createVariable(editor, collection, 'COLOR', 'tint')!;
  const page = editor.pageId;
  editor.history.run('Build', (tx) => {
    tx.create(makeFrame({ id: 'home', parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Home', x: 0, y: 0, width: 200, height: 200 }));
    tx.create(makeRectangle({ id: 'bar', parent: { id: 'home', key: keyOnTop(tx.store, 'home') }, name: 'Bar', x: 0, y: 0, width: 10, height: 10 }));
    tx.create(makeFrame({ id: 'done', parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Done', x: 300, y: 0, width: 200, height: 200 }));
  });
  state = startPlayer(editor.doc, page, 'home')!;
});

describe('variables in prototypes', () => {
  test('expressions read variables by name', () => {
    expect(evaluateAt(editor.doc, NO_VARIABLES, '{count} + 2', 'bar')).toBe(3);
    expect(evaluateAt(editor.doc, NO_VARIABLES, '{label} + " there"', 'bar')).toBe('Hi there');
    expect(evaluateAt(editor.doc, NO_VARIABLES, '{count} > 5 or {flag}', 'bar')).toBe(false);
    expect(evaluateAt(editor.doc, NO_VARIABLES, '{missing} + 1', 'bar')).toBeUndefined();
    expect(evaluateAt(editor.doc, NO_VARIABLES, '{count} +', 'bar')).toBeUndefined();
  });

  test('actions run in order: a Conditional sees the value set before it', () => {
    const first = runReaction(editor.doc, state, on(set(count, '{count} + 5'), { type: 'CONDITIONAL', blocks: [{ condition: '{count} > 5', actions: [go('done')] }, { condition: null, actions: [] }] }), 'bar');
    expect(valueOf(first.state, count)).toBe(6);
    expect(first.state.frameId).toBe('done');

    // In the other order, the condition is checked first and the else block runs.
    const second = runReaction(editor.doc, state, on({ type: 'CONDITIONAL', blocks: [{ condition: '{count} > 5', actions: [go('done')] }, { condition: null, actions: [set(label, '"no"')] }] }, set(count, '{count} + 5')), 'bar');
    expect(second.state.frameId).toBe('home');
    expect(valueOf(second.state, label)).toBe('no');
    expect(valueOf(second.state, count)).toBe(6);
  });

  test('values take the variable type; invalid ones change nothing', () => {
    let s = runReaction(editor.doc, state, on(set(flag, 'true'), set(label, '{count} + 1'), set(tint, '#ff8000')), 'bar').state;
    expect(valueOf(s, flag)).toBe(true);
    expect(valueOf(s, label)).toBe('2');
    expect(valueOf(s, tint)).toEqual({ r: 1, g: 128 / 255, b: 0, a: 1 });
    s = runReaction(editor.doc, s, on(set(count, '"abc"'), set(count, '{count} +'), set(flag, '')), 'bar').state;
    expect(valueOf(s, count)).toBeUndefined();
    expect(valueOf(s, flag)).toBe(true);
  });

  test('Set variable mode switches the page to a mode of a collection', () => {
    const switched = runReaction(editor.doc, state, on({ type: 'SET_VARIABLE_MODE', collectionId: collection, modeId: mode }), 'bar').state;
    expect(switched.variables?.pageModes).toEqual({ [collection]: mode });
    expect(runReaction(editor.doc, state, on({ type: 'SET_VARIABLE_MODE', collectionId: collection, modeId: 'nope' }), 'bar').state).toBe(state);
  });

  test('the runtime document gives bound layers the values set while playing', () => {
    bindVariable(editor, ['bar'], 'width', count);
    const played = runReaction(editor.doc, state, on(set(count, '120')), 'bar').state;
    const runtime = buildRuntime(editor.doc, editor.pageId, { variants: [], variables: played.variables! })!;
    expect((runtime.doc.getOrThrow('bar') as SceneNode).size.width).toBe(120);
    expect((editor.doc.getOrThrow('bar') as SceneNode).size.width).toBe(1);
    expect(buildRuntime(editor.doc, editor.pageId, { variants: [], variables: NO_VARIABLES })).toBeNull();
  });
});
