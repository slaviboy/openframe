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
import { createEmptyDocument, keyOnTop, makeBooleanOperation, makeFrame, makeRectangle, makeText } from '@/core/document/factory';
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
        {
          type: 'GRADIENT_LINEAR',
          gradientStops: [
            { position: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
            { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } },
          ],
          gradientTransform: [1, 0, 0, 1, 0, 0],
          opacity: 1,
          visible: true,
          blendMode: 'MULTIPLY',
        },
        {
          type: 'GRADIENT_ANGULAR',
          gradientStops: [
            { position: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
            { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } },
          ],
          gradientTransform: [1, 0, 0, 1, 0, 0],
          opacity: 1,
          visible: true,
          blendMode: 'NORMAL',
        },
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

describe('the settings SVG carries of its own', () => {
  test('"Include id attribute" names each layer after itself, a repeated name being numbered', () => {
    const plain = exportSvg(editor.doc, frame)!.svg;
    expect(plain).not.toContain('id="Box"');
    editor.history.run('rename', (tx) => tx.set(frame, 'name', 'Box'));
    const withIds = exportSvg(editor.doc, frame, { idAttribute: true })!.svg;
    expect(withIds).toContain('id="Box"');
    expect(withIds).toContain('id="Box-1"');
  });

  test('"Simplify stroke" writes a plain stroke rather than asking for its outline', () => {
    editor.history.run('stroke', (tx) => {
      tx.set(box, 'strokes', [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }]);
      tx.set(box, 'strokeWeight', 4);
      tx.set(box, 'strokeAlign', 'CENTER');
    });
    // Without it, the stroke wants the area it covers, which only the rendering engine works out.
    expect(exportSvg(editor.doc, frame)!.skipped).toContain('Box: stroke');
    const simple = exportSvg(editor.doc, frame, { simplifyStroke: true })!;
    expect(simple.svg).toContain('stroke="#0000ff" stroke-width="4"');
    expect(simple.skipped).not.toContain('Box: stroke');
  });

  test('a stroke SVG would draw elsewhere is outlined even when simplifying', () => {
    editor.history.run('stroke', (tx) => {
      tx.set(box, 'strokes', [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }]);
      tx.set(box, 'strokeWeight', 4);
      // SVG strokes run along the middle of the path, so an inside stroke is not one of them.
      tx.set(box, 'strokeAlign', 'INSIDE');
    });
    const simple = exportSvg(editor.doc, frame, { simplifyStroke: true })!;
    expect(simple.svg).not.toContain('stroke-width');
    expect(simple.skipped).toContain('Box: stroke');
  });
});

describe('the parts of a drawing SVG can carry', () => {
  const solid = (r: number, g: number, b: number) => ({ type: 'SOLID' as const, color: { r, g, b, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' as const });

  test('text goes in as the outlines worked out for it, and is left out without them', () => {
    const label = editor.doc.children(frame)[1]!;
    expect(exportSvg(editor.doc, frame)!.skipped).toContain('Label: text');
    const outlined = exportSvg(editor.doc, frame, {
      textOutline: (node) => (node.id === label ? [{ op: 'M', x: 0, y: 0 }, { op: 'L', x: 10, y: 0 }, { op: 'L', x: 10, y: 10 }, { op: 'Z' }] : null),
    })!;
    expect(outlined.svg).toContain('M0 0L10 0L10 10Z');
    expect(outlined.skipped).not.toContain('Label: text');
  });

  test('a boolean group is drawn as the outline it combines to', () => {
    const id = editor.history.run('boolean', (tx) => {
      const b = editor.ids.next();
      tx.create(makeBooleanOperation({ id: b, parent: { id: frame, key: keyOnTop(tx.store, frame) }, name: 'Combined', x: 0, y: 0, width: 40, height: 40 }, 'UNION'));
      // A boolean group with nothing in it is taken out again when the change is committed.
      const part = editor.ids.next();
      tx.create(makeRectangle({ id: part, parent: { id: b, key: keyOnTop(tx.store, b) }, name: 'Part', x: 0, y: 0, width: 20, height: 20 }));
      return b;
    });
    expect(exportSvg(editor.doc, frame)!.skipped).toContain('Combined: boolean group');
    const combined = exportSvg(editor.doc, frame, {
      booleanOutline: (node) => (node.id === id ? [{ op: 'M', x: 0, y: 0 }, { op: 'L', x: 20, y: 0 }, { op: 'Z' }] : null),
    })!;
    expect(combined.svg).toContain('M0 0L20 0Z');
  });

  test('a mask covers the layers above it, as an SVG mask that reads their alpha', () => {
    editor.history.run('mask', (tx) => {
      tx.set(box, 'isMask', true);
      const over = editor.ids.next();
      tx.create(makeRectangle({ id: over, parent: { id: frame, key: keyOnTop(tx.store, frame) }, name: 'Over', x: 0, y: 0, width: 30, height: 30 }));
      tx.set(over, 'fills', [solid(0, 1, 0)]);
    });
    const masked = exportSvg(editor.doc, frame)!;
    expect(masked.svg).toContain('style="mask-type:alpha"');
    expect(masked.svg).toMatch(/<g mask="url\(#mask\d+\)">/);
    expect(masked.skipped).not.toContain('Box: mask');
  });

  test('a drop shadow and a layer blur become a filter; a second shadow is left out', () => {
    editor.history.run('effects', (tx) =>
      tx.set(box, 'effects', [
        { type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 4 }, radius: 8, spread: 0, visible: true, blendMode: 'NORMAL', showShadowBehindNode: false },
        { type: 'LAYER_BLUR', radius: 6, visible: true },
        { type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 2, y: 2 }, radius: 2, spread: 0, visible: true, blendMode: 'NORMAL', showShadowBehindNode: false },
      ]),
    );
    const result = exportSvg(editor.doc, frame)!;
    // SVG blurs by a standard deviation, which is half the radius the design carries.
    expect(result.svg).toContain('<feDropShadow dx="0" dy="4" stdDeviation="4"');
    expect(result.svg).toContain('<feGaussianBlur stdDeviation="3"/>');
    expect(result.skipped).toContain('Box: more than one shadow');
  });

  test('a per-side stroke is the ring it covers, without asking the engine for an outline', () => {
    editor.history.run('stroke', (tx) => {
      tx.set(box, 'strokes', [solid(0, 0, 1)]);
      tx.set(box, 'strokeWeight', 2);
      tx.set(box, 'strokeAlign', 'INSIDE');
      tx.set(box, 'individualStrokeWeights', { top: 4, right: 0, bottom: 0, left: 0 });
    });
    const result = exportSvg(editor.doc, frame)!;
    // The box is 50 x 40, so an inside top stroke of 4 is the box less the box from y = 4 down.
    expect(result.svg).toContain('M0 0L50 0L50 40L0 40ZM0 4L50 4L50 40L0 40Z');
    expect(result.svg).toContain('fill-rule="evenodd"');
    expect(result.skipped).not.toContain('Box: stroke');
  });

  test('an image fill is carried in the markup as a pattern of the stored file', () => {
    editor.history.run('image', (tx) => tx.set(box, 'fills', [{ type: 'IMAGE', imageHash: 'h1', scaleMode: 'FILL', opacity: 1, visible: true, blendMode: 'NORMAL' }]));
    expect(exportSvg(editor.doc, frame)!.skipped).toContain('Box: image fill');
    const embedded = exportSvg(editor.doc, frame, { image: () => ({ bytes: new Uint8Array([1, 2, 3, 4]), type: 'image/png', size: { width: 10, height: 10 } }) })!;
    expect(embedded.svg).toContain('<pattern id="image');
    expect(embedded.svg).toContain('href="data:image/png;base64,AQIDBA=="');
  });
});
