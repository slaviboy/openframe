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

import { pointInPolygon } from '@/core/geometry/shapes';
import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import { cropTransformFor, imageQuad, keepImageInPlace, moveImage, scaleImageAbout, toCropPaint } from '@/core/image/crop';
import { imagePlacement } from '@/core/image/image-fit';
import { apply, invert, multiply, translation, type Matrix } from '@/core/math/matrix';
import type { Vec2 } from '@/core/math/vec';
import { matrixOf } from '@/core/scene/scene-index';
import { hasGeometry, isSceneNode, type ImagePaint, type SceneNode, type Size } from '@/core/schema/document';
import { handleCursor, hitHandle, selectionFrame } from '../chrome/selection-geometry';
import type { Editor } from '../editor';
import type { ToolId } from '../stores/editor-store';
import type { CursorKind, PointerInfo, Tool } from '../tools/types';
import { worldToScreen } from '../viewport/viewport';
import { HANDLE_AXES, toTransform, type HandleId } from './transform';

type CroppableNode = Exclude<Extract<SceneNode, { fills: readonly unknown[] }>, { type: 'LINE' }>;

/** The image fill being cropped: the layer, the paint's index in `fills`, the paint and its image size. */
export interface CropTarget {
  readonly node: CroppableNode;
  readonly index: number;
  readonly paint: ImagePaint;
  readonly image: Size;
}

/** The topmost visible image fill of a layer that has an image (or the fill at `index`), or null. */
export function cropTarget(editor: Editor, id: Id, index?: number): CropTarget | null {
  const node = editor.doc.get(id);
  if (!node || !isSceneNode(node) || !hasGeometry(node) || node.type === 'LINE') return null;
  const fills = node.fills;
  const indices = index === undefined ? fills.map((_, i) => fills.length - 1 - i) : [index];
  for (const i of indices) {
    const paint = fills[i];
    if (paint?.type === 'IMAGE' && paint.visible && paint.imageHash && paint.imageSize) return { node, index: i, paint, image: paint.imageSize };
  }
  return null;
}

function setPaint(tx: Transaction, target: CropTarget, paint: ImagePaint): void {
  const current = tx.store.getOrThrow(target.node.id) as CroppableNode;
  tx.set(target.node.id, 'fills', current.fills.map((p, i) => (i === target.index ? paint : p)));
}

/**
 * Enters crop mode for a layer's image fill. The paint switches to CROP (as its own undo step)
 * without moving the image, and the layer becomes the only selection.
 */
export function beginCrop(editor: Editor, id: Id, index?: number): boolean {
  const target = cropTarget(editor, id, index);
  if (!target) return false;
  if (target.paint.scaleMode !== 'CROP') {
    editor.history.run('Crop image', (tx) => setPaint(tx, target, toCropPaint(target.paint, target.image, target.node.size)));
  }
  editor.state.select([id]);
  editor.state.setCropping(id);
  editor.requestRender();
  return true;
}

/** Leaves crop mode, keeping the crop. */
export function endCrop(editor: Editor): boolean {
  if (editor.state.getSnapshot().croppingId === null) return false;
  editor.state.setCropping(null);
  editor.requestRender();
  return true;
}

/** Image pixels → layer coordinates of the cropped paint. */
function cropMatrix(target: CropTarget): Matrix | null {
  return imagePlacement(target.paint, target.image, target.node.size)?.matrix ?? null;
}

/** World-space corners (nw, ne, se, sw) of the whole image of the layer being cropped, for chrome. */
export function cropImageWorldQuad(editor: Editor): Vec2[] | null {
  const id = editor.state.getSnapshot().croppingId;
  const target = id ? cropTarget(editor, id) : null;
  const m = target && cropMatrix(target);
  if (!target || !m) return null;
  editor.scene.ensure(editor.pageId);
  const world = editor.scene.worldTransform(target.node.id);
  return imageQuad(m, target.image).map((p) => apply(world, p));
}

type CropHit = { kind: 'box'; handle: HandleId } | { kind: 'scale'; corner: number } | { kind: 'move' };

interface CropGesture {
  readonly hit: CropHit;
  readonly tx: Transaction;
  readonly target: CropTarget;
  /** Layer transform (parent space) and size at the start. */
  readonly transform: Matrix;
  readonly size: Size;
  /** Image placement at the start. */
  readonly matrix: Matrix;
  /** World → layer coordinates at the start. */
  readonly toLocal: Matrix;
  readonly down: Vec2;
  readonly cursor: CursorKind;
  moved: boolean;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Pointer handling in crop mode (routed by the ToolManager while `croppingId` is set):
 * - the layer's handles move the crop edges; the image stays where it is on the canvas
 * - the image's corner handles scale the image about the opposite corner
 * - dragging inside the image or the crop moves the image
 * - clicking anywhere else applies the crop
 */
export class CropController implements Tool {
  readonly id: ToolId = 'move';
  private gesture: CropGesture | null = null;
  private hoverCursor: CursorKind = 'default';

  constructor(
    private readonly editor: Editor,
    private readonly tolerancePx: number,
  ) {}

  get active(): boolean {
    return this.gesture !== null;
  }

  cursor(): CursorKind {
    return this.gesture?.cursor ?? this.hoverCursor;
  }

  private hit(p: PointerInfo): CropHit | null {
    const { editor } = this;
    const id = editor.state.getSnapshot().croppingId;
    if (!id || !cropTarget(editor, id)) return null;
    const frame = selectionFrame(editor, [id]);
    const handle = frame && hitHandle(editor, frame, p.screen, this.tolerancePx);
    if (handle) return { kind: 'box', handle };
    const quad = cropImageWorldQuad(editor);
    if (!quad) return null;
    const v = editor.state.viewport;
    for (let i = 0; i < 4; i++) {
      const s = worldToScreen(v, quad[i]!);
      if (Math.hypot(s.x - p.screen.x, s.y - p.screen.y) <= this.tolerancePx + 2) return { kind: 'scale', corner: i };
    }
    const local = frame ? apply(invert(frame.toWorld) ?? frame.toWorld, p.world) : null;
    const insideBox = frame && local && local.x >= 0 && local.y >= 0 && local.x <= frame.width && local.y <= frame.height;
    return insideBox || pointInPolygon(p.world, quad) ? { kind: 'move' } : null;
  }

  pointerDown(p: PointerInfo): void {
    const { editor } = this;
    editor.scene.ensure(editor.pageId);
    const hit = p.button === 0 ? this.hit(p) : null;
    const id = editor.state.getSnapshot().croppingId;
    const target = id ? cropTarget(editor, id) : null;
    const matrix = target && cropMatrix(target);
    const toLocal = target && invert(editor.scene.worldTransform(target.node.id));
    if (!hit || !target || !matrix || !toLocal) {
      endCrop(editor);
      return;
    }
    const cursor: CursorKind =
      hit.kind === 'box' ? handleCursor(selectionFrame(editor, [target.node.id])!, hit.handle) : hit.kind === 'scale' ? 'nwse-resize' : 'move';
    this.gesture = {
      hit,
      tx: editor.history.begin('Crop image'),
      target,
      transform: matrixOf(target.node.transform),
      size: target.node.size,
      matrix,
      toLocal,
      down: apply(toLocal, p.world),
      cursor,
      moved: false,
    };
  }

  pointerMove(p: PointerInfo): void {
    const g = this.gesture;
    if (!g) {
      const hit = this.hit(p);
      const frame = this.editor.state.getSnapshot().croppingId ? selectionFrame(this.editor, [this.editor.state.getSnapshot().croppingId!]) : null;
      this.hoverCursor = !hit ? 'default' : hit.kind === 'box' && frame ? handleCursor(frame, hit.handle) : hit.kind === 'scale' ? 'nwse-resize' : 'move';
      return;
    }
    g.moved = true;
    const local = apply(g.toLocal, p.world);
    const { width, height } = g.size;
    let transform = g.transform;
    let size = g.size;
    let matrix: Matrix;
    if (g.hit.kind === 'box') {
      const [ax, ay] = HANDLE_AXES[g.hit.handle];
      let x0 = 0;
      let y0 = 0;
      let x1 = width;
      let y1 = height;
      if (ax < 0) x0 = round2(Math.min(local.x, width - 1));
      if (ax > 0) x1 = round2(Math.max(local.x, 1));
      if (ay < 0) y0 = round2(Math.min(local.y, height - 1));
      if (ay > 0) y1 = round2(Math.max(local.y, 1));
      size = { width: round2(x1 - x0), height: round2(y1 - y0) };
      transform = multiply(g.transform, translation(x0, y0));
      matrix = keepImageInPlace(g.matrix, translation(-x0, -y0));
    } else if (g.hit.kind === 'move') {
      matrix = moveImage(g.matrix, { x: local.x - g.down.x, y: local.y - g.down.y });
    } else {
      const quad = imageQuad(g.matrix, g.target.image);
      const fixed = quad[(g.hit.corner + 2) % 4]!;
      const start = quad[g.hit.corner]!;
      const d = { x: start.x - fixed.x, y: start.y - fixed.y };
      const factor = Math.max(0.01, ((local.x - fixed.x) * d.x + (local.y - fixed.y) * d.y) / (d.x * d.x + d.y * d.y || 1));
      matrix = scaleImageAbout(g.matrix, factor, fixed);
    }
    const imageTransform = cropTransformFor(matrix, g.target.image, size);
    if (!imageTransform) return;
    const id = g.target.node.id;
    if (transform !== g.transform) g.tx.set(id, 'transform', toTransform(transform));
    if (size !== g.size) g.tx.set(id, 'size', size);
    setPaint(g.tx, g.target, { ...g.target.paint, imageTransform });
    g.tx.flushPreview();
    this.editor.requestRender();
  }

  pointerUp(p: PointerInfo): void {
    const g = this.gesture;
    if (!g) return;
    if (p.world) this.pointerMove(p);
    this.gesture = null;
    if (g.moved) this.editor.history.commit(g.tx);
    else this.editor.history.cancel(g.tx);
  }

  /** Escape: abandons a drag in progress, otherwise applies the crop. */
  cancel(): boolean {
    if (this.gesture) {
      this.editor.history.cancel(this.gesture.tx);
      this.gesture = null;
      return true;
    }
    return endCrop(this.editor);
  }
}
