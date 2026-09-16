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

import { distanceToSegment, pointInPolygon } from '@/core/geometry/shapes';
import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import {
  aspectCropBox,
  cropAspectRatio,
  cropTransformFor,
  fitCropBox,
  imageCenter,
  imageQuad,
  keepImageInPlace,
  moveImage,
  rotateImageAbout,
  scaleImageAbout,
  scaleImageAxes,
  toCropPaint,
  type CropAspect,
  type CropBox,
} from '@/core/image/crop';
import { imagePlacement } from '@/core/image/image-fit';
import { apply, invert, multiply, rotationOf, translation, type Matrix } from '@/core/math/matrix';
import type { Vec2 } from '@/core/math/vec';
import { matrixOf } from '@/core/scene/scene-index';
import { hasGeometry, isSceneNode, type ImagePaint, type SceneNode, type Size, type VideoPaint } from '@/core/schema/document';
import { handleCursor, hitHandle, selectionFrame } from '../chrome/selection-geometry';
import type { Editor } from '../editor';
import type { ToolId } from '../stores/editor-store';
import type { CursorKind, ModifierState, PointerInfo, Tool } from '../tools/types';
import { worldToScreen } from '../viewport/viewport';
import { HANDLE_AXES, toTransform, type HandleId } from './transform';

type CroppableNode = Exclude<Extract<SceneNode, { fills: readonly unknown[] }>, { type: 'LINE' }>;

/** The image fill being cropped: the layer, the paint's index in `fills`, the paint and its image size. */
export interface CropTarget {
  readonly node: CroppableNode;
  readonly index: number;
  /** The image or video fill being cropped (a video crops like the frames it draws). */
  readonly paint: ImagePaint | VideoPaint;
  readonly image: Size;
}

/** The topmost visible image or video fill of a layer that has one (or the fill at `index`), or null. */
export function cropTarget(editor: Editor, id: Id, index?: number): CropTarget | null {
  const node = editor.doc.get(id);
  if (!node || !isSceneNode(node) || !hasGeometry(node) || node.type === 'LINE') return null;
  const fills = node.fills;
  const indices = index === undefined ? fills.map((_, i) => fills.length - 1 - i) : [index];
  for (const i of indices) {
    const paint = fills[i];
    if (paint?.type === 'IMAGE' && paint.visible && paint.imageHash && paint.imageSize) return { node, index: i, paint, image: paint.imageSize };
    if (paint?.type === 'VIDEO' && paint.visible && paint.imageSize) return { node, index: i, paint, image: paint.imageSize };
  }
  return null;
}

function setPaint(tx: Transaction, target: CropTarget, paint: ImagePaint | VideoPaint): void {
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
    editor.history.run(target.paint.type === 'VIDEO' ? 'Crop video' : 'Crop image', (tx) => setPaint(tx, target, toCropPaint(target.paint, target.image, target.node.size)));
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

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Moves the crop box to `box` (layer coordinates) while the image stays where it is on the canvas. */
function setCropBox(tx: Transaction, target: CropTarget, transform: Matrix, matrix: Matrix, box: CropBox): void {
  const size = { width: round2(box.width), height: round2(box.height) };
  const x = round2(box.x);
  const y = round2(box.y);
  const imageTransform = cropTransformFor(keepImageInPlace(matrix, translation(-x, -y)), target.image, size);
  if (!imageTransform) return;
  tx.set(target.node.id, 'transform', toTransform(multiply(transform, translation(x, y))));
  tx.set(target.node.id, 'size', size);
  setPaint(tx, target, { ...target.paint, imageTransform });
}

/**
 * Picks a crop aspect ratio. A fixed ratio reshapes the crop box to the largest box of that ratio
 * centered in the current one (one undo step) and keeps it while the box handles are dragged.
 */
export function setCropAspect(editor: Editor, aspect: CropAspect): void {
  editor.state.setCropAspect(aspect);
  const id = editor.state.getSnapshot().croppingId;
  const target = id ? cropTarget(editor, id) : null;
  const matrix = target && cropMatrix(target);
  const ratio = target && cropAspectRatio(aspect, target.image);
  if (!target || !matrix || !ratio) return;
  editor.history.run('Crop aspect ratio', (tx) => setCropBox(tx, target, matrixOf(target.node.transform), matrix, aspectCropBox(target.node.size, ratio)));
  editor.requestRender();
}

/** Resize to fit: the crop box grows or shrinks to show the whole image. */
export function resizeCropToFit(editor: Editor): void {
  const id = editor.state.getSnapshot().croppingId;
  const target = id ? cropTarget(editor, id) : null;
  const matrix = target && cropMatrix(target);
  if (!target || !matrix) return;
  editor.state.setCropAspect('FREE');
  editor.history.run('Resize to fit', (tx) => setCropBox(tx, target, matrixOf(target.node.transform), matrix, fitCropBox(matrix, target.image)));
  editor.requestRender();
}

type CropHit =
  | { kind: 'box'; handle: HandleId }
  | { kind: 'scale'; corner: number }
  | { kind: 'edge'; edge: number }
  | { kind: 'rotate'; corner: number }
  | { kind: 'move' };

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
  last: PointerInfo;
  moved: boolean;
}

/** How far outside an image corner the rotate zone reaches, in screen pixels. */
const ROTATE_ZONE_PX = 18;
const ROTATE_CURSORS: readonly CursorKind[] = ['rotate-nw', 'rotate-ne', 'rotate-se', 'rotate-sw'];
const EDGE_CURSORS: readonly CursorKind[] = ['ns-resize', 'ew-resize', 'ns-resize', 'ew-resize'];

/**
 * Pointer handling in crop mode (routed by the ToolManager while `croppingId` is set):
 * - the layer's handles move the crop edges while the image stays put; ⌥ moves the opposite edge
 *   too, and a fixed crop aspect ratio keeps the box's proportions
 * - the image's corners scale it about the opposite corner, and its edges about the opposite edge;
 *   both keep the image's aspect ratio unless Control is held
 * - just outside an image corner, dragging rotates the image about its center (⇧: 15° steps)
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
    const screen = quad.map((q) => worldToScreen(v, q));
    for (let i = 0; i < 4; i++) {
      const s = screen[i]!;
      if (Math.hypot(s.x - p.screen.x, s.y - p.screen.y) <= this.tolerancePx + 2) return { kind: 'scale', corner: i };
    }
    for (let i = 0; i < 4; i++) {
      if (distanceToSegment(p.screen, screen[i]!, screen[(i + 1) % 4]!) <= this.tolerancePx / 2 + 1) return { kind: 'edge', edge: i };
    }
    const local = frame ? apply(invert(frame.toWorld) ?? frame.toWorld, p.world) : null;
    const insideBox = frame && local && local.x >= 0 && local.y >= 0 && local.x <= frame.width && local.y <= frame.height;
    if (insideBox || pointInPolygon(p.world, quad)) return { kind: 'move' };
    for (let i = 0; i < 4; i++) {
      const s = screen[i]!;
      if (Math.hypot(s.x - p.screen.x, s.y - p.screen.y) <= ROTATE_ZONE_PX) return { kind: 'rotate', corner: i };
    }
    return null;
  }

  private cursorFor(hit: CropHit | null): CursorKind {
    if (!hit) return 'default';
    switch (hit.kind) {
      case 'box': {
        const id = this.editor.state.getSnapshot().croppingId;
        const frame = id ? selectionFrame(this.editor, [id]) : null;
        return frame ? handleCursor(frame, hit.handle) : 'default';
      }
      case 'scale':
        return hit.corner % 2 === 0 ? 'nwse-resize' : 'nesw-resize';
      case 'edge':
        return EDGE_CURSORS[hit.edge]!;
      case 'rotate':
        return ROTATE_CURSORS[hit.corner]!;
      case 'move':
        return 'move';
    }
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
    this.gesture = {
      hit,
      tx: editor.history.begin(hit.kind === 'rotate' ? 'Rotate image' : 'Crop image'),
      target,
      transform: matrixOf(target.node.transform),
      size: target.node.size,
      matrix,
      toLocal,
      down: apply(toLocal, p.world),
      cursor: this.cursorFor(hit),
      last: p,
      moved: false,
    };
  }

  pointerMove(p: PointerInfo): void {
    const g = this.gesture;
    if (!g) {
      this.hoverCursor = this.cursorFor(this.hit(p));
      return;
    }
    g.moved = true;
    g.last = p;
    this.apply(g, p);
  }

  modifiersChanged(m: ModifierState): void {
    const g = this.gesture;
    if (!g || !g.moved) return;
    g.last = { ...g.last, ...m };
    this.apply(g, g.last);
  }

  private apply(g: CropGesture, p: PointerInfo): void {
    const local = apply(g.toLocal, p.world);
    const image = g.target.image;
    if (g.hit.kind === 'box') {
      this.applyBox(g, g.hit.handle, local, p.alt);
      return;
    }
    let matrix: Matrix;
    if (g.hit.kind === 'move') {
      matrix = moveImage(g.matrix, { x: local.x - g.down.x, y: local.y - g.down.y });
    } else if (g.hit.kind === 'rotate') {
      const pivot = imageCenter(g.matrix, image);
      let delta = Math.atan2(local.y - pivot.y, local.x - pivot.x) - Math.atan2(g.down.y - pivot.y, g.down.x - pivot.x);
      if (p.shift) {
        const step = Math.PI / 12;
        const start = rotationOf(g.matrix);
        delta = Math.round((start + delta) / step) * step - start;
      }
      matrix = rotateImageAbout(g.matrix, delta, pivot);
    } else {
      // Pointer in image pixels (at the start of the drag).
      const inverse = invert(g.matrix);
      if (!inverse) return;
      const q = apply(inverse, local);
      const { width: iw, height: ih } = image;
      if (g.hit.kind === 'scale') {
        const corners = [
          { x: 0, y: 0 },
          { x: iw, y: 0 },
          { x: iw, y: ih },
          { x: 0, y: ih },
        ];
        const start = corners[g.hit.corner]!;
        const fixed = corners[(g.hit.corner + 2) % 4]!;
        const sx = Math.max(0.01, (q.x - fixed.x) / (start.x - fixed.x));
        const sy = Math.max(0.01, (q.y - fixed.y) / (start.y - fixed.y));
        if (p.ctrl) {
          matrix = scaleImageAxes(g.matrix, sx, sy, fixed);
        } else {
          const quad = imageQuad(g.matrix, image);
          const fixedLayer = quad[(g.hit.corner + 2) % 4]!;
          const startLayer = quad[g.hit.corner]!;
          const d = { x: startLayer.x - fixedLayer.x, y: startLayer.y - fixedLayer.y };
          const factor = Math.max(0.01, ((local.x - fixedLayer.x) * d.x + (local.y - fixedLayer.y) * d.y) / (d.x * d.x + d.y * d.y || 1));
          matrix = scaleImageAbout(g.matrix, factor, fixedLayer);
        }
      } else {
        // Edges: 0 top, 1 right, 2 bottom, 3 left; the opposite edge stays fixed.
        const edge = g.hit.edge;
        const horizontal = edge === 1 || edge === 3;
        const factor = Math.max(0.01, edge === 0 ? (ih - q.y) / ih : edge === 1 ? q.x / iw : edge === 2 ? q.y / ih : (iw - q.x) / iw);
        const fixed = edge === 0 ? { x: iw / 2, y: ih } : edge === 1 ? { x: 0, y: ih / 2 } : edge === 2 ? { x: iw / 2, y: 0 } : { x: iw, y: ih / 2 };
        matrix = p.ctrl ? scaleImageAxes(g.matrix, horizontal ? factor : 1, horizontal ? 1 : factor, fixed) : scaleImageAxes(g.matrix, factor, factor, fixed);
      }
    }
    const imageTransform = cropTransformFor(matrix, image, g.size);
    if (!imageTransform) return;
    setPaint(g.tx, g.target, { ...g.target.paint, imageTransform });
    g.tx.flushPreview();
    this.editor.requestRender();
  }

  /** Moves crop edges: ⌥ mirrors the opposite edge, a fixed aspect ratio keeps the box's proportions. */
  private applyBox(g: CropGesture, handle: HandleId, local: Vec2, symmetric: boolean): void {
    const { width, height } = g.size;
    const [ax, ay] = HANDLE_AXES[handle];
    let x0 = 0;
    let y0 = 0;
    let x1 = width;
    let y1 = height;
    if (ax < 0) x0 = Math.min(local.x, symmetric ? width / 2 - 0.5 : width - 1);
    if (ax > 0) x1 = Math.max(local.x, symmetric ? width / 2 + 0.5 : 1);
    if (ay < 0) y0 = Math.min(local.y, symmetric ? height / 2 - 0.5 : height - 1);
    if (ay > 0) y1 = Math.max(local.y, symmetric ? height / 2 + 0.5 : 1);
    if (symmetric) {
      if (ax < 0) x1 = width - x0;
      if (ax > 0) x0 = width - x1;
      if (ay < 0) y1 = height - y0;
      if (ay > 0) y0 = height - y1;
    }
    const ratio = cropAspectRatio(this.editor.state.getSnapshot().cropAspect, g.target.image);
    if (ratio) {
      let w = x1 - x0;
      let h = y1 - y0;
      if (ax !== 0 && ay !== 0) {
        if (w / ratio > h) h = w / ratio;
        else w = h * ratio;
      } else if (ax !== 0) {
        h = w / ratio;
      } else {
        w = h * ratio;
      }
      // Anchor: the opposite corner or edge's middle, or the center with ⌥.
      const cx = symmetric || ax === 0 ? (x0 + x1) / 2 : ax < 0 ? x1 : x0;
      const cy = symmetric || ay === 0 ? (y0 + y1) / 2 : ay < 0 ? y1 : y0;
      x0 = symmetric || ax === 0 ? cx - w / 2 : ax < 0 ? cx - w : cx;
      y0 = symmetric || ay === 0 ? cy - h / 2 : ay < 0 ? cy - h : cy;
      x1 = x0 + w;
      y1 = y0 + h;
    }
    setCropBox(g.tx, g.target, g.transform, g.matrix, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    g.tx.flushPreview();
    this.editor.requestRender();
  }

  pointerUp(p: PointerInfo): void {
    const g = this.gesture;
    if (!g) return;
    if (p.world && g.moved) this.pointerMove(p);
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
