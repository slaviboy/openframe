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
import { createEmptyDocument, keyOnTop, makeEllipse, makeRectangle, makeVector } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { RectangleNode, SceneNode, VectorNode } from '@/core/schema/document';
import { straightSegment, type VectorNetwork } from '@/core/vector/vector-network';
import { deserializeDocument, serializeDocument } from '@/core/serialize/serialize';
import { Editor } from '../editor';
import {
  canTakeWidthProfile,
  flipStrokeWidths,
  setBrushSettings,
  setAllEndCaps,
  setDashCap,
  setEndCap,
  setIndividualStrokeWeights,
  setStrokeDashes,
  setStrokeJoin,
  setStrokeMiterAngle,
  setVertexCaps,
  setWidthProfile,
} from './properties';

let editor: Editor;
let rect: string;
let ellipse: string;

beforeEach(() => {
  const ids = new IdGenerator('s');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  const add = (make: typeof makeRectangle | typeof makeEllipse) =>
    editor.history.run('seed', (tx) => {
      const id = editor.ids.next();
      tx.create(make({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'L', x: 0, y: 0, width: 10, height: 10 }));
      return id;
    });
  rect = add(makeRectangle);
  ellipse = add(makeEllipse);
});

const get = <T extends SceneNode>(id: string) => editor.doc.getOrThrow(id) as T;

describe('stroke properties', () => {
  test('dashes, dash caps, joins and miter angle store only non-defaults and round-trip', () => {
    editor.history.run('stroke', (tx) => {
      setStrokeDashes(tx, get(rect), [4, 2]);
      setDashCap(tx, get(rect), 'ROUND');
      setStrokeJoin(tx, get(rect), 'BEVEL');
      setStrokeMiterAngle(tx, get(rect), 45);
    });
    expect(get<RectangleNode>(rect)).toMatchObject({ strokeDashes: [4, 2], strokeCap: 'ROUND', strokeJoin: 'BEVEL', strokeMiterAngle: 45 });
    const reloaded = deserializeDocument(serializeDocument(editor.doc)).getOrThrow(rect);
    expect(reloaded).toMatchObject({ strokeDashes: [4, 2], strokeJoin: 'BEVEL' });

    editor.history.run('reset', (tx) => {
      setStrokeDashes(tx, get(rect), undefined);
      setDashCap(tx, get(rect), 'NONE');
      setStrokeJoin(tx, get(rect), 'MITER');
      setStrokeMiterAngle(tx, get(rect), 28.96);
    });
    const node = get<RectangleNode>(rect);
    for (const field of ['strokeDashes', 'strokeCap', 'strokeJoin', 'strokeMiterAngle']) expect(field in node).toBe(false);
  });

  test('invalid dash patterns clear the dashes', () => {
    editor.history.run('dash', (tx) => setStrokeDashes(tx, get(rect), [0, 0]));
    expect('strokeDashes' in get(rect)).toBe(false);
    editor.history.run('dash', (tx) => setStrokeDashes(tx, get(rect), [3]));
    expect('strokeDashes' in get(rect)).toBe(false);
  });

  test('individual stroke weights apply to rectangles and collapse when equal', () => {
    editor.history.run('sides', (tx) => setIndividualStrokeWeights(tx, get(rect), { top: 2, right: 0, bottom: 0, left: 0 }));
    expect(get<RectangleNode>(rect).individualStrokeWeights).toEqual({ top: 2, right: 0, bottom: 0, left: 0 });
    editor.history.run('sides', (tx) => setIndividualStrokeWeights(tx, get(rect), { top: 3, right: 3, bottom: 3, left: 3 }));
    expect(get<RectangleNode>(rect)).toMatchObject({ strokeWeight: 3 });
    expect('individualStrokeWeights' in get(rect)).toBe(false);
    editor.history.run('sides', (tx) => setIndividualStrokeWeights(tx, get(ellipse), { top: 2, right: 0, bottom: 0, left: 0 }));
    expect('individualStrokeWeights' in get(ellipse)).toBe(false);
  });

  describe('end points', () => {
    /** An open path from (0, 0) to (40, 0) to (40, 40), whose ends are its first and last point. */
    const path = (): VectorNetwork => ({
      vertices: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ],
      segments: [straightSegment(0, 1), straightSegment(1, 2)],
      regions: [],
    });
    const addVector = (network: VectorNetwork) =>
      editor.history.run('seed', (tx) => {
        const id = editor.ids.next();
        tx.create(makeVector({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'V', x: 0, y: 0, width: 40, height: 40 }, network));
        return id;
      });

    test('a vector keeps a cap on the point each end stops at, and a line keeps its own two', () => {
      const vector = addVector(path());
      editor.history.run('caps', (tx) => {
        setEndCap(tx, get(vector), 'startCap', 'CIRCLE_FILLED');
        setEndCap(tx, get(vector), 'endCap', 'TRIANGLE_ARROW');
      });
      const network = get<VectorNode>(vector).vectorNetwork;
      expect(network.vertices.map((v) => v.cap)).toEqual(['CIRCLE_FILLED', undefined, 'TRIANGLE_ARROW']);
      // The caps survive a save and an open.
      expect((deserializeDocument(serializeDocument(editor.doc)).getOrThrow(vector) as VectorNode).vectorNetwork.vertices[2]!.cap).toBe('TRIANGLE_ARROW');
    });

    test('a network that is not one open path takes the same end point on every end', () => {
      const branching = path();
      const vector = addVector({ ...branching, vertices: [...branching.vertices, { x: 40, y: -40 }], segments: [...branching.segments, straightSegment(1, 3)] });
      editor.history.run('caps', (tx) => setEndCap(tx, get(vector), 'startCap', 'ROUND'));
      expect(get<VectorNode>(vector).endpointCap).toBe('ROUND');
      expect(get<VectorNode>(vector).vectorNetwork.vertices.every((v) => v.cap === undefined)).toBe(true);
    });

    test('a width profile is laid down as shares of the weight, and takes the end points off with it', () => {
      const vector = addVector(path());
      editor.history.run('caps', (tx) => setEndCap(tx, get(vector), 'endCap', 'TRIANGLE_ARROW'));
      expect(canTakeWidthProfile(get(vector))).toBe(true);
      editor.history.run('profile', (tx) => setWidthProfile(tx, get(vector), 'WEDGE'));
      const points = get<VectorNode>(vector).strokeWidths!;
      expect(points[0]!.width).toBe(get<VectorNode>(vector).strokeWeight);
      expect(points[points.length - 1]!.width).toBeLessThan(points[0]!.width);
      expect(get<VectorNode>(vector).vectorNetwork.vertices.every((v) => v.cap === undefined)).toBe(true);

      // Flipping reads the same widths back along the path the other way, and the uniform profile clears them.
      editor.history.run('flip', (tx) => flipStrokeWidths(tx, get(vector)));
      const flipped = get<VectorNode>(vector).strokeWidths!;
      expect(flipped[0]!.width).toBeLessThan(flipped[flipped.length - 1]!.width);
      editor.history.run('profile', (tx) => setWidthProfile(tx, get(vector), 'UNIFORM'));
      expect(get<VectorNode>(vector).strokeWidths).toBeUndefined();
    });

    test('a brush keeps only the settings that differ from the ones it starts with', () => {
      const vector = addVector(path());
      editor.history.run('brush', (tx) => setBrushSettings(tx, get(vector), { gap: 25 }));
      expect('brushSettings' in get(vector)).toBe(false);
      editor.history.run('brush', (tx) => setBrushSettings(tx, get(vector), { gap: 80, direction: 'REVERSE' }));
      expect(get<VectorNode>(vector).brushSettings).toEqual({ gap: 80, direction: 'REVERSE' });
      // Set back to what it starts as, the field goes again rather than being stored as a default.
      editor.history.run('brush', (tx) => setBrushSettings(tx, get(vector), { gap: 25 }));
      expect(get<VectorNode>(vector).brushSettings).toEqual({ direction: 'REVERSE' });
      expect((deserializeDocument(serializeDocument(editor.doc)).getOrThrow(vector) as VectorNode).brushSettings).toEqual({ direction: 'REVERSE' });
    });

    test('a dashed, dynamic or branching stroke takes no width profile', () => {
      const vector = addVector(path());
      editor.history.run('dash', (tx) => setStrokeDashes(tx, get(vector), [4, 4]));
      expect(canTakeWidthProfile(get(vector))).toBe(false);
      editor.history.run('profile', (tx) => setWidthProfile(tx, get(vector), 'WEDGE'));
      expect(get<VectorNode>(vector).strokeWidths).toBeUndefined();
      const branching = path();
      const forked = addVector({ ...branching, vertices: [...branching.vertices, { x: 40, y: -40 }], segments: [...branching.segments, straightSegment(1, 3)] });
      expect(canTakeWidthProfile(get(forked))).toBe(false);
    });

    test('the ends picked in vector edit mode take their own point, and a layer-wide one clears them', () => {
      const vector = addVector(path());
      editor.history.run('caps', (tx) => setVertexCaps(tx, get(vector), [2], 'DIAMOND_FILLED'));
      expect(get<VectorNode>(vector).vectorNetwork.vertices[2]!.cap).toBe('DIAMOND_FILLED');
      editor.history.run('caps', (tx) => setAllEndCaps(tx, get(vector), 'SQUARE'));
      expect(get<VectorNode>(vector)).toMatchObject({ endpointCap: 'SQUARE' });
      expect(get<VectorNode>(vector).vectorNetwork.vertices.every((v) => v.cap === undefined)).toBe(true);
    });
  });
});
