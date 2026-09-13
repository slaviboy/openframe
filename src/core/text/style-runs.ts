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

import { valuesEqual } from '../ops/equality';
import type { FontName, LetterSpacing, LineHeight, Paint, TextNode } from '../schema/document';

/**
 * Mixed styles within a text layer. The layer's own properties are the default style; `styleRuns`
 * override some of them on character ranges [start, end) (UTF-16 offsets). Runs are kept sorted,
 * non-overlapping, merged when adjacent runs have the same overrides, and without overrides equal
 * to the default, so a uniformly styled layer has no runs.
 */

/** The full style of a stretch of text. */
export interface TextStyle {
  readonly fontName: FontName;
  readonly fontSize: number;
  readonly lineHeight: LineHeight;
  readonly letterSpacing: LetterSpacing;
  readonly fills: readonly Paint[];
}

export type TextStyleKey = keyof TextStyle;
export type TextStyleOverrides = { readonly [K in TextStyleKey]?: TextStyle[K] | undefined };

export interface TextStyleRun {
  readonly start: number;
  readonly end: number;
  readonly style: TextStyleOverrides;
}

/** A stretch of text [start, end) with its resolved style. */
export interface TextSegment extends TextStyle {
  readonly start: number;
  readonly end: number;
}

export const TEXT_STYLE_KEYS: readonly TextStyleKey[] = ['fontName', 'fontSize', 'lineHeight', 'letterSpacing', 'fills'];

type RunsNode = Pick<TextNode, 'characters' | 'fontName' | 'fontSize' | 'lineHeight' | 'letterSpacing' | 'fills'> & { readonly styleRuns?: readonly TextStyleRun[] | undefined };

/** The layer's default style. */
export function baseTextStyle(node: RunsNode): TextStyle {
  return { fontName: node.fontName, fontSize: node.fontSize, lineHeight: node.lineHeight, letterSpacing: node.letterSpacing, fills: node.fills };
}

function withOverrides(base: TextStyle, overrides: TextStyleOverrides): TextStyle {
  const style: Record<string, unknown> = { ...base };
  for (const key of TEXT_STYLE_KEYS) if (overrides[key] !== undefined) style[key] = overrides[key];
  return style as unknown as TextStyle;
}

/** Segments covering the whole text in order, each with its resolved style (one segment when uniform). */
export function textSegments(node: RunsNode): TextSegment[] {
  const base = baseTextStyle(node);
  const length = node.characters.length;
  const segments: TextSegment[] = [];
  let at = 0;
  for (const run of node.styleRuns ?? []) {
    const start = Math.max(at, Math.min(length, run.start));
    const end = Math.min(length, run.end);
    if (end <= start) continue;
    if (start > at) segments.push({ ...base, start: at, end: start });
    segments.push({ ...withOverrides(base, run.style), start, end });
    at = end;
  }
  if (at < length || segments.length === 0) segments.push({ ...base, start: at, end: length });
  return segments;
}

/** The style of the character at `offset` (clamped to the text). */
export function textStyleAt(node: RunsNode, offset: number): TextStyle {
  const segments = textSegments(node);
  const at = Math.min(Math.max(0, offset), Math.max(0, node.characters.length - 1));
  return segments.find((s) => at >= s.start && at < s.end) ?? segments[segments.length - 1]!;
}

/** Converts resolved segments back to normalized runs relative to the default style. */
function toRuns(segments: readonly TextSegment[], base: TextStyle): TextStyleRun[] | undefined {
  const runs: TextStyleRun[] = [];
  for (const segment of segments) {
    if (segment.end <= segment.start) continue;
    const style: Record<string, unknown> = {};
    for (const key of TEXT_STYLE_KEYS) if (!valuesEqual(segment[key], base[key])) style[key] = segment[key];
    if (Object.keys(style).length === 0) continue;
    const last = runs[runs.length - 1];
    if (last && last.end === segment.start && valuesEqual(last.style, style)) runs[runs.length - 1] = { ...last, end: segment.end };
    else runs.push({ start: segment.start, end: segment.end, style: style as TextStyleOverrides });
  }
  return runs.length > 0 ? runs : undefined;
}

/** Splits segments so that `offset` is a boundary. */
function splitAt(segments: readonly TextSegment[], offset: number): TextSegment[] {
  return segments.flatMap((s) => (offset > s.start && offset < s.end ? [{ ...s, end: offset }, { ...s, start: offset }] : [s]));
}

/** Runs after applying `overrides` to [start, end). */
export function styleRange(node: RunsNode, start: number, end: number, overrides: TextStyleOverrides): TextStyleRun[] | undefined {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(node.characters.length, Math.max(start, end));
  if (to <= from) return node.styleRuns && node.styleRuns.length > 0 ? [...node.styleRuns] : undefined;
  const segments = splitAt(splitAt(textSegments(node), from), to).map((s) => (s.start >= from && s.end <= to ? { ...withOverrides(s, overrides), start: s.start, end: s.end } : s));
  return toRuns(segments, baseTextStyle(node));
}

/**
 * Runs after changing the default style: overrides of the changed keys are cleared so the whole
 * layer takes the new value (a property change with no text range selected).
 */
export function clearRunKeys(node: RunsNode, keys: readonly TextStyleKey[]): TextStyleRun[] | undefined {
  const runs = (node.styleRuns ?? []).map((run) => ({
    ...run,
    style: Object.fromEntries(Object.entries(run.style).filter(([key]) => !keys.includes(key as TextStyleKey))) as TextStyleOverrides,
  }));
  return runs.some((r) => Object.keys(r.style).length > 0) ? toRuns(textSegments({ ...node, styleRuns: runs }), baseTextStyle(node)) : undefined;
}

/** The changed span between two texts: [start, end) of `before` was replaced by `insertedLength` characters. */
export function textChange(before: string, after: string): { start: number; end: number; insertedLength: number } {
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let suffix = 0;
  while (suffix < max - start && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  return { start, end: before.length - suffix, insertedLength: after.length - suffix - start };
}

/**
 * Runs for the node's text after an edit replaced [start, end) of its current characters with
 * `insertedLength` characters. Inserted text takes the style of the character before it (at the
 * very start, the style of the character after it), like typing in the reference editor.
 */
export function runsAfterEdit(node: RunsNode, start: number, end: number, insertedLength: number): TextStyleRun[] | undefined {
  if (!node.styleRuns || node.styleRuns.length === 0) return undefined;
  const length = node.characters.length;
  const inherit = length === 0 ? baseTextStyle(node) : start > 0 ? textStyleAt(node, start - 1) : textStyleAt(node, end);
  const segments = splitAt(splitAt(textSegments(node), start), end);
  const delta = insertedLength - (end - start);
  const next: TextSegment[] = [];
  for (const s of segments) {
    if (s.end <= start) next.push(s);
    else if (s.start >= end) next.push({ ...s, start: s.start + delta, end: s.end + delta });
  }
  const index = next.findIndex((s) => s.start >= start + insertedLength);
  const inserted = { ...inherit, start, end: start + insertedLength };
  if (index < 0) next.push(inserted);
  else next.splice(index, 0, inserted);
  return toRuns(next, baseTextStyle(node));
}

/** The distinct values of a style property over [start, end) (at the caret when empty). */
export function rangeValues<K extends TextStyleKey>(node: RunsNode, start: number, end: number, key: K): TextStyle[K][] {
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  const covered = to > from ? textSegments(node).filter((s) => s.end > from && s.start < to) : [textStyleAt(node, from > 0 ? from - 1 : 0)];
  const values: TextStyle[K][] = [];
  for (const s of covered) if (!values.some((v) => valuesEqual(v, s[key]))) values.push(s[key]);
  return values;
}
