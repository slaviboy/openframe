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

import type { CanvasKit, EmbindEnumEntity, LineMetrics, Paint as CkPaint, Paragraph, TextStyle, TypefaceFontProvider } from 'canvaskit-wasm';
import type { Id } from '@/core/ids/ids';
import type { Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import type { Size, TextAlignVertical, TextNode } from '@/core/schema/document';
import { parseFontStyle, VARIABLE_FONT_STYLES } from '@/core/text/font-style';
import { nextGrapheme, previousGrapheme } from '@/core/text/text-editing';
import type { FontFamilyInfo, TextCaretBox, TextLayoutService } from '@/core/text/text-layout';
import { isFallbackFamily } from './font-files';
import { textSegments, type TextSegment, type TextStyle as RunsStyle } from '@/core/text/style-runs';

/** Font bytes to register under a family name. */
export interface FontSource {
  readonly family: string;
  readonly bytes: ArrayBuffer | Uint8Array;
}

/** Paints glyphs: the paint for each mixed-style segment, over a background paint. */
export interface TextPainter {
  readonly background: CkPaint;
  paint(segment: TextSegment): CkPaint;
}

type RunStyle = Pick<RunsStyle, 'fontName' | 'fontSize' | 'lineHeight' | 'letterSpacing'>;

/** Layout width for text that never wraps. */
const UNBOUNDED = 1e6;
/** Stands in for empty text, so an empty layer keeps one line's height and a caret. */
const EMPTY = '​';
/** Laid-out paragraphs kept for caret and hit queries. */
const CACHE_LIMIT = 256;
const VERTICAL: Record<TextAlignVertical, number> = { TOP: 0, CENTER: 0.5, BOTTOM: 1 };

const round2 = (v: number) => Math.round(v * 100) / 100;

interface Layout {
  readonly node: TextNode;
  readonly paragraph: Paragraph;
  /** Offset of the paragraph's top in the layer (vertical alignment of fixed-size boxes). */
  readonly dy: number;
}

/**
 * Shapes and lays out text layers with SkParagraph (HarfBuzz shaping, ICU line breaking) from
 * registered fonts. Implements the editor's text layout service and builds painted paragraphs for
 * the renderer, so what is measured is exactly what is drawn.
 */
export class TextShaper implements TextLayoutService {
  private readonly provider: TypefaceFontProvider;
  private readonly families: string[] = [];
  private readonly layouts = new Map<Id, Layout>();

  constructor(
    private readonly ck: CanvasKit,
    fonts: readonly FontSource[],
  ) {
    this.provider = ck.TypefaceFontProvider.Make();
    for (const font of fonts) {
      this.provider.registerFont(font.bytes, font.family);
      if (!this.families.includes(font.family)) this.families.push(font.family);
    }
  }

  /** Registered family names, in registration order. */
  get registeredFamilies(): readonly string[] {
    return this.families;
  }

  /** The families users can pick (fallback subsets excluded). The bundled fonts are variable, with every weight upright and italic. */
  availableFonts(): readonly FontFamilyInfo[] {
    return this.families.filter((family) => !isFallbackFamily(family)).map((family) => ({ family, styles: VARIABLE_FONT_STYLES }));
  }

  dispose(): void {
    for (const layout of this.layouts.values()) layout.paragraph.delete();
    this.layouts.clear();
    this.provider.delete();
  }

  private textStyle(style: RunStyle): TextStyle {
    const ck = this.ck;
    const { weight, italic } = parseFontStyle(style.fontName.style);
    const weights: EmbindEnumEntity[] = [
      ck.FontWeight.Thin,
      ck.FontWeight.ExtraLight,
      ck.FontWeight.Light,
      ck.FontWeight.Normal,
      ck.FontWeight.Medium,
      ck.FontWeight.SemiBold,
      ck.FontWeight.Bold,
      ck.FontWeight.ExtraBold,
      ck.FontWeight.Black,
    ];
    const lineHeight = style.lineHeight.unit === 'PIXELS' ? style.lineHeight.value / style.fontSize : style.lineHeight.unit === 'PERCENT' ? style.lineHeight.value / 100 : null;
    return new ck.TextStyle({
      color: ck.BLACK,
      // Other registered families follow as fallbacks for characters the font lacks.
      fontFamilies: [style.fontName.family, ...this.families.filter((f) => f !== style.fontName.family)],
      fontSize: style.fontSize,
      fontStyle: { weight: weights[Math.min(8, Math.max(0, Math.round(weight / 100) - 1))]!, slant: italic ? ck.FontSlant.Italic : ck.FontSlant.Upright },
      fontVariations: [{ axis: 'wght', value: weight }],
      letterSpacing: style.letterSpacing.unit === 'PIXELS' ? style.letterSpacing.value : (style.letterSpacing.value / 100) * style.fontSize,
      ...(lineHeight !== null ? { heightMultiplier: lineHeight, halfLeading: true } : {}),
    });
  }

  /**
   * A paragraph of the layer's text with one style run per mixed-style segment. With a `painter`,
   * each segment is painted with the paint it returns over `background` (otherwise black). Not
   * laid out; the caller deletes it.
   */
  build(node: TextNode, painter?: TextPainter, maxLines?: number): Paragraph {
    const ck = this.ck;
    const align = { LEFT: ck.TextAlign.Left, CENTER: ck.TextAlign.Center, RIGHT: ck.TextAlign.Right, JUSTIFIED: ck.TextAlign.Justify }[node.textAlignHorizontal];
    const style = new ck.ParagraphStyle({
      textStyle: this.textStyle(node),
      textAlign: align,
      // Rounding widths up would wrap auto-width text laid out at its exact natural width.
      applyRoundingHack: false,
      ...(node.textAutoResize === 'TRUNCATE' ? { ellipsis: '…' } : {}),
      ...(maxLines !== undefined ? { maxLines } : {}),
    });
    const builder = ck.ParagraphBuilder.MakeFromFontProvider(style, this.provider);
    const segments = textSegments(node);
    for (const segment of segments) {
      const textStyle = this.textStyle(segment);
      // Painters may reuse one paint object: pushing copies it into the run.
      if (painter) builder.pushPaintStyle(textStyle, painter.paint(segment), painter.background);
      else builder.pushStyle(textStyle);
      builder.addText(node.characters === '' ? EMPTY : node.characters.slice(segment.start, segment.end));
      builder.pop();
    }
    const paragraph = builder.build();
    builder.delete();
    return paragraph;
  }

  /**
   * Lays out a paragraph for the layer's box: auto width at its natural width (never narrower
   * than the box), everything else wrapped to the box width. Truncated layers are rebuilt to the
   * lines that fit. Returns the paragraph to draw (possibly a new one) and its vertical offset.
   */
  layOut(node: TextNode, paragraph: Paragraph, rebuild: (maxLines: number) => Paragraph): { paragraph: Paragraph; dy: number } {
    let p = paragraph;
    if (node.textAutoResize === 'WIDTH_AND_HEIGHT') {
      p.layout(UNBOUNDED);
      p.layout(Math.max(node.size.width, p.getMaxIntrinsicWidth()) + 0.01);
    } else {
      p.layout(Math.max(0, node.size.width));
    }
    if (node.textAutoResize === 'TRUNCATE') {
      const lines = p.getLineMetrics();
      const fit = lines.filter((l) => l.baseline + l.descent <= node.size.height + 0.5).length;
      if (fit < lines.length) {
        p.delete();
        p = rebuild(Math.max(1, fit));
        p.layout(Math.max(0, node.size.width));
      }
    }
    const fixed = node.textAutoResize === 'NONE' || node.textAutoResize === 'TRUNCATE';
    return { paragraph: p, dy: fixed ? (node.size.height - p.getHeight()) * VERTICAL[node.textAlignVertical] : 0 };
  }

  private layout(node: TextNode): Layout {
    const cached = this.layouts.get(node.id);
    if (cached?.node === node) return cached;
    if (cached) {
      cached.paragraph.delete();
      this.layouts.delete(node.id);
    }
    const { paragraph, dy } = this.layOut(node, this.build(node), (maxLines) => this.build(node, undefined, maxLines));
    const layout = { node, paragraph, dy };
    this.layouts.set(node.id, layout);
    if (this.layouts.size > CACHE_LIMIT) {
      const [oldest] = this.layouts.keys();
      this.layouts.get(oldest!)?.paragraph.delete();
      this.layouts.delete(oldest!);
    }
    return layout;
  }

  measure(node: TextNode, width: number | null): Size {
    const paragraph = this.build(node);
    try {
      if (width === null) {
        paragraph.layout(UNBOUNDED);
        return { width: round2(paragraph.getMaxIntrinsicWidth()), height: round2(paragraph.getHeight()) };
      }
      paragraph.layout(Math.max(0, width));
      return { width, height: round2(paragraph.getHeight()) };
    } finally {
      paragraph.delete();
    }
  }

  private clamp(node: TextNode, offset: number): number {
    return Math.min(node.characters.length, Math.max(0, offset));
  }

  /** Index of the visual line containing `offset` (the last line starting at or before it). */
  private lineIndex(lines: readonly LineMetrics[], offset: number): number {
    for (let i = lines.length - 1; i >= 0; i--) if (lines[i]!.startIndex <= offset) return i;
    return 0;
  }

  offsetAt(node: TextNode, point: Vec2): number {
    if (node.characters === '') return 0;
    const { paragraph, dy } = this.layout(node);
    return this.clamp(node, paragraph.getGlyphPositionAtCoordinate(point.x, point.y - dy).pos);
  }

  caretAt(node: TextNode, offset: number): TextCaretBox {
    const { paragraph, dy } = this.layout(node);
    const text = node.characters;
    const at = this.clamp(node, offset);
    const lines = paragraph.getLineMetrics();
    if (lines.length === 0) return { x: 0, top: dy, bottom: dy + node.fontSize };
    const box = (index: number) => {
      const line = lines[this.lineIndex(lines, index)]!;
      return { top: line.baseline - line.ascent + dy, bottom: line.baseline + line.descent + dy };
    };
    const rect = (start: number, end: number) => paragraph.getRectsForRange(start, end, this.ck.RectHeightStyle.Tight, this.ck.RectWidthStyle.Tight)[0]?.rect;
    if (at < text.length && text[at] !== '\n') {
      const r = rect(at, nextGrapheme(text, at));
      if (r) return { x: r[0]!, ...box(at) };
    }
    if (at > 0 && text[at - 1] !== '\n') {
      const r = rect(previousGrapheme(text, at), at);
      if (r) return { x: r[2]!, ...box(at - 1) };
    }
    // An empty line: the start of the text or right after a line break.
    const width = paragraph.getMaxWidth();
    const x = node.textAlignHorizontal === 'CENTER' ? width / 2 : node.textAlignHorizontal === 'RIGHT' ? width : 0;
    return { x, ...box(at) };
  }

  selectionRects(node: TextNode, start: number, end: number): Rect[] {
    if (node.characters === '' || start >= end) return [];
    const { paragraph, dy } = this.layout(node);
    return paragraph
      .getRectsForRange(this.clamp(node, start), this.clamp(node, end), this.ck.RectHeightStyle.Max, this.ck.RectWidthStyle.Tight)
      .map(({ rect: r }) => ({ x: r[0]!, y: r[1]! + dy, width: r[2]! - r[0]!, height: r[3]! - r[1]! }));
  }

  offsetOnAdjacentLine(node: TextNode, offset: number, direction: -1 | 1, x: number): number {
    const { paragraph } = this.layout(node);
    const lines = paragraph.getLineMetrics();
    const target = this.lineIndex(lines, this.clamp(node, offset)) + direction;
    if (target < 0) return 0;
    if (target >= lines.length) return node.characters.length;
    return this.clamp(node, paragraph.getGlyphPositionAtCoordinate(x, lines[target]!.baseline).pos);
  }

  lineRange(node: TextNode, offset: number): [number, number] {
    if (node.characters === '') return [0, 0];
    const { paragraph } = this.layout(node);
    const lines = paragraph.getLineMetrics();
    const line = lines[this.lineIndex(lines, this.clamp(node, offset))];
    if (!line) return [0, 0];
    let end = this.clamp(node, line.endIndex);
    if (end > line.startIndex && node.characters[end - 1] === '\n') end--;
    return [this.clamp(node, line.startIndex), end];
  }
}
