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

import { expect, test } from 'vitest';
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { flattenLayers, rowRange } from './layer-rows';

test('rows list topmost first and include children of expanded containers only', () => {
  const ids = new IdGenerator('r');
  const doc = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  const page = doc.pages()[0]!;
  const frame = makeFrame({ id: ids.next(), parent: { id: page, key: keyOnTop(doc, page) }, name: 'F', x: 0, y: 0, width: 1, height: 1 });
  doc.applyOp({ kind: 'create', node: frame });
  const top = makeRectangle({ id: ids.next(), parent: { id: page, key: keyOnTop(doc, page) }, name: 'Top', x: 0, y: 0, width: 1, height: 1 });
  doc.applyOp({ kind: 'create', node: top });
  const child = makeRectangle({ id: ids.next(), parent: { id: frame.id, key: 'V' }, name: 'C', x: 0, y: 0, width: 1, height: 1 });
  doc.applyOp({ kind: 'create', node: child });

  expect(flattenLayers(doc, page, new Set()).map((r) => r.id)).toEqual([top.id, frame.id]);
  const rows = flattenLayers(doc, page, new Set([frame.id]));
  expect(rows.map((r) => [r.id, r.depth])).toEqual([
    [top.id, 0],
    [frame.id, 0],
    [child.id, 1],
  ]);
  expect(rows[1]!.hasChildren && rows[1]!.expanded).toBe(true);
  expect(rowRange(rows, child.id, top.id)).toEqual([top.id, frame.id, child.id]);
});
