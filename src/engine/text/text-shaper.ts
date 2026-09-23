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

import type { Canvas, CanvasKit, EmbindEnumEntity, LineMetrics, Paint as CkPaint, Paragraph, TextStyle, Typeface, TypefaceFontProvider } from 'canvaskit-wasm';
import type { Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import type { FontName, OpenTypeFeatures, Size, TextAlignVertical, TextNode } from '@/core/schema/document';
import { FEATURE_PROBE_TEXT, isDefaultOnFeature, PROBED_FEATURES, toFontFeatures } from '@/core/text/opentype';
import { readFontAxes, type FontAxis } from '@/core/text/font-names';
import { BUNDLED_FONT_AXES, mergeAxes, variationSettings } from '@/core/text/font-variations';
import { resolveDirection } from '@/core/text/direction';
import { CJK_FAMILIES, cjkScriptFor, containsCjk } from '@/core/text/cjk';
import { containsSymbols } from '@/core/text/symbols';
import { balancedWidth, prettyWidth } from '@/core/text/wrap-style';
import { fallbackUnderlineMetrics, underlineLine, wavySegments, type UnderlineMetrics } from '@/core/text/underline';
import { parseFontStyle, VARIABLE_FONT_STYLES } from '@/core/text/font-style';
import { nextGrapheme, previousGrapheme } from '@/core/text/text-editing';
import type { FontFamilyInfo, GlyphPlacement, TextCaretBox, TextLayoutService } from '@/core/text/text-layout';
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
  /** Whether this pass draws underlines (a layer drawn in several fill passes draws them once). Absent means true. */
  readonly decorations?: boolean | undefined;
}

/** An underline on one line of a run, in layer coordinates. */
export interface UnderlinePiece {
  readonly x1: number;
  readonly x2: number;
  /** Center line. */
  readonly y: number;
  readonly thickness: number;
  readonly segment: TextSegment;
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
/**
 * Laid-out text kept for caret and hit queries: how many blocks are held once the layers using them are off screen.
 * What a frame draws is never counted against it — a frame that shapes more text than this keeps all of it, because
 * dropping a block a later frame draws again means shaping that layer once a frame, which is what `beginFrame` sweeps
 * around.
 */
const CACHE_LIMIT = 256;
/**
 * The most blocks held without frames going by, which only a shaper nothing ever draws through can reach (measuring
 * text headlessly). It bounds the native paragraphs the cache owns when no sweep is coming.
 */
const CACHE_CEILING = 8192;
/**
 * Device pixels to the em below which a text layer is drawn as a bar per line instead of being shaped. At a third of
 * a pixel to the em nothing of a glyph survives rasterizing, so shaping the layer buys a smudge — and a page zoomed
 * out far enough to hold thousands of text layers would pay for every one of them.
 */
const GREEK_MIN_EM_PX = 3;
const VERTICAL: Record<TextAlignVertical, number> = { TOP: 0, CENTER: 0.5, BOTTOM: 1 };
/** List indentation per level, in ems of the item's font size. */
const LIST_INDENT_EM = 1.5;
/** Gap between a list marker and its item's text, in ems. */
const LIST_MARKER_GAP_EM = 0.4;
/** The most a Pretty wrap narrows a paragraph to avoid an orphan, as a share of its width. */
const PRETTY_MAX_SHRINK = 0.2;
/** Opening quotation marks that hang with hanging quotes on. */
const OPENING_QUOTES = new Set(['"', "'", '“', '‘', '«', '‹', '„', '‚', '「', '『']);

const round2 = (v: number) => Math.round(v * 100) / 100;

/** One paragraph of a text layer, laid out. */
interface ParagraphLayout {
  readonly range: ParagraphRange;
  readonly paragraph: Paragraph;
  /** Placeholder characters before the paragraph's own (a first-line indent). */
  readonly prefix: number;
  /** Left edge of every line (list indentation), in the layer. */
  readonly left: number;
  /** Extra x offset of the first line only (a hanging opening quote), ≤ 0. */
  readonly firstLineShift: number;
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
  /** The frame the block was last used in, so a frame never drops a block it is still drawing. */
  frame: number;
}

/** What a font's lines measure at a size: the reach above and below the baseline, its leading, and a mean advance. */
interface FontLineMetrics {
  readonly ascent: number;
  readonly descent: number;
  readonly leading: number;
  readonly advance: number;
}

/** A bar standing in for one line of text too small to read, in the layer's own space. */
export interface GreekedLine {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Shapes and lays out text layers with SkParagraph (HarfBuzz shaping, ICU line breaking) from
 * registered fonts. Each paragraph (text between line breaks) is its own SkParagraph, stacked with
 * the layer's paragraph spacing and offset by its first-line indent. Implements the editor's text
 * layout service and draws for the renderer, so what is measured is exactly what is drawn.
 */
/** A path text is drawn along: how long it is, and the point and direction at a distance along it. */
export interface PathRun {
  readonly length: number;
  at(distance: number): { readonly point: { readonly x: number; readonly y: number }; readonly tangent: { readonly x: number; readonly y: number } };
}

export class TextShaper implements TextLayoutService {
  private readonly provider: TypefaceFontProvider;
  private readonly families: string[] = [];
  private readonly userFamilies = new Map<string, { styles: Set<string>; variable: boolean }>();
  /** Laid-out blocks by `${node id}` for measuring, and `${node id}\n${paint key}` for drawing. */
  private readonly layouts = new Map<string, CachedLayout>();
  /** Counts the frames drawn through this shaper, which is what blocks are kept by (see `beginFrame`). */
  private frame = 0;
  /** Line metrics by "family\nsize", for the bars text too small to read is drawn as. */
  private readonly metricsCache = new Map<string, FontLineMetrics>();
  /** Supported OpenType features by "family\nstyle". */
  private readonly featureSupport = new Map<string, readonly string[]>();
  /** Variation axes of user families, read from their font files. */
  private readonly familyAxes = new Map<string, readonly FontAxis[]>();
  /** One typeface per family, for its underline metrics. */
  private readonly typefaces = new Map<string, Typeface>();
  /** The font file each family was registered from, which is what glyph outlines are read out of. */
  private readonly fontFiles = new Map<string, Uint8Array>();
  /** Registered Noto Sans CJK subsets: fallbacks added only to text of their script. */
  private readonly cjkSubsets = new Set<string>();
  /** Registered symbol fallbacks (arrows, maths, dingbats): added only to text that has symbols. */
  private readonly symbolFallbacks = new Set<string>();
  private readonly underlineCache = new Map<string, UnderlineMetrics>();

  constructor(
    private readonly ck: CanvasKit,
    fonts: readonly FontSource[],
  ) {
    this.provider = ck.TypefaceFontProvider.Make();
    for (const font of fonts) {
      this.rememberTypeface(font.family, font.bytes);
      this.provider.registerFont(font.bytes, font.family);
      if (!this.families.includes(font.family)) this.families.push(font.family);
    }
  }

  /** Registered family names, in registration order. */
  get registeredFamilies(): readonly string[] {
    return this.families;
  }

  /**
   * The internal fallback families — the bundled script subsets, the colour emoji font, the CJK
   * subsets and the symbol fallbacks. They are drawn from but never picked, so `availableFonts`
   * leaves them out; reading a character's outline has to look in them all the same.
   */
  fallbackFamilies(): readonly string[] {
    return [...this.families.filter(isFallbackFamily), ...this.cjkSubsets, ...this.symbolFallbacks];
  }

  /**
   * The families users can pick (fallback subsets excluded). Bundled fonts are variable, with every
   * weight upright and italic; user families list the styles registered for them.
   */
  availableFonts(): readonly FontFamilyInfo[] {
    const registered = this.registeredFonts();
    // The bundled Noto Sans CJK families, whose characters load on demand.
    const cjk = CJK_FAMILIES.filter((family) => !registered.some((f) => f.family === family)).map((family) => ({ family, styles: VARIABLE_FONT_STYLES, variable: true }));
    return [...registered, ...cjk];
  }

  private registeredFonts(): readonly FontFamilyInfo[] {
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
      this.rememberTypeface(font.family, font.bytes);
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
    if (CJK_FAMILIES.includes(family) && !this.userFamilies.has(family)) return BUNDLED_FONT_AXES;
    if (isFallbackFamily(family) || !this.families.includes(family)) return [];
    return this.userFamilies.has(family) ? (this.familyAxes.get(family) ?? []) : BUNDLED_FONT_AXES;
  }

  /** Registers internal fallback fonts loaded later (the color emoji font); cached layouts are dropped. */
  registerFallbackFonts(fonts: readonly FontSource[]): void {
    for (const font of fonts) {
      this.rememberTypeface(font.family, font.bytes);
      this.provider.registerFont(font.bytes, font.family);
      if (!this.families.includes(font.family)) this.families.push(font.family);
    }
    this.featureSupport.clear();
    this.clearCache();
  }

  /** Registers Noto Sans CJK subsets (loaded for the characters in use); cached layouts are dropped. */
  registerCjkSubsets(fonts: readonly FontSource[]): void {
    for (const font of fonts) {
      if (this.cjkSubsets.has(font.family)) continue;
      if (!this.fontFiles.has(font.family)) this.fontFiles.set(font.family, font.bytes instanceof Uint8Array ? font.bytes : new Uint8Array(font.bytes));
      this.provider.registerFont(font.bytes, font.family);
      this.cjkSubsets.add(font.family);
    }
    this.clearCache();
  }

  /**
   * Registers the symbol fallback fonts (arrows, mathematical operators, technical marks, box
   * drawing, geometric shapes and dingbats), loaded once text uses a character no registered font
   * covers; cached layouts are dropped so that text reshapes with them.
   */
  registerSymbolFallbacks(fonts: readonly FontSource[]): void {
    for (const font of fonts) {
      if (this.symbolFallbacks.has(font.family)) continue;
      this.rememberTypeface(font.family, font.bytes);
      this.provider.registerFont(font.bytes, font.family);
      this.symbolFallbacks.add(font.family);
    }
    this.clearCache();
  }

  /**
   * The code points of a text that no registered font has a glyph for, so the caller knows whether
   * loading a fallback would help. ASCII is skipped, and so is a code point some font covers.
   */
  uncoveredCodePoints(text: string): number[] {
    const out: number[] = [];
    const seen = new Set<number>();
    for (const char of text) {
      const cp = char.codePointAt(0)!;
      if (cp <= 0x7f || seen.has(cp)) continue;
      seen.add(cp);
      let covered = false;
      for (const typeface of this.typefaces.values()) {
        if (typeface.getGlyphIDs(char)[0]) {
          covered = true;
          break;
        }
      }
      if (!covered) out.push(cp);
    }
    return out;
  }

  /**
   * The symbol fallback families a layer's text falls back to. Like the CJK subsets they aren't in
   * every run's fallback list, since a long list makes layout slow.
   */
  private symbolFallbacksFor(node: TextNode): readonly string[] {
    if (this.symbolFallbacks.size === 0 || !containsSymbols(node.characters)) return [];
    return [...this.symbolFallbacks];
  }

  /**
   * The CJK subset families a layer's text falls back to: the registered subsets of its script. They
   * aren't in every run's fallback list, since a long list makes layout slow.
   */
  private cjkFallbacksFor(node: TextNode): readonly string[] {
    if (this.cjkSubsets.size === 0 || !containsCjk(node.characters)) return [];
    const prefix = `Noto Sans ${cjkScriptFor(node.characters, node.fontName.family)} (`;
    return [...this.cjkSubsets].filter((family) => family.startsWith(prefix));
  }

  /**
   * Where each character of a text layer sits, in the layer's space: the left of its box and the baseline of the
   * line it is on, with the size and family its style asks for. Line breaks carry no glyph and are left out.
   */
  glyphPlacements(node: TextNode): GlyphPlacement[] {
    if (node.characters === '') return [];
    const block = this.layout(node);
    const segments = textSegments(node);
    const out: GlyphPlacement[] = [];
    for (const layout of block.paragraphs) {
      if (layout.hidden) continue;
      const lines = layout.paragraph.getLineMetrics();
      for (const segment of segments) {
        const from = Math.max(segment.start, layout.range.start);
        const to = Math.min(segment.end, layout.range.end);
        for (let i = from; i < to; i++) {
          const code = node.characters.codePointAt(i);
          if (code === undefined) continue;
          const char = String.fromCodePoint(code);
          // A character outside the basic plane takes two code units, the second of which is not its own character.
          const units = char.length;
          const skip = units - 1;
          if (char === '\n' || char.trim() === '') {
            i += skip;
            continue;
          }
          const at = toParagraphOffset(layout.range, i, layout.prefix);
          const rect = layout.paragraph.getRectsForRange(at, at + units, this.ck.RectHeightStyle.Tight, this.ck.RectWidthStyle.Tight)[0];
          i += skip;
          if (!rect) continue;
          const [x0 = 0, top = 0, , bottom = 0] = rect.rect;
          const middle = (top + bottom) / 2;
          const line = lines.find((l) => middle >= l.baseline - l.ascent - 0.5 && middle <= l.baseline + l.descent + 0.5) ?? lines[0];
          if (!line) continue;
          out.push({ char, x: lineLeft(layout, lines.indexOf(line)) + x0, baseline: block.dy + layout.top + line.baseline, fontSize: segment.fontSize, family: segment.fontName.family });
        }
      }
    }
    return out;
  }

  /** The font file a family was registered from, for reading its glyph outlines; null for an unknown family. */
  fontBytesOf(family: string): Uint8Array | null {
    return this.fontFiles.get(family) ?? null;
  }

  private rememberTypeface(family: string, bytes: ArrayBuffer | Uint8Array): void {
    if (!this.fontFiles.has(family)) this.fontFiles.set(family, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    if (this.typefaces.has(family)) return;
    const data = bytes instanceof Uint8Array ? bytes.slice().buffer : bytes;
    const typeface = this.ck.Typeface.MakeTypefaceFromData(data);
    if (typeface) this.typefaces.set(family, typeface);
  }

  /**
   * A family's line metrics at a font size: how far its lines reach above and below their baseline, the gap the font
   * asks for after each, and the width of an average lowercase letter. Read from the font, with the proportions of a
   * text face standing in for a family that isn't loaded.
   */
  private lineMetrics(family: string, fontSize: number): FontLineMetrics {
    const key = `${family}\n${fontSize}`;
    const cached = this.metricsCache.get(key);
    if (cached) return cached;
    let metrics: FontLineMetrics = { ascent: fontSize * 0.97, descent: fontSize * 0.24, leading: 0, advance: fontSize * 0.5 };
    const typeface = this.typefaces.get(family);
    if (typeface) {
      const font = new this.ck.Font(typeface, fontSize);
      const m = font.getMetrics();
      const widths = font.getGlyphWidths(font.getGlyphIDs('abcdefghijklmnopqrstuvwxyz '));
      font.delete();
      const advance = widths.length > 0 ? [...widths].reduce((sum, w) => sum + w, 0) / widths.length : 0;
      metrics = {
        ascent: Math.abs(m.ascent) || metrics.ascent,
        descent: Math.abs(m.descent) || metrics.descent,
        leading: Math.abs(m.leading ?? 0),
        advance: advance > 0 ? advance : metrics.advance,
      };
    }
    this.metricsCache.set(key, metrics);
    return metrics;
  }

  /**
   * The bars that stand in for a text layer's lines while it is drawn too small to read — below `GREEK_MIN_EM_PX`
   * device pixels to the em, where a glyph is a fraction of a pixel and every line comes out a smudge. Null when the
   * layer is big enough to be worth shaping, which is what the renderer takes as "draw this as text".
   *
   * The lines are where the font's own metrics say they fall; how far each one runs is worked out from how many
   * characters it holds, since shaping is the thing being skipped. A layer of one line — a label, which is most of
   * them — is its box, and so exact; a wrapped paragraph's last line is the only real guess.
   */
  greekedLines(node: TextNode, scale: number): readonly GreekedLine[] | null {
    const fontSize = Math.max(node.fontSize, ...(node.styleRuns ?? []).map((run) => run.style.fontSize ?? 0));
    if (node.characters === '' || fontSize * scale >= GREEK_MIN_EM_PX) return null;
    const { ascent, descent, leading, advance } = this.lineMetrics(node.fontName.family, node.fontSize);
    const lineHeight =
      node.lineHeight.unit === 'PIXELS' ? node.lineHeight.value : node.lineHeight.unit === 'PERCENT' ? (node.lineHeight.value / 100) * node.fontSize : ascent + descent + leading;
    const paragraphs = node.characters.split('\n');
    const longest = Math.max(1, ...paragraphs.map((p) => p.length));
    // Auto width never wraps: a paragraph is a line, and the box is as wide as the longest of them.
    const wraps = node.textAutoResize !== 'WIDTH_AND_HEIGHT';
    const perLine = Math.max(1, Math.floor(node.size.width / Math.max(advance, 0.001)));
    const shares: number[][] = paragraphs.map((paragraph) => {
      const characters = paragraph.length;
      if (!wraps) return [characters / longest];
      if (characters === 0) return [0];
      const lines = Math.ceil(characters / perLine);
      return Array.from({ length: lines }, (_, i) => (i < lines - 1 ? 1 : (characters - (lines - 1) * perLine) / perLine));
    });
    const limit = node.maxLines;
    if (limit !== undefined) {
      let left = limit;
      for (let i = 0; i < shares.length; i++) {
        shares[i] = shares[i]!.slice(0, Math.max(0, left));
        left -= shares[i]!.length;
      }
    }
    const count = shares.reduce((sum, paragraph) => sum + paragraph.length, 0);
    if (count === 0) return [];
    const spacing = node.paragraphSpacing ?? 0;
    const height = count * lineHeight + spacing * (paragraphs.length - 1);
    const cap = this.capHeight(node.fontName.family, node.fontSize);
    const lines: GreekedLine[] = [];
    let y = (node.size.height - height) * VERTICAL[node.textAlignVertical];
    for (const paragraph of shares) {
      for (const share of paragraph) {
        // Half leading, as the shaped lines are laid out with.
        const baseline = y + (lineHeight - (ascent + descent)) / 2 + ascent;
        const width = Math.max(0, Math.min(1, share)) * node.size.width;
        const x = node.textAlignHorizontal === 'CENTER' ? (node.size.width - width) / 2 : node.textAlignHorizontal === 'RIGHT' ? node.size.width - width : 0;
        if (width > 0) lines.push({ x, y: baseline - cap, width, height: cap });
        y += lineHeight;
      }
      y += spacing;
    }
    return lines;
  }

  /** A family's cap height at a font size, from the bounds of its "H" (70% of the size when the font can't be read). */
  private capHeight(family: string, fontSize: number): number {
    const typeface = this.typefaces.get(family);
    if (!typeface) return fontSize * 0.7;
    const font = new this.ck.Font(typeface, fontSize);
    const bounds = font.getGlyphBounds(font.getGlyphIDs('H'));
    font.delete();
    const height = bounds.length >= 4 ? -bounds[1]! : 0;
    return height > 0 ? height : fontSize * 0.7;
  }

  /** A family's underline position and thickness at a font size (from the font, or proportional defaults). */
  private underlineMetrics(family: string, fontSize: number): UnderlineMetrics {
    const key = `${family}\n${fontSize}`;
    const cached = this.underlineCache.get(key);
    if (cached) return cached;
    const fallback = fallbackUnderlineMetrics(fontSize);
    const typeface = this.typefaces.get(family);
    let metrics = fallback;
    if (typeface) {
      const font = new this.ck.Font(typeface, fontSize);
      const m = font.getMetrics();
      font.delete();
      metrics = { position: m.underlinePosition ?? fallback.position, thickness: m.underlineThickness ?? fallback.thickness };
    }
    this.underlineCache.set(key, metrics);
    return metrics;
  }

  /**
   * The underlines of a text layer as laid out in its box: one piece per underlined run per line,
   * with its center line, thickness, style and the segment it belongs to.
   */
  underlines(node: TextNode): UnderlinePiece[] {
    if (node.characters === '') return [];
    const segments = textSegments(node).filter((s) => s.textDecoration === 'UNDERLINE');
    // Nothing is underlined, which is the usual case: the layer is not laid out a second time to find that out.
    if (segments.length === 0) return [];
    const block = this.layout(node);
    const pieces: UnderlinePiece[] = [];
    for (const layout of block.paragraphs) {
      if (layout.hidden) continue;
      const lines = layout.paragraph.getLineMetrics();
      for (const segment of segments) {
        const from = Math.max(segment.start, layout.range.start);
        const to = Math.min(segment.end, layout.range.end);
        if (to <= from) continue;
        const metrics = this.underlineMetrics(segment.fontName.family, segment.fontSize);
        const rects = layout.paragraph.getRectsForRange(
          toParagraphOffset(layout.range, from, layout.prefix),
          toParagraphOffset(layout.range, to, layout.prefix),
          this.ck.RectHeightStyle.Tight,
          this.ck.RectWidthStyle.Tight,
        );
        for (const { rect } of rects) {
          const middle = (rect[1]! + rect[3]!) / 2;
          const line = lines.find((l) => middle >= l.baseline - l.ascent - 0.5 && middle <= l.baseline + l.descent + 0.5) ?? lines[0];
          if (!line || rect[2]! <= rect[0]!) continue;
          const { y, thickness } = underlineLine(block.dy + layout.top + line.baseline, metrics, segment.decorationThickness, segment.decorationOffset);
          const left = lineLeft(layout, lines.indexOf(line));
          pieces.push({ x1: left + rect[0]!, x2: left + rect[2]!, y, thickness, segment });
        }
      }
    }
    return pieces;
  }

  /** Draws a laid-out paragraph; with a hanging first line, that line and the rest are drawn clipped, each at its own offset. */
  private drawParagraphLines(canvas: Canvas, p: ParagraphLayout, dy: number): void {
    if (p.firstLineShift === 0) {
      canvas.drawParagraph(p.paragraph, p.left, dy + p.top);
      return;
    }
    const ck = this.ck;
    const lines = p.paragraph.getLineMetrics();
    const second = lines[1];
    // The boundary between the first and second lines.
    const split = second ? dy + p.top + second.baseline - second.ascent : dy + p.top + p.height;
    const far = 1e6;
    canvas.save();
    canvas.clipRect(ck.LTRBRect(-far, -far, far, split), ck.ClipOp.Intersect, true);
    canvas.drawParagraph(p.paragraph, p.left + p.firstLineShift, dy + p.top);
    canvas.restore();
    if (second) {
      canvas.save();
      canvas.clipRect(ck.LTRBRect(-far, split, far, far), ck.ClipOp.Intersect, true);
      canvas.drawParagraph(p.paragraph, p.left, dy + p.top);
      canvas.restore();
    }
  }

  /** Draws underline pieces; with skip ink, erases them where a stroked copy of the glyphs crosses them. */
  private drawUnderlines(canvas: Canvas, node: TextNode, painter: TextPainter): void {
    const pieces = this.underlines(node);
    if (pieces.length === 0) return;
    const ck = this.ck;
    const skipInk = pieces.some((p) => p.segment.decorationSkipInk);
    if (skipInk) canvas.saveLayer();
    const paint = new ck.Paint();
    paint.setAntiAlias(true);
    for (const piece of pieces) {
      paint.setColor(painter.decorationColor?.(piece.segment) ?? ck.BLACK);
      const { x1, x2, y, thickness } = piece;
      switch (piece.segment.decorationStyle) {
        case 'SOLID':
          paint.setStyle(ck.PaintStyle.Fill);
          paint.setPathEffect(null);
          canvas.drawRect(ck.XYWHRect(x1, y - thickness / 2, x2 - x1, thickness), paint);
          break;
        case 'DOTTED': {
          const dots = ck.PathEffect.MakeDash([0.001, thickness * 2]);
          paint.setStyle(ck.PaintStyle.Stroke);
          paint.setStrokeWidth(thickness);
          paint.setStrokeCap(ck.StrokeCap.Round);
          paint.setPathEffect(dots);
          canvas.drawLine(x1 + thickness / 2, y, x2, y, paint);
          paint.setPathEffect(null);
          dots.delete();
          break;
        }
        case 'WAVY': {
          const builder = new ck.PathBuilder();
          builder.moveTo(x1, y);
          for (const [cx, cy, ex, ey] of wavySegments(x1, x2, y, thickness)) builder.quadTo(cx, cy, ex, ey);
          const path = builder.detachAndDelete();
          paint.setStyle(ck.PaintStyle.Stroke);
          paint.setStrokeWidth(thickness);
          paint.setStrokeCap(ck.StrokeCap.Butt);
          canvas.drawPath(path, paint);
          path.delete();
          break;
        }
      }
    }
    paint.delete();
    if (skipInk) {
      const eraser = new ck.Paint();
      eraser.setAntiAlias(true);
      eraser.setStyle(ck.PaintStyle.Stroke);
      eraser.setStrokeWidth(Math.max(...pieces.map((p) => p.thickness)) * 2 + 1);
      eraser.setBlendMode(ck.BlendMode.DstOut);
      // Only runs that skip ink erase; the others keep their underline whole.
      const mask = this.stack(node, 'box', { background: painter.background, paint: (segment) => (segment.decorationSkipInk && segment.textDecoration === 'UNDERLINE' ? eraser : painter.background) });
      for (const p of mask.paragraphs) if (!p.hidden) this.drawParagraphLines(canvas, p, mask.dy);
      deleteBlock(mask);
      eraser.delete();
      canvas.restore();
    }
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
    for (const typeface of this.typefaces.values()) typeface.delete();
    this.typefaces.clear();
    this.provider.delete();
  }

  private clearCache(): void {
    for (const { block } of this.layouts.values()) deleteBlock(block);
    this.layouts.clear();
  }

  private textStyle(style: RunStyle, decorationColor?: Float32Array, extraFamilies: readonly string[] = []): TextStyle {
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
      fontFamilies: [style.fontName.family, ...this.families.filter((f) => f !== style.fontName.family), ...extraFamilies],
      fontSize: style.fontSize,
      fontStyle: { weight: weights[Math.min(8, Math.max(0, Math.round(weight / 100) - 1))]!, slant: italic ? ck.FontSlant.Italic : ck.FontSlant.Upright },
      fontVariations: variationSettings(weight, style.fontVariations),
      letterSpacing: style.letterSpacing.unit === 'PIXELS' ? style.letterSpacing.value : (style.letterSpacing.value / 100) * style.fontSize,
      ...(lineHeight !== null ? { heightMultiplier: lineHeight, halfLeading: true } : {}),
      fontFeatures: toFontFeatures(style.openTypeFeatures ?? {}, style.textCase === 'SMALL_CAPS'),
      // Underlines are drawn by `draw` (offset, dotted or wavy style, skip ink); strikethrough is an SkParagraph decoration.
      ...(style.textDecoration === 'STRIKETHROUGH'
        ? {
            decoration: ck.LineThroughDecoration,
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
    const fallbacks = [...this.cjkFallbacksFor(node), ...this.symbolFallbacksFor(node)];
    const style = new ck.ParagraphStyle({
      textStyle: this.textStyle(range.end > range.start ? textStyleAt(node, range.start) : emptyStyle, undefined, fallbacks),
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
      const textStyle = this.textStyle(segment, painter?.decorationColor?.(segment), fallbacks);
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
    // Hanging lists take one level off, so first-level markers sit outside the box and item text aligns with its edge.
    const hang = node.hangingList ? 1 : 0;
    const insets = items.map((item, i) => (item.type === 'NONE' ? 0 : (clampLevel(item.level) - hang) * Math.round(styles[i]!.fontSize * LIST_INDENT_EM)));
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
    // Wrap style: balanced or orphan-free paragraphs lay out narrower, aligned within the full width. Auto-width text never wraps.
    const wraps = width !== null && !(width === 'box' && node.textAutoResize === 'WIDTH_AND_HEIGHT');
    const wrapWidths = paragraphs.map((p, i) => {
      const full = widthOf(i);
      const style = styles[i]!.wrapStyle;
      if (!wraps || style === 'AUTO') return full;
      const range = ranges[i]!;
      const prefix = indents[i]! > 0 ? 1 : 0;
      const measure = (w: number) => {
        p.layout(w);
        const lines = p.getLineMetrics();
        const last = lines[lines.length - 1];
        const lastText = last ? node.characters.slice(fromParagraphOffset(range, last.startIndex, prefix), fromParagraphOffset(range, last.endIndex, prefix)) : '';
        return { lines: lines.length, lastLineWords: lastText.trim().split(/\s+/).filter(Boolean).length };
      };
      const chosen = style === 'BALANCE' ? balancedWidth((w) => measure(w).lines, full) : prettyWidth(measure, full, full * PRETTY_MAX_SHRINK);
      p.layout(chosen);
      return chosen;
    });
    const alignFactor = { LEFT: 0, JUSTIFIED: 0, CENTER: 0.5, RIGHT: 1 }[node.textAlignHorizontal];
    const shifts = wrapWidths.map((w, i) => (widthOf(i) - w) * alignFactor);
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
        paragraph.layout(wrapWidths[i]!);
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
      // Hanging quotes: an opening quote starting a left-aligned, left-to-right paragraph sits outside the box on the first line.
      let firstLineShift = 0;
      const first = node.characters[ranges[i]!.start];
      if (
        !hidden &&
        node.hangingPunctuation &&
        !rtl[i] &&
        items[i]!.type === 'NONE' &&
        (node.textAlignHorizontal === 'LEFT' || node.textAlignHorizontal === 'JUSTIFIED') &&
        first !== undefined &&
        OPENING_QUOTES.has(first)
      ) {
        const prefix = indents[i]! > 0 ? 1 : 0;
        const quote = paragraph.getRectsForRange(prefix, prefix + 1, this.ck.RectHeightStyle.Tight, this.ck.RectWidthStyle.Tight)[0];
        if (quote) firstLineShift = -(quote.rect[2]! - quote.rect[0]!);
      }
      layouts.push({ range: ranges[i]!, paragraph, prefix: indents[i]! > 0 ? 1 : 0, left: lefts[i]! + shifts[i]!, firstLineShift, marker, top, height, hidden });
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

  /**
   * Draws a text layer along a path: the text is laid out as one line, and each character is drawn where its place in
   * that line falls along the path, turned to face the way the path goes. The character is clipped out of the line as
   * it was shaped, so kerning and ligatures hold; `start` moves the text along the path, and `flipped` puts it on the
   * other side, reading the other way.
   */
  drawOnPath(canvas: Canvas, node: TextNode, painter: TextPainter, path: PathRun, start: number, flipped: boolean): void {
    if (node.characters === '') return;
    const block = this.stack({ ...node, textAlignHorizontal: 'LEFT' }, null, painter);
    const first = block.paragraphs.find((p) => !p.hidden);
    if (!first) {
      deleteBlock(block);
      return;
    }
    const paragraph = first.paragraph;
    const baseline = paragraph.getAlphabeticBaseline();
    const offset = start * path.length;
    for (let i = 0; i < node.characters.length; i++) {
      const rect = paragraph.getRectsForRange(i, i + 1, this.ck.RectHeightStyle.Max, this.ck.RectWidthStyle.Tight)[0];
      if (!rect) continue;
      const [x0 = 0, top = 0, x1 = 0, bottom = 0] = rect.rect;
      const center = (x0 + x1) / 2;
      const distance = flipped ? path.length - (offset + center) : offset + center;
      if (distance < 0 || distance > path.length) continue;
      const at = path.at(distance);
      const angle = (Math.atan2(at.tangent.y, at.tangent.x) * 180) / Math.PI + (flipped ? 180 : 0);
      canvas.save();
      canvas.translate(at.point.x, at.point.y);
      canvas.rotate(angle, 0, 0);
      canvas.translate(-center, -baseline);
      // Only this character of the line is drawn, so the rest of it stays off the path.
      canvas.clipRect(this.ck.LTRBRect(x0 - 0.5, top - 1, x1 + 0.5, bottom + 1), this.ck.ClipOp.Intersect, true);
      canvas.drawParagraph(paragraph, 0, 0);
      canvas.restore();
    }
    deleteBlock(block);
  }

  /** Draws a text layer's glyphs and list markers, each mixed-style segment painted by `painter`. */
  /**
   * Draws a text layer's glyphs and list markers, each mixed-style segment painted by `painter`.
   *
   * `paintKey` names what the painter paints with. A painter bakes its paint into the paragraphs as they
   * are built, so a laid-out block can only be drawn again by the same painter — with a key to say which,
   * the block is kept and the layer is shaped once instead of once a frame. Without a key the block is
   * built and thrown away, which is right for a painter that cannot be named.
   */
  draw(canvas: Canvas, node: TextNode, painter: TextPainter, paintKey?: string): void {
    const key = paintKey === undefined ? null : `${node.id}\n${paintKey}`;
    // Past the ceiling a frame shapes what it still needs and throws it away, which is slow but bounded: the
    // paragraphs a block holds are native memory, and a frame that kept every one of thousands would run out.
    const keep = key !== null && (this.layouts.has(key) || this.layouts.size < CACHE_CEILING);
    const block = keep ? this.cachedBlock(key, node, () => this.stack(node, 'box', painter)) : this.stack(node, 'box', painter);
    for (const p of block.paragraphs) {
      if (p.hidden) continue;
      this.drawParagraphLines(canvas, p, block.dy);
      if (p.marker) canvas.drawParagraph(p.marker.paragraph, p.marker.x, block.dy + p.marker.y);
    }
    if (!keep) deleteBlock(block);
    if (painter.decorations !== false) this.drawUnderlines(canvas, node, painter);
  }

  private layout(node: TextNode): BlockLayout {
    return this.cachedBlock(node.id, node, () => this.stack(node, 'box'));
  }

  /**
   * Starts a frame: what the frame before it drew is kept, and blocks older than that go once there are more than
   * `CACHE_LIMIT` of them.
   *
   * A frame draws the layers of a page in the same order every time, so evicting by age alone drops the block the
   * next frame asks for first. Past the cache's size that costs every visible layer a full shaping pass a frame —
   * seconds a frame on a page with a few hundred text layers, which is what zooming out until they are all on screen
   * does. Keeping what the last frame used holds the working set however big it is, and only what has gone off screen
   * is dropped.
   */
  beginFrame(): void {
    const previous = this.frame++;
    if (this.layouts.size <= CACHE_LIMIT) return;
    for (const [key, entry] of this.layouts) {
      if (entry.frame >= previous) continue;
      deleteBlock(entry.block);
      this.layouts.delete(key);
    }
  }

  /** A laid-out block, kept until its layer changes or the frames it is drawn in stop. */
  private cachedBlock(key: string, node: TextNode, make: () => BlockLayout): BlockLayout {
    const cached = this.layouts.get(key);
    if (cached?.node === node) {
      cached.frame = this.frame;
      return cached.block;
    }
    if (cached) {
      deleteBlock(cached.block);
      this.layouts.delete(key);
    }
    const block = make();
    this.layouts.set(key, { node, block, frame: this.frame });
    // Nothing is drawing through this shaper, so no sweep is coming: everything but this frame's own work goes.
    if (this.layouts.size > CACHE_CEILING) {
      for (const [old, entry] of this.layouts) {
        if (entry.frame === this.frame) continue;
        deleteBlock(entry.block);
        this.layouts.delete(old);
      }
    }
    return block;
  }

  verticalTrim(node: TextNode): { top: number; bottom: number } | null {
    const block = this.layout(node);
    const visible = block.paragraphs.filter((p) => !p.hidden);
    const first = visible[0];
    const last = visible.at(-1);
    const firstLine = first?.paragraph.getLineMetrics()[0];
    const lastLine = last?.paragraph.getLineMetrics().at(-1);
    if (!first || !last || !firstLine || !lastLine) return null;
    const top = block.dy + first.top + firstLine.baseline - this.capHeight(node.fontName.family, node.fontSize);
    const bottom = node.size.height - (block.dy + last.top + lastLine.baseline);
    return { top: round2(Math.max(0, top)), bottom: round2(Math.max(0, bottom)) };
  }

  firstBaseline(node: TextNode): number | null {
    const block = this.layout(node);
    const first = block.paragraphs.find((p) => !p.hidden);
    const line = first?.paragraph.getLineMetrics()[0];
    return first && line ? round2(block.dy + first.top + line.baseline) : null;
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
    const localY = y - target.top;
    const targetLines = target.paragraph.getLineMetrics();
    // The line under the point: the first whose next line starts below it.
    const lineUnder = Math.max(
      0,
      targetLines.findIndex((_, i) => i === targetLines.length - 1 || localY < targetLines[i + 1]!.baseline - targetLines[i + 1]!.ascent),
    );
    const local = target.paragraph.getGlyphPositionAtCoordinate(point.x - lineLeft(target, lineUnder), localY).pos;
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
    const leftAt = (localIndex: number) => lineLeft(layout, this.lineIndex(lines, localIndex));
    const rtlValue = this.ck.TextDirection.RTL.value;
    const glyph = (start: number, end: number) => paragraph.getRectsForRange(start, end, this.ck.RectHeightStyle.Tight, this.ck.RectWidthStyle.Tight)[0];
    // The caret sits before a glyph on its leading edge (left in left-to-right runs, right in right-to-left ones), or after it on the trailing edge.
    if (at < range.end) {
      const g = glyph(local(at), local(nextGrapheme(text, at)));
      if (g) return { x: leftAt(local(at)) + (g.dir.value === rtlValue ? g.rect[2]! : g.rect[0]!), ...box(local(at)) };
    }
    if (at > range.start) {
      const g = glyph(local(previousGrapheme(text, at)), local(at));
      if (g) return { x: leftAt(local(at) - 1) + (g.dir.value === rtlValue ? g.rect[0]! : g.rect[2]!), ...box(local(at) - 1) };
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
      for (const { rect: r } of layout.paragraph.getRectsForRange(
        toParagraphOffset(layout.range, from, layout.prefix),
        toParagraphOffset(layout.range, to, layout.prefix),
        this.ck.RectHeightStyle.Max,
        this.ck.RectWidthStyle.Tight,
      )) {
        const middle = (r[1]! + r[3]!) / 2;
        const line = Math.max(
          0,
          layout.paragraph.getLineMetrics().findIndex((l) => middle <= l.baseline + l.descent + 0.5),
        );
        rects.push({ x: lineLeft(layout, line) + r[0]!, y: r[1]! + y, width: r[2]! - r[0]!, height: r[3]! - r[1]! });
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
      return this.clamp(node, fromParagraphOffset(layout.range, layout.paragraph.getGlyphPositionAtCoordinate(x - lineLeft(layout, line), lines[line]!.baseline).pos, layout.prefix));
    }
    // Into the paragraph above or below.
    const visible = block.paragraphs.filter((p) => !p.hidden);
    const next = visible[visible.indexOf(layout) + direction];
    if (!next) return direction < 0 ? 0 : node.characters.length;
    const nextLines = next.paragraph.getLineMetrics();
    const nextLine = direction > 0 ? nextLines[0] : nextLines[nextLines.length - 1];
    if (!nextLine) return direction > 0 ? next.range.start : next.range.end;
    return this.clamp(
      node,
      fromParagraphOffset(next.range, next.paragraph.getGlyphPositionAtCoordinate(x - lineLeft(next, direction > 0 ? 0 : nextLines.length - 1), nextLine.baseline).pos, next.prefix),
    );
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

/** The x of a paragraph's line in the layer: its left edge, shifted on the first line for a hanging quote. */
function lineLeft(layout: ParagraphLayout, line: number): number {
  return layout.left + (line === 0 ? layout.firstLineShift : 0);
}

function deleteBlock(block: BlockLayout): void {
  for (const p of block.paragraphs) {
    p.paragraph.delete();
    p.marker?.paragraph.delete();
  }
}
