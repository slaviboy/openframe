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
import { hasGeometry, isSceneNode, type BlendMode, type Paint, type SceneNode, type Size } from '../schema/document';
import { imagePlacement } from '../image/image-fit';
import { maskRuns } from '../scene/masks';
import { regionFillPath } from '../vector/vector-network';
import { svgColor, svgPaint, type SvgPaint } from './svg-paint';
import { escapeXml, svgNumber, svgPathData } from './svg-path';

export interface SvgExportOptions {
  /** The area a layer's stroke covers, in its local space (the rendering engine's GeometryService); strokes are exported as fills. */
  readonly strokeOutline?: ((node: SceneNode) => PathCommand[] | null) | undefined;
  /** Writes an `id` attribute on each layer, taken from its name, so the markup can be styled or scripted. */
  readonly idAttribute?: boolean;
  /** Keeps a plain stroke as a `stroke` attribute rather than outlining it into a fill, where SVG draws it the same. */
  readonly simplifyStroke?: boolean;
  /** The outline a boolean group combines to, in its own space (the rendering engine's GeometryService). */
  readonly booleanOutline?: ((node: SceneNode) => PathCommand[] | null) | undefined;
  /** A text layer's glyphs as outlines in its own space, worked out ahead of the export (a font has to be read). */
  readonly textOutline?: ((node: SceneNode) => PathCommand[] | null) | undefined;
  /** A stored image by its hash, with its pixel size, so an image fill can be carried in the markup as a data URI. */
  readonly image?: ((hash: string) => { readonly bytes: Uint8Array; readonly type: string; readonly size: Size } | null) | undefined;
}

export interface SvgExport {
  readonly svg: string;
  /** What was left out, as `layer name: what`, because SVG export doesn't support it. */
  readonly skipped: readonly string[];
}

/** Blend modes CSS (and so SVG) has, as `mix-blend-mode`. */
const CSS_BLEND_MODES: ReadonlySet<BlendMode> = new Set([
  'DARKEN',
  'MULTIPLY',
  'COLOR_BURN',
  'LIGHTEN',
  'SCREEN',
  'COLOR_DODGE',
  'OVERLAY',
  'SOFT_LIGHT',
  'HARD_LIGHT',
  'DIFFERENCE',
  'EXCLUSION',
  'HUE',
  'SATURATION',
  'COLOR',
  'LUMINOSITY',
]);

const UNSUPPORTED_PAINTS: Readonly<Record<string, string>> = {
  GRADIENT_ANGULAR: 'angular gradient',
  GRADIENT_DIAMOND: 'diamond gradient',
  IMAGE: 'image fill',
  PATTERN: 'pattern fill',
};

/** Base64, written out here because the core carries no web types and so has no `btoa`. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const word = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(word >> 18) & 63]! + ALPHABET[(word >> 12) & 63]! + (b === undefined ? '=' : ALPHABET[(word >> 6) & 63]!) + (c === undefined ? '=' : ALPHABET[word & 63]!);
  }
  return out;
}

/** The box a layer's per-side stroke covers: the box grown by each side's weight, less the box shrunk by it. */
function individualStrokeRing(node: SceneNode): PathCommand[] | null {
  if (!hasGeometry(node) || !('individualStrokeWeights' in node) || !node.individualStrokeWeights) return null;
  const { top, right, bottom, left } = node.individualStrokeWeights;
  const { width, height } = node.size;
  // Each side's weight reaches outwards, inwards or half of each, which is what the align says.
  const out = node.strokeAlign === 'INSIDE' ? 0 : node.strokeAlign === 'OUTSIDE' ? 1 : 0.5;
  const rect = (x: number, y: number, w: number, h: number): PathCommand[] =>
    w <= 0 || h <= 0 ? [] : [{ op: 'M', x, y }, { op: 'L', x: x + w, y }, { op: 'L', x: x + w, y: y + h }, { op: 'L', x, y: y + h }, { op: 'Z' }];
  const outer = rect(-left * out, -top * out, width + (left + right) * out, height + (top + bottom) * out);
  const inner = rect(left * (1 - out), top * (1 - out), width - (left + right) * (1 - out), height - (top + bottom) * (1 - out));
  return outer.length > 0 ? [...outer, ...inner] : null;
}

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
      return roundedPolygon(
        points,
        points.map(() => node.cornerRadius ?? 0),
        node.cornerSmoothing ?? 0,
      );
    }
    default:
      return null;
  }
}

/**
 * A layer and its children as an SVG document the size of the layer (in its own space). Shapes, frames (clipping
 * their content), vectors, groups and boolean groups are exported with solid, linear and radial gradient and image
 * paints, strokes as filled outlines (or as strokes, with `simplifyStroke`), per-side stroke weights as the ring they
 * cover, text as the outlines of its glyphs, masks as SVG masks, a drop shadow and a layer blur as a filter, and
 * opacity and blend modes. What SVG cannot draw the same way — pattern fills, angular and diamond gradients, inner
 * shadows, background blurs, noise, and a second drop shadow — is left out, and `skipped` lists it. The outlines a
 * boolean group and a text layer need are worked out by the caller, and without them those layers are left out too.
 * Null for a layer without an area.
 */
export function exportSvg(store: DocumentStore, rootId: Id, options: SvgExportOptions = {}): SvgExport | null {
  const root = store.get(rootId);
  if (!root || !isSceneNode(root) || root.size.width <= 0 || root.size.height <= 0) return null;
  const definitions: string[] = [];
  const skipped: string[] = [];
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}${counter++}`;
  const skip = (node: SceneNode, what: string) => skipped.push(`${node.name}: ${what}`);
  // Ids come from the layer names, which need not be unique, so a repeated one is numbered.
  const usedIds = new Map<string, number>();
  const idFor = (node: SceneNode): string => {
    const base = node.name.trim().replaceAll(/\s+/g, '-') || 'layer';
    const seen = usedIds.get(base) ?? 0;
    usedIds.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen}`;
  };

  /**
   * An image fill as a pattern of the stored file, placed the way the canvas places it. The image goes into the
   * markup as a data URI, so the file stands on its own.
   */
  const imagePattern = (paint: Paint, node: SceneNode): SvgPaint | null => {
    if (paint.type !== 'IMAGE' || !options.image || paint.imageHash === undefined) return null;
    const stored = options.image(paint.imageHash);
    if (!stored) return null;
    const id = nextId('image');
    const { width, height } = node.size;
    // The pattern covers the layer, and the image inside it is laid out by the same rules the canvas uses.
    const placement = imagePlacement(paint, stored.size, { width, height });
    if (!placement) return null;
    const m = placement.matrix;
    const tile = placement.tile ? '' : ' preserveAspectRatio="none"';
    const href = `data:${stored.type};base64,${base64(stored.bytes)}`;
    const definition =
      `<pattern id="${escapeXml(id)}" patternUnits="userSpaceOnUse" width="${svgNumber(width)}" height="${svgNumber(height)}">` +
      `<g transform="matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(svgNumber).join(' ')})">` +
      `<image href="${href}" width="${svgNumber(stored.size.width)}" height="${svgNumber(stored.size.height)}"${tile}/></g></pattern>`;
    return { value: `url(#${escapeXml(id)})`, opacity: paint.opacity, definition };
  };

  const painted = (commands: readonly PathCommand[], paints: readonly Paint[], node: SceneNode, evenOdd = false) =>
    paints
      .map((paint) => {
        const svg = svgPaint(paint, nextId('paint')) ?? imagePattern(paint, node);
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

  /**
   * A stroke written as SVG's own `stroke`, which only matches what the canvas draws when it runs along the middle
   * of a single closed outline at one weight, in a solid color. Anything else is outlined into a fill instead.
   */
  const strokeAttributes = (node: SceneNode): { readonly commands: readonly PathCommand[]; readonly attributes: string } | null => {
    if (!hasGeometry(node) || node.strokeAlign !== 'CENTER' || ('individualStrokeWeights' in node && node.individualStrokeWeights) || node.strokeDashes?.length) return null;
    const visible = node.strokes.filter((paint) => paint.visible);
    const [paint] = visible;
    if (visible.length !== 1 || paint?.type !== 'SOLID') return null;
    const commands = shapeOutline(node);
    if (!commands) return null;
    const svg = svgPaint(paint, nextId('paint'));
    if (!svg) return null;
    const join = node.strokeJoin === 'ROUND' ? ' stroke-linejoin="round"' : node.strokeJoin === 'BEVEL' ? ' stroke-linejoin="bevel"' : '';
    const opacity = svg.opacity < 1 ? ` stroke-opacity="${svgNumber(svg.opacity)}"` : '';
    return { commands, attributes: `stroke="${svg.value}" stroke-width="${svgNumber(node.strokeWeight)}"${opacity}${join}` };
  };

  /**
   * A layer's effects as an SVG filter: one drop shadow and one layer blur, which are the ones SVG draws the same
   * way. An inner shadow, a background blur, noise, texture or glass has no filter of its own here and is left out,
   * as is a second shadow — chaining `feDropShadow` would shadow the shadow rather than the layer.
   */
  const filterFor = (node: SceneNode): string | null => {
    const effects = (node.effects ?? []).filter((effect) => effect.visible);
    if (effects.length === 0) return null;
    const blur = effects.find((effect) => effect.type === 'LAYER_BLUR' && (effect.blurType ?? 'NORMAL') === 'NORMAL');
    const shadow = effects.find((effect) => effect.type === 'DROP_SHADOW');
    const blurRadius = blur?.type === 'LAYER_BLUR' ? blur.radius : 0;
    const left = effects.filter((effect) => effect !== blur && effect !== shadow);
    if (left.length > 0) skip(node, left.some((effect) => effect.type === 'DROP_SHADOW') ? 'more than one shadow' : 'effects');
    if (!shadow && !blur) return null;
    const parts: string[] = [];
    if (shadow?.type === 'DROP_SHADOW') {
      // A spread grows or shrinks the shadow before it is blurred, which is what a morphology does.
      const spread = shadow.spread !== 0 ? `<feMorphology operator="${shadow.spread > 0 ? 'dilate' : 'erode'}" radius="${svgNumber(Math.abs(shadow.spread))}"/>` : '';
      // SVG blurs by a standard deviation, which is half the radius the design carries.
      parts.push(
        `${spread}<feDropShadow dx="${svgNumber(shadow.offset.x)}" dy="${svgNumber(shadow.offset.y)}" stdDeviation="${svgNumber(shadow.radius / 2)}" flood-color="${svgColor(shadow.color)}" flood-opacity="${svgNumber(shadow.color.a)}"/>`,
      );
    }
    if (blur) parts.push(`<feGaussianBlur stdDeviation="${svgNumber(blurRadius / 2)}"/>`);
    const id = nextId('filter');
    // The filter reaches beyond the layer, so its region is grown to hold the shadow and the blur.
    definitions.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" filterUnits="objectBoundingBox">${parts.join('')}</filter>`);
    return id;
  };

  const element = (node: SceneNode, isRoot: boolean): string => {
    if (!node.visible || node.type === 'SLICE') return '';
    if (node.type === 'TEXT') {
      // Text goes in as the shapes of its glyphs, which is how SVG keeps what the canvas drew; the outlines are
      // worked out before the export, since reading a font file cannot wait for markup being written.
      const outline = options.textOutline?.(node) ?? null;
      if (!outline) {
        skip(node, 'text');
        return '';
      }
      const glyphs = painted(outline, node.fills, node);
      const attributes = [`transform="matrix(${node.transform.map(svgNumber).join(' ')})"`];
      if (options.idAttribute) attributes.unshift(`id="${escapeXml(idFor(node))}"`);
      if (node.opacity < 1) attributes.push(`opacity="${svgNumber(node.opacity)}"`);
      return glyphs ? `<g ${attributes.join(' ')}>${glyphs}</g>` : '';
    }
    if (node.type === 'BOOLEAN_OPERATION') {
      // Only the rendering engine can combine the shapes, so without it the group is left out.
      const outline = options.booleanOutline?.(node) ?? null;
      if (!outline) {
        skip(node, 'boolean group');
        return '';
      }
      const shape = painted(outline, node.fills, node);
      const attributes = [`transform="matrix(${node.transform.map(svgNumber).join(' ')})"`];
      if (options.idAttribute) attributes.unshift(`id="${escapeXml(idFor(node))}"`);
      if (node.opacity < 1) attributes.push(`opacity="${svgNumber(node.opacity)}"`);
      return shape ? `<g ${attributes.join(' ')}>${shape}</g>` : '';
    }
    const filter = filterFor(node);
    const parts: string[] = [];
    if (hasGeometry(node)) {
      if (node.type === 'VECTOR') {
        for (const region of node.vectorNetwork.regions) parts.push(painted(regionFillPath(node.vectorNetwork, region), region.fills ?? node.fills, node, region.windingRule === 'EVENODD'));
      } else {
        const outline = shapeOutline(node);
        if (outline) parts.push(painted(outline, node.fills, node));
      }
    }
    const asScene = (id: Id): SceneNode | null => {
      const child = store.get(id);
      return child !== undefined && isSceneNode(child) ? child : null;
    };
    const drawn = (id: Id) => {
      const child = asScene(id);
      return child ? element(child, false) : '';
    };
    // A mask covers the siblings above it, which is the run `maskRuns` gives back.
    const children = maskRuns(store, store.children(node.id))
      .map((run) => {
        if (run.mask === null) return drawn(run.content[0]!);
        const content = run.content.map(drawn).join('');
        const shape = drawn(run.mask);
        if (!content || !shape) return content;
        const id = nextId('mask');
        // The reference's own masks read the layer's alpha; a luminance mask is what SVG reads by default.
        const alpha = (asScene(run.mask)?.maskType ?? 'ALPHA') !== 'LUMINANCE';
        definitions.push(`<mask id="${id}" maskUnits="userSpaceOnUse"${alpha ? ' style="mask-type:alpha"' : ''}>${shape}</mask>`);
        return `<g mask="url(#${id})">${content}</g>`;
      })
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
      const simple = options.simplifyStroke ? strokeAttributes(node) : null;
      // A per-side stroke is a ring of the box grown by each side's weight less the box shrunk by it, as it is drawn.
      const outline = simple ? null : (individualStrokeRing(node) ?? strokeOutlineOf(node));
      if (simple) parts.push(`<path d="${svgPathData(simple.commands)}" fill="none" ${simple.attributes}/>`);
      else if (outline) parts.push(painted(outline, node.strokes, node, individualStrokeRing(node) !== null));
      else skip(node, 'stroke');
    }
    const content = parts.join('');
    if (!content) return '';
    const attributes: string[] = [];
    if (options.idAttribute) attributes.push(`id="${escapeXml(idFor(node))}"`);
    if (filter) attributes.push(`filter="url(#${filter})"`);
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
