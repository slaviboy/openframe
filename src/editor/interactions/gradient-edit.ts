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

import { gradientHandles, gradientTransformFromHandles, positionOnGradient, stopPoint, type GradientHandles } from '@/core/color/gradient-handles';
import { colorAt, updateStop } from '@/core/color/paints';
import { distanceToSegment } from '@/core/geometry/shapes';
import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import { apply, invert, type Matrix } from '@/core/math/matrix';
import type { Vec2 } from '@/core/math/vec';
import { hasGeometry, isGradientPaint, isSceneNode, type Color, type GradientPaint, type SceneNode, type Size } from '@/core/schema/document';
import type { Editor } from '../editor';
import type { ToolId } from '../stores/editor-store';
import type { CursorKind, PointerInfo, Tool } from '../tools/types';
import { worldToScreen } from '../viewport/viewport';

type GeometryNode = Extract<SceneNode, { fills: readonly unknown[] }>;

export interface GradientEditTarget {
  readonly node: GeometryNode;
  readonly field: 'fills' | 'strokes';
  readonly index: number;
  readonly paint: GradientPaint;
}

/** The gradient paint being edited, if it still exists and is a gradient. */
export function gradientEditTarget(editor: Editor): GradientEditTarget | null {
  const edit = editor.state.getSnapshot().gradientEdit;
  const node = edit ? editor.doc.get(edit.nodeId) : undefined;
  if (!edit || !node || !isSceneNode(node) || !hasGeometry(node)) return null;
  const paint = node[edit.field][edit.index];
  return paint && isGradientPaint(paint) ? { node, field: edit.field, index: edit.index, paint } : null;
}

/** Starts on-canvas editing of a layer's gradient fill or stroke (the layer becomes the selection). */
export function beginGradientEdit(editor: Editor, nodeId: Id, field: 'fills' | 'strokes', index: number): boolean {
  editor.state.select([nodeId]);
  editor.state.setGradientEdit({ nodeId, field, index });
  if (!gradientEditTarget(editor)) {
    editor.state.setGradientEdit(null);
    return false;
  }
  editor.requestRender();
  return true;
}

export function endGradientEdit(editor: Editor): boolean {
  if (!editor.state.getSnapshot().gradientEdit) return false;
  editor.state.setGradientEdit(null);
  editor.requestRender();
  return true;
}

/** The layer box a gradient is mapped onto (lines use the stroke weight as height, like the renderer). */
const paintSize = (node: GeometryNode): Size => (node.type === 'LINE' ? { width: node.size.width, height: Math.max(node.strokeWeight, 1) } : node.size);

export interface GradientChrome {
  readonly linear: boolean;
  readonly start: Vec2;
  readonly end: Vec2;
  readonly width: Vec2;
  readonly stops: readonly { readonly point: Vec2; readonly color: Color }[];
}

/** World-space handles and stops of the gradient being edited, for the overlay. */
export function gradientEditChrome(editor: Editor): GradientChrome | null {
  const target = gradientEditTarget(editor);
  if (!target) return null;
  editor.scene.ensure(editor.pageId);
  const world = editor.scene.worldTransform(target.node.id);
  const handles = gradientHandles(target.paint, paintSize(target.node));
  const toWorld = (p: Vec2) => apply(world, p);
  return {
    linear: target.paint.type === 'GRADIENT_LINEAR',
    start: toWorld(handles.start),
    end: toWorld(handles.end),
    width: toWorld(handles.width),
    stops: [...target.paint.gradientStops].sort((a, b) => a.position - b.position).map((s) => ({ point: toWorld(stopPoint(handles, s.position)), color: s.color })),
  };
}

type Handle = 'start' | 'end' | 'width';
type GradientHit = { kind: 'handle'; handle: Handle } | { kind: 'stop'; index: number } | { kind: 'line'; position: number };

interface GradientGesture {
  readonly hit: GradientHit;
  readonly tx: Transaction;
  readonly target: GradientEditTarget;
  readonly handles: GradientHandles;
  readonly toLocal: Matrix;
  readonly down: Vec2;
  moved: boolean;
}

function setPaint(tx: Transaction, target: GradientEditTarget, paint: GradientPaint): void {
  const current = tx.store.getOrThrow(target.node.id) as GeometryNode;
  tx.set(target.node.id, target.field, current[target.field].map((p, i) => (i === target.index ? paint : p)));
}

/**
 * Pointer handling while a gradient is edited on the canvas (routed by the ToolManager):
 * - dragging the start or end handle moves that end of the gradient (the center of a radial,
 *   angular or diamond gradient moves the whole gradient; its width handle sets the other axis)
 * - dragging a stop moves it along the gradient; clicking the gradient line adds a stop there
 * - clicking elsewhere, Escape or selecting another layer stops editing
 */
export class GradientEditController implements Tool {
  readonly id: ToolId = 'move';
  private gesture: GradientGesture | null = null;
  private hoverCursor: CursorKind = 'default';

  constructor(
    private readonly editor: Editor,
    private readonly tolerancePx: number,
  ) {}

  get active(): boolean {
    return this.gesture !== null;
  }

  cursor(): CursorKind {
    return this.gesture ? 'move' : this.hoverCursor;
  }

  private hit(p: PointerInfo): GradientHit | null {
    const chrome = gradientEditChrome(this.editor);
    if (!chrome) return null;
    const v = this.editor.state.viewport;
    const near = (world: Vec2) => {
      const s = worldToScreen(v, world);
      return Math.hypot(s.x - p.screen.x, s.y - p.screen.y) <= this.tolerancePx + 2;
    };
    if (near(chrome.start)) return { kind: 'handle', handle: 'start' };
    if (near(chrome.end)) return { kind: 'handle', handle: 'end' };
    if (!chrome.linear && near(chrome.width)) return { kind: 'handle', handle: 'width' };
    const stop = chrome.stops.findIndex((s) => near(s.point));
    if (stop >= 0) return { kind: 'stop', index: stop };
    const a = worldToScreen(v, chrome.start);
    const b = worldToScreen(v, chrome.end);
    if (distanceToSegment(p.screen, a, b) <= this.tolerancePx) {
      const target = gradientEditTarget(this.editor)!;
      const toLocal = invert(this.editor.scene.worldTransform(target.node.id));
      if (!toLocal) return null;
      return { kind: 'line', position: positionOnGradient(gradientHandles(target.paint, paintSize(target.node)), apply(toLocal, p.world)) };
    }
    return null;
  }

  pointerDown(p: PointerInfo): void {
    const { editor } = this;
    editor.scene.ensure(editor.pageId);
    const target = gradientEditTarget(editor);
    const hit = p.button === 0 && target ? this.hit(p) : null;
    const toLocal = target && invert(editor.scene.worldTransform(target.node.id));
    if (!hit || !target || !toLocal) {
      endGradientEdit(editor);
      return;
    }
    this.gesture = {
      hit,
      tx: editor.history.begin(hit.kind === 'line' ? 'Add gradient stop' : hit.kind === 'stop' ? 'Move gradient stop' : 'Move gradient'),
      target,
      handles: gradientHandles(target.paint, paintSize(target.node)),
      toLocal,
      down: apply(toLocal, p.world),
      moved: false,
    };
  }

  pointerMove(p: PointerInfo): void {
    const g = this.gesture;
    if (!g) {
      const hit = this.hit(p);
      this.hoverCursor = hit && hit.kind !== 'line' ? 'move' : hit ? 'crosshair' : 'default';
      return;
    }
    const local = apply(g.toLocal, p.world);
    const d = { x: local.x - g.down.x, y: local.y - g.down.y };
    if (!g.moved && Math.hypot(d.x, d.y) * this.editor.state.viewport.zoom < 2) return;
    g.moved = true;
    const { paint, node } = g.target;
    if (g.hit.kind === 'handle') {
      const shift = (q: Vec2) => ({ x: q.x + d.x, y: q.y + d.y });
      const h = g.handles;
      const moved: GradientHandles =
        g.hit.handle === 'start'
          ? paint.type === 'GRADIENT_LINEAR'
            ? { ...h, start: shift(h.start) }
            : { start: shift(h.start), end: shift(h.end), width: shift(h.width) }
          : g.hit.handle === 'end'
            ? { ...h, end: shift(h.end) }
            : { ...h, width: shift(h.width) };
      const gradientTransform = gradientTransformFromHandles(paint.type, moved, paintSize(node));
      if (!gradientTransform) return;
      setPaint(g.tx, g.target, { ...paint, gradientTransform });
    } else if (g.hit.kind === 'stop') {
      setPaint(g.tx, g.target, updateStop(paint, g.hit.index, { position: positionOnGradient(g.handles, local) }));
    } else {
      return;
    }
    g.tx.flushPreview();
    this.editor.requestRender();
  }

  pointerUp(): void {
    const g = this.gesture;
    if (!g) return;
    this.gesture = null;
    if (g.hit.kind === 'line' && !g.moved && g.target.paint.gradientStops.length < 64) {
      const { paint } = g.target;
      const position = g.hit.position;
      const stops = [...paint.gradientStops, { position, color: colorAt(paint.gradientStops, position) }].sort((a, b) => a.position - b.position);
      setPaint(g.tx, g.target, { ...paint, gradientStops: stops });
      this.editor.history.commit(g.tx);
      return;
    }
    if (g.moved) this.editor.history.commit(g.tx);
    else this.editor.history.cancel(g.tx);
  }

  /** Escape: abandons a drag in progress, otherwise stops editing. */
  cancel(): boolean {
    if (this.gesture) {
      this.editor.history.cancel(this.gesture.tx);
      this.gesture = null;
      return true;
    }
    return endGradientEdit(this.editor);
  }
}
