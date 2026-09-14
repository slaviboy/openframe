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

import { keyBetween } from '../ids/fractional-index';
import { ROOT_ID, type Id, type IdGenerator } from '../ids/ids';
import type {
  Color,
  DocumentNode,
  EllipseNode,
  FrameNode,
  GroupNode,
  LineNode,
  PageNode,
  Paint,
  PolygonNode,
  RectangleNode,
  SectionNode,
  SliceNode,
  StarNode,
  StrokeCap, VectorNode } from '../schema/document';
import { DocumentStore } from './store';

export const WHITE: Color = { r: 1, g: 1, b: 1, a: 1 };
export const BLACK: Color = { r: 0, g: 0, b: 0, a: 1 };
/** Default shape fill (#D9D9D9), matching the reference editor. */
export const DEFAULT_SHAPE_FILL: Color = { r: 217 / 255, g: 217 / 255, b: 217 / 255, a: 1 };
export const LIGHT_CANVAS: Color = { r: 245 / 255, g: 245 / 255, b: 245 / 255, a: 1 };
export const DARK_CANVAS: Color = { r: 30 / 255, g: 30 / 255, b: 30 / 255, a: 1 };

export const solid = (color: Color, opacity = 1): Paint => ({
  type: 'SOLID',
  color,
  opacity,
  visible: true,
  blendMode: 'NORMAL',
});

/** Fractional key that places a new child on top of its current siblings. */
export function keyOnTop(store: DocumentStore, parentId: Id): string {
  const siblings = store.children(parentId);
  const last = siblings.at(-1);
  const lastNode = last ? store.get(last) : undefined;
  return keyBetween(lastNode && lastNode.type !== 'DOCUMENT' ? lastNode.parent.key : null, null);
}

export interface NewDocumentOptions {
  name: string;
  now: string;
  appVersion: string;
  ids: IdGenerator;
  canvas?: Color;
}

export function createEmptyDocument(options: NewDocumentOptions): DocumentStore {
  const root: DocumentNode = { id: ROOT_ID, type: 'DOCUMENT', name: options.name };
  const page: PageNode = {
    id: options.ids.next(),
    type: 'PAGE',
    name: 'Page 1',
    parent: { id: ROOT_ID, key: keyBetween(null, null) },
    visible: true,
    locked: false,
    backgroundColor: options.canvas ?? LIGHT_CANVAS,
  };
  return new DocumentStore({ name: options.name, createdAt: options.now, appVersion: options.appVersion }, [root, page]);
}

interface ShapeInit {
  id: Id;
  parent: { id: Id; key: string };
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const sceneDefaults = (init: ShapeInit) => ({
  id: init.id,
  name: init.name,
  parent: init.parent,
  visible: true,
  locked: false,
  transform: [1, 0, 0, 1, init.x, init.y] as [number, number, number, number, number, number],
  size: { width: init.width, height: init.height },
  opacity: 1,
  blendMode: 'PASS_THROUGH' as const,
});

export const makeFrame = (init: ShapeInit): FrameNode => ({
  ...sceneDefaults(init),
  type: 'FRAME',
  fills: [solid(WHITE)],
  strokes: [],
  strokeWeight: 1,
  strokeAlign: 'INSIDE',
  cornerRadius: 0,
  clipsContent: true,
});

export const makeRectangle = (init: ShapeInit): RectangleNode => ({
  ...sceneDefaults(init),
  blendMode: 'PASS_THROUGH',
  type: 'RECTANGLE',
  fills: [solid(DEFAULT_SHAPE_FILL)],
  strokes: [],
  strokeWeight: 1,
  strokeAlign: 'INSIDE',
  cornerRadius: 0,
});

export const makeEllipse = (init: ShapeInit): EllipseNode => ({
  ...sceneDefaults(init),
  type: 'ELLIPSE',
  fills: [solid(DEFAULT_SHAPE_FILL)],
  strokes: [],
  strokeWeight: 1,
  strokeAlign: 'INSIDE',
});

export const makePolygon = (init: ShapeInit): PolygonNode => ({
  ...sceneDefaults(init),
  type: 'POLYGON',
  fills: [solid(DEFAULT_SHAPE_FILL)],
  strokes: [],
  strokeWeight: 1,
  strokeAlign: 'INSIDE',
  pointCount: 3,
});

export const makeStar = (init: ShapeInit): StarNode => ({
  ...sceneDefaults(init),
  type: 'STAR',
  fills: [solid(DEFAULT_SHAPE_FILL)],
  strokes: [],
  strokeWeight: 1,
  strokeAlign: 'INSIDE',
  pointCount: 5,
  innerRadius: 0.38,
});

/** A vector layer (Pen, Pencil) with a 1px black center stroke and no fill; `network` is in the layer's local space. */
export const makeVector = (init: ShapeInit, network: VectorNetwork): VectorNode => ({
  ...sceneDefaults(init),
  type: 'VECTOR',
  fills: [],
  strokes: [solid(BLACK)],
  strokeWeight: 1,
  strokeAlign: 'CENTER',
  vectorNetwork: network as VectorNode['vectorNetwork'],
});

/** A line (or arrow, with `endCap`) with a 1px black center stroke and no fill. */
export const makeLine = (init: ShapeInit, endCap: StrokeCap = 'NONE'): LineNode => ({
  ...sceneDefaults(init),
  size: { width: init.width, height: 0 },
  type: 'LINE',
  fills: [],
  strokes: [solid(BLACK)],
  strokeWeight: 1,
  strokeAlign: 'CENTER',
  startCap: 'NONE',
  endCap,
});

/** A section with a white fill and a subtle 10% black border. */
export const makeSection = (init: ShapeInit): SectionNode => ({
  ...sceneDefaults(init),
  type: 'SECTION',
  fills: [solid(WHITE)],
  strokes: [solid(BLACK, 0.1)],
  strokeWeight: 1,
  strokeAlign: 'INSIDE',
});

export const makeSlice = (init: ShapeInit): SliceNode => ({ ...sceneDefaults(init), type: 'SLICE' });

export const makeGroup = (init: ShapeInit): GroupNode => ({ ...sceneDefaults(init), type: 'GROUP' });

/** An empty auto-width text layer in Inter Regular 12, black, as the reference editor creates them. */
export const makeText = (init: ShapeInit): TextNode => ({
  ...sceneDefaults(init),
  type: 'TEXT',
  fills: [solid(BLACK)],
  strokes: [],
  strokeWeight: 1,
  strokeAlign: 'OUTSIDE',
  characters: '',
  fontName: { family: 'Inter', style: 'Regular' },
  fontSize: 12,
  lineHeight: { unit: 'AUTO' },
  letterSpacing: { unit: 'PERCENT', value: 0 },
  textAlignHorizontal: 'LEFT',
  textAlignVertical: 'TOP',
  textAutoResize: 'WIDTH_AND_HEIGHT',
});
import type { TextNode } from '../schema/document';
import type { VectorNetwork } from '../vector/vector-network';

export function makePage(id: Id, name: string, key: string, canvas: Color = LIGHT_CANVAS): PageNode {
  return { id, type: 'PAGE', name, parent: { id: ROOT_ID, key }, visible: true, locked: false, backgroundColor: canvas };
}
