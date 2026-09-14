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

import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import { apply, applyLinear, invert } from '@/core/math/matrix';
import { nodeContainsLocal } from '@/core/scene/scene-index';
import type { Transform, VectorNode } from '@/core/schema/document';
import { deleteVertices, healVertices, moveVertices, nearestOnSegments, splitSegment } from '@/core/vector/vector-edit';
import type { VectorNetwork } from '@/core/vector/vector-network';
import type { Editor } from '../editor';
import { refitVector } from '../tools/vector-draw';
import type { CursorKind, PointerInfo, Tool } from '../tools/types';
import { worldToScreen } from '../viewport/viewport';

/** Vector edit mode can start on a single selected, unlocked vector layer. */
export function canBeginVectorEdit(editor: Editor): boolean {
  if (editor.state.getSnapshot().vectorEdit || editor.selection.length !== 1) return false;
  const node = editor.doc.get(editor.selection[0]!);
  return node?.type === 'VECTOR' && !node.locked;
}

/** Enters vector edit mode on a vector layer (selecting it). */
export function beginVectorEdit(editor: Editor, id: Id): boolean {
  const node = editor.doc.get(id);
  if (node?.type !== 'VECTOR' || node.locked) return false;
  editor.state.select([id]);
  editor.state.setVectorEdit({ nodeId: id, vertices: [] });
  return true;
}

/** Leaves vector edit mode. */
export function endVectorEdit(editor: Editor): boolean {
  if (!editor.state.getSnapshot().vectorEdit) return false;
  editor.state.setVectorEdit(null);
  return true;
}

const editedVector = (editor: Editor): VectorNode | null => {
  const state = editor.state.getSnapshot().vectorEdit;
  const node = state ? editor.doc.get(state.nodeId) : undefined;
  return node?.type === 'VECTOR' ? node : null;
};

/** Deletes the selected points of the vector being edited (with their segments), as one undo step. */
export function deleteSelectedPoints(editor: Editor): boolean {
  const state = editor.state.getSnapshot().vectorEdit;
  const node = editedVector(editor);
  if (!state || !node || state.vertices.length === 0) return false;
  editor.history.run('Delete points', (tx) => refitVector(tx, node.id, deleteVertices(node.vectorNetwork, state.vertices)));
  editor.state.setVectorEdit({ nodeId: node.id, vertices: [] });
  return true;
}

/** ⇧Delete: deletes the selected points and heals the path across them. */
export function healSelectedPoints(editor: Editor): boolean {
  const state = editor.state.getSnapshot().vectorEdit;
  const node = editedVector(editor);
  if (!state || !node || state.vertices.length === 0) return false;
  editor.history.run('Delete and heal points', (tx) => refitVector(tx, node.id, healVertices(node.vectorNetwork, state.vertices)));
  editor.state.setVectorEdit({ nodeId: node.id, vertices: [] });
  return true;
}

interface PointDrag {
  tx: Transaction;
  start: VectorNetwork;
  startTransform: Transform;
  down: PointerInfo;
  vertices: readonly number[];
  moved: boolean;
}

/**
 * Pointer handling in vector edit mode (routed by the ToolManager while `vectorEdit` is set): click a
 * point to select it (Shift adds or removes), drag selected points to move them, double-click a path
 * to add a point, click inside the layer to clear the point selection, and click elsewhere to leave.
 */
export class VectorEditController implements Tool {
  readonly id = 'move' as const;
  private drag: PointDrag | null = null;

  constructor(
    private readonly editor: Editor,
    private readonly tolerancePx: number,
  ) {}

  get active(): boolean {
    return this.drag !== null;
  }

  cursor(): CursorKind {
    return 'default';
  }

  pointerDown(p: PointerInfo): void {
    const { editor } = this;
    const state = editor.state.getSnapshot().vectorEdit;
    const node = editedVector(editor);
    if (!state || !node) {
      endVectorEdit(editor);
      return;
    }
    editor.scene.ensure(editor.pageId);
    const toWorld = editor.scene.worldTransform(node.id);
    const v = editor.state.viewport;
    const hit = node.vectorNetwork.vertices.findIndex((vertex) => {
      const s = worldToScreen(v, apply(toWorld, vertex));
      return Math.abs(s.x - p.screen.x) <= this.tolerancePx && Math.abs(s.y - p.screen.y) <= this.tolerancePx;
    });
    if (hit !== -1) {
      const selected = p.shift ? (state.vertices.includes(hit) ? state.vertices.filter((i) => i !== hit) : [...state.vertices, hit]) : state.vertices.includes(hit) ? state.vertices : [hit];
      editor.state.setVectorEdit({ nodeId: node.id, vertices: selected });
      if (selected.includes(hit)) {
        this.drag = { tx: editor.history.begin('Move points'), start: node.vectorNetwork, startTransform: node.transform, down: p, vertices: selected, moved: false };
      }
      return;
    }
    const inverse = invert(toWorld);
    const local = inverse ? apply(inverse, p.world) : null;
    const pixelsPerUnit = Math.hypot(toWorld.a, toWorld.b) * v.zoom;
    if (local && p.clickCount >= 2) {
      const nearest = nearestOnSegments(node.vectorNetwork, local);
      if (nearest && nearest.distance * pixelsPerUnit <= this.tolerancePx) {
        const { network, vertex } = splitSegment(node.vectorNetwork, nearest.segment, nearest.t);
        editor.history.run('Add point', (tx) => refitVector(tx, node.id, network));
        editor.state.setVectorEdit({ nodeId: node.id, vertices: [vertex] });
        return;
      }
    }
    if (local && nodeContainsLocal(node, local, this.tolerancePx / pixelsPerUnit)) editor.state.setVectorEdit({ nodeId: node.id, vertices: [] });
    else endVectorEdit(editor);
  }

  pointerMove(p: PointerInfo): void {
    const d = this.drag;
    const state = this.editor.state.getSnapshot().vectorEdit;
    if (!d || !state) return;
    if (!d.moved && Math.hypot(p.screen.x - d.down.screen.x, p.screen.y - d.down.screen.y) < 3) return;
    d.moved = true;
    // The drag distance in the layer's own space; its rotation and scale don't change while points move.
    const inverse = invert(this.editor.scene.worldTransform(state.nodeId));
    const worldDelta = { x: p.world.x - d.down.world.x, y: p.world.y - d.down.world.y };
    const delta = inverse ? applyLinear(inverse, worldDelta) : worldDelta;
    refitVector(d.tx, state.nodeId, moveVertices(d.start, d.vertices, delta), d.startTransform);
    d.tx.flushPreview();
    this.editor.requestRender();
  }

  pointerUp(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.moved) this.editor.history.commit(d.tx);
    else this.editor.history.cancel(d.tx);
  }

  cancel(): boolean {
    if (this.drag) {
      this.editor.history.cancel(this.drag.tx);
      this.drag = null;
      return true;
    }
    return endVectorEdit(this.editor);
  }
}
