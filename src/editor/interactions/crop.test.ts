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
import { createEmptyDocument, keyOnTop, makeEllipse, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { imagePlacement } from '@/core/image/image-fit';
import { imagePaintFor } from '@/core/image/image-paint';
import { apply } from '@/core/math/matrix';
import type { Vec2 } from '@/core/math/vec';
import type { ImagePaint, RectangleNode } from '@/core/schema/document';
import { BUILTIN_COMMANDS } from '../commands/builtin';
import { Editor } from '../editor';
import { ToolManager } from '../tools/tool-manager';
import type { PointerInfo } from '../tools/types';
import { beginCrop, cropImageWorldQuad } from './crop';

let editor: Editor;
let tools: ToolManager;
let rect: string;
const image = { hash: 'a'.repeat(64), width: 200, height: 100 };

const sample = (x: number, y: number): Omit<PointerInfo, 'world'> => ({
  screen: { x, y },
  button: 0,
  shift: false,
  alt: false,
  mod: false,
  ctrl: false,
  pointerType: 'mouse',
  pressure: 0.5,
  clickCount: 1,
});

function drag(from: Vec2, to: Vec2): void {
  tools.pointerDown(sample(from.x, from.y));
  tools.pointerMove(sample((from.x + to.x) / 2, (from.y + to.y) / 2));
  tools.pointerMove(sample(to.x, to.y));
  tools.pointerUp(sample(to.x, to.y));
}

const node = () => editor.doc.getOrThrow(rect) as RectangleNode;
const paint = () => node().fills[0] as ImagePaint;
/** Where an image pixel lands on the canvas. */
const imageToWorld = (p: Vec2) => {
  editor.scene.ensure(editor.pageId);
  return apply(editor.scene.worldTransform(rect), apply(imagePlacement(paint(), image, node().size)!.matrix, p));
};

beforeEach(() => {
  const ids = new IdGenerator('k');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.state.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
  rect = editor.history.run('seed', (tx) => {
    const id = editor.ids.next();
    const r = makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'R', x: 0, y: 0, width: 100, height: 100 });
    tx.create({ ...r, fills: [imagePaintFor(image)] });
    return id;
  });
});

describe('crop mode', () => {
  test('starting a crop switches the fill to CROP without moving the image', () => {
    expect(imageToWorld({ x: 0, y: 0 })).toEqual({ x: -50, y: 0 });
    expect(beginCrop(editor, rect)).toBe(true);
    expect(editor.state.getSnapshot().croppingId).toBe(rect);
    expect(paint().scaleMode).toBe('CROP');
    const corner = imageToWorld({ x: 0, y: 0 });
    expect(corner.x).toBeCloseTo(-50);
    expect(corner.y).toBeCloseTo(0);
    expect(cropImageWorldQuad(editor)![2]!.x).toBeCloseTo(150);
    // Layers without an image cannot be cropped.
    const ellipse = editor.history.run('e', (tx) => {
      const id = editor.ids.next();
      tx.create(makeEllipse({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'E', x: 300, y: 0, width: 10, height: 10 }));
      return id;
    });
    expect(beginCrop(editor, ellipse)).toBe(false);
  });

  test('dragging crop edges resizes the layer while the image stays in place, in one undo step', () => {
    beginCrop(editor, rect);
    drag({ x: 100, y: 50 }, { x: 60, y: 50 });
    expect(node().size).toEqual({ width: 60, height: 100 });
    drag({ x: 0, y: 50 }, { x: 30, y: 50 });
    expect(node().size).toEqual({ width: 30, height: 100 });
    expect(node().transform[4]).toBe(30);
    const corner = imageToWorld({ x: 0, y: 0 });
    expect(corner.x).toBeCloseTo(-50);
    expect(imageToWorld({ x: 200, y: 100 }).x).toBeCloseTo(150);
    editor.history.undo();
    expect(node().size.width).toBe(60);
    expect(node().transform[4]).toBe(0);
  });

  test('dragging inside moves the image; dragging an image corner scales it about the opposite corner', () => {
    beginCrop(editor, rect);
    drag({ x: 50, y: 50 }, { x: 60, y: 45 });
    expect(imageToWorld({ x: 0, y: 0 }).x).toBeCloseTo(-40);
    expect(imageToWorld({ x: 0, y: 0 }).y).toBeCloseTo(-5);
    expect(node().size).toEqual({ width: 100, height: 100 });
    // Corners are now (-40,-5) … (160,95); pull the bottom-right corner out by 1.5×.
    drag({ x: 160, y: 95 }, { x: 260, y: 145 });
    const se = imageToWorld({ x: 200, y: 100 });
    expect(se.x).toBeCloseTo(260);
    expect(se.y).toBeCloseTo(145);
    expect(imageToWorld({ x: 0, y: 0 }).x).toBeCloseTo(-40);
  });

  test('Return, Escape, clicking elsewhere or selecting another layer applies the crop', () => {
    beginCrop(editor, rect);
    expect(editor.commands.run('image.applyCrop')).toBe(true);
    expect(editor.state.getSnapshot().croppingId).toBeNull();
    beginCrop(editor, rect);
    expect(tools.cancel()).toBe(true);
    expect(editor.state.getSnapshot().croppingId).toBeNull();
    beginCrop(editor, rect);
    tools.pointerDown(sample(600, 600));
    tools.pointerUp(sample(600, 600));
    expect(editor.state.getSnapshot().croppingId).toBeNull();
    beginCrop(editor, rect);
    editor.state.clearSelection();
    expect(editor.state.getSnapshot().croppingId).toBeNull();
    expect(paint().scaleMode).toBe('CROP');
  });
});
