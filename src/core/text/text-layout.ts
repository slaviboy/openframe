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

import type { Rect } from '../math/rect';
import type { Vec2 } from '../math/vec';
import type { FontName, Size, TextNode } from '../schema/document';
import type { FontAxis } from './font-names';

/** A caret: its x position and the vertical extent of its line, in layer coordinates. */
export interface TextCaretBox {
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
}

/** A font family that can be picked, with its style names. */
export interface FontFamilyInfo {
  readonly family: string;
  readonly styles: readonly string[];
  /** Uploaded or installed by the user (not bundled). */
  readonly user?: boolean | undefined;
  /** Has variation axes. */
  readonly variable?: boolean | undefined;
}

/**
 * Text shaping and layout (implemented by the engine with SkParagraph). All positions are in the
 * layer's local coordinates, including vertical alignment; offsets are UTF-16 indices into
 * `characters`.
 */
export interface TextLayoutService {
  /** The size the text needs: its natural size when `width` is null, else wrapped to `width`. */
  measure(node: TextNode, width: number | null): Size;
  /** Distance from the layer's top to its first line's alphabetic baseline (after vertical alignment); null without lines. */
  firstBaseline?(node: TextNode): number | null;
  /** Vertical trim: the space above the first line's cap height and below the last line's baseline; null without lines. */
  verticalTrim?(node: TextNode): { top: number; bottom: number } | null;
  /** The caret offset nearest to a point. */
  offsetAt(node: TextNode, point: Vec2): number;
  caretAt(node: TextNode, offset: number): TextCaretBox;
  /** Highlight rectangles of a range. */
  selectionRects(node: TextNode, start: number, end: number): Rect[];
  /** The offset on the visual line above (−1) or below (1) nearest to `x`; the text's start or end past the first or last line. */
  offsetOnAdjacentLine(node: TextNode, offset: number, direction: -1 | 1, x: number): number;
  /** The visual line containing `offset`, as [start, end) without its trailing line break. */
  lineRange(node: TextNode, offset: number): [number, number];
  /** Font families that can be picked, in display order. */
  availableFonts(): readonly FontFamilyInfo[];
  /** The family name inside a font file, or null when the engine can't read it. */
  fontFamilyOf?(bytes: Uint8Array): string | null;
  /** The OpenType feature tags that change how a font shapes text. */
  supportedFeatures?(font: FontName): readonly string[];
  /** The variation axes of a family (empty for static fonts and fonts whose axes can't be read). */
  fontAxes?(family: string): readonly FontAxis[];
  /** Where each character of a text layer sits, for reading its glyphs out as outlines. */
  glyphPlacements?(node: TextNode): readonly GlyphPlacement[];
  /** The font file registered for a family, whose glyph outlines can be read; null when there is none. */
  fontBytesOf?(family: string): Uint8Array | null;
}

/** Where one character of a laid-out text layer sits, in the layer's own space. */
export interface GlyphPlacement {
  readonly char: string;
  /** The left of the character's box, which is where its glyph is drawn from. */
  readonly x: number;
  /** The baseline the character sits on. */
  readonly baseline: number;
  readonly fontSize: number;
  /** The family the character's style asks for; the glyph may come from a fallback when it has no such glyph. */
  readonly family: string;
}
