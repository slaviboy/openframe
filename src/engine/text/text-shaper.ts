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

import type { Canvas, CanvasKit, EmbindEnumEntity, LineMetrics, Paint as CkPaint, Paragraph, TextStyle, TypefaceFontProvider } from 'canvaskit-wasm';
import type { Id } from '@/core/ids/ids';
import type { Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import type { FontName, OpenTypeFeatures, Size, TextAlignVertical, TextNode } from '@/core/schema/document';
import { FEATURE_PROBE_TEXT, isDefaultOnFeature, PROBED_FEATURES, toFontFeatures } from '@/core/text/opentype';
import { readFontAxes, type FontAxis } from '@/core/text/font-names';
import { BUNDLED_FONT_AXES, mergeAxes, variationSettings } from '@/core/text/font-variations';
import { resolveDirection } from '@/core/text/direction';
import { parseFontStyle, VARIABLE_FONT_STYLES } from '@/core/text/font-style';
import { nextGrapheme, previousGrapheme } from '@/core/text/text-editing';
import type { FontFamilyInfo, TextCaretBox, TextLayoutService } from '@/core/text/text-layout';
import { isFallbackFamily } from './font-files';
import { textSegments, textStyleAt, type TextSegment, type TextStyle as RunsStyle } from '@/core/text/style-runs';
import { applyTextCase } from '@/core/text/letter-case';
import { fromParagraphOffset, lineBudgets, paragraphAt, paragraphRanges, paragraphStyleOffset, toParagraphOffset, type ParagraphRange } from '@/core/text/paragraphs';
import { clampLevel, listCounters, listMarker, type ListItem } from '@/core/text/lists';

/** Font bytes to register under a family name. */
export interface FontSource {
  readonly family: string;
  readonly bytes: ArrayBuffer | Uint8Array;
}

/** Paints glyphs: the paint for each mixed-style segment, over a background paint. */
export interface TextPainter {
  readonly background: CkPaint;
  paint(segment: TextSegment): CkPaint;
  /** Color of underlines and strikethroughs (decorations don't take the glyph paint). */
  decorationColor?(segment: TextSegment): Float32Array;
}

type RunStyle = Pick<RunsStyle, 'fontName' | 'fontSize' | 'lineHeight' | 'letterSpacing'> & {
  readonly textDecoration?: RunsStyle['textDecoration'] | undefined;
  readonly textCase?: RunsStyle['textCase'] | undefined;
  readonly openTypeFeatures?: RunsStyle['openTypeFeatures'] | undefined;
  readonly fontVariations?: RunsStyle['fontVariations'] | undefined;
};

/** Layout width for text that never wraps. */
const UNBOUNDED = 1e6;
/** Stands in for an empty paragraph, so it keeps one line's height and a caret. */
const EMPTY = '​';
/** Laid-out text kept for caret and hit queries. */
const CACHE_LIMIT = 256;
const VERTICAL: Record<TextAlignVertical, number> = { TOP: 0, CENTER: 0.5, BOTTOM: 1 };
/** List indentation per level, in ems of the item's font size. */
const LIST_INDENT_EM = 1.5;
/** Gap between a list marker and its item's text, in ems. */
const LIST_MARKER_GAP_EM = 0.4;

const round2 = (v: number) => Math.round(v * 100) / 100;

/** One paragraph of a text layer, laid out. */
interface ParagraphLayout {
  readonly range: ParagraphRange;
  readonly paragraph: Paragraph;
  /** Placeholder characters before the paragraph's own (a first-line indent). */
  readonly prefix: number;
  /** Left edge of every line (list indentation), in the layer. */
  readonly left: number;
  /** The list marker, positioned in the block. */
  readonly marker: { readonly paragraph: Paragraph; readonly x: number; readonly y: number } | null;
  /** Top within the text block, before vertical alignment. */
  readonly top: number;
  readonly height: number;
  /** Cut off entirely by max lines or truncation. */
  readonly hidden: boolean;
}

/** A text layer's paragraphs stacked into a block. */
interface BlockLayout {
  readonly paragraphs: readonly ParagraphLayout[];
  /** The widest paragraph's natural width (for auto width). */
  readonly naturalWidth: number;
  readonly height: number;
  /** Offset of the block's top in the layer (vertical alignment of fixed-size boxes). */
  readonly dy: number;
}

interface CachedLayout {
  readonly node: TextNode;
  readonly block: BlockLayout;
}

/**
 * Shapes and lays out text layers with SkParagraph (HarfBuzz shaping, ICU line breaking) from
 * registered fonts. Each paragraph (text between line breaks) is its own SkParagraph, stacked with
 * the layer's paragraph spacing and offset by its first-line indent. Implements the editor's text
 * layout service and draws for the renderer, so what is measured is exactly what is drawn.
 */
export class TextShaper implements TextLayoutService {
  private readonly provider: TypefaceFontProvider;
  private readonly families: string[] = [];
  private readonly userFamilies = new Map<string, { styles: Set<string>; variable: boolean }>();
  private readonly layouts = new Map<Id, CachedLayout>();
  /** Supported OpenType features by "family\nstyle". */
  private readonly featureSupport = new Map<string, readonly string[]>();
  /** Variation axes of user families, read from their font files. */
  private readonly familyAxes = new Map<string, readonly FontAxis[]>();

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

  /**
   * The families users can pick (fallback subsets excluded). Bundled fonts are variable, with every
   * weight upright and italic; user families list the styles registered for them.
   */
  availableFonts(): readonly FontFamilyInfo[] {
    return this.families
      .filter((family) => !isFallbackFamily(family))
      .map((family) => {
        const user = this.userFamilies.get(family);
        if (!user) return { family, styles: VARIABLE_FONT_STYLES, variable: true };
        const order = (style: string) => {
          const { weight, italic } = parseFontStyle(style);
          return weight * 2 + (italic ? 1 : 0);
        };
        return { family, styles: [...user.styles].sort((a, b) => order(a) - order(b)), user: true, variable: user.variable };
      });
  }

  /** Registers user fonts (uploaded or installed); cached layouts are dropped so text reshapes with them. */
  registerFonts(fonts: readonly { readonly family: string; readonly style: string; readonly bytes: ArrayBuffer | Uint8Array; readonly variable: boolean }[]): void {
    for (const font of fonts) {
      this.provider.registerFont(font.bytes, font.family);
      if (!this.families.includes(font.family)) this.families.push(font.family);
      const entry = this.userFamilies.get(font.family) ?? { styles: new Set<string>(), variable: false };
      if (font.variable) for (const style of VARIABLE_FONT_STYLES) entry.styles.add(style);
      else entry.styles.add(font.style);
      entry.variable ||= font.variable;
      const axes = readFontAxes(font.bytes instanceof Uint8Array ? font.bytes : new Uint8Array(font.bytes));
      if (axes.length > 0) this.familyAxes.set(font.family, mergeAxes(this.familyAxes.get(font.family) ?? [], axes));
      this.userFamilies.set(font.family, entry);
    }
    this.featureSupport.clear();
    this.clearCache();
  }

  /**
   * The OpenType features that change how a font shapes text: sample text is shaped with each
   * feature switched from its default, and a feature counts when any glyph or position changes.
   * Cached per family and style.
   */
  supportedFeatures(font: FontName): readonly string[] {
    const key = `${font.family}\n${font.style}`;
    const cached = this.featureSupport.get(key);
    if (cached) return cached;
    const ck = this.ck;
    const signature = (openTypeFeatures: OpenTypeFeatures) => {
      const textStyle = this.textStyle({ fontName: font, fontSize: 32, lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PIXELS', value: 0 }, openTypeFeatures });
      const builder = ck.ParagraphBuilder.MakeFromFontProvider(new ck.ParagraphStyle({ textStyle, applyRoundingHack: false }), this.provider);
      builder.addText(FEATURE_PROBE_TEXT);
      const paragraph = builder.build();
      builder.delete();
      paragraph.layout(UNBOUNDED);
      const parts: number[] = [];
      for (const line of paragraph.getShapedLines()) {
        for (const run of line.runs) {
          parts.push(...run.glyphs);
          for (const v of run.positions) parts.push(Math.round(v * 4));
        }
      }
      paragraph.delete();
      return parts.join(',');
    };
    const base = signature({});
    const supported = PROBED_FEATURES.filter((tag) => signature({ [tag]: !isDefaultOnFeature(tag) }) !== base);
    this.featureSupport.set(key, supported);
    return supported;
  }

  /** Variation axes of a family: the bundled Inter's weight axis, or those read from a user family's files. */
  fontAxes(family: string): readonly FontAxis[] {
    if (isFallbackFamily(family) || !this.families.includes(family)) return [];
    return this.userFamilies.has(family) ? (this.familyAxes.get(family) ?? []) : BUNDLED_FONT_AXES;
  }

  /** Registers internal fallback fonts loaded later (the color emoji font); cached layouts are dropped. */
  registerFallbackFonts(fonts: readonly FontSource[]): void {
    for (const font of fonts) {
      this.provider.registerFont(font.bytes, font.family);
      if (!this.families.includes(font.family)) this.families.push(font.family);
    }
    this.featureSupport.clear();
    this.clearCache();
  }

  fontFamilyOf(bytes: Uint8Array): string | null {
    const typeface = this.ck.Typeface.MakeTypefaceFromData(bytes.slice().buffer);
    if (!typeface) return null;
    const family = typeface.getFamilyName();
    typeface.delete();
    return family || null;
  }

  dispose(): void {
    this.clearCache();
    this.provider.delete();
  }

  private clearCache(): void {
    for (const { block } of this.layouts.values()) deleteBlock(block);
    this.layouts.clear();
  }

  private textStyle(style: RunStyle, decorationColor?: Float32Array): TextStyle {
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
      fontVariations: variationSettings(weight, style.fontVariations),
      letterSpacing: style.letterSpacing.unit === 'PIXELS' ? style.letterSpacing.value : (style.letterSpacing.value / 100) * style.fontSize,
      ...(lineHeight !== null ? { heightMultiplier: lineHeight, halfLeading: true } : {}),
      fontFeatures: toFontFeatures(style.openTypeFeatures ?? {}, style.textCase === 'SMALL_CAPS'),
      ...(style.textDecoration === 'UNDERLINE' || style.textDecoration === 'STRIKETHROUGH'
        ? {
            decoration: style.textDecoration === 'UNDERLINE' ? ck.UnderlineDecoration : ck.LineThroughDecoration,
            decorationThickness: Math.max(1, style.fontSize / 16),
            ...(decorationColor ? { decorationColor } : {}),
          }
        : {}),
    });
  }

  /** First-line indent in effect (only left-aligned and justified text is indented). */
  private indentOf(node: TextNode): number {
    const indent = node.paragraphIndent ?? 0;
    return indent > 0 && (node.textAlignHorizontal === 'LEFT' || node.textAlignHorizontal === 'JUSTIFIED') ? indent : 0;
  }

  /**
   * One paragraph of the layer's text with one style run per mixed-style segment, after an indent
   * placeholder when the layer has one. With a `painter`, segments are painted with the paints it
   * returns. Not laid out; the caller deletes it.
   */
  private buildParagraph(node: TextNode, range: ParagraphRange, indent: number, rtl: boolean, painter: TextPainter | undefined, maxLines?: number): Paragraph {
    const ck = this.ck;
    const align = { LEFT: ck.TextAlign.Left, CENTER: ck.TextAlign.Center, RIGHT: ck.TextAlign.Right, JUSTIFIED: ck.TextAlign.Justify }[node.textAlignHorizontal];
    // An empty paragraph takes the style of the character before it (what typing there would get).
    const emptyStyle = textStyleAt(node, paragraphStyleOffset(range));
    const style = new ck.ParagraphStyle({
      textStyle: this.textStyle(range.end > range.start ? textStyleAt(node, range.start) : emptyStyle),
      textAlign: align,
      // The base direction for bidi reordering of the paragraph's runs.
      textDirection: rtl ? ck.TextDirection.RTL : ck.TextDirection.LTR,
      // Rounding widths up would wrap auto-width text laid out at its exact natural width.
      applyRoundingHack: false,
      ...(node.textAutoResize === 'TRUNCATE' || node.maxLines !== undefined ? { ellipsis: '…' } : {}),
      ...(maxLines !== undefined ? { maxLines } : {}),
    });
    const builder = ck.ParagraphBuilder.MakeFromFontProvider(style, this.provider);
    if (indent > 0) builder.addPlaceholder(indent, 0, ck.PlaceholderAlignment.Baseline, ck.TextBaseline.Alphabetic, 0);
    const add = (segment: TextSegment, text: string) => {
      const textStyle = this.textStyle(segment, painter?.decorationColor?.(segment));
      // Painters may reuse one paint object: pushing copies it into the run.
      if (painter) builder.pushPaintStyle(textStyle, painter.paint(segment), painter.background);
      else builder.pushStyle(textStyle);
      builder.addText(text);
      builder.pop();
    };
    if (range.end === range.start) {
      add({ ...emptyStyle, start: range.start, end: range.start }, EMPTY);
    } else {
      for (const segment of textSegments(node)) {
        const start = Math.max(segment.start, range.start);
        const end = Math.min(segment.end, range.end);
        // Letter case keeps every character's length, so offsets still match the stored text.
        if (end > start) add(segment, applyTextCase(node.characters.slice(start, end), segment.textCase));
      }
    }
    const paragraph = builder.build();
    builder.delete();
    return paragraph;
  }

  /**
   * Lays the layer's paragraphs out and stacks them. `width` null uses the natural width; a number
   * wraps to it; 'box' fits the layer's box: auto width at its natural width (never narrower than
   * the box), otherwise wrapped to the box width, with truncation to the box height and vertical
   * alignment. Max lines is shared across paragraphs in order. The caller deletes the paragraphs.
   */
  private stack(node: TextNode, width: number | null | 'box', painter?: TextPainter): BlockLayout {
    const ranges = paragraphRanges(node.characters);
    const spacing = node.paragraphSpacing ?? 0;
    const listSpacing = node.listSpacing ?? 0;
    const styles = ranges.map((range) => textStyleAt(node, paragraphStyleOffset(range)));
    const items: ListItem[] = styles.map((s) => ({ type: s.listType, level: s.indentation }));
    const counters = listCounters(items);
    // List items indent every line by level (wrapped lines hang); other paragraphs take the first-line indent.
    const insets = items.map((item, i) => (item.type === 'NONE' ? 0 : clampLevel(item.level) * Math.round(styles[i]!.fontSize * LIST_INDENT_EM)));
    const rtl = ranges.map((range, i) => resolveDirection(styles[i]!.textDirection, node.characters.slice(range.start, range.end)) === 'RTL');
    // Right-to-left list items are indented from the right, with the marker on that side.
    const lefts = insets.map((inset, i) => (rtl[i] ? 0 : inset));
    const indents = items.map((item) => (item.type === 'NONE' ? this.indentOf(node) : 0));
    const paragraphs = ranges.map((range, i) => this.buildParagraph(node, range, indents[i]!, rtl[i]!, painter));
    let naturalWidth = 0;
    let layoutWidth: number;
    if (width === null || (width === 'box' && node.textAutoResize === 'WIDTH_AND_HEIGHT')) {
      for (const p of paragraphs) p.layout(UNBOUNDED);
      naturalWidth = Math.max(0, ...paragraphs.map((p, i) => p.getMaxIntrinsicWidth() + insets[i]!));
      layoutWidth = (width === 'box' ? Math.max(node.size.width, naturalWidth) : naturalWidth) + 0.01;
    } else {
      layoutWidth = Math.max(0, width === 'box' ? node.size.width : width);
    }
    const widthOf = (i: number) => Math.max(1, layoutWidth - insets[i]!);
    paragraphs.forEach((p, i) => p.layout(widthOf(i)));
    // List spacing separates consecutive list items; paragraph spacing everything else.
    const gapBetween = (previous: number, next: number) => (items[previous]!.type !== 'NONE' && items[next]!.type !== 'NONE' ? listSpacing : spacing);
    const counts = paragraphs.map((p) => p.getLineMetrics().length);
    let budgets = lineBudgets(counts, node.maxLines);
    if (width === 'box' && node.textAutoResize === 'TRUNCATE') {
      // The lines that fit in the box: once a paragraph is cut, the ones after it are hidden.
      let top = 0;
      let cut = false;
      budgets = budgets.map((budget, i) => {
        if (cut) return 0;
        const p = paragraphs[i]!;
        const fit = p
          .getLineMetrics()
          .slice(0, budget)
          .filter((l) => top + l.baseline + l.descent <= node.size.height + 0.5).length;
        const lines = i === 0 ? Math.max(1, fit) : fit;
        if (lines < counts[i]!) cut = true;
        top += p.getHeight() + (i + 1 < paragraphs.length ? gapBetween(i, i + 1) : 0);
        return lines;
      });
    }
    const layouts: ParagraphLayout[] = [];
    let top = 0;
    let previous = -1;
    paragraphs.forEach((original, i) => {
      let paragraph = original;
      const budget = budgets[i]!;
      // The first paragraph always shows at least its first line.
      const hidden = budget === 0 && i > 0;
      if (!hidden && budget < counts[i]!) {
        paragraph.delete();
        paragraph = this.buildParagraph(node, ranges[i]!, indents[i]!, rtl[i]!, painter, Math.max(1, budget));
        paragraph.layout(widthOf(i));
      }
      if (!hidden && previous >= 0) top += gapBetween(previous, i);
      const height = hidden ? 0 : paragraph.getHeight();
      let marker: ParagraphLayout['marker'] = null;
      if (!hidden && items[i]!.type !== 'NONE') {
        const style = styles[i]!;
        const markerParagraph = this.buildMarker(style, listMarker(items[i]!, counters[i]!), painter);
        const firstLine = paragraph.getLineMetrics()[0];
        const baseline = firstLine ? firstLine.baseline : paragraph.getAlphabeticBaseline();
        marker = {
          paragraph: markerParagraph,
          x: rtl[i] ? widthOf(i) + style.fontSize * LIST_MARKER_GAP_EM : lefts[i]! - markerParagraph.getMaxIntrinsicWidth() - style.fontSize * LIST_MARKER_GAP_EM,
          y: top + baseline - markerParagraph.getAlphabeticBaseline(),
        };
      }
      layouts.push({ range: ranges[i]!, paragraph, prefix: indents[i]! > 0 ? 1 : 0, left: lefts[i]!, marker, top, height, hidden });
      if (!hidden) {
        top += height;
        previous = i;
      }
    });
    const fixed = width === 'box' && (node.textAutoResize === 'NONE' || node.textAutoResize === 'TRUNCATE');
    return { paragraphs: layouts, naturalWidth, height: top, dy: fixed ? (node.size.height - top) * VERTICAL[node.textAlignVertical] : 0 };
  }

  /** A list marker ("•", "3.", "c.") in its item's style, without decoration or letter case, on one line. */
  private buildMarker(style: RunsStyle, text: string, painter: TextPainter | undefined): Paragraph {
    const ck = this.ck;
    const markerStyle = { ...style, textDecoration: 'NONE' as const, textCase: 'ORIGINAL' as const };
    const textStyle = this.textStyle(markerStyle);
    const builder = ck.ParagraphBuilder.MakeFromFontProvider(new ck.ParagraphStyle({ textStyle, applyRoundingHack: false }), this.provider);
    if (painter) builder.pushPaintStyle(textStyle, painter.paint({ ...markerStyle, start: 0, end: 0 }), painter.background);
    else builder.pushStyle(textStyle);
    builder.addText(text);
    builder.pop();
    const paragraph = builder.build();
    builder.delete();
    paragraph.layout(UNBOUNDED);
    return paragraph;
  }

  /** Draws a text layer's glyphs and list markers, each mixed-style segment painted by `painter`. */
  draw(canvas: Canvas, node: TextNode, painter: TextPainter): void {
    const block = this.stack(node, 'box', painter);
    for (const p of block.paragraphs) {
      if (p.hidden) continue;
      canvas.drawParagraph(p.paragraph, p.left, block.dy + p.top);
      if (p.marker) canvas.drawParagraph(p.marker.paragraph, p.marker.x, block.dy + p.marker.y);
    }
    deleteBlock(block);
  }

  private layout(node: TextNode): BlockLayout {
    const cached = this.layouts.get(node.id);
    if (cached?.node === node) return cached.block;
    if (cached) {
      deleteBlock(cached.block);
      this.layouts.delete(node.id);
    }
    const block = this.stack(node, 'box');
    this.layouts.set(node.id, { node, block });
    if (this.layouts.size > CACHE_LIMIT) {
      const [oldest] = this.layouts.keys();
      const evicted = this.layouts.get(oldest!);
      if (evicted) deleteBlock(evicted.block);
      this.layouts.delete(oldest!);
    }
    return block;
  }

  measure(node: TextNode, width: number | null): Size {
    const block = this.stack(node, width);
    deleteBlock(block);
    return { width: width === null ? round2(block.naturalWidth) : width, height: round2(block.height) };
  }

  private clamp(node: TextNode, offset: number): number {
    return Math.min(node.characters.length, Math.max(0, offset));
  }

  /** Index of the visual line containing a paragraph-local offset (the last line starting at or before it). */
  private lineIndex(lines: readonly LineMetrics[], local: number): number {
    for (let i = lines.length - 1; i >= 0; i--) if (lines[i]!.startIndex <= local) return i;
    return 0;
  }

  /** The laid-out paragraph holding an offset (the last visible one when it is cut off). */
  private paragraphFor(block: BlockLayout, offset: number): ParagraphLayout {
    const range = paragraphAt(
      block.paragraphs.map((p) => p.range),
      offset,
    );
    const layout = block.paragraphs[range.index]!;
    if (!layout.hidden) return layout;
    return [...block.paragraphs].reverse().find((p) => !p.hidden) ?? block.paragraphs[0]!;
  }

  offsetAt(node: TextNode, point: Vec2): number {
    if (node.characters === '') return 0;
    const block = this.layout(node);
    const y = point.y - block.dy;
    const spacing = node.paragraphSpacing ?? 0;
    const visible = block.paragraphs.filter((p) => !p.hidden);
    // The paragraph under the point; the gap between two belongs to the nearer one.
    let target = visible[0]!;
    for (const p of visible) if (y >= p.top - spacing / 2) target = p;
    const local = target.paragraph.getGlyphPositionAtCoordinate(point.x - target.left, y - target.top).pos;
    return this.clamp(node, fromParagraphOffset(target.range, local, target.prefix));
  }

  caretAt(node: TextNode, offset: number): TextCaretBox {
    const block = this.layout(node);
    const text = node.characters;
    const layout = this.paragraphFor(block, this.clamp(node, offset));
    const { range, paragraph, prefix } = layout;
    const at = Math.min(range.end, Math.max(range.start, offset));
    const local = (o: number) => toParagraphOffset(range, o, prefix);
    const y = block.dy + layout.top;
    const lines = paragraph.getLineMetrics();
    if (lines.length === 0) return { x: 0, top: y, bottom: y + node.fontSize };
    const box = (localIndex: number) => {
      const line = lines[this.lineIndex(lines, localIndex)]!;
      return { top: line.baseline - line.ascent + y, bottom: line.baseline + line.descent + y };
    };
    const rtlValue = this.ck.TextDirection.RTL.value;
    const glyph = (start: number, end: number) => paragraph.getRectsForRange(start, end, this.ck.RectHeightStyle.Tight, this.ck.RectWidthStyle.Tight)[0];
    // The caret sits before a glyph on its leading edge (left in left-to-right runs, right in right-to-left ones), or after it on the trailing edge.
    if (at < range.end) {
      const g = glyph(local(at), local(nextGrapheme(text, at)));
      if (g) return { x: layout.left + (g.dir.value === rtlValue ? g.rect[2]! : g.rect[0]!), ...box(local(at)) };
    }
    if (at > range.start) {
      const g = glyph(local(previousGrapheme(text, at)), local(at));
      if (g) return { x: layout.left + (g.dir.value === rtlValue ? g.rect[0]! : g.rect[2]!), ...box(local(at) - 1) };
    }
    // An empty paragraph.
    const width = paragraph.getMaxWidth();
    const x = layout.left + (node.textAlignHorizontal === 'CENTER' ? width / 2 : node.textAlignHorizontal === 'RIGHT' ? width : prefix > 0 ? this.indentOf(node) : 0);
    return { x, ...box(local(at)) };
  }

  selectionRects(node: TextNode, start: number, end: number): Rect[] {
    if (node.characters === '' || start >= end) return [];
    const block = this.layout(node);
    const rects: Rect[] = [];
    for (const layout of block.paragraphs) {
      const from = Math.max(start, layout.range.start);
      const to = Math.min(end, layout.range.end);
      if (layout.hidden || to <= from) continue;
      const y = block.dy + layout.top;
      for (const { rect: r } of layout.paragraph.getRectsForRange(toParagraphOffset(layout.range, from, layout.prefix), toParagraphOffset(layout.range, to, layout.prefix), this.ck.RectHeightStyle.Max, this.ck.RectWidthStyle.Tight)) {
        rects.push({ x: layout.left + r[0]!, y: r[1]! + y, width: r[2]! - r[0]!, height: r[3]! - r[1]! });
      }
    }
    return rects;
  }

  offsetOnAdjacentLine(node: TextNode, offset: number, direction: -1 | 1, x: number): number {
    const block = this.layout(node);
    const layout = this.paragraphFor(block, this.clamp(node, offset));
    const lines = layout.paragraph.getLineMetrics();
    const line = this.lineIndex(lines, toParagraphOffset(layout.range, this.clamp(node, offset), layout.prefix)) + direction;
    if (line >= 0 && line < lines.length) {
      return this.clamp(node, fromParagraphOffset(layout.range, layout.paragraph.getGlyphPositionAtCoordinate(x - layout.left, lines[line]!.baseline).pos, layout.prefix));
    }
    // Into the paragraph above or below.
    const visible = block.paragraphs.filter((p) => !p.hidden);
    const next = visible[visible.indexOf(layout) + direction];
    if (!next) return direction < 0 ? 0 : node.characters.length;
    const nextLines = next.paragraph.getLineMetrics();
    const nextLine = direction > 0 ? nextLines[0] : nextLines[nextLines.length - 1];
    if (!nextLine) return direction > 0 ? next.range.start : next.range.end;
    return this.clamp(node, fromParagraphOffset(next.range, next.paragraph.getGlyphPositionAtCoordinate(x - next.left, nextLine.baseline).pos, next.prefix));
  }

  lineRange(node: TextNode, offset: number): [number, number] {
    if (node.characters === '') return [0, 0];
    const block = this.layout(node);
    const layout = this.paragraphFor(block, this.clamp(node, offset));
    const lines = layout.paragraph.getLineMetrics();
    const line = lines[this.lineIndex(lines, toParagraphOffset(layout.range, this.clamp(node, offset), layout.prefix))];
    if (!line) return [layout.range.start, layout.range.end];
    return [fromParagraphOffset(layout.range, line.startIndex, layout.prefix), fromParagraphOffset(layout.range, line.endIndex, layout.prefix)];
  }
}

function deleteBlock(block: BlockLayout): void {
  for (const p of block.paragraphs) {
    p.paragraph.delete();
    p.marker?.paragraph.delete();
  }
}
