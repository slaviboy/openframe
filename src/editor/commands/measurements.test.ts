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
import { addMeasurement, deleteMeasurement, drawnMeasurements, measurementsOf, pruneMeasurements, setMeasurementLabel } from './measurements';

let editor: Editor;
let left: string;
let right: string;

/** Two rectangles a hundred apart, which a measurement runs between. */
beforeEach(() => {
  const ids = new IdGenerator('m');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  const make = (name: string, x: number) =>
    editor.history.run('create', (tx) => {
      const id = editor.ids.next();
      tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name, x, y: 0, width: 50, height: 50 }));
      return id;
    });
  left = make('Left', 0);
  right = make('Right', 150);
});

describe('a saved measurement', () => {
  test('records the distance between two layers, and is drawn from where they are now', () => {
    const id = addMeasurement(editor, left, right);
    expect(id).not.toBeNull();
    expect(measurementsOf(editor)).toHaveLength(1);

    const drawn = drawnMeasurements(editor);
    expect(drawn).toHaveLength(1);
    // The rectangles are 50 wide and 150 apart at their left edges, so a hundred stands between them.
    expect(drawn[0]!.lines[0]!.distance).toBe(100);
    expect(drawn[0]!.lines[0]!.axis).toBe('x');

    // Moving a layer moves the measurement with it.
    editor.history.run('move', (tx) => tx.set(right, 'transform', [1, 0, 0, 1, 250, 0]));
    expect(drawnMeasurements(editor)[0]!.lines[0]!.distance).toBe(200);
  });

  test('takes text of its own instead of the distance, and gives it back up', () => {
    const id = addMeasurement(editor, left, right)!;
    expect(setMeasurementLabel(editor, id, 'One gutter')).toBe(true);
    expect(measurementsOf(editor)[0]!.label).toBe('One gutter');
    expect(drawnMeasurements(editor)[0]!.label).toBe('One gutter');

    setMeasurementLabel(editor, id, '   ');
    expect(measurementsOf(editor)[0]!.label).toBeUndefined();
  });

  test('a measurement needs two different layers', () => {
    expect(addMeasurement(editor, left, left)).toBeNull();
    expect(addMeasurement(editor, left, 'nowhere')).toBeNull();
    expect(measurementsOf(editor)).toHaveLength(0);
  });

  test('is deleted, and the page carries none again', () => {
    const id = addMeasurement(editor, left, right)!;
    expect(deleteMeasurement(editor, id)).toBe(true);
    expect(deleteMeasurement(editor, id)).toBe(false);
    expect(measurementsOf(editor)).toHaveLength(0);
    expect((editor.doc.getOrThrow(editor.pageId) as { measurements?: unknown }).measurements).toBeUndefined();
  });

  test('one whose layer is gone is dropped, and is not drawn in the meantime', () => {
    addMeasurement(editor, left, right);
    editor.history.run('delete', (tx) => tx.delete(right));
    expect(drawnMeasurements(editor)).toHaveLength(0);
    expect(pruneMeasurements(editor)).toBe(true);
    expect(measurementsOf(editor)).toHaveLength(0);
  });
});
