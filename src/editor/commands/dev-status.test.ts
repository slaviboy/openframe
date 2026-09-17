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
import { Editor } from '../editor';
import { devStatusLabel, devStatusLayers, devStatusOf, pageHasDevStatus, setDevStatus } from './dev-status';

let editor: Editor;
let frame: string;
let rect: string;

/** A frame with a rectangle inside it, which is the design a status is put on. */
beforeEach(() => {
  const ids = new IdGenerator('d');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  frame = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeFrame({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Screen', x: 0, y: 0, width: 200, height: 200 }));
    return id;
  });
  rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: frame, key: keyOnTop(tx.store, frame) }, name: 'Card', x: 10, y: 10, width: 60, height: 40 }));
    return id;
  });
});

describe('a dev status', () => {
  test('marks a design ready for dev, and comes off again', () => {
    expect(setDevStatus(editor, [frame], 'READY_FOR_DEV')).toBe(true);
    expect(devStatusOf(editor, frame)).toEqual({ state: 'READY_FOR_DEV' });
    expect(devStatusLabel(devStatusOf(editor, frame)!)).toBe('Ready for dev');

    expect(setDevStatus(editor, [frame], 'COMPLETED')).toBe(true);
    expect(devStatusLabel(devStatusOf(editor, frame)!)).toBe('Completed');

    expect(setDevStatus(editor, [frame], null)).toBe(true);
    expect(devStatusOf(editor, frame)).toBeUndefined();
  });

  test('only sections, frames and the components made of them can carry one', () => {
    expect(setDevStatus(editor, [rect], 'READY_FOR_DEV')).toBe(false);
    expect(devStatusOf(editor, rect)).toBeUndefined();
  });

  test('editing the design afterwards puts it in the changed state, and marking it again settles it', () => {
    setDevStatus(editor, [frame], 'READY_FOR_DEV');
    // A change to a layer inside the design counts as the design moving on.
    editor.history.run('move', (tx) => tx.set(rect, 'transform', [1, 0, 0, 1, 40, 10]));
    expect(devStatusOf(editor, frame)).toEqual({ state: 'READY_FOR_DEV', changed: true });
    expect(devStatusLabel(devStatusOf(editor, frame)!)).toBe('Ready for dev (changed)');

    setDevStatus(editor, [frame], 'READY_FOR_DEV');
    expect(devStatusOf(editor, frame)).toEqual({ state: 'READY_FOR_DEV' });
  });

  test('a value a variable or a style carries is not the design moving on', () => {
    setDevStatus(editor, [frame], 'READY_FOR_DEV');
    editor.history.run('bind', (tx) => tx.set(rect, 'fillStyleId', 'some-style'));
    expect(devStatusOf(editor, frame)?.changed).toBeUndefined();
  });

  test('an unmarked design stays unmarked however much it is edited', () => {
    editor.history.run('move', (tx) => tx.set(rect, 'transform', [1, 0, 0, 1, 40, 10]));
    expect(devStatusOf(editor, frame)).toBeUndefined();
  });

  test('the page lists what it holds marked, which is what badges it', () => {
    expect(pageHasDevStatus(editor, editor.pageId)).toBe(false);
    setDevStatus(editor, [frame], 'READY_FOR_DEV');
    expect(devStatusLayers(editor, editor.pageId).map((node) => node.name)).toEqual(['Screen']);
    expect(pageHasDevStatus(editor, editor.pageId)).toBe(true);
  });
});
