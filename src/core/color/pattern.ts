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
import type { PatternPaint, Size } from '../schema/document';

export type PatternTileType = PatternPaint['tileType'];
export type PatternAlignment = PatternPaint['horizontalAlignment'];

export const PATTERN_TILE_LABELS: Record<PatternTileType, string> = {
  RECTANGULAR: 'Grid',
  HORIZONTAL_HEXAGONAL: 'Horizontal hex',
  VERTICAL_HEXAGONAL: 'Vertical hex',
};

export const PATTERN_ALIGNMENT_LABELS: Record<PatternAlignment, string> = { START: 'Left', CENTER: 'Center', END: 'Right' };

/**
 * How a pattern repeats inside a layer: one repeating `tile` (in layer coordinates) that contains the
 * source drawn at `scale` at each of `placements`, with the tile grid starting at `origin`.
 */
export interface PatternLayout {
  readonly scale: number;
  readonly tile: Size;
  readonly placements: readonly Vec2[];
  readonly origin: Vec2;
}

/** Tile layout for a pattern of a `source`-sized layer inside a `layer`-sized one. Null when the source has no area. */
export function patternLayout(paint: Pick<PatternPaint, 'tileType' | 'scalingFactor' | 'spacing' | 'horizontalAlignment'>, source: Size, layer: Size): PatternLayout | null {
  const scale = paint.scalingFactor;
  const w = source.width * scale;
  const h = source.height * scale;
  if (!(w > 0 && h > 0)) return null;
  const cellW = w + paint.spacing.x;
  const cellH = h + paint.spacing.y;
  let tile: Size;
  let placements: Vec2[];
  switch (paint.tileType) {
    case 'RECTANGULAR':
      tile = { width: cellW, height: cellH };
      placements = [{ x: 0, y: 0 }];
      break;
    case 'HORIZONTAL_HEXAGONAL':
      // Every other row shifts by half a cell; the shifted row wraps around the tile's left edge.
      tile = { width: cellW, height: cellH * 2 };
      placements = [
        { x: 0, y: 0 },
        { x: cellW / 2, y: cellH },
        { x: -cellW / 2, y: cellH },
      ];
      break;
    case 'VERTICAL_HEXAGONAL':
      tile = { width: cellW * 2, height: cellH };
      placements = [
        { x: 0, y: 0 },
        { x: cellW, y: cellH / 2 },
        { x: cellW, y: -cellH / 2 },
      ];
      break;
  }
  const anchor = paint.horizontalAlignment === 'START' ? 0 : paint.horizontalAlignment === 'CENTER' ? layer.width / 2 - w / 2 : layer.width - w;
  const origin = { x: ((anchor % tile.width) + tile.width) % tile.width, y: 0 };
  return { scale, tile, placements, origin };
}
