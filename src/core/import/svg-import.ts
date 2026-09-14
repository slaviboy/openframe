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
import { multiply, scaling, translation, type Matrix } from '../math/matrix';
import type { Paint } from '../schema/document';
import { commandsToNetwork, ellipseCommands, polygonCommands } from '../vector/shape-networks';
import { networkBounds, transformNetworkBy, type VectorNetwork } from '../vector/vector-network';
import { parseSvgColor, parseSvgPaint, type SvgColor } from './svg-color';
import { parseSvgPath } from './svg-path-parse';
import { parseSvgTransform } from './svg-transform';

/** An SVG element, as parsed from markup: its tag (without a namespace prefix), attributes and element children. */
export interface SvgElement {
  readonly tag: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly SvgElement[];
}

/** A vector layer to create, positioned in the imported frame's space (its geometry starts at its position). */
export interface ImportedVector {
  readonly kind: 'vector';
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly network: VectorNetwork;
  readonly fills: Paint[];
  readonly strokes: Paint[];
  readonly strokeWeight: number;
  readonly opacity: number;
}

/** A group to create around its children. */
export interface ImportedGroup {
  readonly kind: 'group';
  readonly name: string;
  readonly opacity: number;
  readonly children: readonly ImportedLayer[];
}

export type ImportedLayer = ImportedVector | ImportedGroup;

/** An SVG file as layers: a frame of `width` × `height`, its layers, and what wasn't imported. */
export interface SvgImport {
  readonly width: number;
  readonly height: number;
  readonly children: readonly ImportedLayer[];
  /** What was left out, as `element: what`. */
  readonly skipped: readonly string[];
}

/** The inherited presentation properties SVG import reads. */
interface Style {
  readonly fill: string;
  readonly fillOpacity: number;
  readonly fillRule: 'NONZERO' | 'EVENODD';
  readonly stroke: string;
  readonly strokeOpacity: number;
  readonly strokeWidth: number;
  readonly color: string;
}

const INITIAL_STYLE: Style = { fill: 'black', fillOpacity: 1, fillRule: 'NONZERO', stroke: 'none', strokeOpacity: 1, strokeWidth: 1, color: 'black' };
/** Elements that are never drawn by themselves (their content is referenced, or it's metadata). */
const NOT_RENDERED: ReadonlySet<string> = new Set(['defs', 'title', 'desc', 'metadata', 'style', 'script', 'symbol', 'clippath', 'lineargradient', 'radialgradient', 'filter']);
/** Elements SVG import doesn't support, reported as skipped (markers and patterns aren't imported, as in the reference). */
const SKIPPED: Readonly<Record<string, string>> = { text: 'text', image: 'image', use: 'reused element (use)', foreignobject: 'embedded content', mask: 'mask', marker: 'marker', pattern: 'pattern', switch: 'conditional content' };
const NAMES: Readonly<Record<string, string>> = { path: 'Vector', rect: 'Rectangle', circle: 'Ellipse', ellipse: 'Ellipse', line: 'Line', polyline: 'Vector', polygon: 'Polygon', g: 'Group', a: 'Group', svg: 'Group' };
const MAX_ELEMENTS = 20_000;
const MAX_DEPTH = 64;
const KAPPA = 0.5522847498307936;

const LENGTH = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)(px)?\s*$/;

/** A length in user units (a number, optionally in px); `fallback` for anything else. */
function length(value: string | undefined, fallback: number): number {
  const match = value === undefined ? null : LENGTH.exec(value);
  return match ? Number(match[1]) : fallback;
}

function opacityValue(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const text = value.trim();
  const number = text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

/** The element's presentation attributes, with its `style` declarations taking precedence. */
function declarations(element: SvgElement): Record<string, string> {
  const values: Record<string, string> = { ...element.attributes };
  for (const declaration of (element.attributes.style ?? '').split(';')) {
    const colon = declaration.indexOf(':');
    if (colon > 0) values[declaration.slice(0, colon).trim().toLowerCase()] = declaration.slice(colon + 1).replace(/!important/i, '').trim();
  }
  return values;
}

function inherit(parent: Style, values: Readonly<Record<string, string>>): Style {
  const keep = (value: string | undefined) => (value === undefined || value === 'inherit' ? undefined : value);
  return {
    fill: keep(values.fill) ?? parent.fill,
    fillOpacity: opacityValue(keep(values['fill-opacity']), parent.fillOpacity),
    fillRule: keep(values['fill-rule']) === 'evenodd' ? 'EVENODD' : keep(values['fill-rule']) === 'nonzero' ? 'NONZERO' : parent.fillRule,
    stroke: keep(values.stroke) ?? parent.stroke,
    strokeOpacity: opacityValue(keep(values['stroke-opacity']), parent.strokeOpacity),
    strokeWidth: Math.max(0, length(keep(values['stroke-width']), parent.strokeWidth)),
    color: keep(values.color) ?? parent.color,
  };
}

/** Points of a `points` attribute (polyline, polygon). */
function points(text: string | undefined): Array<{ x: number; y: number }> {
  const numbers = (text ?? '')
    .trim()
    .split(/[\s,]+/)
    .filter((part) => part !== '')
    .map(Number);
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    if (!Number.isFinite(numbers[i]) || !Number.isFinite(numbers[i + 1])) break;
    out.push({ x: numbers[i]!, y: numbers[i + 1]! });
  }
  return out;
}

/** A rectangle with elliptical corners (rx, ry clamped to half its size), as path commands. */
function rectCommands(x: number, y: number, w: number, h: number, rx: number, ry: number): PathCommand[] {
  if (rx <= 0 || ry <= 0) return polygonCommands([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]);
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    { op: 'M', x: x + rx, y },
    { op: 'L', x: x + w - rx, y },
    { op: 'C', x1: x + w - rx + kx, y1: y, x2: x + w, y2: y + ry - ky, x: x + w, y: y + ry },
    { op: 'L', x: x + w, y: y + h - ry },
    { op: 'C', x1: x + w, y1: y + h - ry + ky, x2: x + w - rx + kx, y2: y + h, x: x + w - rx, y: y + h },
    { op: 'L', x: x + rx, y: y + h },
    { op: 'C', x1: x + rx - kx, y1: y + h, x2: x, y2: y + h - ry + ky, x, y: y + h - ry },
    { op: 'L', x, y: y + ry },
    { op: 'C', x1: x, y1: y + ry - ky, x2: x + rx - kx, y2: y, x: x + rx, y },
    { op: 'Z' },
  ];
}

/** A shape element's outline in its own user space; null for elements without one (or with no area to draw). */
function shapeCommands(tag: string, a: Readonly<Record<string, string>>): PathCommand[] | null {
  switch (tag) {
    case 'path': {
      const commands = parseSvgPath(a.d ?? '');
      return commands.length > 0 ? commands : null;
    }
    case 'rect': {
      const w = length(a.width, 0);
      const h = length(a.height, 0);
      if (w <= 0 || h <= 0) return null;
      let rx = a.rx === undefined ? undefined : length(a.rx, 0);
      let ry = a.ry === undefined ? undefined : length(a.ry, 0);
      rx ??= ry ?? 0;
      ry ??= rx;
      return rectCommands(length(a.x, 0), length(a.y, 0), w, h, Math.min(Math.max(0, rx), w / 2), Math.min(Math.max(0, ry), h / 2));
    }
    case 'circle':
    case 'ellipse': {
      const rx = tag === 'circle' ? length(a.r, 0) : length(a.rx, 0);
      const ry = tag === 'circle' ? rx : length(a.ry, 0);
      if (rx <= 0 || ry <= 0) return null;
      const cx = length(a.cx, 0);
      const cy = length(a.cy, 0);
      return ellipseCommands(2 * rx, 2 * ry).map((c): PathCommand => (c.op === 'Z' ? c : c.op === 'C' ? { ...c, x1: c.x1 + cx - rx, y1: c.y1 + cy - ry, x2: c.x2 + cx - rx, y2: c.y2 + cy - ry, x: c.x + cx - rx, y: c.y + cy - ry } : { ...c, x: c.x + cx - rx, y: c.y + cy - ry }));
    }
    case 'line':
      return [
        { op: 'M', x: length(a.x1, 0), y: length(a.y1, 0) },
        { op: 'L', x: length(a.x2, 0), y: length(a.y2, 0) },
      ];
    case 'polyline':
    case 'polygon': {
      const list = points(a.points);
      if (list.length < 2) return null;
      return [{ op: 'M', ...list[0]! }, ...list.slice(1).map((p): PathCommand => ({ op: 'L', ...p })), ...(tag === 'polygon' ? [{ op: 'Z' } as const] : [])];
    }
    default:
      return null;
  }
}

/**
 * An SVG document as layers, as when importing an SVG file: shapes (paths, rectangles, circles, ellipses, lines,
 * polylines and polygons) become editable vector layers with their solid fills and strokes, `<g>` elements become
 * groups, and transforms and the view box are applied to the geometry. Text, images, reused elements, gradient and
 * pattern paints, masks and markers aren't imported; `skipped` lists them. Null when the root isn't an `<svg>` element.
 */
export function importSvg(root: SvgElement): SvgImport | null {
  if (root.tag.toLowerCase() !== 'svg') return null;
  const viewBox = (root.attributes.viewBox ?? root.attributes.viewbox ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const hasViewBox = viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2]! > 0 && viewBox[3]! > 0;
  const width = length(root.attributes.width, hasViewBox ? viewBox[2]! : 300);
  const height = length(root.attributes.height, hasViewBox ? viewBox[3]! : 150);
  if (!(width > 0) || !(height > 0)) return null;
  let base: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  if (hasViewBox) {
    // preserveAspectRatio's default, xMidYMid meet: a uniform scale that fits, centered.
    const [vx, vy, vw, vh] = viewBox as [number, number, number, number];
    const scale = Math.min(width / vw, height / vh);
    base = multiply(translation((width - vw * scale) / 2, (height - vh * scale) / 2), multiply(scaling(scale), translation(-vx, -vy)));
  }

  const skipped: string[] = [];
  let count = 0;
  const skip = (element: SvgElement, what: string) => skipped.push(`${element.attributes.id ? `${element.attributes.id}: ` : ''}${what}`);

  const paintOf = (element: SvgElement, value: string, opacity: number, style: Style, what: 'fill' | 'stroke'): Paint[] => {
    const paint = parseSvgPaint(value);
    if (!paint || paint.kind === 'none') return [];
    if (paint.kind === 'reference') {
      skip(element, `${what} paint (gradient or pattern)`);
      return [];
    }
    const color: SvgColor | null = paint.kind === 'color' ? paint.color : parseSvgColor(style.color);
    if (!color) return [];
    const alpha = color.a * opacity;
    return alpha > 0 ? [{ type: 'SOLID', color: { r: color.r, g: color.g, b: color.b, a: 1 }, opacity: alpha, visible: true, blendMode: 'NORMAL' }] : [];
  };

  const visit = (element: SvgElement, parentStyle: Style, parentMatrix: Matrix, depth: number): ImportedLayer | null => {
    if (++count > MAX_ELEMENTS || depth > MAX_DEPTH) return null;
    const tag = element.tag.toLowerCase();
    if (NOT_RENDERED.has(tag)) return null;
    if (SKIPPED[tag]) {
      skip(element, SKIPPED[tag]!);
      return null;
    }
    const values = declarations(element);
    if (values.display === 'none') return null;
    const style = inherit(parentStyle, values);
    const matrix = depth === 0 ? parentMatrix : multiply(parentMatrix, parseSvgTransform(element.attributes.transform));
    const opacity = opacityValue(values.opacity, 1);
    const name = element.attributes.id || NAMES[tag] || tag;

    if (tag === 'g' || tag === 'a' || tag === 'svg') {
      const children = element.children.map((child) => visit(child, style, matrix, depth + 1)).filter((layer): layer is ImportedLayer => layer !== null);
      if (children.length === 0) return null;
      return { kind: 'group', name, opacity, children };
    }
    const commands = shapeCommands(tag, element.attributes);
    if (!commands) {
      if (!NAMES[tag]) skip(element, `unsupported element <${tag}>`);
      return null;
    }
    let network = transformNetworkBy(commandsToNetwork(commands), matrix);
    if (style.fillRule === 'EVENODD') network = { ...network, regions: network.regions.map((region) => ({ ...region, windingRule: 'EVENODD' as const })) };
    const bounds = networkBounds(network);
    if (!bounds) return null;
    network = transformNetworkBy(network, translation(-bounds.x, -bounds.y));
    // Strokes scale with the transform (by its average scale).
    const strokeScale = Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c));
    const closed = network.regions.length > 0;
    return {
      kind: 'vector',
      name,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      network,
      fills: closed ? paintOf(element, style.fill, style.fillOpacity, style, 'fill') : [],
      strokes: style.strokeWidth > 0 ? paintOf(element, style.stroke, style.strokeOpacity, style, 'stroke') : [],
      strokeWeight: style.strokeWidth * strokeScale,
      opacity,
    };
  };

  const top = visit(root, INITIAL_STYLE, base, 0);
  const children = top === null ? [] : top.kind === 'group' ? top.children : [top];
  if (count > MAX_ELEMENTS) skipped.push(`elements beyond the first ${MAX_ELEMENTS}`);
  return { width, height, children, skipped: [...new Set(skipped)] };
}
