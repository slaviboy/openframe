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

import type { PathCommand } from '../geometry/corners';
import { ROOT_ID, type Id } from '../ids/ids';
import type { BrushKind, BrushNode, Node, Size } from '../schema/document';
import { commandsToNetwork, ellipseCommands, polygonCommands } from './shape-networks';

/**
 * The brushes every file starts with. The reference ships twenty-five of its own, which are its artwork, so
 * these are ours: four shapes to lay along a stroke and four to scatter down it, each named for what it is.
 * They are not layers in the file — they are the same in every file, cannot be renamed or thrown away, and
 * take up no room in what is saved — so `brushById` looks here before it looks in the document.
 */

/**
 * Ids in the `0` replica, which is the document root's own and no editing session ever takes, so one of
 * these can never be taken for a brush made in a file — and a file that names one keeps naming it after a
 * save and an open.
 */
const shape = (index: number, name: string, brushKind: BrushKind, size: Size, commands: readonly PathCommand[]): BrushNode => ({
  id: `0:${index}`,
  type: 'BRUSH',
  name,
  parent: { id: ROOT_ID, key: `brush-builtin-${index}` },
  visible: true,
  locked: false,
  brushKind,
  vectorNetwork: commandsToNetwork(commands) as BrushNode['vectorNetwork'],
  size,
});

/** A closed shape from its own points and curves; x runs along the stroke, y across it. */
const closed = (commands: readonly PathCommand[]): PathCommand[] => [...commands, { op: 'Z' }];

export const BUILTIN_BRUSHES: readonly BrushNode[] = [
  // Laid over the whole stroke: the shape's own length becomes the path's, so its outline is the stroke's.
  shape(
    1,
    'Leaf',
    'STRETCH',
    { width: 100, height: 20 },
    closed([
      { op: 'M', x: 0, y: 10 },
      { op: 'C', x1: 25, y1: 0, x2: 75, y2: 0, x: 100, y: 10 },
      { op: 'C', x1: 75, y1: 20, x2: 25, y2: 20, x: 0, y: 10 },
    ]),
  ),
  shape(
    2,
    'Wedge',
    'STRETCH',
    { width: 100, height: 20 },
    closed([
      { op: 'M', x: 0, y: 0 },
      { op: 'L', x: 100, y: 8.5 },
      { op: 'L', x: 100, y: 11.5 },
      { op: 'L', x: 0, y: 20 },
    ]),
  ),
  shape(
    3,
    'Chisel',
    'STRETCH',
    { width: 100, height: 20 },
    closed([
      { op: 'M', x: 7, y: 0 },
      { op: 'L', x: 100, y: 0 },
      { op: 'L', x: 93, y: 20 },
      { op: 'L', x: 0, y: 20 },
    ]),
  ),
  shape(
    4,
    'Ribbon',
    'STRETCH',
    { width: 100, height: 20 },
    closed([
      { op: 'M', x: 0, y: 0 },
      { op: 'C', x1: 30, y1: 7, x2: 70, y2: 7, x: 100, y: 0 },
      { op: 'L', x: 100, y: 20 },
      { op: 'C', x1: 70, y1: 13, x2: 30, y2: 13, x: 0, y: 20 },
    ]),
  ),
  // Repeated down the stroke, a gap apart, each copy turned to the way the path goes.
  shape(5, 'Dot', 'SCATTER', { width: 20, height: 20 }, ellipseCommands(20, 20)),
  shape(6, 'Dash', 'SCATTER', { width: 28, height: 8 }, ellipseCommands(28, 8)),
  shape(
    7,
    'Triangle',
    'SCATTER',
    { width: 20, height: 20 },
    polygonCommands([
      { x: 10, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ]),
  ),
  shape(
    8,
    'Petal',
    'SCATTER',
    { width: 16, height: 20 },
    closed([
      { op: 'M', x: 8, y: 0 },
      { op: 'C', x1: 16, y1: 6, x2: 16, y2: 14, x: 8, y: 20 },
      { op: 'C', x1: 0, y1: 14, x2: 0, y2: 6, x: 8, y: 0 },
    ]),
  ),
];

/** Whether a brush is one of the ones every file has, rather than one made in this file. */
export const isBuiltinBrush = (id: Id): boolean => BUILTIN_BRUSHES.some((brush) => brush.id === id);

/** The brush an id names: one every file has, or one this file holds. */
export function brushById(store: { get(id: Id): Node | undefined }, id: Id): BrushNode | undefined {
  const builtin = BUILTIN_BRUSHES.find((brush) => brush.id === id);
  if (builtin) return builtin;
  const node = store.get(id);
  return node?.type === 'BRUSH' ? node : undefined;
}
