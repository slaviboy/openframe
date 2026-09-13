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
import type { Node, SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';

let editor: Editor;

function add(make: (i: { id: string; parent: { id: string; key: string }; name: string; x: number; y: number; width: number; height: number }) => Node, x: number, y: number, parent = editor.pageId, patch: Partial<Node> = {}): string {
  return editor.history.run('seed', (tx) => {
    const id = editor.ids.next();
    tx.create({ ...make({ id, parent: { id: parent, key: keyOnTop(editor.doc, parent) }, name: 'L', x, y, width: 50, height: 50 }), ...patch } as Node);
    return id;
  });
}
const pos = (id: string) => (editor.doc.getOrThrow(id) as SceneNode).transform.slice(4);

beforeEach(() => {
  const ids = new IdGenerator('t');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
});

describe('tidy up command', () => {
  test('tidies a row in world space, including layers inside frames, in one undo step', () => {
    const frame = add(makeFrame, 100, 100, editor.pageId, { size: { width: 500, height: 200 } } as Partial<Node>);
    const a = add(makeRectangle, 0, 0, frame);
    const b = add(makeRectangle, 60, 7, frame);
    const c = add(makeRectangle, 140, -3, frame);
    editor.state.select([a, b, c]);
    expect(editor.commands.get('arrange.tidyUp')?.shortcuts).toEqual(['Ctrl+Alt+T']);
    editor.commands.run('arrange.tidyUp');
    // Gaps 10 and 30 → median 20; top aligned to the highest layer (local y −3).
    expect([pos(a), pos(b), pos(c)]).toEqual([
      [0, -3],
      [70, -3],
      [140, -3],
    ]);
    editor.history.undo();
    expect(pos(b)).toEqual([60, 7]);
  });

  test('needs two unlocked layers; locked layers stay put', () => {
    const a = add(makeRectangle, 0, 0);
    const locked = add(makeRectangle, 90, 30, editor.pageId, { locked: true } as Partial<Node>);
    editor.state.select([a, locked]);
    expect(editor.commands.isEnabled('arrange.tidyUp')).toBe(false);
  });
});
