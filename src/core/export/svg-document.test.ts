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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle, makeText } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '@/editor/editor';
import { exportSvg, shapeOutline } from './svg-document';

let editor: Editor;
let frame: string;
let box: string;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  [frame, box] = editor.history.run('create', (tx) => {
    const page = editor.pageId;
    const f = editor.ids.next();
    tx.create(makeFrame({ id: f, parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Card <1>', x: 300, y: 300, width: 200, height: 100 }));
    tx.set(f, 'clipsContent', true);
    tx.set(f, 'fills', []);
    const r = editor.ids.next();
    tx.create(makeRectangle({ id: r, parent: { id: f, key: keyOnTop(tx.store, f) }, name: 'Box', x: 10, y: 20, width: 50, height: 40 }));
    tx.set(r, 'fills', [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }]);
    tx.set(r, 'opacity', 0.5);
    const t = editor.ids.next();
    tx.create(makeText({ id: t, parent: { id: f, key: keyOnTop(tx.store, f) }, name: 'Label', x: 0, y: 0, width: 80, height: 20 }));
    return [f, r];
  });
});

describe('SVG export', () => {
  test('a frame exports in its own space, clipping its children, which keep their transforms and opacity', () => {
    const result = exportSvg(editor.doc, frame)!;
    expect(result.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100" fill="none"><title>Card &lt;1&gt;</title>')).toBe(true);
    expect(result.svg).toContain('<clipPath id="clip');
    expect(result.svg).toContain('<g transform="matrix(1 0 0 1 10 20)" opacity="0.5"><path d="M0 20L0 0L50 0L50 40L0 40Z" fill="#ff0000"/></g>');
    expect(result.skipped).toEqual(['Label: text']);
  });

  test('gradients are definitions; unsupported paints and strokes without an outline are listed; hidden layers are left out', () => {
    editor.history.run('paints', (tx) => {
      tx.set(box, 'fills', [
        { type: 'GRADIENT_LINEAR', gradientStops: [{ position: 0, color: { r: 0, g: 0, b: 0, a: 1 } }, { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } }], gradientTransform: [1, 0, 0, 1, 0, 0], opacity: 1, visible: true, blendMode: 'MULTIPLY' },
        { type: 'GRADIENT_ANGULAR', gradientStops: [{ position: 0, color: { r: 0, g: 0, b: 0, a: 1 } }, { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } }], gradientTransform: [1, 0, 0, 1, 0, 0], opacity: 1, visible: true, blendMode: 'NORMAL' },
      ]);
      tx.set(box, 'strokes', [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }]);
      tx.set(box, 'strokeWeight', 2);
    });
    const withoutEngine = exportSvg(editor.doc, frame)!;
    expect(withoutEngine.svg).toContain('<defs><linearGradient id="paint0"');
    expect(withoutEngine.svg).toContain('fill="url(#paint0)" style="mix-blend-mode:multiply"');
    expect(withoutEngine.skipped).toEqual(['Box: angular gradient', 'Box: stroke', 'Label: text']);

    const outlined = exportSvg(editor.doc, frame, { strokeOutline: () => [{ op: 'M', x: 0, y: 0 }, { op: 'L', x: 50, y: 0 }, { op: 'Z' }] })!;
    expect(outlined.svg).toContain('<path d="M0 0L50 0Z" fill="#000000"/>');

    editor.history.run('hide', (tx) => tx.set(box, 'visible', false));
    expect(exportSvg(editor.doc, frame)!.svg).not.toContain('matrix(1 0 0 1 10 20)');
  });

  test('shape outlines follow corner radii', () => {
    editor.history.run('radius', (tx) => tx.set(box, 'cornerRadius', 5));
    const commands = shapeOutline(editor.doc.getOrThrow(box) as SceneNode)!;
    expect(commands[0]).toEqual({ op: 'M', x: 0, y: 20 });
    expect(commands.filter((c) => c.op === 'C').length).toBeGreaterThan(0);
    expect(commands.at(-1)).toEqual({ op: 'Z' });
  });
});
