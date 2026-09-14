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

import type { DocumentStore } from '../document/store';
import { arcCommands } from '../geometry/arc';
import { rectangleCorners, resolveCornerRadii, roundedPolygon, type PathCommand } from '../geometry/corners';
import { polygonPoints, starPoints } from '../geometry/shapes';
import type { Id } from '../ids/ids';
import { hasGeometry, isSceneNode, type BlendMode, type Paint, type SceneNode } from '../schema/document';
import { regionFillPath } from '../vector/vector-network';
import { svgPaint } from './svg-paint';
import { escapeXml, svgNumber, svgPathData } from './svg-path';

export interface SvgExportOptions {
  /** The area a layer's stroke covers, in its local space (the rendering engine's GeometryService); strokes are exported as fills. */
  readonly strokeOutline?: ((node: SceneNode) => PathCommand[] | null) | undefined;
}

export interface SvgExport {
  readonly svg: string;
  /** What was left out, as `layer name: what`, because SVG export doesn't support it. */
  readonly skipped: readonly string[];
}

/** Blend modes CSS (and so SVG) has, as `mix-blend-mode`. */
const CSS_BLEND_MODES: ReadonlySet<BlendMode> = new Set(['DARKEN', 'MULTIPLY', 'COLOR_BURN', 'LIGHTEN', 'SCREEN', 'COLOR_DODGE', 'OVERLAY', 'SOFT_LIGHT', 'HARD_LIGHT', 'DIFFERENCE', 'EXCLUSION', 'HUE', 'SATURATION', 'COLOR', 'LUMINOSITY']);

const UNSUPPORTED_PAINTS: Readonly<Record<string, string>> = {
  GRADIENT_ANGULAR: 'angular gradient',
  GRADIENT_DIAMOND: 'diamond gradient',
  IMAGE: 'image fill',
  PATTERN: 'pattern fill',
};

const blendStyle = (mode: BlendMode) => ` style="mix-blend-mode:${mode.toLowerCase().replaceAll('_', '-')}"`;

/** A full ellipse in the box (0, 0)–(width, height), as four cubic arcs. */
function ellipseCommands(width: number, height: number): PathCommand[] {
  const rx = width / 2;
  const ry = height / 2;
  const k = 0.5522847498;
  return [
    { op: 'M', x: width, y: ry },
    { op: 'C', x1: width, y1: ry + ry * k, x2: rx + rx * k, y2: height, x: rx, y: height },
    { op: 'C', x1: rx - rx * k, y1: height, x2: 0, y2: ry + ry * k, x: 0, y: ry },
    { op: 'C', x1: 0, y1: ry - ry * k, x2: rx - rx * k, y2: 0, x: rx, y: 0 },
    { op: 'C', x1: rx + rx * k, y1: 0, x2: width, y2: ry - ry * k, x: width, y: ry },
    { op: 'Z' },
  ];
}

/** The outline of a layer's shape in its local space (frames, rectangles, ellipses, polygons and stars); null for other layers. */
export function shapeOutline(node: SceneNode): PathCommand[] | null {
  const { width, height } = node.size;
  switch (node.type) {
    case 'FRAME':
    case 'RECTANGLE': {
      const corners = rectangleCorners(width, height, resolveCornerRadii(node));
      return roundedPolygon(corners.points, corners.radii, node.cornerSmoothing ?? 0);
    }
    case 'ELLIPSE':
      return node.arcData ? arcCommands(width, height, node.arcData) : ellipseCommands(width, height);
    case 'POLYGON':
    case 'STAR': {
      const points = node.type === 'POLYGON' ? polygonPoints(width, height, node.pointCount) : starPoints(width, height, node.pointCount, node.innerRadius);
      return roundedPolygon(points, points.map(() => node.cornerRadius ?? 0), node.cornerSmoothing ?? 0);
    }
    default:
      return null;
  }
}

/**
 * A layer and its children as an SVG document the size of the layer (in its own space). Shapes, frames (clipping their
 * content), vectors and groups are exported with solid and linear or radial gradient paints, strokes as filled
 * outlines, opacity and blend modes. Text, boolean groups, masks, effects, image and pattern fills, angular and diamond
 * gradients and per-side strokes aren't exported; `skipped` lists them. Null for a layer without an area.
 */
export function exportSvg(store: DocumentStore, rootId: Id, options: SvgExportOptions = {}): SvgExport | null {
  const root = store.get(rootId);
  if (!root || !isSceneNode(root) || root.size.width <= 0 || root.size.height <= 0) return null;
  const definitions: string[] = [];
  const skipped: string[] = [];
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}${counter++}`;
  const skip = (node: SceneNode, what: string) => skipped.push(`${node.name}: ${what}`);

  const painted = (commands: readonly PathCommand[], paints: readonly Paint[], node: SceneNode, evenOdd = false) =>
    paints
      .map((paint) => {
        const svg = svgPaint(paint, nextId('paint'));
        if (!svg) {
          if (paint.visible) skip(node, UNSUPPORTED_PAINTS[paint.type] ?? 'paint');
          return '';
        }
        if (svg.definition) definitions.push(svg.definition);
        const blend = CSS_BLEND_MODES.has(paint.blendMode) ? blendStyle(paint.blendMode) : '';
        return `<path d="${svgPathData(commands)}" fill="${svg.value}"${svg.opacity < 1 ? ` fill-opacity="${svgNumber(svg.opacity)}"` : ''}${evenOdd ? ' fill-rule="evenodd"' : ''}${blend}/>`;
      })
      .join('');

  const strokeOutlineOf = (node: SceneNode): PathCommand[] | null => {
    if (!options.strokeOutline) return null;
    if (node.type === 'FRAME') {
      // A frame's stroke follows its rectangle; per-side weights have no outline.
      return node.individualStrokeWeights ? null : options.strokeOutline({ ...node, type: 'RECTANGLE' } as unknown as SceneNode);
    }
    return options.strokeOutline(node);
  };

  const element = (node: SceneNode, isRoot: boolean): string => {
    if (!node.visible || node.type === 'SLICE') return '';
    if (node.type === 'TEXT') {
      skip(node, 'text');
      return '';
    }
    if (node.type === 'BOOLEAN_OPERATION') {
      skip(node, 'boolean group');
      return '';
    }
    if (node.isMask) {
      skip(node, 'mask');
      return '';
    }
    if (node.effects?.some((effect) => effect.visible)) skip(node, 'effects');
    const parts: string[] = [];
    if (hasGeometry(node)) {
      if (node.type === 'VECTOR') {
        for (const region of node.vectorNetwork.regions) parts.push(painted(regionFillPath(node.vectorNetwork, region), region.fills ?? node.fills, node, region.windingRule === 'EVENODD'));
      } else {
        const outline = shapeOutline(node);
        if (outline) parts.push(painted(outline, node.fills, node));
      }
    }
    const children = store
      .children(node.id)
      .map((id) => store.get(id))
      .filter((child): child is SceneNode => child !== undefined && isSceneNode(child))
      .map((child) => element(child, false))
      .join('');
    if (children) {
      const outline = node.type === 'FRAME' && node.clipsContent ? shapeOutline(node) : null;
      if (outline) {
        const clip = nextId('clip');
        definitions.push(`<clipPath id="${clip}"><path d="${svgPathData(outline)}"/></clipPath>`);
        parts.push(`<g clip-path="url(#${clip})">${children}</g>`);
      } else {
        parts.push(children);
      }
    }
    if (hasGeometry(node) && node.strokeWeight > 0 && node.strokes.some((paint) => paint.visible)) {
      const outline = strokeOutlineOf(node);
      if (outline) parts.push(painted(outline, node.strokes, node));
      else skip(node, 'stroke');
    }
    const content = parts.join('');
    if (!content) return '';
    const attributes: string[] = [];
    if (!isRoot) attributes.push(`transform="matrix(${node.transform.map(svgNumber).join(' ')})"`);
    if (node.opacity < 1) attributes.push(`opacity="${svgNumber(node.opacity)}"`);
    if (CSS_BLEND_MODES.has(node.blendMode)) attributes.push(blendStyle(node.blendMode).trim());
    else if (node.blendMode === 'PLUS_DARKER' || node.blendMode === 'PLUS_LIGHTER') skip(node, 'blend mode');
    return attributes.length > 0 ? `<g ${attributes.join(' ')}>${content}</g>` : content;
  };

  const body = element(root, true);
  const width = svgNumber(root.size.width);
  const height = svgNumber(root.size.height);
  const defs = definitions.length > 0 ? `<defs>${definitions.join('')}</defs>` : '';
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none"><title>${escapeXml(root.name)}</title>${defs}${body}</svg>`,
    skipped: [...new Set(skipped)],
  };
}
