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

import type { Id } from '@/core/ids/ids';
import { gridTracks, isAutoLayoutFrame } from '@/core/layout/auto-layout';
import { gridTrackHandles, type GridTrackHandle, type TrackAxis, type TrackBand } from '@/core/layout/grid-track-handles';
import { apply, type Matrix } from '@/core/math/matrix';
import type { Vec2 } from '@/core/math/vec';
import type { GridTrack } from '@/core/schema/document';
import type { Editor } from '../editor';
import { worldToScreen } from '../viewport/viewport';

/** How far into the frame from its top (columns) or left (rows) side track edges can be grabbed, in screen pixels. */
export const GRID_EDGE_BAND_PX = 16;

export interface SelectedGridTracks {
  readonly frameId: Id;
  readonly handles: readonly GridTrackHandle[];
  /** The frame's local-to-world transform. */
  readonly toWorld: Matrix;
  readonly columns: readonly TrackBand[];
  readonly rows: readonly TrackBand[];
  readonly columnSizes: readonly GridTrack[];
  /** Explicit row sizes; undefined for Auto rows. */
  readonly rowSizes: readonly GridTrack[] | undefined;
}

/** The tracks and track handles of the selection when it is one unlocked, unrotated grid auto layout frame. */
export function selectedGridTracks(editor: Editor): SelectedGridTracks | null {
  if (editor.selection.length !== 1) return null;
  const frame = editor.doc.get(editor.selection[0]!);
  if (!isAutoLayoutFrame(frame) || frame.layoutMode !== 'GRID' || frame.locked) return null;
  editor.scene.ensure(editor.pageId);
  const toWorld = editor.scene.worldTransform(frame.id);
  if (Math.abs(toWorld.b) > 1e-9 || Math.abs(toWorld.c) > 1e-9) return null;
  const tracks = gridTracks(editor.doc, frame.id);
  if (!tracks) return null;
  return {
    frameId: frame.id,
    handles: gridTrackHandles(tracks, frame.size),
    toWorld,
    columns: tracks.columns,
    rows: tracks.rows,
    columnSizes: frame.gridColumnSizes ?? [{ type: 'FLEX', value: 1 }],
    rowSizes: frame.gridRowSizes,
  };
}

/** How far from a track's pill it can still be picked, in screen pixels: the pill is a small label. */
const PILL_REACH_PX = 14;

/** The track whose size pill a screen point is on, which is how a track is picked out on the canvas. */
export function hitGridTrackPill(editor: Editor, screen: Vec2): { readonly selected: SelectedGridTracks; readonly axis: TrackAxis; readonly index: number } | null {
  const selected = selectedGridTracks(editor);
  if (!selected) return null;
  const v = editor.state.viewport;
  for (const handle of selected.handles) {
    if (handle.kind !== 'pill') continue;
    const at = worldToScreen(v, apply(selected.toWorld, handle.at));
    // The pills sit just outside the frame's top and left sides, so the reach is wider along the side they run.
    const withinX = handle.axis === 'column' ? Math.abs(screen.x - at.x) <= PILL_REACH_PX * 2 : Math.abs(screen.x - at.x) <= PILL_REACH_PX;
    const withinY = handle.axis === 'column' ? Math.abs(screen.y - at.y) <= PILL_REACH_PX : Math.abs(screen.y - at.y) <= PILL_REACH_PX * 2;
    if (withinX && withinY) return { selected, axis: handle.axis, index: handle.index };
  }
  return null;
}

/** The track edge under a screen point, near the frame's top side (column edges) or left side (row edges). */
export function hitGridTrackEdge(editor: Editor, screen: Vec2, tolerancePx: number): { readonly selected: SelectedGridTracks; readonly axis: TrackAxis; readonly index: number } | null {
  const selected = selectedGridTracks(editor);
  if (!selected) return null;
  const v = editor.state.viewport;
  for (const handle of selected.handles) {
    if (handle.kind !== 'edge') continue;
    const start = worldToScreen(v, apply(selected.toWorld, handle.from));
    const hit =
      handle.axis === 'column'
        ? Math.abs(screen.x - start.x) <= tolerancePx && screen.y >= start.y - tolerancePx && screen.y <= start.y + GRID_EDGE_BAND_PX
        : Math.abs(screen.y - start.y) <= tolerancePx && screen.x >= start.x - tolerancePx && screen.x <= start.x + GRID_EDGE_BAND_PX;
    if (hit) return { selected, axis: handle.axis, index: handle.index };
  }
  return null;
}
