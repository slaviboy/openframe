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
import { createEmptyDocument, keyOnTop, makeText } from '../document/factory';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import type { TextNode } from '../schema/document';
import type { TextLayoutService } from './text-layout';
import { autoTextName, createTextFinalizer } from './text-resize';

/** Fake layout: every character is 10 wide, every line 20 tall; wrapping breaks every `width / 10` characters. */
const fake: TextLayoutService = {
  measure: (node, width) => {
    const lines = node.characters.split('\n');
    if (width === null) return { width: Math.max(...lines.map((l) => l.length)) * 10, height: lines.length * 20 };
    const perLine = Math.max(1, Math.floor(width / 10));
    return { width, height: lines.reduce((sum, l) => sum + Math.max(1, Math.ceil(l.length / perLine)), 0) * 20 };
  },
  offsetAt: () => 0,
  caretAt: () => ({ x: 0, top: 0, bottom: 20 }),
  selectionRects: () => [],
  offsetOnAdjacentLine: () => 0,
  lineRange: () => [0, 0],
  availableFonts: () => [{ family: 'Inter', styles: ['Regular', 'Bold'] }],
};

function setup(layout: TextLayoutService | null = fake) {
  const ids = new IdGenerator('t');
  const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  const history = new History<null>({ store, captureMeta: () => null, restoreMeta: () => undefined, finalizers: [createTextFinalizer(() => layout)] });
  const page = store.pages()[0]!;
  const id = ids.next();
  history.run('create', (tx) => tx.create({ ...makeText({ id, parent: { id: page, key: keyOnTop(store, page) }, name: 'Text', x: 100, y: 50, width: 0, height: 0 }), autoRename: true }));
  const get = () => store.getOrThrow(id) as TextNode;
  return { history, id, get };
}

describe('text box fitting', () => {
  test('auto width fits both dimensions and follows the text as it changes', () => {
    const { history, id, get } = setup();
    expect(get().size).toEqual({ width: 0, height: 20 });
    history.run('type', (tx) => tx.set(id, 'characters', 'Hello\nworld!'));
    expect(get().size).toEqual({ width: 60, height: 40 });
    expect(get().name).toBe('Hello');
  });

  test('centered and right-aligned auto width text grows around its alignment edge', () => {
    const { history, id, get } = setup();
    history.run('align', (tx) => tx.set(id, 'textAlignHorizontal', 'CENTER'));
    history.run('type', (tx) => tx.set(id, 'characters', 'abcd'));
    expect(get().transform.slice(4)).toEqual([80, 50]);
    history.run('align', (tx) => tx.set(id, 'textAlignHorizontal', 'RIGHT'));
    history.run('type', (tx) => tx.set(id, 'characters', 'abcdef'));
    expect(get().transform.slice(4)).toEqual([60, 50]);
    expect(get().size.width).toBe(60);
  });

  test('auto height wraps to the width; fixed size keeps its box', () => {
    const { history, id, get } = setup();
    history.run('mode', (tx) => {
      tx.set(id, 'textAutoResize', 'HEIGHT');
      tx.set(id, 'size', { width: 30, height: 20 });
    });
    history.run('type', (tx) => tx.set(id, 'characters', 'abcdefg'));
    expect(get().size).toEqual({ width: 30, height: 60 });
    history.run('mode', (tx) => tx.set(id, 'textAutoResize', 'NONE'));
    history.run('type', (tx) => tx.set(id, 'characters', 'a'));
    expect(get().size).toEqual({ width: 30, height: 60 });
  });

  test('names follow the first line until renamed; without a layout only names update', () => {
    expect(autoTextName('\n  Title  \nbody')).toBe('Title');
    expect(autoTextName('   ')).toBe('Text');
    const { history, id, get } = setup(null);
    history.run('type', (tx) => tx.set(id, 'characters', 'Hi'));
    expect(get()).toMatchObject({ name: 'Hi', size: { width: 0, height: 0 } });
    history.run('rename', (tx) => {
      tx.set(id, 'name', 'Custom');
      tx.set(id, 'autoRename', undefined);
    });
    history.run('type', (tx) => tx.set(id, 'characters', 'Changed'));
    expect(get().name).toBe('Custom');
  });
});
