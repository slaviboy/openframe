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
import type { TrackAxis } from '@/core/layout/grid-track-handles';
import { moveTrack, placementAfterMove, placementAfterRemove, removeTrack, type GridPlacement } from '@/core/layout/grid-track-edits';
import type { Id } from '@/core/ids/ids';
import type { FrameNode, GridTrack, SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';

/** The grid frame a track belongs to, when it is still there and still a grid. */
function gridFrame(editor: Editor, frameId: Id): FrameNode | null {
  const frame = editor.doc.get(frameId);
  return frame?.type === 'FRAME' && frame.layoutMode === 'GRID' && !frame.locked ? frame : null;
}

/** The sizes of a grid's columns or rows as they stand; rows left to Auto have none of their own. */
export function trackSizes(frame: FrameNode, axis: TrackAxis): readonly GridTrack[] | undefined {
  return axis === 'column' ? (frame.gridColumnSizes ?? [{ type: 'FLEX', value: 1 }]) : frame.gridRowSizes;
}

/** Reads a child's place along one axis of the grid. */
const placementOf = (child: SceneNode, axis: TrackAxis): GridPlacement =>
  axis === 'column' ? { cell: child.gridColumn, span: child.gridColumnSpan } : { cell: child.gridRow, span: child.gridRowSpan };

/** Writes a child's place along one axis, leaving out what it no longer carries. */
function setPlacement(tx: Transaction, id: Id, axis: TrackAxis, placement: GridPlacement): void {
  tx.set(id, axis === 'column' ? 'gridColumn' : 'gridRow', placement.cell);
  tx.set(id, axis === 'column' ? 'gridColumnSpan' : 'gridRowSpan', placement.span);
}

const sizeField = (axis: TrackAxis) => (axis === 'column' ? 'gridColumnSizes' : 'gridRowSizes');

/**
 * Takes a track out of a grid: its size goes, the children in it go back to being placed automatically, the ones
 * after it move up a track, and the ones reaching over it reach one track less. One undo step.
 */
export function deleteGridTrack(editor: Editor, frameId: Id, axis: TrackAxis, index: number): boolean {
  const frame = gridFrame(editor, frameId);
  const sizes = frame ? trackSizes(frame, axis) : undefined;
  const next = sizes ? removeTrack(sizes, index) : null;
  if (!frame || !next) return false;
  editor.history.run(axis === 'column' ? 'Delete column' : 'Delete row', (tx) => {
    tx.set(frameId, sizeField(axis), next);
    for (const id of tx.store.children(frameId)) {
      const child = tx.store.get(id);
      if (!child || !('gridColumn' in child)) continue;
      const placement = placementAfterRemove(placementOf(child, axis), index);
      setPlacement(tx, id, axis, placement);
    }
  });
  return true;
}

/** Moves a track to another place in the grid, the children travelling with it. One undo step. */
export function moveGridTrack(editor: Editor, frameId: Id, axis: TrackAxis, from: number, to: number): boolean {
  const frame = gridFrame(editor, frameId);
  const sizes = frame ? trackSizes(frame, axis) : undefined;
  const next = sizes ? moveTrack(sizes, from, to) : null;
  if (!frame || !next) return false;
  editor.history.run(axis === 'column' ? 'Move column' : 'Move row', (tx) => {
    tx.set(frameId, sizeField(axis), next);
    for (const id of tx.store.children(frameId)) {
      const child = tx.store.get(id);
      if (!child || !('gridColumn' in child)) continue;
      setPlacement(tx, id, axis, placementAfterMove(placementOf(child, axis), from, to));
    }
  });
  return true;
}
