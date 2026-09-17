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

import { colorEquals, relativeLuminance, type RGBA } from '@/core/color/color';
import { backgroundColorAt } from '@/core/color/contrast';
import { keyOnTop, makeVector, solid } from '@/core/document/factory';
import { hitTestDeepest } from '@/core/scene/hit-test';
import { isSceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import type { Vec2 } from '@/core/math/vec';
import { EMPTY_NETWORK } from '@/core/vector/pen';
import { pencilNetwork } from '@/core/vector/pencil';
import { DEFAULT_SKETCH_STROKE } from '../stores/editor-store';
import { containerAt, nextLayerName, parentToLocal } from './draw-helpers';
import type { CursorKind, ModifierState, PointerInfo, Tool, ToolEnvironment } from './types';
import { placeNetwork } from './vector-draw';

interface Sketch {
  tx: Transaction;
  id: Id;
  toLocal: (world: Vec2) => Vec2;
  /** Pointer positions in the parent's space. */
  points: Vec2[];
  shift: boolean;
}

/**
 * ⌘-click with the Pencil: the stroke of the layer under the pointer — its color, weight and style — becomes what the
 * next sketches are drawn with. Layers without a stroke are left alone.
 */
function sampleStroke(editor: Editor, world: Vec2): boolean {
  const tolerance = 4 / editor.state.viewport.zoom;
  const id = hitTestDeepest(editor.doc, editor.scene, editor.pageId, world, { tolerance });
  const node = id === null ? undefined : editor.doc.get(id);
  if (!node || !isSceneNode(node) || !('strokes' in node)) return false;
  const paint = node.strokes.find((s) => s.visible && s.type === 'SOLID');
  if (paint?.type !== 'SOLID') return false;
  editor.state.setSketchStroke({
    color: { ...paint.color, a: paint.opacity },
    weight: node.strokeWeight,
    dashed: node.strokeDashes !== undefined,
    ...(node.dynamicStroke ? { dynamic: node.dynamicStroke } : {}),
  });
  return true;
}

/** Below this the canvas counts as dark, and the sketch that would be lost on it is drawn in white instead. */
const DARK_BACKGROUND = 0.18;

/**
 * The colour a sketch is drawn in. A stroke the designer picked is used as it is; the black a sketch starts out
 * with turns white where the canvas or the frame under it is dark, so the line can be seen.
 */
function sketchColor(editor: Editor, color: RGBA, world: Vec2): RGBA {
  if (!colorEquals(color, DEFAULT_SKETCH_STROKE.color)) return color;
  const behind = backgroundColorAt(editor.doc, editor.scene, editor.pageId, world);
  return relativeLuminance(behind) < DARK_BACKGROUND ? { r: 1, g: 1, b: 1, a: 1 } : color;
}

/**
 * Pencil (⇧P) and Brush (B): drag to sketch a smoothed vector path with the stroke the sketch toolbar holds; hold Shift
 * for a straight line. The Brush gives its sketches a dynamic stroke, for a hand-drawn, bumpy line. The tool stays
 * active for the next sketch until Escape or another tool.
 */
export class PencilTool implements Tool {
  private sketch: Sketch | null = null;

  /** The Brush is the same tool drawing with a dynamic stroke, so both sketch the same way. */
  constructor(
    private readonly env: ToolEnvironment,
    readonly id: 'pencil' | 'brush' = 'pencil',
  ) {}

  get active(): boolean {
    return this.sketch !== null;
  }

  cursor(): CursorKind {
    return 'crosshair';
  }

  pointerDown(p: PointerInfo): void {
    if (p.button !== 0) return;
    const { editor } = this.env;
    editor.scene.ensure(editor.pageId);
    // ⌘-click takes the stroke of the layer under the pointer, for the sketches that follow.
    if (p.mod && sampleStroke(editor, p.world)) return;
    const parent = containerAt(editor, p.world);
    const toLocal = parentToLocal(editor, parent);
    const start = toLocal(p.world);
    const tx = editor.history.begin('Sketch');
    const id = editor.ids.next();
    const stroke = editor.state.getSnapshot().sketchStroke;
    tx.create({
      ...makeVector({ id, parent: { id: parent, key: keyOnTop(editor.doc, parent) }, name: nextLayerName(editor, 'Vector'), x: start.x, y: start.y, width: 0, height: 0 }, EMPTY_NETWORK),
      strokes: [solid(sketchColor(editor, stroke.color, p.world))],
      strokeWeight: stroke.weight,
      ...(stroke.dashed ? { strokeDashes: [10, 10] } : {}),
      ...(this.id === 'brush' ? { dynamicStroke: stroke.dynamic } : {}),
      strokeJoin: 'ROUND',
      endpointCap: 'ROUND',
    });
    editor.state.select([id]);
    this.sketch = { tx, id, toLocal, points: [start], shift: p.shift };
    this.apply();
  }

  pointerMove(p: PointerInfo): void {
    const s = this.sketch;
    if (!s) return;
    s.points.push(s.toLocal(p.world));
    s.shift = p.shift;
    this.apply();
  }

  pointerUp(p: PointerInfo): void {
    const s = this.sketch;
    if (!s) return;
    // The release position ends the sketch.
    s.points.push(s.toLocal(p.world));
    s.shift = p.shift;
    this.apply();
    this.sketch = null;
    const moved = s.points.some((q) => Math.hypot(q.x - s.points[0]!.x, q.y - s.points[0]!.y) > 0);
    if (moved) this.env.editor.history.commit(s.tx);
    else this.env.editor.history.cancel(s.tx);
  }

  modifiersChanged(m: ModifierState): void {
    if (!this.sketch) return;
    this.sketch.shift = m.shift;
    this.apply();
  }

  cancel(): boolean {
    if (!this.sketch) return false;
    this.env.editor.history.cancel(this.sketch.tx);
    this.sketch = null;
    return true;
  }

  private apply(): void {
    const s = this.sketch!;
    const { editor } = this.env;
    placeNetwork(s.tx, s.id, pencilNetwork(s.points, { tolerance: 1 / editor.state.viewport.zoom, straight: s.shift }));
    s.tx.flushPreview();
    editor.requestRender();
  }
}
