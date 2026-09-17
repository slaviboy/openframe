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

import type { GridTrack } from '../schema/document';

/** Where a child sits in the grid and how far it reaches, as the fields on it read. */
export interface GridPlacement {
  readonly cell: number | undefined;
  readonly span: number | undefined;
}

/** The sizes with one track taken out; a grid always keeps one track, so the last one stays. */
export function removeTrack(sizes: readonly GridTrack[], index: number): GridTrack[] | null {
  if (sizes.length <= 1 || index < 0 || index >= sizes.length) return null;
  return sizes.filter((_, i) => i !== index);
}

/** The sizes with one track moved to another place, the others closing up behind it. */
export function moveTrack(sizes: readonly GridTrack[], from: number, to: number): GridTrack[] | null {
  if (from === to || from < 0 || to < 0 || from >= sizes.length || to >= sizes.length) return null;
  const moved = [...sizes];
  const [track] = moved.splice(from, 1);
  if (!track) return null;
  moved.splice(to, 0, track);
  return moved;
}

/**
 * Where a child sits once a track is taken out: one in the track itself loses its place and goes back to being
 * placed automatically, one after it moves up a track, and one reaching across the track reaches one track less.
 */
export function placementAfterRemove(placement: GridPlacement, index: number): GridPlacement {
  const { cell, span } = placement;
  if (cell === undefined) return placement;
  const reach = span ?? 1;
  if (cell === index) return { cell: undefined, span: undefined };
  if (cell > index) return { cell: cell - 1, span };
  // The child starts before the track and reaches over it, so it reaches one track less. A reach of one is what
  // a child carries no span for, so it is left off rather than written out.
  if (cell + reach <= index) return placement;
  const shorter = reach - 1;
  return { cell, span: shorter > 1 ? shorter : undefined };
}

/**
 * Where a child sits once a track is moved. A child in the moved track travels with it; the ones the move steps
 * over shift one place the other way. A child reaching across several tracks is left where it is, since a move
 * would tear it apart.
 */
export function placementAfterMove(placement: GridPlacement, from: number, to: number): GridPlacement {
  const { cell, span } = placement;
  if (cell === undefined || (span ?? 1) > 1) return placement;
  if (cell === from) return { cell: to, span };
  if (from < to && cell > from && cell <= to) return { cell: cell - 1, span };
  if (to < from && cell >= to && cell < from) return { cell: cell + 1, span };
  return placement;
}
