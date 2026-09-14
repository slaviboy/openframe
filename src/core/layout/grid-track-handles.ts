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

import type { Vec2 } from '../math/vec';
import type { GridTrack, Size } from '../schema/document';

export type TrackAxis = 'column' | 'row';

export interface TrackBand {
  readonly start: number;
  readonly length: number;
}

/**
 * On-canvas handles of a grid auto layout frame, in its local space: a pill per track centered on
 * the frame's top edge (columns) or left edge (rows), and a draggable edge after every track, spanning
 * the frame.
 */
export type GridTrackHandle =
  | { readonly kind: 'pill'; readonly axis: TrackAxis; readonly index: number; readonly at: Vec2 }
  | { readonly kind: 'edge'; readonly axis: TrackAxis; readonly index: number; readonly from: Vec2; readonly to: Vec2 };

export function gridTrackHandles(tracks: { readonly columns: readonly TrackBand[]; readonly rows: readonly TrackBand[] }, size: Size): GridTrackHandle[] {
  const handles: GridTrackHandle[] = [];
  tracks.columns.forEach((band, index) => {
    handles.push({ kind: 'pill', axis: 'column', index, at: { x: band.start + band.length / 2, y: 0 } });
    const x = band.start + band.length;
    handles.push({ kind: 'edge', axis: 'column', index, from: { x, y: 0 }, to: { x, y: size.height } });
  });
  tracks.rows.forEach((band, index) => {
    handles.push({ kind: 'pill', axis: 'row', index, at: { x: 0, y: band.start + band.length / 2 } });
    const y = band.start + band.length;
    handles.push({ kind: 'edge', axis: 'row', index, from: { x: 0, y }, to: { x: size.width, y } });
  });
  return handles;
}

const formatPixels = (value: number) => String(Math.round(value * 100) / 100);

/** A track's size as shown on its pill: pixels for fixed tracks, fractions for fill tracks, Hug for hugging ones. */
export function trackLabel(track: GridTrack | undefined): string {
  if (!track || track.type === 'FLEX') return `${formatPixels(track?.value ?? 1)}fr`;
  return track.type === 'HUG' ? 'Hug' : formatPixels(track.value);
}

/** A track dragged by its end edge becomes fixed: its length at the drag's start plus the drag distance, never below 0. */
export function resizedTrack(startLength: number, delta: number): GridTrack {
  return { type: 'FIXED', value: Math.max(0, Math.round(startLength + delta)) };
}
