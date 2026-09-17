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
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import {
  DEFAULT_ANNOTATION_CATEGORIES,
  addAnnotation,
  annotationCategories,
  annotationPropertyValue,
  annotationsFor,
  deleteAnnotation,
  pruneAnnotations,
  setAnnotationCategories,
  updateAnnotation,
} from './annotations';

let editor: Editor;
let rect: string;

beforeEach(() => {
  const ids = new IdGenerator('a');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Card', x: 10, y: 20, width: 120, height: 80 }));
    return id;
  });
});

const node = () => editor.doc.getOrThrow(rect) as SceneNode;

describe('an annotation', () => {
  test('is left on a layer, says what it says, and comes off again', () => {
    const id = addAnnotation(editor, rect, 'Use the brand blue')!;
    expect(annotationsFor(editor, rect)).toEqual([{ id, nodeId: rect, text: 'Use the brand blue' }]);

    updateAnnotation(editor, id, { text: 'Use the accent instead' });
    expect(annotationsFor(editor, rect)[0]!.text).toBe('Use the accent instead');

    expect(deleteAnnotation(editor, id)).toBe(true);
    expect(annotationsFor(editor, rect)).toEqual([]);
  });

  test('calls out the layer’s own properties, which read from the design as it stands', () => {
    const id = addAnnotation(editor, rect)!;
    updateAnnotation(editor, id, { properties: ['width', 'cornerRadius'] });
    expect(annotationsFor(editor, rect)[0]!.properties).toEqual(['width', 'cornerRadius']);

    expect(annotationPropertyValue(node(), 'width')).toBe('120');
    // Resizing the layer changes what the annotation reads, because it keeps the property, not the number.
    editor.history.run('resize', (tx) => tx.set(rect, 'size', { width: 200, height: 80 }));
    expect(annotationPropertyValue(node(), 'width')).toBe('200');
    // A property the layer has nothing to say about reads as nothing at all.
    expect(annotationPropertyValue(node(), 'gap')).toBeNull();
  });

  test('is filed under a category, and the file starts with four of them', () => {
    expect(annotationCategories(editor).map((category) => category.label)).toEqual(['Development', 'Interaction', 'Accessibility', 'Content']);
    const id = addAnnotation(editor, rect)!;
    updateAnnotation(editor, id, { categoryId: 'accessibility' });
    expect(annotationsFor(editor, rect)[0]!.categoryId).toBe('accessibility');

    // The category comes off again.
    updateAnnotation(editor, id, { categoryId: null });
    expect(annotationsFor(editor, rect)[0]!.categoryId).toBeUndefined();
  });

  test('the file’s categories are edited, and the ones it starts with are not written down', () => {
    expect(setAnnotationCategories(editor, [...DEFAULT_ANNOTATION_CATEGORIES, { id: 'perf', label: 'Performance', color: '#FFCD29' }])).toBe(true);
    expect(annotationCategories(editor)).toHaveLength(5);

    setAnnotationCategories(editor, DEFAULT_ANNOTATION_CATEGORIES);
    expect(annotationCategories(editor)).toHaveLength(4);
    expect((editor.doc.getOrThrow('0:0') as { annotationCategories?: unknown }).annotationCategories).toBeUndefined();
  });

  test('one whose layer is gone is dropped', () => {
    addAnnotation(editor, rect, 'Note');
    editor.history.run('delete', (tx) => tx.delete(rect));
    expect(pruneAnnotations(editor)).toBe(true);
    expect(annotationsFor(editor, rect)).toEqual([]);
  });
});
