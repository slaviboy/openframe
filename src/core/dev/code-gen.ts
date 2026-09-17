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

import { toHex6 } from '../color/color';
import type { Paint, SceneNode, TextNode } from '../schema/document';

/** The languages Dev Mode writes a selection out in. */
export type CodeLanguage = 'CSS' | 'SWIFTUI' | 'UIKIT' | 'COMPOSE' | 'ANDROID_XML';

/** The units a measurement is written in; which are offered depends on the language. */
export type CodeUnit = 'px' | 'rem' | 'pt' | 'dp' | 'sp';

export const CODE_LANGUAGE_LABELS: Readonly<Record<CodeLanguage, string>> = {
  CSS: 'CSS',
  SWIFTUI: 'SwiftUI',
  UIKIT: 'UIKit',
  COMPOSE: 'Compose',
  ANDROID_XML: 'Android XML',
};

/** The units each language offers, the first being what it starts on. */
export const CODE_UNITS: Readonly<Record<CodeLanguage, readonly CodeUnit[]>> = {
  CSS: ['px', 'rem'],
  SWIFTUI: ['pt', 'px'],
  UIKIT: ['pt', 'px'],
  COMPOSE: ['dp', 'px', 'sp'],
  ANDROID_XML: ['dp', 'px', 'sp'],
};

/** What a unit divides a measurement in pixels by, unless the unit scale says otherwise. */
export const DEFAULT_UNIT_SCALE: Readonly<Record<CodeUnit, number>> = { px: 1, rem: 16, pt: 1, dp: 1, sp: 1 };

export interface CodeOptions {
  readonly language: CodeLanguage;
  readonly unit: CodeUnit;
  /** What a measurement in pixels is divided by; a root font size for rems, a scale factor for points. */
  readonly scale?: number;
}

/** A measurement written out: scaled, rounded to two decimals, and without a trailing `.0`. */
function measure(px: number, options: CodeOptions): string {
  const scale = options.scale && options.scale > 0 ? options.scale : DEFAULT_UNIT_SCALE[options.unit];
  const value = px / scale;
  return `${Math.round(value * 100) / 100}`;
}

/** A measurement with the unit after it, as CSS and Android write them. */
const withUnit = (px: number, options: CodeOptions): string => `${measure(px, options)}${options.unit}`;

/** The first paint that is actually painted, which is the one the code shows. */
const firstPaint = (paints: readonly Paint[] | undefined): Paint | undefined => paints?.find((paint) => paint.visible && paint.opacity > 0);

/** A solid paint's color as `#rrggbb`, or null when the paint is not a flat color. */
function solidHex(paint: Paint | undefined): string | null {
  return paint?.type === 'SOLID' ? `#${toHex6(paint.color).toUpperCase()}` : null;
}

/** A solid paint's color as SwiftUI and Compose want it, in parts of one. */
function solidParts(paint: Paint | undefined): { r: number; g: number; b: number } | null {
  if (paint?.type !== 'SOLID') return null;
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return { r: round(paint.color.r), g: round(paint.color.g), b: round(paint.color.b) };
}

/** The corner radius a layer is drawn with, if it has one. */
const radiusOf = (node: SceneNode): number => ('cornerRadius' in node ? (node.cornerRadius ?? 0) : 0);

/** The auto layout a frame carries, if it lays its children out at all. */
function layoutOf(node: SceneNode) {
  if (node.type !== 'FRAME' || !node.layoutMode) return null;
  return {
    direction: node.layoutMode,
    gap: node.itemSpacing ?? 0,
    top: node.paddingTop ?? 0,
    right: node.paddingRight ?? 0,
    bottom: node.paddingBottom ?? 0,
    left: node.paddingLeft ?? 0,
  };
}

/** The line height in pixels, whatever it is written in; auto has none to write. */
function lineHeightPx(node: TextNode): number | null {
  if (node.lineHeight.unit === 'PIXELS') return node.lineHeight.value;
  if (node.lineHeight.unit === 'PERCENT') return (node.lineHeight.value / 100) * node.fontSize;
  return null;
}

/** The CSS font weight a style name stands for. */
function fontWeight(style: string): number {
  const name = style.toLowerCase();
  const weights: readonly (readonly [string, number])[] = [
    ['thin', 100],
    ['extralight', 200],
    ['ultralight', 200],
    ['light', 300],
    ['regular', 400],
    ['normal', 400],
    ['medium', 500],
    ['semibold', 600],
    ['demibold', 600],
    ['extrabold', 800],
    ['ultrabold', 800],
    ['bold', 700],
    ['black', 900],
    ['heavy', 900],
  ];
  const plain = name.replace(/\s|-/g, '');
  return weights.find(([word]) => plain.includes(word))?.[1] ?? 400;
}

function cssFor(node: SceneNode, options: CodeOptions): string[] {
  const lines = [`width: ${withUnit(node.size.width, options)};`, `height: ${withUnit(node.size.height, options)};`];
  const layout = layoutOf(node);
  if (layout) {
    lines.push('display: flex;', `flex-direction: ${layout.direction === 'HORIZONTAL' ? 'row' : 'column'};`);
    if (layout.gap > 0) lines.push(`gap: ${withUnit(layout.gap, options)};`);
    const pad = [layout.top, layout.right, layout.bottom, layout.left];
    if (pad.some((value) => value > 0)) lines.push(`padding: ${pad.map((value) => withUnit(value, options)).join(' ')};`);
  }
  const radius = radiusOf(node);
  if (radius > 0) lines.push(`border-radius: ${withUnit(radius, options)};`);

  if (node.type === 'TEXT') {
    lines.push(`font-family: "${node.fontName.family}";`, `font-size: ${withUnit(node.fontSize, options)};`, `font-weight: ${fontWeight(node.fontName.style)};`);
    const height = lineHeightPx(node);
    if (height !== null) lines.push(`line-height: ${withUnit(height, options)};`);
    if (node.letterSpacing.unit === 'PIXELS' && node.letterSpacing.value !== 0) lines.push(`letter-spacing: ${withUnit(node.letterSpacing.value, options)};`);
    if (node.textAlignHorizontal !== 'LEFT') lines.push(`text-align: ${node.textAlignHorizontal.toLowerCase()};`);
    const color = solidHex(firstPaint('fills' in node ? node.fills : undefined));
    if (color) lines.push(`color: ${color};`);
  } else {
    const fill = solidHex(firstPaint('fills' in node ? node.fills : undefined));
    if (fill) lines.push(`background: ${fill};`);
  }

  const stroke = solidHex(firstPaint('strokes' in node ? node.strokes : undefined));
  if (stroke && 'strokeWeight' in node && node.strokeWeight > 0) lines.push(`border: ${withUnit(node.strokeWeight, options)} solid ${stroke};`);
  if (node.opacity < 1) lines.push(`opacity: ${Math.round(node.opacity * 100) / 100};`);
  return lines;
}

function swiftUiFor(node: SceneNode, options: CodeOptions): string[] {
  const lines: string[] = [];
  if (node.type === 'TEXT') {
    lines.push(`Text("${node.characters.replace(/["\\]/g, '\\$&').split('\n')[0] ?? ''}")`);
    lines.push(`    .font(.custom("${node.fontName.family}", size: ${measure(node.fontSize, options)}))`);
    const color = solidParts(firstPaint(node.fills));
    if (color) lines.push(`    .foregroundColor(Color(red: ${color.r}, green: ${color.g}, blue: ${color.b}))`);
  } else {
    lines.push('Rectangle()');
    const fill = solidParts(firstPaint('fills' in node ? node.fills : undefined));
    if (fill) lines.push(`    .fill(Color(red: ${fill.r}, green: ${fill.g}, blue: ${fill.b}))`);
  }
  lines.push(`    .frame(width: ${measure(node.size.width, options)}, height: ${measure(node.size.height, options)})`);
  const radius = radiusOf(node);
  if (radius > 0) lines.push(`    .cornerRadius(${measure(radius, options)})`);
  if (node.opacity < 1) lines.push(`    .opacity(${Math.round(node.opacity * 100) / 100})`);
  return lines;
}

function uiKitFor(node: SceneNode, options: CodeOptions): string[] {
  const lines = [`let view = UIView(frame: CGRect(x: 0, y: 0, width: ${measure(node.size.width, options)}, height: ${measure(node.size.height, options)}))`];
  const fill = solidParts(firstPaint('fills' in node ? node.fills : undefined));
  if (fill) lines.push(`view.backgroundColor = UIColor(red: ${fill.r}, green: ${fill.g}, blue: ${fill.b}, alpha: 1)`);
  const radius = radiusOf(node);
  if (radius > 0) lines.push(`view.layer.cornerRadius = ${measure(radius, options)}`);
  if (node.opacity < 1) lines.push(`view.alpha = ${Math.round(node.opacity * 100) / 100}`);
  return lines;
}

/** A color as Compose writes it: `0xAARRGGBB`. */
const composeColor = (paint: Paint | undefined): string | null => {
  const hex = solidHex(paint);
  return hex === null ? null : `0xFF${hex.slice(1)}`;
};

function composeFor(node: SceneNode, options: CodeOptions): string[] {
  const unit = options.unit === 'px' ? 'dp' : options.unit;
  const size = (value: number) => `${measure(value, options)}.${unit}`;
  const lines = ['Modifier', `    .size(width = ${size(node.size.width)}, height = ${size(node.size.height)})`];
  const radius = radiusOf(node);
  const color = composeColor(firstPaint('fills' in node ? node.fills : undefined));
  if (color) lines.push(radius > 0 ? `    .background(Color(${color}), shape = RoundedCornerShape(${size(radius)}))` : `    .background(Color(${color}))`);
  else if (radius > 0) lines.push(`    .clip(RoundedCornerShape(${size(radius)}))`);
  const layout = layoutOf(node);
  if (layout && layout.gap > 0) lines.push(`    // Arrangement.spacedBy(${size(layout.gap)})`);
  if (layout && [layout.top, layout.right, layout.bottom, layout.left].some((value) => value > 0)) {
    lines.push(`    .padding(start = ${size(layout.left)}, top = ${size(layout.top)}, end = ${size(layout.right)}, bottom = ${size(layout.bottom)})`);
  }
  if (node.opacity < 1) lines.push(`    .alpha(${Math.round(node.opacity * 100) / 100}f)`);
  return lines;
}

function androidXmlFor(node: SceneNode, options: CodeOptions): string[] {
  const unit = options.unit === 'px' ? 'px' : options.unit;
  const size = (value: number) => `${measure(value, options)}${unit}`;
  const tag = node.type === 'TEXT' ? 'TextView' : 'View';
  const lines = [`<${tag}`, `    android:layout_width="${size(node.size.width)}"`, `    android:layout_height="${size(node.size.height)}"`];
  const fill = solidHex(firstPaint('fills' in node ? node.fills : undefined));
  if (node.type === 'TEXT') {
    lines.push(`    android:text="${node.characters.split('\n')[0]?.replace(/"/g, '&quot;') ?? ''}"`, `    android:textSize="${measure(node.fontSize, options)}sp"`);
    if (fill) lines.push(`    android:textColor="#${fill.slice(1)}"`);
  } else if (fill) {
    lines.push(`    android:background="${fill}"`);
  }
  if (node.opacity < 1) lines.push(`    android:alpha="${Math.round(node.opacity * 100) / 100}"`);
  lines.push('    />');
  return lines;
}

/** Writes a layer out in the language chosen, in the unit chosen: what Dev Mode's Code section shows. */
export function generateCode(node: SceneNode, options: CodeOptions): string {
  switch (options.language) {
    case 'CSS':
      return cssFor(node, options).join('\n');
    case 'SWIFTUI':
      return swiftUiFor(node, options).join('\n');
    case 'UIKIT':
      return uiKitFor(node, options).join('\n');
    case 'COMPOSE':
      return composeFor(node, options).join('\n');
    case 'ANDROID_XML':
      return androidXmlFor(node, options).join('\n');
  }
}
