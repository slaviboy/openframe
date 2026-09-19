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

import { DEFAULT_JPEG_QUALITY, type ExportImageOptions, type RasterFormat } from '@/core/export/export-settings';
import type { ThumbnailSource } from '@/core/document/file-thumbnail';
import type { Canvas, CanvasKit, ColorFilter, EmbindEnumEntity, Paint as CkPaint, ImageFilter, Path, RRect, RuntimeEffect, Shader } from 'canvaskit-wasm';
import type { Effect } from '@/core/schema/document';

const isNormalBlend = (mode: string): boolean => mode === 'NORMAL' || mode === 'PASS_THROUGH';
import { maskRuns } from '@/core/scene/masks';
import { arcCommands } from '@/core/geometry/arc';
import { strokeChain, variableWidthOutline } from '@/core/vector/vector-width';
import { networkStrokePath, regionFillPath, type VectorNetwork } from '@/core/vector/vector-network';
import { capOfEnd, isMarkerCap, openEnds, type OpenEnd } from '@/core/vector/vector-caps';
import type { Vec2 } from '@/core/math/vec';
import type { OffsetJoin, ShapeFace } from '@/core/vector/geometry-service';
import { bumpedEnds, dynamicStrokePath, hasDynamicStroke } from '@/core/vector/dynamic-stroke';
import { brushStrokeOutlines, isBrush } from '@/core/vector/brush';
import { pathRunFor } from '@/core/vector/text-path';
import { repeatMatrices, repeats } from '@/core/geometry/repeat';
import type { BooleanOperationNode, VectorNode } from '@/core/schema/document';
import { stackingOrder } from '@/core/layout/auto-layout';
import {
  blurOffsets,
  blurSigma,
  isProgressiveBlur,
  limitEffects,
  maxBlurRadius,
  progressiveBlurLevels,
  backdropEffect,
  type BlurEffect,
  type GlassEffect,
  type NoiseEffect,
  type TextureEffect,
} from '@/core/effects/effects';
import { GLASS_FIELD_SKSL } from './glass-sksl';
import { NOISE_SKSL, TEXTURE_SKSL } from './noise-sksl';
import { patternLayout } from '@/core/color/pattern';
import type { ColorProfile } from '@/core/color/color';
import { documentToSrgb } from '@/core/color/color-profile';
import { invert } from '@/core/math/matrix';
import { hasGeometry, isSceneNode, type PatternPaint } from '@/core/schema/document';
import type { DocumentStore } from '@/core/document/store';
import { clampCornerRadius, lineCapSize, polygonPoints, starPoints } from '@/core/geometry/shapes';
import { rectangleCorners, resolveCornerRadii, roundedPolygon, type PathCommand } from '@/core/geometry/corners';
import type { TextNode } from '@/core/schema/document';
import type { TextShaper } from '../text/text-shaper';
import { textSegments, type TextSegment } from '@/core/text/style-runs';
import { isGradientPaint } from '@/core/schema/document';
import { adjustmentValues, hasAdjustments } from '@/core/image/adjustments';
import { imageQuad } from '@/core/image/crop';
import { imagePlacement } from '@/core/image/image-fit';
import { IMAGE_ADJUST_SKSL } from './image-adjust';
import type { ImagePaint } from '@/core/schema/document';
import type { Image as CkImage } from 'canvaskit-wasm';

/** Encoded image bytes by content hash; `request` asks for one that is not available yet. */
export interface ImageSource {
  get(hash: string): { readonly bytes: Uint8Array } | undefined;
  request(hash: string): void;
}
import type { Id } from '@/core/ids/ids';
import { intersects, type Rect } from '@/core/math/rect';
import { matrixOf, type SceneIndex } from '@/core/scene/scene-index';
import {
  DEFAULT_MITER_ANGLE,
  type Color,
  type CornerRadii,
  type GradientPaint,
  type IndividualStrokeWeights,
  type LineNode,
  type Paint,
  type SceneNode,
  type Size,
  type StrokeCap,
} from '@/core/schema/document';
import { BlendModes } from './blend';

export interface RenderView {
  /** World point at the canvas top-left. */
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  /** Canvas size in CSS pixels. */
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

export interface RenderStats {
  drawn: number;
  culled: number;
  ms: number;
}

export interface RenderOptions {
  /** Outline mode (⌘⇧O): hairline outlines of every layer; no fills, strokes, effects or clipping. */
  readonly outlines?: boolean;
  /** In outline mode, also outline hidden layers. */
  readonly includeHidden?: boolean;
  /** In outline mode, also draw the box each layer sits in. */
  readonly objectBounds?: boolean;
  /** Layer in crop mode: its whole image is shown faded under the crop. */
  readonly cropping?: Id | null;
  /** The file's color profile: how document color values are interpreted. */
  readonly colorProfile?: ColorProfile;
  /** Draw only this layer and its children (thumbnails), on a transparent background. */
  readonly only?: Id;
  /** Presentation view: the current frame of a playing video fill, by video hash (null draws its poster). */
  readonly videoFrame?: (videoHash: string) => CkImage | null;
  /** Presentation view: the current frame of an animated GIF image fill, by image hash (null draws the stored image). */
  readonly imageFrame?: (imageHash: string) => CkImage | null;
  /**
   * How an image fill is sampled when it is drawn at another size: `DETAILED` weighs the pixels around each one
   * (bicubic), `BASIC` takes the nearest, which keeps hard edges. Absent draws it the way the canvas does.
   */
  readonly resampling?: 'DETAILED' | 'BASIC';
  /**
   * A text layer's glyphs as outlines in its own space, when they have been worked out already. A boolean group
   * combines them rather than the layer's box; without them the box is what it combines, as it always did.
   */
  readonly textOutline?: (node: SceneNode) => readonly PathCommand[] | null;
  /**
   * Draw text too small to read as a bar a line rather than shaping it (see `drawGreekedText`). It is for a surface
   * a person pans and zooms; an export writes what the layers say, however small it is asked to draw them.
   */
  readonly greekText?: boolean;
}

interface DrawContext {
  readonly store: DocumentStore;
  readonly index: SceneIndex;
  readonly visible: Rect;
  readonly stats: RenderStats;
  readonly pixelSize: number;
  readonly outlines: boolean;
  readonly includeHidden: boolean;
  readonly objectBounds: boolean;
  readonly cropping: Id | null;
}

type GeometryNode = Extract<SceneNode, { fills: readonly Paint[] }>;
type ShapeNode = Exclude<GeometryNode, LineNode>;

/** Diamond gradient: distance |x − ½| + |y − ½| (0 at the center, 1 at the diamond's tips) looks up a linear color ramp. */
const DIAMOND_SKSL = `
uniform shader ramp;
half4 main(float2 p) {
  float t = clamp((abs(p.x - 0.5) + abs(p.y - 0.5)) * 2.0, 0.0, 1.0);
  return ramp.eval(float2(t, 0.5));
}`;

/**
 * How much of a bar standing in for a line of text too small to read is ink. Latin text covers about this share of
 * the box its glyphs sit in, and it is what keeps a page of greeked text as light as the same page of real text.
 * Measured against shaped text in `scene-renderer.test.ts`.
 */
const GREEK_INK = 0.38;
/** Sections have slightly rounded corners and no radius control. */
export const SECTION_CORNER_RADIUS = 2;
/** How many shapes the Shape builder reads at once: every group of them is tried, so the work doubles with each. */
const MAX_FACE_SHAPES = 8;

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

/**
 * Draws a page of the document with CanvasKit. Stateless with respect to the
 * document: it reads the store and the SceneIndex each frame and culls subtrees
 * outside the visible world rect.
 */
export class SceneRenderer {
  private readonly blend: BlendModes;
  private readonly fillPaint: CkPaint;
  private readonly strokePaint: CkPaint;
  private readonly layerPaint: CkPaint;
  private readonly outlinePaint: CkPaint;
  private readonly maskPaint: CkPaint;
  private readonly shadowPaint: CkPaint;
  private diamondEffect: RuntimeEffect | null | undefined;
  /** Decoded images by content hash (null when the bytes could not be decoded). */
  private readonly imageCache = new Map<string, CkImage | null>();
  private checker: CkImage | null = null;
  private adjustEffect: RuntimeEffect | null | undefined;
  private noiseEffect: RuntimeEffect | null | undefined;
  private textureEffect: RuntimeEffect | null | undefined;
  private glassEffect: RuntimeEffect | null | undefined;
  /** Pattern shaders of the layer being drawn, keyed by paint. */
  private readonly patternShaders = new Map<PatternPaint, Shader>();
  /** Pattern sources currently being recorded (guards against a pattern of itself). */
  private readonly patternSources = new Set<Id>();
  /** Color profile of the page being rendered. */
  private profile: ColorProfile = 'SRGB';
  /** The current frames of video fills while rendering (presentation view). */
  private videoFrame: ((videoHash: string) => CkImage | null) | null = null;
  /** The current frames of animated GIFs while rendering (presentation view). */
  private imageFrame: ((imageHash: string) => CkImage | null) | null = null;
  /** How image fills are sampled while rendering; null samples them the way the canvas does. */
  private resampling: 'DETAILED' | 'BASIC' | null = null;
  /** Glyph outlines of text layers, when the caller has them ready; null combines a text layer's box instead. */
  private textOutline: ((node: SceneNode) => readonly PathCommand[] | null) | null = null;
  /** Whether text too small to read stands in as bars, which only an interactive surface asks for. */
  private greekText = false;

  constructor(
    private readonly ck: CanvasKit,
    private readonly images: ImageSource | null = null,
  ) {
    this.outlinePaint = new ck.Paint();
    this.outlinePaint.setAntiAlias(true);
    this.outlinePaint.setStyle(ck.PaintStyle.Stroke);
    // Width 0 is a hairline: one device pixel regardless of zoom.
    this.outlinePaint.setStrokeWidth(0);
    this.blend = new BlendModes(ck);
    this.fillPaint = new ck.Paint();
    this.fillPaint.setAntiAlias(true);
    this.fillPaint.setStyle(ck.PaintStyle.Fill);
    this.strokePaint = new ck.Paint();
    this.strokePaint.setAntiAlias(true);
    this.strokePaint.setStyle(ck.PaintStyle.Stroke);
    this.layerPaint = new ck.Paint();
    this.maskPaint = new ck.Paint();
    this.shadowPaint = new ck.Paint();
  }

  dispose(): void {
    this.fillPaint.delete();
    this.strokePaint.delete();
    this.layerPaint.delete();
    this.maskPaint.delete();
    this.shadowPaint.delete();
    this.outlinePaint.delete();
    this.diamondEffect?.delete();
    this.blend.dispose();
    for (const image of this.imageCache.values()) image?.delete();
    this.imageCache.clear();
    this.checker?.delete();
    this.checker = null;
    this.adjustEffect?.delete();
    this.adjustEffect = undefined;
    this.noiseEffect?.delete();
    this.noiseEffect = undefined;
    this.textureEffect?.delete();
    this.textureEffect = undefined;
    this.glassEffect?.delete();
    this.glassEffect = undefined;
  }

  /** The document being drawn; boolean groups combine their children's outlines from it. */
  private drawStore: DocumentStore | null = null;

  render(canvas: Canvas, store: DocumentStore, index: SceneIndex, pageId: Id, view: RenderView, options: RenderOptions = {}): RenderStats {
    const start = performance.now();
    this.profile = options.colorProfile ?? 'SRGB';
    this.videoFrame = options.videoFrame ?? null;
    this.imageFrame = options.imageFrame ?? null;
    this.resampling = options.resampling ?? null;
    this.textOutline = options.textOutline ?? null;
    this.greekText = options.greekText ?? false;
    this.drawStore = store;
    const stats: RenderStats = { drawn: 0, culled: 0, ms: 0 };
    const page = store.get(pageId);
    if (options.outlines) {
      // Black outlines on light canvases, white on dark ones.
      const bg = page?.type === 'PAGE' ? page.backgroundColor : { r: 1, g: 1, b: 1, a: 1 };
      const light = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b > 0.5;
      this.outlinePaint.setColor(light ? this.ck.BLACK : this.ck.WHITE);
    }
    canvas.save();
    canvas.clear(options.only !== undefined ? this.ck.TRANSPARENT : page?.type === 'PAGE' ? this.color(page.backgroundColor) : this.ck.WHITE);
    const s = view.zoom * view.dpr;
    canvas.scale(view.dpr, view.dpr);
    canvas.scale(view.zoom, view.zoom);
    canvas.translate(-view.x, -view.y);
    const visible: Rect = { x: view.x, y: view.y, width: view.width / view.zoom, height: view.height / view.zoom };
    index.ensure(pageId);
    const ctx: DrawContext = {
      store,
      index,
      visible,
      stats,
      pixelSize: 1 / s,
      outlines: options.outlines ?? false,
      includeHidden: options.includeHidden ?? false,
      objectBounds: options.objectBounds ?? false,
      cropping: options.cropping ?? null,
    };
    if (options.only !== undefined) {
      // A single layer: its parents' transform, then the layer with its children.
      const parentId = store.parentOf(options.only);
      if (parentId !== null && parentId !== pageId) {
        const w = index.worldTransform(parentId);
        canvas.concat([w.a, w.c, w.e, w.b, w.d, w.f, 0, 0, 1]);
      }
      this.drawNode(canvas, options.only, ctx);
    } else {
      this.drawChildren(canvas, store.children(pageId), ctx);
    }
    canvas.restore();
    stats.ms = performance.now() - start;
    return stats;
  }

  /**
   * A PNG of one layer and its children alone on a transparent background (ThumbnailService), scaled to fit
   * `size` × `size` CSS pixels at `dpr` and never enlarged more than 4×; null when the layer has no area.
   */
  thumbnail(store: DocumentStore, index: SceneIndex, pageId: Id, id: Id, size: number, dpr: number, colorProfile?: ColorProfile): Uint8Array | null {
    index.ensure(pageId);
    const bounds = index.paintBounds(id) ?? index.worldBounds(id);
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    const zoom = Math.min(size / bounds.width, size / bounds.height, 4);
    const width = Math.max(1, Math.ceil(bounds.width * zoom));
    const height = Math.max(1, Math.ceil(bounds.height * zoom));
    const surface = this.ck.MakeSurface(Math.ceil(width * dpr), Math.ceil(height * dpr));
    if (!surface) return null;
    try {
      this.render(surface.getCanvas(), store, index, pageId, { x: bounds.x, y: bounds.y, zoom, width, height, dpr }, { only: id, ...(colorProfile ? { colorProfile } : {}) });
      surface.flush();
      const image = surface.makeImageSnapshot();
      try {
        return image.encodeToBytes();
      } finally {
        image.delete();
      }
    } finally {
      surface.delete();
    }
  }

  /**
   * An exported image (ThumbnailService): one layer and its children within its painted bounds (effects included) on a
   * transparent background, or for a slice everything within its bounds, at `scale`. JPG has no transparency, so it is
   * flattened onto white. Null when there is nothing to draw.
   */
  exportImage(store: DocumentStore, index: SceneIndex, pageId: Id, id: Id, scale: number, format: RasterFormat, options: ExportImageOptions = {}): Uint8Array | null {
    index.ensure(pageId);
    const { colorProfile, resampling, quality, textOutline } = options;
    // With "ignore overlapping layers" off, the whole page is drawn and cut to the layer's bounds, as a slice is.
    const region = store.get(id)?.type === 'SLICE' || options.contentsOnly === false;
    const bounds = region ? index.worldBounds(id) : (index.paintBounds(id) ?? index.worldBounds(id));
    if (!bounds || bounds.width <= 0 || bounds.height <= 0 || !(scale > 0)) return null;
    const width = Math.max(1, Math.round(bounds.width * scale));
    const height = Math.max(1, Math.round(bounds.height * scale));
    const surface = this.ck.MakeSurface(width, height);
    if (!surface) return null;
    const flat = format === 'JPG' ? this.ck.MakeSurface(width, height) : null;
    try {
      const view = { x: bounds.x, y: bounds.y, zoom: scale, width, height, dpr: 1 };
      this.render(surface.getCanvas(), store, index, pageId, view, {
        ...(region ? {} : { only: id }),
        ...(colorProfile ? { colorProfile } : {}),
        ...(textOutline ? { textOutline } : {}),
        resampling: resampling ?? 'DETAILED',
      });
      surface.flush();
      const drawn = surface.makeImageSnapshot();
      try {
        if (!flat) return drawn.encodeToBytes(format === 'WEBP' ? this.ck.ImageFormat.WEBP : this.ck.ImageFormat.PNG, quality ?? 100);
        const canvas = flat.getCanvas();
        canvas.clear(this.ck.WHITE);
        canvas.drawImage(drawn, 0, 0, null);
        flat.flush();
        const flattened = flat.makeImageSnapshot();
        try {
          return flattened.encodeToBytes(this.ck.ImageFormat.JPEG, quality ?? DEFAULT_JPEG_QUALITY);
        } finally {
          flattened.delete();
        }
      } finally {
        drawn.delete();
      }
    } finally {
      surface.delete();
      flat?.delete();
    }
  }

  /**
   * A file thumbnail (ThumbnailService): the frame set as the thumbnail scaled to fill `width` × `height` (what overflows
   * is cropped), or the page's visible content fitted into it (enlarged at most 4×) on the page background.
   */
  fileThumbnail(store: DocumentStore, index: SceneIndex, source: ThumbnailSource, width: number, height: number, colorProfile?: ColorProfile): Uint8Array | null {
    index.ensure(source.pageId);
    let bounds: Rect | null = null;
    if (source.kind === 'frame') {
      bounds = index.worldBounds(source.id);
    } else {
      for (const child of store.children(source.pageId)) {
        const node = store.get(child);
        if (!node || !isSceneNode(node) || !node.visible) continue;
        const b = index.paintBounds(child) ?? index.worldBounds(child);
        if (!b) continue;
        bounds = bounds
          ? {
              x: Math.min(bounds.x, b.x),
              y: Math.min(bounds.y, b.y),
              width: Math.max(bounds.x + bounds.width, b.x + b.width) - Math.min(bounds.x, b.x),
              height: Math.max(bounds.y + bounds.height, b.y + b.height) - Math.min(bounds.y, b.y),
            }
          : b;
      }
    }
    if (!bounds || bounds.width <= 0 || bounds.height <= 0 || width <= 0 || height <= 0) return null;
    const zoom = source.kind === 'frame' ? Math.max(width / bounds.width, height / bounds.height) : Math.min(width / bounds.width, height / bounds.height, 4);
    const view = { x: bounds.x + bounds.width / 2 - width / zoom / 2, y: bounds.y + bounds.height / 2 - height / zoom / 2, zoom, width, height, dpr: 1 };
    const surface = this.ck.MakeSurface(width, height);
    if (!surface) return null;
    try {
      this.render(surface.getCanvas(), store, index, source.pageId, view, { ...(source.kind === 'frame' ? { only: source.id } : {}), ...(colorProfile ? { colorProfile } : {}) });
      surface.flush();
      const image = surface.makeImageSnapshot();
      try {
        return image.encodeToBytes();
      } finally {
        image.delete();
      }
    } finally {
      surface.delete();
    }
  }

  /**
   * Draws children in paint order. A visible mask and the siblings above it (up to the next mask)
   * draw into a layer; the mask then composites over it with DstIn, so the content shows where the
   * mask is opaque. Vector masks count any coverage as fully opaque; luminance masks use brightness.
   * Outline mode ignores masks.
   */
  private drawChildren(canvas: Canvas, children: readonly Id[], ctx: DrawContext): void {
    if (ctx.outlines) {
      for (const child of children) this.drawNode(canvas, child, ctx);
      return;
    }
    for (const run of maskRuns(ctx.store, children)) {
      if (run.mask === null) {
        this.drawNode(canvas, run.content[0], ctx);
        continue;
      }
      canvas.saveLayer();
      for (const child of run.content) this.drawNode(canvas, child, ctx);
      const mask = ctx.store.get(run.mask) as SceneNode;
      const filter = this.maskColorFilter(mask.maskType ?? 'ALPHA');
      this.maskPaint.setBlendMode(this.ck.BlendMode.DstIn);
      this.maskPaint.setColorFilter(filter);
      canvas.saveLayer(this.maskPaint);
      this.maskPaint.setColorFilter(null);
      filter?.delete();
      this.drawNode(canvas, run.mask, ctx);
      canvas.restore();
      canvas.restore();
    }
  }

  /** Turns a mask's pixels into coverage: unchanged for alpha, any coverage → opaque for vector, brightness for luminance. */
  private maskColorFilter(type: 'ALPHA' | 'VECTOR' | 'LUMINANCE'): ColorFilter | null {
    if (type === 'ALPHA') return null;
    const alphaRow = type === 'VECTOR' ? [0, 0, 0, 255, 0] : [0.2126, 0.7152, 0.0722, 0, 0];
    return this.ck.ColorFilter.MakeMatrix([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, ...alphaRow]);
  }

  private drawNode(canvas: Canvas, id: Id, ctx: DrawContext): void {
    const node = ctx.store.get(id) as SceneNode | undefined;
    // Slices mark export regions and are never painted.
    if (!node || node.type === 'SLICE') return;
    if (ctx.outlines ? !node.visible && !ctx.includeHidden : !node.visible || node.opacity <= 0) return;
    const bounds = ctx.index.paintBounds(id);
    // Subtree culling: a clipping frame contains its children; others may overflow, so
    // only cull when the node has no children or clips content. Outline mode never clips.
    // Auto layout frames can draw their first child on top (canvas stacking).
    const children = stackingOrder(node, ctx.store.children(id));
    const clips = !ctx.outlines && node.type === 'FRAME' && node.clipsContent;
    if (bounds && !intersects(bounds, ctx.visible) && (children.length === 0 || clips)) {
      ctx.stats.culled++;
      return;
    }

    if (ctx.outlines) {
      canvas.save();
      const om = matrixOf(node.transform);
      canvas.concat([om.a, om.c, om.e, om.b, om.d, om.f, 0, 0, 1]);
      if (node.type !== 'GROUP') {
        this.drawOutline(canvas, node, ctx.objectBounds);
        ctx.stats.drawn++;
      }
      for (const child of children) this.drawNode(canvas, child, ctx);
      canvas.restore();
      return;
    }
    canvas.save();
    const m = matrixOf(node.transform);
    canvas.concat([m.a, m.c, m.e, m.b, m.d, m.f, 0, 0, 1]);

    const patterns = this.preparePatterns(node, ctx);
    this.drawBackgroundBlur(canvas, node, ctx.store);
    this.drawBlendedDropShadows(canvas, node, children, clips, ctx);
    const filters: ImageFilter[] = [];
    const effectFilter = this.effectFilter(node, filters);
    const needsLayer = node.opacity < 1 || (node.blendMode !== 'PASS_THROUGH' && node.blendMode !== 'NORMAL') || effectFilter !== null;
    if (needsLayer) {
      this.layerPaint.setAlphaf(node.opacity);
      this.applyBlend(this.layerPaint, node.blendMode);
      this.layerPaint.setImageFilter(effectFilter);
      canvas.saveLayer(this.layerPaint);
      this.layerPaint.setImageFilter(null);
    }
    for (const filter of filters) filter.delete();

    if (node.id === ctx.cropping && node.type !== 'GROUP' && node.type !== 'LINE') this.drawCropPreview(canvas, node);
    if (node.type !== 'GROUP') {
      this.drawGeometry(canvas, node, ctx.pixelSize, ctx.store);
      ctx.stats.drawn++;
    }

    // A boolean group paints its combined shape instead of its children.
    if (children.length > 0 && node.type !== 'BOOLEAN_OPERATION') {
      if (clips) {
        canvas.save();
        if (node.type === 'FRAME') this.clipToFrame(canvas, node);
      }
      // A transform group repeats its contents without holding layers for the copies.
      if (node.type === 'GROUP' && repeats(node.repeat)) {
        for (const copy of repeatMatrices(node.repeat, node.size)) {
          canvas.save();
          canvas.concat([copy.a, copy.c, copy.e, copy.b, copy.d, copy.f, 0, 0, 1]);
          this.drawChildren(canvas, children, ctx);
          canvas.restore();
        }
      } else {
        this.drawChildren(canvas, children, ctx);
      }
      if (clips) canvas.restore();
    }

    if (node.type === 'FRAME') this.drawStrokes(canvas, node);
    if (needsLayer) canvas.restore();
    canvas.restore();
    for (const paint of patterns) {
      this.patternShaders.get(paint)?.delete();
      this.patternShaders.delete(paint);
    }
  }

  /**
   * Records a picture shader for every visible pattern fill and stroke of a layer, before any of its
   * geometry is drawn (recording draws other layers with the shared paints). A pattern whose source
   * is missing, has no area, or is already being recorded (a pattern of itself) stays transparent.
   * Returns the paints that got a shader, for release after the layer is drawn.
   */
  private preparePatterns(node: SceneNode, ctx: DrawContext): PatternPaint[] {
    if (!hasGeometry(node)) return [];
    const prepared: PatternPaint[] = [];
    for (const paint of [...node.fills, ...node.strokes]) {
      if (paint.type !== 'PATTERN' || !paint.visible || !paint.sourceNodeId || this.patternShaders.has(paint)) continue;
      const shader = this.recordPattern(paint, paint.sourceNodeId, node.size, ctx);
      if (!shader) continue;
      this.patternShaders.set(paint, shader);
      prepared.push(paint);
    }
    return prepared;
  }

  private recordPattern(paint: PatternPaint, sourceId: Id, size: Size, ctx: DrawContext): Shader | null {
    const ck = this.ck;
    const source = ctx.store.get(sourceId);
    if (!source || !isSceneNode(source) || source.type === 'SLICE' || this.patternSources.has(sourceId)) return null;
    const layout = patternLayout(paint, source.size, size);
    const inverse = invert(matrixOf(source.transform));
    if (!layout || !inverse) return null;
    const recorder = new ck.PictureRecorder();
    const canvas = recorder.beginRecording(ck.LTRBRect(0, 0, layout.tile.width, layout.tile.height));
    // The source draws in its own coordinates, unculled, without crop previews.
    const local: DrawContext = { ...ctx, visible: { x: -1e9, y: -1e9, width: 2e9, height: 2e9 }, cropping: null };
    this.patternSources.add(sourceId);
    try {
      for (const at of layout.placements) {
        canvas.save();
        canvas.translate(at.x, at.y);
        canvas.scale(layout.scale, layout.scale);
        canvas.concat([inverse.a, inverse.c, inverse.e, inverse.b, inverse.d, inverse.f, 0, 0, 1]);
        this.drawNode(canvas, sourceId, local);
        canvas.restore();
      }
    } finally {
      this.patternSources.delete(sourceId);
    }
    const picture = recorder.finishRecordingAsPicture();
    recorder.delete();
    const shader = picture.makeShader(ck.TileMode.Repeat, ck.TileMode.Repeat, ck.FilterMode.Linear, [1, 0, layout.origin.x, 0, 1, layout.origin.y, 0, 0, 1]);
    picture.delete();
    return shader;
  }

  /** Crop mode: the whole image of the top CROP fill, faded, under the layer (the crop itself draws on top). */
  private drawCropPreview(canvas: Canvas, node: ShapeNode): void {
    const paint = [...node.fills].reverse().find((p): p is ImagePaint => p.type === 'IMAGE' && p.visible && p.scaleMode === 'CROP');
    const image = paint?.imageSize;
    const placement = paint && image ? imagePlacement(paint, image, node.size) : null;
    if (!paint || !image || !placement) return;
    const quad = imageQuad(placement.matrix, image);
    const path = new this.ck.PathBuilder()
      .addPolygon(
        quad.flatMap((p) => [p.x, p.y]),
        true,
      )
      .detachAndDelete();
    this.configurePaint(this.fillPaint, { ...paint, opacity: paint.opacity * 0.35, blendMode: 'NORMAL' }, node.size);
    canvas.drawPath(path, this.fillPaint);
    path.delete();
  }

  private drawGeometry(canvas: Canvas, node: GeometryNode, pixelSize: number, store: DocumentStore): void {
    if (node.type === 'LINE') {
      this.drawLine(canvas, node);
      return;
    }
    if (node.type === 'TEXT') {
      if (this.drawGreekedText(canvas, node, pixelSize)) return;
      // Fill layers bottom to top; each paragraph paints every segment with its own fill at that layer.
      const segments = textSegments(node);
      const layers = Math.max(0, ...segments.map((s) => s.fills.length));
      // What a fill layer paints with follows from the layer itself, so its shaped text can be kept and
      // drawn again — unless a fill is painted from an image, which may only arrive later and would leave
      // the kept text painted as it was before the image was there.
      const settled = segments.every((s) => s.fills.every((p) => p.type === 'SOLID' || isGradientPaint(p)));
      for (let i = 0; i < layers; i++) {
        this.drawText(
          canvas,
          node,
          (segment) => {
            const paint = segment.fills[i];
            if (!paint || !paint.visible || paint.opacity <= 0) return this.transparentPaint();
            this.configurePaint(this.fillPaint, paint, node.size);
            return this.fillPaint;
          },
          // Underlines once, over the top fill.
          i === layers - 1,
          store,
          settled ? `fill:${i}` : undefined,
        );
      }
      return;
    }
    if (node.type === 'VECTOR') {
      this.drawVector(canvas, node, store);
      return;
    }
    if (node.type === 'BOOLEAN_OPERATION') {
      this.drawBoolean(canvas, node);
      return;
    }
    const path = this.shapePath(node);
    for (const paint of node.fills) {
      if (!paint.visible || paint.opacity <= 0) continue;
      this.configurePaint(this.fillPaint, paint, node.size);
      this.drawShape(canvas, node, this.fillPaint, path);
    }
    // Frame strokes are drawn after children so they sit on top, as in the reference editor.
    if (node.type !== 'FRAME') this.drawStrokes(canvas, node, path);
    path?.delete();
  }

  private drawStrokes(canvas: Canvas, node: ShapeNode, shapePath: Path | null = null): void {
    if ((node.type === 'FRAME' || node.type === 'RECTANGLE') && node.individualStrokeWeights) {
      this.drawIndividualStrokes(canvas, node, node.individualStrokeWeights);
      return;
    }
    if (node.strokeWeight <= 0) return;
    const path = shapePath ?? this.shapePath(node);
    // Path trim draws only the share of the path between the trim points; like the reference it needs a centered stroke.
    const trimmed = node.strokeAlign === 'CENTER' ? this.trimStroke(node, path) : undefined;
    const along = trimmed === undefined ? path : trimmed;
    this.applyStrokeStyle(node);
    for (const paint of trimmed === null ? [] : node.strokes) {
      if (!paint.visible || paint.opacity <= 0) continue;
      this.configurePaint(this.strokePaint, paint, node.size);
      const w = node.strokeWeight;
      canvas.save();
      if (node.strokeAlign === 'CENTER') {
        this.strokePaint.setStrokeWidth(w);
      } else {
        // Inside/outside strokes: draw a double-width stroke clipped to (or outside) the shape.
        this.strokePaint.setStrokeWidth(w * 2);
        const clipOp = node.strokeAlign === 'INSIDE' ? this.ck.ClipOp.Intersect : this.ck.ClipOp.Difference;
        if (path) canvas.clipPath(path, clipOp, true);
        else {
          const box = this.boxRRect(node);
          if (box) canvas.clipRRect(box, clipOp, true);
        }
      }
      this.drawShape(canvas, node, this.strokePaint, along);
      canvas.restore();
    }
    this.resetStrokeStyle();
    trimmed?.delete();
    if (!shapePath) path?.delete();
  }

  /** The path a trimmed stroke is drawn along: undefined when the whole of it is, null when none of it is. */
  private trimStroke(node: ShapeNode, path: Path | null): Path | null | undefined {
    const start = node.strokeTrimStart ?? 0;
    const end = node.strokeTrimEnd ?? 1;
    if (start === 0 && end === 1) return undefined;
    const box = path ? null : this.boxRRect(node);
    const source = path ?? (box ? new this.ck.PathBuilder().addRRect(box).detachAndDelete() : null);
    if (!source) return undefined;
    const trimmed = this.trimmedPath(source, start, end);
    if (source !== path) source.delete();
    return trimmed;
  }

  /**
   * Image filter for a layer's shadows and layer blur, applied to the layer's rendered content
   * (fills, strokes and children) via saveLayer. Created filters are pushed to `created` so the
   * caller can release them once the layer is saved. Returns null when there is nothing to apply.
   *
   * - Drop shadows: shadow-only copies of the content (dilated or eroded for spread), merged,
   *   knocked out by the content's silhouette unless shown behind transparent areas.
   * - Inner shadows: the inverted alpha, tinted, offset and blurred, masked back to the content.
   * - Layer blur: blurs everything above.
   */
  private effectFilter(node: SceneNode, created: ImageFilter[]): ImageFilter | null {
    const effects = node.effects && limitEffects(node.effects).filter((e) => e.visible);
    if (!effects || effects.length === 0) return null;
    const ck = this.ck;
    const keep = <T extends ImageFilter>(filter: T): T => {
      created.push(filter);
      return filter;
    };
    const over = (background: ImageFilter | null, foreground: ImageFilter | null) => keep(ck.ImageFilter.MakeBlend(ck.BlendMode.SrcOver, background, foreground));
    const spreadInput = (spread: number, input: ImageFilter | null) =>
      spread > 0 ? keep(ck.ImageFilter.MakeDilate(spread, spread, input)) : spread < 0 ? keep(ck.ImageFilter.MakeErode(-spread, -spread, input)) : input;

    let drops: ImageFilter | null = null;
    let inner: ImageFilter | null = null;
    let knockOut = false;
    for (const effect of effects) {
      if (effect.type === 'DROP_SHADOW') {
        // Blended drop shadows blend with what is behind the layer, so they draw in their own pass.
        if (!isNormalBlend(effect.blendMode)) continue;
        const sigma = blurSigma(effect.radius);
        const c = effect.color;
        const shadow = keep(ck.ImageFilter.MakeDropShadowOnly(effect.offset.x, effect.offset.y, sigma, sigma, this.color(c), spreadInput(effect.spread, null)));
        drops = drops ? over(drops, shadow) : shadow;
        knockOut ||= !effect.showShadowBehindNode;
      } else if (effect.type === 'INNER_SHADOW') {
        const c = effect.color;
        // Alpha becomes (1 − alpha) · shadow alpha, colored with the shadow color.
        const tint = ck.ColorFilter.MakeMatrix([0, 0, 0, 0, c.r, 0, 0, 0, 0, c.g, 0, 0, 0, 0, c.b, 0, 0, 0, -c.a, c.a]);
        const inverted = keep(ck.ImageFilter.MakeColorFilter(tint, null));
        tint.delete();
        const shifted = keep(ck.ImageFilter.MakeOffset(effect.offset.x, effect.offset.y, spreadInput(effect.spread, inverted)));
        const sigma = blurSigma(effect.radius);
        const blurred = sigma > 0 ? keep(ck.ImageFilter.MakeBlur(sigma, sigma, ck.TileMode.Decal, shifted)) : shifted;
        const masked = keep(ck.ImageFilter.MakeBlend(ck.BlendMode.SrcIn, null, blurred));
        // Each inner shadow blends onto the content (and earlier inner shadows) with its own mode.
        inner = keep(ck.ImageFilter.MakeBlend(this.nativeBlend(effect.blendMode), inner, masked));
      }
    }

    let result: ImageFilter | null = inner;
    if (drops) {
      if (knockOut) {
        const opaque = ck.ColorFilter.MakeMatrix([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0]);
        const silhouette = keep(ck.ImageFilter.MakeColorFilter(opaque, null));
        opaque.delete();
        drops = keep(ck.ImageFilter.MakeBlend(ck.BlendMode.DstOut, drops, silhouette));
      }
      result = over(drops, result);
    }
    // Layer blur, noise and texture sit on top, applied in their order in the list.
    for (const effect of effects) {
      if (effect.type === 'LAYER_BLUR') {
        if (maxBlurRadius(effect) <= 0) continue;
        if (isProgressiveBlur(effect)) {
          result = this.progressiveBlurFilter(effect, node.size, keep, result, ck.TileMode.Decal);
        } else {
          const sigma = blurSigma(effect.radius);
          result = keep(ck.ImageFilter.MakeBlur(sigma, sigma, ck.TileMode.Decal, result));
        }
      } else if (effect.type === 'NOISE') {
        result = this.noiseFilter(effect, keep, result);
      } else if (effect.type === 'TEXTURE') {
        result = this.textureFilter(effect, keep, result);
      }
    }
    return result;
  }

  /**
   * Progressive blur as one image filter: each blur level of `progressiveBlurLevels` is masked by a
   * linear gradient along the blur direction (DstIn) and the masked levels are summed (Plus). The
   * weights sum to 1, so the result is a smooth ramp from the start radius to the end radius.
   */
  private progressiveBlurFilter(effect: BlurEffect, size: Size, keep: <T extends ImageFilter>(filter: T) => T, input: ImageFilter | null, tile: EmbindEnumEntity): ImageFilter {
    const ck = this.ck;
    const w = Math.max(size.width, 1e-6);
    const h = Math.max(size.height, 1e-6);
    const { start, end } = blurOffsets(effect);
    const from = [start.x * w, start.y * h];
    const to = [end.x * w, end.y * h];
    // Coincident points have no direction; the end radius applies everywhere.
    if (from[0] === to[0] && from[1] === to[1]) to[1] = from[1]! + 1e-3;
    let result: ImageFilter | null = null;
    for (const level of progressiveBlurLevels(effect)) {
      const sigma = blurSigma(level.radius);
      const blurred = sigma > 0 ? keep(ck.ImageFilter.MakeBlur(sigma, sigma, tile, input)) : input;
      const colors = level.stops.map((s) => ck.Color4f(0, 0, 0, s.alpha));
      const shader = ck.Shader.MakeLinearGradient(
        from,
        to,
        colors,
        level.stops.map((s) => s.position),
        ck.TileMode.Clamp,
      );
      const mask = keep(ck.ImageFilter.MakeShader(shader));
      shader.delete();
      const masked = keep(ck.ImageFilter.MakeBlend(ck.BlendMode.DstIn, blurred, mask));
      result = result ? keep(ck.ImageFilter.MakeBlend(ck.BlendMode.Plus, result, masked)) : masked;
    }
    return result!;
  }

  /**
   * Noise: a noise shader in layer coordinates, kept only where the content (so far) has coverage
   * (SrcIn), then blended over the content with the effect's blend mode.
   */
  private noiseFilter(effect: NoiseEffect, keep: <T extends ImageFilter>(filter: T) => T, input: ImageFilter | null): ImageFilter | null {
    const ck = this.ck;
    this.noiseEffect ??= ck.RuntimeEffect.Make(NOISE_SKSL);
    if (!this.noiseEffect || effect.density <= 0) return input;
    const mode = effect.noiseType === 'MONOTONE' ? 0 : effect.noiseType === 'DUOTONE' ? 1 : 2;
    const c1 = effect.color;
    const c2 = effect.secondaryColor;
    const shader = this.noiseEffect.makeShader([effect.noiseSize, effect.density, mode, c1.r, c1.g, c1.b, c1.a, c2.r, c2.g, c2.b, c2.a, effect.opacity]);
    const noise = keep(ck.ImageFilter.MakeShader(shader));
    shader.delete();
    const masked = keep(ck.ImageFilter.MakeBlend(ck.BlendMode.SrcIn, input, noise));
    return keep(ck.ImageFilter.MakeBlend(this.nativeBlend(effect.blendMode), input, masked));
  }

  /**
   * Texture: displaces the content by a smooth noise field (up to `radius` pixels), which roughens
   * edges. With clip to shape, the displaced result is kept only inside the original coverage.
   */
  private textureFilter(effect: TextureEffect, keep: <T extends ImageFilter>(filter: T) => T, input: ImageFilter | null): ImageFilter | null {
    const ck = this.ck;
    this.textureEffect ??= ck.RuntimeEffect.Make(TEXTURE_SKSL);
    if (!this.textureEffect || effect.radius <= 0) return input;
    const shader = this.textureEffect.makeShader([effect.noiseSize]);
    const field = keep(ck.ImageFilter.MakeShader(shader));
    shader.delete();
    const displaced = keep(ck.ImageFilter.MakeDisplacementMap(ck.ColorChannel.Red, ck.ColorChannel.Green, effect.radius * 2, field, input));
    return effect.clipToShape ? keep(ck.ImageFilter.MakeBlend(ck.BlendMode.SrcIn, input, displaced)) : displaced;
  }

  /** Native Skia mode for image-filter blends; modes Skia lacks (plus darker) fall back to normal. */
  private nativeBlend(mode: Paint['blendMode']): EmbindEnumEntity {
    const resolved = this.blend.resolve(mode);
    return 'mode' in resolved ? resolved.mode : this.ck.BlendMode.SrcOver;
  }

  /**
   * Drop shadows with a blend mode other than normal: each draws the layer's shadow alone
   * (knocked out under the layer unless shown behind it) into a layer that blends with what is
   * already on the canvas.
   */
  private drawBlendedDropShadows(canvas: Canvas, node: SceneNode, children: readonly Id[], clips: boolean, ctx: DrawContext): void {
    const shadows = node.effects && limitEffects(node.effects).filter((e): e is Extract<Effect, { type: 'DROP_SHADOW' }> => e.type === 'DROP_SHADOW' && e.visible && !isNormalBlend(e.blendMode));
    if (!shadows || shadows.length === 0) return;
    const ck = this.ck;
    for (const effect of shadows) {
      const created: ImageFilter[] = [];
      const keep = <T extends ImageFilter>(filter: T): T => {
        created.push(filter);
        return filter;
      };
      const sigma = blurSigma(effect.radius);
      const c = effect.color;
      const spread =
        effect.spread > 0 ? keep(ck.ImageFilter.MakeDilate(effect.spread, effect.spread, null)) : effect.spread < 0 ? keep(ck.ImageFilter.MakeErode(-effect.spread, -effect.spread, null)) : null;
      let filter: ImageFilter = keep(ck.ImageFilter.MakeDropShadowOnly(effect.offset.x, effect.offset.y, sigma, sigma, this.color(c), spread));
      if (!effect.showShadowBehindNode) {
        const opaque = ck.ColorFilter.MakeMatrix([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0]);
        const silhouette = keep(ck.ImageFilter.MakeColorFilter(opaque, null));
        opaque.delete();
        filter = keep(ck.ImageFilter.MakeBlend(ck.BlendMode.DstOut, filter, silhouette));
      }
      this.shadowPaint.setImageFilter(filter);
      this.shadowPaint.setAlphaf(node.opacity);
      this.applyBlend(this.shadowPaint, effect.blendMode);
      canvas.saveLayer(this.shadowPaint);
      this.shadowPaint.setImageFilter(null);
      this.drawSilhouette(canvas, node, children, clips, ctx);
      canvas.restore();
      for (const f of created) f.delete();
    }
  }

  /** The layer's own geometry, children and frame strokes, without its effects (the source of a blended shadow). */
  private drawSilhouette(canvas: Canvas, node: SceneNode, children: readonly Id[], clips: boolean, ctx: DrawContext): void {
    if (node.type !== 'GROUP' && node.type !== 'SLICE') this.drawGeometry(canvas, node, ctx.pixelSize, ctx.store);
    if (children.length > 0) {
      if (clips) {
        canvas.save();
        if (node.type === 'FRAME') this.clipToFrame(canvas, node);
      }
      this.drawChildren(canvas, children, ctx);
      if (clips) canvas.restore();
    }
    if (node.type === 'FRAME') this.drawStrokes(canvas, node);
  }

  /**
   * Glass, within the layer's shape (drawn before its content, which covers it where the fills are
   * opaque):
   * 1. the backdrop is frosted (blurred by `radius`) and refracted near the edges by a displacement
   *    map whose field is the shape's edge normal (GLASS_FIELD_SKSL); with dispersion, red, green
   *    and blue are displaced by slightly different amounts and recombined (Lighten);
   * 2. a light from `lightAngle` adds a highlight along the edges, strongest on the side facing the
   *    light and fainter opposite, widened and softened by `splay`.
   */
  private drawGlass(canvas: Canvas, node: SceneNode, effect: GlassEffect): void {
    if (node.type === 'GROUP' || node.type === 'LINE' || node.type === 'SLICE') return;
    const ck = this.ck;
    const path = this.shapePath(node);
    const box = path ? null : this.boxRRect(node);
    if (!path && !box) return;
    const { width, height } = node.size;
    const created: ImageFilter[] = [];
    const keep = <T extends ImageFilter>(filter: T): T => {
      created.push(filter);
      return filter;
    };
    canvas.save();
    if (path) canvas.clipPath(path, ck.ClipOp.Intersect, true);
    else canvas.clipRRect(box!, ck.ClipOp.Intersect, true);

    const sigma = blurSigma(effect.radius);
    let filter: ImageFilter | null = sigma > 0 ? keep(ck.ImageFilter.MakeBlur(sigma, sigma, ck.TileMode.Clamp, null)) : null;
    const scale = effect.refraction * effect.depth;
    this.glassEffect ??= ck.RuntimeEffect.Make(GLASS_FIELD_SKSL);
    if (this.glassEffect && scale > 0) {
      const corner =
        node.type === 'FRAME' || node.type === 'RECTANGLE'
          ? node.cornerRadii
            ? Math.max(node.cornerRadii.topLeft, node.cornerRadii.topRight, node.cornerRadii.bottomRight, node.cornerRadii.bottomLeft)
            : node.cornerRadius
          : 0;
      const shader = this.glassEffect.makeShader([width, height, corner, node.type === 'ELLIPSE' ? 1 : 0, effect.depth]);
      const field = keep(ck.ImageFilter.MakeShader(shader));
      shader.delete();
      const displace = (amount: number, input: ImageFilter | null) => keep(ck.ImageFilter.MakeDisplacementMap(ck.ColorChannel.Red, ck.ColorChannel.Green, amount, field, input));
      if (effect.dispersion > 0) {
        // Keep one color channel (and alpha) of a displaced copy; Lighten recombines the three.
        const only = (channel: 0 | 1 | 2, input: ImageFilter) => {
          const m = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0];
          m[channel * 5 + channel] = 1;
          const cf = ck.ColorFilter.MakeMatrix(m);
          const result = keep(ck.ImageFilter.MakeColorFilter(cf, input));
          cf.delete();
          return result;
        };
        const spread = effect.dispersion * 0.3;
        const red = only(0, displace(scale * (1 + spread), filter));
        const green = only(1, displace(scale, filter));
        const blue = only(2, displace(scale * (1 - spread), filter));
        filter = keep(ck.ImageFilter.MakeBlend(ck.BlendMode.Lighten, keep(ck.ImageFilter.MakeBlend(ck.BlendMode.Lighten, red, green)), blue));
      } else {
        filter = displace(scale, filter);
      }
    }
    if (filter) {
      canvas.saveLayer(undefined, null, filter);
      canvas.restore();
    }

    if (effect.lightIntensity > 0) {
      const angle = (effect.lightAngle * Math.PI) / 180;
      const toLight = { x: Math.cos(angle), y: -Math.sin(angle) };
      const reach = Math.hypot(width, height) / 2;
      const cx = width / 2;
      const cy = height / 2;
      const colors = [ck.Color4f(1, 1, 1, effect.lightIntensity), ck.Color4f(1, 1, 1, 0), ck.Color4f(1, 1, 1, effect.lightIntensity * 0.35)];
      const shader = ck.Shader.MakeLinearGradient([cx + toLight.x * reach, cy + toLight.y * reach], [cx - toLight.x * reach, cy - toLight.y * reach], colors, [0, 0.5, 1], ck.TileMode.Clamp);
      const light = this.shadowPaint;
      light.setShader(shader);
      light.setStyle(ck.PaintStyle.Stroke);
      // The clip keeps the inner half of the stroke; splay widens and softens the highlight.
      // The rim is as thick as a share of the glass edge depth (the clip keeps its inner half).
      light.setStrokeWidth(Math.max(4, effect.depth * 0.4) * (1 + effect.splay * 4));
      light.setAlphaf(1);
      light.setBlendMode(ck.BlendMode.SrcOver);
      const soft = effect.splay > 0 ? ck.MaskFilter.MakeBlur(ck.BlurStyle.Normal, effect.splay * 4, true) : null;
      light.setMaskFilter(soft);
      if (path) canvas.drawPath(path, light);
      else canvas.drawRRect(box!, light);
      light.setMaskFilter(null);
      soft?.delete();
      light.setShader(null as never);
      light.setStyle(ck.PaintStyle.Fill);
      shader.delete();
    }
    canvas.restore();
    for (const f of created) f.delete();
    path?.delete();
  }

  /** Background blur: blurs what is already drawn behind the layer, within the layer's shape. */
  private drawBackgroundBlur(canvas: Canvas, node: SceneNode, store: DocumentStore): void {
    // Background blur and glass share one visual layer: only the first of them renders.
    const backdrop = backdropEffect(node.effects);
    if (backdrop?.type === 'GLASS') {
      this.drawGlass(canvas, node, backdrop);
      return;
    }
    const effect = backdrop && maxBlurRadius(backdrop) > 0 ? backdrop : undefined;
    if (!effect || node.type === 'SLICE') return;
    const ck = this.ck;
    const path = this.backdropOutline(node, store, 0);
    if (!path) return;
    canvas.save();
    canvas.clipPath(path, ck.ClipOp.Intersect, true);
    const created: ImageFilter[] = [];
    const keep = <T extends ImageFilter>(filter: T): T => {
      created.push(filter);
      return filter;
    };
    const sigma = blurSigma(effect.radius);
    const filter = isProgressiveBlur(effect) ? this.progressiveBlurFilter(effect, node.size, keep, null, ck.TileMode.Clamp) : keep(ck.ImageFilter.MakeBlur(sigma, sigma, ck.TileMode.Clamp, null));
    canvas.saveLayer(undefined, null, filter);
    canvas.restore();
    canvas.restore();
    for (const f of created) f.delete();
    path.delete();
  }

  /**
   * The area a background blur covers, in the layer's coordinates: a shape's outline, a line's
   * stroke (without end markers), or for a group the union of its visible children's areas.
   */
  private backdropOutline(node: SceneNode, store: DocumentStore, depth: number): Path | null {
    const ck = this.ck;
    switch (node.type) {
      case 'SLICE':
        return null;
      case 'TEXT': {
        // The glyphs themselves, when they have been read from the font already; the box until then.
        const glyphs = this.textOutline?.(node) ?? null;
        return glyphs && glyphs.length > 0 ? this.pathFrom(glyphs) : new ck.PathBuilder().addRect(ck.LTRBRect(0, 0, node.size.width, node.size.height)).detachAndDelete();
      }
      case 'LINE': {
        if (node.strokeWeight <= 0 || node.size.width <= 0) return null;
        const line = new ck.PathBuilder().moveTo(0, 0).lineTo(node.size.width, 0).detachAndDelete();
        const stroked = line.makeStroked({ width: node.strokeWeight, cap: ck.StrokeCap.Butt });
        line.delete();
        return stroked;
      }
      case 'BOOLEAN_OPERATION':
        return depth > 64 ? null : this.booleanPath(node, store, depth + 1);
      case 'GROUP': {
        if (depth > 64) return null;
        let union: Path | null = null;
        for (const childId of store.children(node.id)) {
          const child = store.get(childId);
          if (!child || !isSceneNode(child) || !child.visible) continue;
          const outline = this.backdropOutline(child, store, depth + 1);
          if (!outline) continue;
          const m = matrixOf(child.transform);
          const placed = new ck.PathBuilder().addPath(outline, [m.a, m.c, m.e, m.b, m.d, m.f, 0, 0, 1])?.detachAndDelete() ?? null;
          outline.delete();
          if (!placed) continue;
          if (!union) {
            union = placed;
            continue;
          }
          const merged: Path | null = ck.Path.MakeFromOp(union, placed, ck.PathOp.Union);
          union.delete();
          placed.delete();
          union = merged;
        }
        return union;
      }
      default: {
        const path = this.shapePath(node);
        if (path) return path;
        const box = this.boxRRect(node);
        return box ? new ck.PathBuilder().addRRect(box).detachAndDelete() : null;
      }
    }
  }

  /** Join, miter limit, dash cap and dash pattern of a layer's strokes. */
  private applyStrokeStyle(node: GeometryNode): void {
    const ck = this.ck;
    const paint = this.strokePaint;
    paint.setStrokeJoin(node.strokeJoin === 'ROUND' ? ck.StrokeJoin.Round : node.strokeJoin === 'BEVEL' ? ck.StrokeJoin.Bevel : ck.StrokeJoin.Miter);
    // A miter angle θ corresponds to a miter limit of 1 / sin(θ / 2).
    const angle = node.strokeMiterAngle ?? DEFAULT_MITER_ANGLE;
    paint.setStrokeMiter(angle <= 0 ? 1000 : Math.min(1000, 1 / Math.sin((angle * Math.PI) / 360)));
    paint.setStrokeCap(node.strokeCap === 'ROUND' ? ck.StrokeCap.Round : node.strokeCap === 'SQUARE' ? ck.StrokeCap.Square : ck.StrokeCap.Butt);
    if (node.strokeDashes && node.strokeDashes.some((d) => d > 0)) {
      // Dashed strokes start and end with a half-length dash.
      const effect = ck.PathEffect.MakeDash([...node.strokeDashes], node.strokeDashes[0]! / 2);
      paint.setPathEffect(effect);
      effect.delete();
    } else {
      paint.setPathEffect(null);
    }
  }

  private resetStrokeStyle(): void {
    const paint = this.strokePaint;
    paint.setPathEffect(null);
    paint.setStrokeCap(this.ck.StrokeCap.Butt);
    paint.setStrokeJoin(this.ck.StrokeJoin.Miter);
    paint.setStrokeMiter(4);
  }

  /**
   * Per-side stroke weights: a ring between an outer and an inner rectangle, offset by the stroke
   * alignment (inside, center, outside). Corner radii and dashes are not applied to per-side strokes.
   */
  private drawIndividualStrokes(canvas: Canvas, node: Extract<ShapeNode, { cornerRadius: number }>, s: IndividualStrokeWeights): void {
    const k = node.strokeAlign === 'INSIDE' ? 0 : node.strokeAlign === 'CENTER' ? 0.5 : 1;
    const { width: w, height: h } = node.size;
    const outer = this.ck.LTRBRect(-k * s.left, -k * s.top, w + k * s.right, h + k * s.bottom);
    const innerL = (1 - k) * s.left;
    const innerT = (1 - k) * s.top;
    const innerR = Math.max(innerL, w - (1 - k) * s.right);
    const innerB = Math.max(innerT, h - (1 - k) * s.bottom);
    const inner = this.ck.LTRBRect(innerL, innerT, innerR, innerB);
    for (const paint of node.strokes) {
      if (!paint.visible || paint.opacity <= 0) continue;
      this.configurePaint(this.fillPaint, paint, node.size);
      canvas.drawDRRect(this.ck.RRectXY(outer, 0, 0), this.ck.RRectXY(inner, 0, 0), this.fillPaint);
    }
  }

  private drawShape(canvas: Canvas, node: ShapeNode, paint: CkPaint, path: Path | null): void {
    if (path) {
      canvas.drawPath(path, paint);
      return;
    }
    const box = this.boxRRect(node);
    if (box) canvas.drawRRect(box, paint);
  }

  private textShaper: TextShaper | null = null;
  private clearPaint: CkPaint | null = null;

  /** Installs the text shaper that lays out and paints text layers (they don't draw until then). */
  setTextShaper(shaper: TextShaper | null): void {
    this.textShaper = shaper;
  }

  /**
   * A text layer drawn too small to read: a bar per line in the layer's own fills, rather than shaped glyphs. True
   * when the layer was drawn this way, so text is shaped only where it can be read (see `TextShaper.greekedLines`).
   *
   * A bar is as wide as its line and as tall as the font's cap height, at a share of the fill's strength — glyphs
   * cover about a third of the box they sit in, and a solid bar would read as a much darker page than the text does.
   */
  private drawGreekedText(canvas: Canvas, node: TextNode, pixelSize: number): boolean {
    const shaper = this.textShaper;
    // Text on a path doesn't sit in its box, so its lines are not the box's lines.
    if (!shaper || !this.greekText || node.textPath) return false;
    // A layer painted only through its style runs is left to the text path, rather than drawn in fills it hasn't got.
    if (!node.fills.some((paint) => paint.visible && paint.opacity > 0)) return false;
    const m = canvas.getTotalMatrix();
    // The scale the layer is really drawn at, which its parents' transforms are part of.
    const scale = Math.sqrt(Math.abs(m[0]! * m[4]! - m[1]! * m[3]!)) || 1 / pixelSize;
    const lines = shaper.greekedLines(node, scale);
    if (!lines) return false;
    for (const paint of node.fills) {
      if (!paint.visible || paint.opacity <= 0) continue;
      this.configurePaint(this.fillPaint, paint, node.size);
      this.fillPaint.setAlphaf(this.fillPaint.getColor()[3]! * GREEK_INK);
      for (const line of lines) canvas.drawRect(this.ck.XYWHRect(line.x, line.y, line.width, line.height), this.fillPaint);
    }
    return true;
  }

  private transparentPaint(): CkPaint {
    this.clearPaint ??= (() => {
      const p = new this.ck.Paint();
      p.setColor(this.ck.TRANSPARENT);
      return p;
    })();
    return this.clearPaint;
  }

  /** Draws a text layer's glyphs, each mixed-style segment painted with the paint `paintFor` returns. */
  private drawText(canvas: Canvas, node: TextNode, paintFor: (segment: TextSegment) => CkPaint, decorations = true, store?: DocumentStore, paintKey?: string): void {
    const shaper = this.textShaper;
    if (!shaper || node.characters === '') return;
    const painter = {
      background: this.transparentPaint(),
      paint: paintFor,
      decorations,
      // Decorations take the segment's top visible fill color (the first stop of a gradient; black for images and patterns).
      decorationColor: (segment: TextSegment) => {
        // A custom underline color, with its alpha as opacity.
        if (segment.decorationColor && segment.textDecoration === 'UNDERLINE') return this.color({ ...segment.decorationColor, a: 1 }, segment.decorationColor.a);
        const top = [...segment.fills].reverse().find((p) => p.visible && p.opacity > 0);
        if (top?.type === 'SOLID') return this.color(top.color, top.opacity);
        if (top && isGradientPaint(top) && top.gradientStops[0]) return this.color(top.gradientStops[0].color, top.opacity);
        return this.ck.BLACK;
      },
    };
    // Text on a path follows the vector it was placed on; the two share a transform, so the path is read as it is.
    const run = node.textPath && store ? pathRunFor(store, node.textPath.pathId) : null;
    if (run && node.textPath) shaper.drawOnPath(canvas, node, painter, run, node.textPath.start, node.textPath.flipped);
    else shaper.draw(canvas, node, painter, paintKey);
  }

  /** Outline mode: a hairline (one device pixel at any zoom) along the layer's geometry. */
  private drawOutline(canvas: Canvas, node: GeometryNode, bounds = false): void {
    // "Include object bounds": the box each layer sits in, drawn as well as the shape it draws.
    if (bounds) canvas.drawRect(this.ck.LTRBRect(0, 0, node.size.width, node.size.height), this.outlinePaint);
    // Stroke placement: where the stroke really sits — inside, outside or astride the edge — shown as its own
    // hairline beside the shape, since outline mode draws no strokes.
    const half = node.strokeWeight / 2;
    if (node.strokeWeight > 0 && node.strokes.some((paint) => paint.visible && paint.opacity > 0) && node.type !== 'TEXT' && node.type !== 'LINE') {
      const offsets = node.strokeAlign === 'CENTER' ? [-half, half] : node.strokeAlign === 'INSIDE' ? [node.strokeWeight] : [-node.strokeWeight];
      for (const offset of offsets) {
        const [left, top, right, bottom] = [offset, offset, node.size.width - offset, node.size.height - offset];
        if (right > left && bottom > top) canvas.drawRect(this.ck.LTRBRect(left, top, right, bottom), this.outlinePaint);
      }
    }
    if (node.type === 'TEXT') {
      this.drawText(canvas, node, () => this.outlinePaint);
      return;
    }
    if (node.type === 'LINE') {
      canvas.drawLine(0, 0, node.size.width, 0, this.outlinePaint);
      return;
    }
    const path = this.shapePath(node);
    if (path) {
      canvas.drawPath(path, this.outlinePaint);
      path.delete();
      return;
    }
    const box = this.boxRRect(node);
    if (box) canvas.drawRRect(box, this.outlinePaint);
  }

  /** Rounded-rectangle outline of frames, rectangles and sections (null for path-based shapes). */
  private boxRRect(node: ShapeNode): RRect | null {
    if (node.type === 'FRAME' || node.type === 'RECTANGLE') return this.rrect(node);
    if (node.type === 'SECTION') return this.rrect({ size: node.size, cornerRadius: SECTION_CORNER_RADIUS });
    return null;
  }

  /**
   * Outline path for ellipses, polygons, stars and smoothed rectangles; null for (rounded)
   * rectangles without corner smoothing, which draw as RRects.
   */
  private shapePath(node: ShapeNode): Path | null {
    const { width: w, height: h } = node.size;
    switch (node.type) {
      case 'ELLIPSE':
        if (node.arcData) return this.pathFrom(arcCommands(w, h, node.arcData));
        return new this.ck.PathBuilder().addOval(this.ck.LTRBRect(0, 0, w, h)).detachAndDelete();
      case 'FRAME':
      case 'RECTANGLE': {
        const radii = resolveCornerRadii(node);
        if (!node.cornerSmoothing || Math.max(radii.topLeft, radii.topRight, radii.bottomRight, radii.bottomLeft) <= 0) return null;
        const corners = rectangleCorners(w, h, radii);
        return this.pathFrom(roundedPolygon(corners.points, corners.radii, node.cornerSmoothing));
      }
      case 'POLYGON':
      case 'STAR': {
        const points = node.type === 'POLYGON' ? polygonPoints(w, h, node.pointCount) : starPoints(w, h, node.pointCount, node.innerRadius);
        const radius = node.cornerRadius ?? 0;
        if (radius <= 0)
          return new this.ck.PathBuilder()
            .addPolygon(
              points.flatMap((p) => [p.x, p.y]),
              true,
            )
            .detachAndDelete();
        if (node.cornerSmoothing)
          return this.pathFrom(
            roundedPolygon(
              points,
              points.map(() => radius),
              node.cornerSmoothing,
            ),
          );
        // Start mid-edge so every vertex, including the first, gets a tangent arc.
        const builder = new this.ck.PathBuilder();
        const n = points.length;
        const first = points[0]!;
        const last = points[n - 1]!;
        builder.moveTo((first.x + last.x) / 2, (first.y + last.y) / 2);
        for (let i = 0; i < n; i++) {
          const v = points[i]!;
          const next = points[(i + 1) % n]!;
          const r = clampCornerRadius(points[(i + n - 1) % n]!, v, next, radius);
          if (r > 0) builder.arcToTangent(v.x, v.y, next.x, next.y, r);
          else builder.lineTo(v.x, v.y);
        }
        builder.close();
        return builder.detachAndDelete();
      }
      case 'VECTOR':
        return this.vectorFillPath(node);
      default:
        return null;
    }
  }

  /**
   * The area a layer's stroke covers, as path commands in its local space (GeometryService): the
   * centerline dashed, stroked with the layer's caps and joins, and — for inside or outside strokes
   * of closed shapes — a double-width stroke intersected with (or cut from) the shape.
   */
  /**
   * A path cut into the dashes a pattern draws, over each of its contours. Skia's own dashing takes only one
   * length on and one off, so a longer pattern — dash, gap, dot, gap — is cut by hand here, the same way the
   * renderer's dash effect draws it: the pattern repeats around the contour, starting half a dash in.
   */
  private dashedPath(path: Path, pattern: readonly number[]): Path | null {
    const ck = this.ck;
    // An odd-length pattern repeats doubled, so its dashes and gaps alternate the way they are drawn.
    const steps = pattern.length % 2 === 0 ? pattern : [...pattern, ...pattern];
    const cycle = steps.reduce((total, step) => total + Math.max(0, step), 0);
    if (cycle <= 0) return null;
    const builder = new ck.PathBuilder();
    const iterator = new ck.ContourMeasureIter(path, false, 1);
    let drawn = false;
    for (let contour = iterator.next(); contour; contour = iterator.next()) {
      const length = contour.length();
      // The first dash is cut in half, as the drawn stroke does, so a closed shape starts on a dash.
      let at = -steps[0]! / 2;
      for (let i = 0; at < length; i = (i + 1) % steps.length) {
        const step = Math.max(0, steps[i]!);
        const [from, to] = [Math.max(0, at), Math.min(length, at + step)];
        at += step;
        // Even steps of the pattern are the dashes; the odd ones are the gaps between them.
        if (i % 2 === 1 || to <= from) continue;
        const segment = contour.getSegment(from, to, true);
        builder.addPath(segment);
        segment.delete();
        drawn = true;
      }
      contour.delete();
    }
    iterator.delete();
    const dashed = builder.detachAndDelete();
    if (drawn) return dashed;
    dashed.delete();
    return null;
  }

  /** The stretch of a path between two shares of its length, over each of its contours; null when none of it is left. */
  private trimmedPath(path: Path, start: number, end: number): Path | null {
    const ck = this.ck;
    const from = Math.min(Math.max(start, 0), 1);
    const to = Math.min(Math.max(end, 0), 1);
    const builder = new ck.PathBuilder();
    const iterator = new ck.ContourMeasureIter(path, false, 1);
    let drawn = false;
    for (let contour = iterator.next(); contour; contour = iterator.next()) {
      const length = contour.length();
      // A trim that starts past where it ends wraps back around the contour, which is how a spinner is made.
      const spans: readonly (readonly [number, number])[] =
        from <= to
          ? [[from * length, to * length]]
          : [
              [from * length, length],
              [0, to * length],
            ];
      for (const [a, b] of spans) {
        if (length <= 0 || b - a <= 0) continue;
        const segment = contour.getSegment(a, b, true);
        builder.addPath(segment);
        segment.delete();
        drawn = true;
      }
      contour.delete();
    }
    iterator.delete();
    const trimmed = builder.detachAndDelete();
    if (drawn) return trimmed;
    trimmed.delete();
    return null;
  }

  /** Polygons joined into one filled area, their self-overlaps taken out, as path commands. */
  private polygonsOutline(polygons: readonly (readonly { readonly x: number; readonly y: number }[])[]): PathCommand[] | null {
    const ck = this.ck;
    const builder = new ck.PathBuilder();
    let drawn = false;
    for (const polygon of polygons) {
      if (polygon.length < 3) continue;
      builder.addPolygon(
        polygon.flatMap((p) => [p.x, p.y]),
        true,
      );
      drawn = true;
    }
    const path = builder.detachAndDelete();
    if (!drawn) {
      path.delete();
      return null;
    }
    // A union with an empty path removes the overlaps where the two sides of the stroke cross.
    const empty = new ck.PathBuilder().detachAndDelete();
    const simplified: Path | null = ck.Path.MakeFromOp(path, empty, ck.PathOp.Union);
    empty.delete();
    path.delete();
    if (!simplified) return null;
    const commands = simplified.isEmpty() ? null : this.commandsOf(simplified);
    simplified.delete();
    return commands;
  }

  /**
   * The area a per-side stroke covers: the box grown by each side's weight with the box shrunk by it taken out,
   * which is the ring `drawIndividualStrokes` paints. Per-side strokes take no corners, joins or dashes, as drawn.
   */
  private individualStrokeOutline(node: Extract<ShapeNode, { cornerRadius: number }>, s: IndividualStrokeWeights): PathCommand[] | null {
    const ck = this.ck;
    const k = node.strokeAlign === 'INSIDE' ? 0 : node.strokeAlign === 'CENTER' ? 0.5 : 1;
    const { width: w, height: h } = node.size;
    const innerL = (1 - k) * s.left;
    const innerT = (1 - k) * s.top;
    const outer = new ck.PathBuilder().addRect(ck.LTRBRect(-k * s.left, -k * s.top, w + k * s.right, h + k * s.bottom)).detachAndDelete();
    const inner = new ck.PathBuilder().addRect(ck.LTRBRect(innerL, innerT, Math.max(innerL, w - (1 - k) * s.right), Math.max(innerT, h - (1 - k) * s.bottom))).detachAndDelete();
    const ring: Path | null = ck.Path.MakeFromOp(outer, inner, ck.PathOp.Difference);
    outer.delete();
    inner.delete();
    if (!ring) return null;
    const commands = ring.isEmpty() ? null : this.commandsOf(ring);
    ring.delete();
    return commands;
  }

  strokeOutline(node: SceneNode, store?: DocumentStore): PathCommand[] | null {
    const ck = this.ck;
    const outlinable = node.type === 'RECTANGLE' || node.type === 'ELLIPSE' || node.type === 'POLYGON' || node.type === 'STAR' || node.type === 'LINE' || node.type === 'VECTOR';
    // A frame's stroke runs around its box, and a boolean group's around the shape it combines to.
    const combined = node.type === 'BOOLEAN_OPERATION' && store !== undefined;
    if (!outlinable && node.type !== 'FRAME' && !combined) return null;
    if (!('strokes' in node) || node.strokeWeight <= 0 || !node.strokes.some((p) => p.visible && p.opacity > 0)) return null;
    if ((node.type === 'RECTANGLE' || node.type === 'FRAME') && node.individualStrokeWeights) return this.individualStrokeOutline(node, node.individualStrokeWeights);
    // A stroke whose width varies along the path is outlined as the shape it is drawn as, not by stroking a line.
    if (node.type === 'VECTOR' && node.strokeWidths?.length && !node.strokeDashes) {
      const chain = strokeChain(node.vectorNetwork);
      if (chain) return this.polygonsOutline(variableWidthOutline(chain, node.strokeWidths, node.strokeWeight));
    }
    let area: Path | null = null;
    let centerline: Path | null;
    if (combined) {
      area = this.booleanPath(node, store!);
      centerline = area;
    } else if (node.type === 'LINE') {
      centerline = node.size.width > 0 ? new ck.PathBuilder().moveTo(0, 0).lineTo(node.size.width, 0).detachAndDelete() : null;
    } else if (node.type === 'VECTOR') {
      area = this.vectorFillPath(node);
      // The outline follows the stroke as it is drawn, bumps and all, so Outline stroke and the SVG export
      // give back the line that is on screen rather than the straight one underneath it.
      const commands = node.vectorNetwork.segments.length > 0 ? networkStrokePath(node.vectorNetwork) : null;
      centerline = commands ? this.pathFrom(hasDynamicStroke(node.dynamicStroke) ? dynamicStrokePath(commands, node.dynamicStroke) : commands) : null;
    } else {
      area = this.shapePath(node);
      if (!area) {
        const box = this.boxRRect(node);
        area = box ? new ck.PathBuilder().addRRect(box).detachAndDelete() : null;
      }
      centerline = area;
    }
    const release = () => {
      if (centerline && centerline !== area) centerline.delete();
      area?.delete();
    };
    if (!centerline) {
      release();
      return null;
    }
    // Path trim draws only the share of the path between the trim points. Like the reference it needs a centered stroke,
    // and is left out of account on any other, which would have the stroke follow the shape's edge instead.
    if (node.strokeAlign === 'CENTER' && ((node.strokeTrimStart ?? 0) !== 0 || (node.strokeTrimEnd ?? 1) !== 1)) {
      const trimmed = this.trimmedPath(centerline, node.strokeTrimStart ?? 0, node.strokeTrimEnd ?? 1);
      if (centerline !== area) centerline.delete();
      centerline = trimmed;
      if (!centerline) {
        release();
        return null;
      }
    }
    const dashes = node.strokeDashes && node.strokeDashes.some((d) => d > 0) ? node.strokeDashes : null;
    // A vector's open ends are outlined the way they are drawn: the ends that draw their own artwork cut the
    // path off flat and are taken into the outline below, and a triangle's tip stops the path at its base.
    const ends = node.type === 'VECTOR' ? this.vectorEnds(node) : [];
    const plainEnd = ends.every((end) => end.cap === (ends[0]?.cap ?? 'NONE') && !isMarkerCap(end.cap)) ? (ends[0]?.cap ?? 'NONE') : null;
    const tips = ends.filter((end) => end.cap === 'TRIANGLE_ARROW');
    if (tips.length > 0) {
      const inseted = this.insetEnds(centerline, tips, lineCapSize(node.strokeWeight) * COS30);
      if (inseted) {
        if (centerline !== area) centerline.delete();
        centerline = inseted;
      }
    }
    // Dashed strokes start and end with a half-length dash, as drawn.
    const dashed = dashes ? this.dashedPath(centerline, dashes) : null;
    const aligned = node.strokeAlign !== 'CENTER' && area !== null && node.type !== 'LINE';
    const angle = node.strokeMiterAngle ?? DEFAULT_MITER_ANGLE;
    const endCap = node.type === 'VECTOR' && !dashes ? (plainEnd ?? 'NONE') : node.strokeCap;
    let outline = (dashed ?? centerline).makeStroked({
      width: aligned ? node.strokeWeight * 2 : node.strokeWeight,
      join: node.strokeJoin === 'ROUND' ? ck.StrokeJoin.Round : node.strokeJoin === 'BEVEL' ? ck.StrokeJoin.Bevel : ck.StrokeJoin.Miter,
      miter_limit: angle <= 0 ? 1000 : Math.min(1000, 1 / Math.sin((angle * Math.PI) / 360)),
      cap: endCap === 'ROUND' ? ck.StrokeCap.Round : endCap === 'SQUARE' ? ck.StrokeCap.Square : ck.StrokeCap.Butt,
    });
    dashed?.delete();
    if (outline && aligned && area) {
      const clipped: Path | null = ck.Path.MakeFromOp(outline, area, node.strokeAlign === 'INSIDE' ? ck.PathOp.Intersect : ck.PathOp.Difference);
      outline.delete();
      outline = clipped;
    }
    // A union with an empty path removes the stroke's self-overlaps (this CanvasKit build has no makeSimplified).
    const empty = new ck.PathBuilder().detachAndDelete();
    const simplified: Path | null = outline ? ck.Path.MakeFromOp(outline, empty, ck.PathOp.Union) : null;
    empty.delete();
    outline?.delete();
    release();
    if (!simplified) return null;
    // End markers are part of the ink a stroke draws, so they go into the outline with it.
    const withMarkers = node.type === 'LINE' ? this.withCaps(simplified, node) : plainEnd === null ? this.withEndCaps(simplified, ends, node.strokeWeight) : simplified;
    if (withMarkers !== simplified) simplified.delete();
    if (!withMarkers) return null;
    const commands = this.commandsOf(withMarkers);
    withMarkers.delete();
    return commands.length > 0 ? commands : null;
  }

  /** A line's stroke with its end markers taken in; the path it is given is left for the caller to delete. */
  private withCaps(stroke: Path, node: LineNode): Path | null {
    const size = lineCapSize(node.strokeWeight);
    let result: Path | null = stroke;
    for (const [cap, x, dir] of [
      [node.startCap, 0, -1],
      [node.endCap, node.size.width, 1],
    ] as const) {
      const marker = result ? this.capPath(cap, x, dir, node.strokeWeight, size) : null;
      if (!marker || !result) continue;
      const merged: Path | null = this.ck.Path.MakeFromOp(result, marker, this.ck.PathOp.Union);
      marker.delete();
      if (result !== stroke) result.delete();
      result = merged;
    }
    return result;
  }

  /**
   * A vector's stroke with the end points of its open ends taken in, each turned to face the way the path
   * leaves it; the path it is given is left for the caller to delete.
   */
  private withEndCaps(stroke: Path, ends: readonly (OpenEnd & { readonly cap: StrokeCap })[], weight: number): Path | null {
    const ck = this.ck;
    const size = lineCapSize(weight);
    // The stroke is cut off flat at every end here, so a round or square end is an area of its own too — the
    // same one `drawCap` paints — while `capPath` leaves those to the stroke's own cap.
    const areaOf = (cap: StrokeCap): Path | null =>
      cap === 'ROUND'
        ? new ck.PathBuilder().addOval(ck.LTRBRect(-weight / 2, -weight / 2, weight / 2, weight / 2)).detachAndDelete()
        : cap === 'SQUARE'
          ? new ck.PathBuilder().addRect(ck.LTRBRect(0, -weight / 2, weight / 2, weight / 2)).detachAndDelete()
          : this.capPath(cap, 0, 1, weight, size);
    let result: Path | null = stroke;
    for (const end of ends) {
      const marker = result ? areaOf(end.cap) : null;
      if (!marker || !result) continue;
      // The marker is drawn along +x from the origin, so it is turned and carried onto the end it belongs to.
      const cos = Math.cos(end.angle);
      const sin = Math.sin(end.angle);
      const placed = new this.ck.PathBuilder();
      placed.addPath(marker, cos, -sin, end.point.x, sin, cos, end.point.y);
      marker.delete();
      const turned = placed.detachAndDelete();
      const merged: Path | null = this.ck.Path.MakeFromOp(result, turned, this.ck.PathOp.Union);
      turned.delete();
      if (result !== stroke) result.delete();
      result = merged;
    }
    return result;
  }

  /** What is left of a vector region after a round eraser stroke (GeometryService); null when the stroke misses it. */
  regionMinusStroke(network: VectorNetwork, index: number, path: readonly { readonly x: number; readonly y: number }[], weight: number, shape: 'ROUND' | 'SQUARE' = 'ROUND'): PathCommand[] | null {
    const ck = this.ck;
    const region = network.regions[index];
    const first = path[0];
    if (!region || !first || weight <= 0) return null;
    const builder = new ck.PathBuilder().moveTo(first.x, first.y);
    // A press without moving erases a dot.
    if (path.length === 1) builder.lineTo(first.x + 0.001, first.y);
    for (const p of path.slice(1)) builder.lineTo(p.x, p.y);
    const line = builder.detachAndDelete();
    const square = shape === 'SQUARE';
    const stroke = line.makeStroked({ width: weight, cap: square ? ck.StrokeCap.Square : ck.StrokeCap.Round, join: square ? ck.StrokeJoin.Miter : ck.StrokeJoin.Round });
    line.delete();
    if (!stroke) return null;
    const area = this.pathFrom(regionFillPath(network, region), region.windingRule === 'EVENODD');
    const overlap: Path | null = ck.Path.MakeFromOp(area, stroke, ck.PathOp.Intersect);
    const reaches = overlap !== null && !overlap.isEmpty();
    overlap?.delete();
    const rest: Path | null = reaches ? ck.Path.MakeFromOp(area, stroke, ck.PathOp.Difference) : null;
    area.delete();
    stroke.delete();
    if (!reaches) return null;
    if (!rest) return [];
    const commands = this.commandsOf(rest);
    rest.delete();
    return commands;
  }

  /**
   * Offset path (GeometryService): the area the network's closed loops cover, grown or shrunk by `amount`. The
   * growth is a stroke of twice the amount laid along the outline, taken in where the amount is positive and cut
   * away where it is negative, which is what rounds or squares the corners off by the join.
   */
  offsetNetwork(network: VectorNetwork, amount: number, join: OffsetJoin): PathCommand[] | null {
    const ck = this.ck;
    const loops = network.regions.flatMap((region) => regionFillPath(network, region));
    if (loops.length === 0 || amount === 0) return null;
    const area = this.pathFrom(
      loops,
      network.regions.some((region) => region.windingRule === 'EVENODD'),
    );
    const band = area.makeStroked({ width: Math.abs(amount) * 2, cap: ck.StrokeCap.Butt, join: join === 'ROUND' ? ck.StrokeJoin.Round : ck.StrokeJoin.Miter });
    if (!band) {
      area.delete();
      return null;
    }
    const grown: Path | null = ck.Path.MakeFromOp(area, band, amount > 0 ? ck.PathOp.Union : ck.PathOp.Difference);
    area.delete();
    band.delete();
    if (!grown) return [];
    const commands = grown.isEmpty() ? [] : this.commandsOf(grown);
    grown.delete();
    return commands;
  }

  /** A vector region's area split by the line through `a` and `b` (GeometryService); null without the region. */
  regionHalves(
    network: VectorNetwork,
    index: number,
    a: { readonly x: number; readonly y: number },
    b: { readonly x: number; readonly y: number },
  ): { positive: PathCommand[]; negative: PathCommand[] } | null {
    const ck = this.ck;
    const region = network.regions[index];
    const [dx, dy] = [b.x - a.x, b.y - a.y];
    const length = Math.hypot(dx, dy);
    if (!region || length === 0) return null;
    const area = this.pathFrom(regionFillPath(network, region), region.windingRule === 'EVENODD');
    const bounds = area.getBounds();
    // Each side is the region intersected with a polygon along the line, reaching past the whole region.
    const reach = Math.hypot(bounds[2]! - bounds[0]!, bounds[3]! - bounds[1]!) + Math.hypot(a.x - bounds[0]!, a.y - bounds[1]!) + 1;
    const [ux, uy] = [dx / length, dy / length];
    const side = (sign: 1 | -1): PathCommand[] => {
      const [nx, ny] = [-uy * sign * reach, ux * sign * reach];
      const [x1, y1, x2, y2] = [a.x - ux * reach, a.y - uy * reach, a.x + ux * reach, a.y + uy * reach];
      const half = new ck.PathBuilder().addPolygon([x1, y1, x2, y2, x2 + nx, y2 + ny, x1 + nx, y1 + ny], true).detachAndDelete();
      const part: Path | null = ck.Path.MakeFromOp(area, half, ck.PathOp.Intersect);
      half.delete();
      const commands = part ? this.commandsOf(part) : [];
      part?.delete();
      return commands;
    };
    const halves = { positive: side(1), negative: side(-1) };
    area.delete();
    return halves;
  }

  /** A path's contours as move, line, cubic and close commands (quadratic and conic curves become cubics). */
  private commandsOf(path: Path): PathCommand[] {
    const ck = this.ck;
    const cmds = path.toCmds();
    const out: PathCommand[] = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i < cmds.length;) {
      const verb = cmds[i++]!;
      if (verb === ck.MOVE_VERB || verb === ck.LINE_VERB) {
        x = cmds[i++]!;
        y = cmds[i++]!;
        out.push({ op: verb === ck.MOVE_VERB ? 'M' : 'L', x, y });
      } else if (verb === ck.CUBIC_VERB) {
        const [x1, y1, x2, y2, ex, ey] = [cmds[i]!, cmds[i + 1]!, cmds[i + 2]!, cmds[i + 3]!, cmds[i + 4]!, cmds[i + 5]!];
        i += 6;
        out.push({ op: 'C', x1, y1, x2, y2, x: ex, y: ey });
        [x, y] = [ex, ey];
      } else if (verb === ck.QUAD_VERB || verb === ck.CONIC_VERB) {
        const [qx, qy, ex, ey] = [cmds[i]!, cmds[i + 1]!, cmds[i + 2]!, cmds[i + 3]!];
        i += 4;
        const w = verb === ck.CONIC_VERB ? cmds[i++]! : 1;
        // A quadratic is exactly a cubic with controls 2/3 of the way to its control point; a conic's
        // weight scales that fraction (exact for w = 1, close for the circular arcs of round joins and caps).
        const k = (4 * w) / (3 * (1 + w));
        out.push({ op: 'C', x1: x + k * (qx - x), y1: y + k * (qy - y), x2: ex + k * (qx - ex), y2: ey + k * (qy - ey), x: ex, y: ey });
        [x, y] = [ex, ey];
      } else {
        out.push({ op: 'Z' });
      }
    }
    return out;
  }

  /** A boolean group's shape: its visible children's outlines, placed by their transforms and combined by its operation. */
  /**
   * A layer's shape with the area its stroke covers taken in, which is what a boolean group combines: a stroked
   * layer contributes the ink it draws, not just the shape the ink runs around. Deletes the shape it is given.
   */
  private withStrokeArea(shape: Path | null, node: SceneNode): Path | null {
    const commands = this.strokeOutline(node);
    if (!commands || commands.length === 0) return shape;
    const stroke = this.pathFrom(commands);
    if (!shape) return stroke;
    const merged: Path | null = this.ck.Path.MakeFromOp(shape, stroke, this.ck.PathOp.Union);
    shape.delete();
    stroke.delete();
    return merged;
  }

  /**
   * Shape builder (GeometryService): the pieces overlapping shapes cut the plane into. A piece is the area inside
   * one group of the shapes and outside every other, so the pieces together cover the shapes exactly once and can
   * be taken apart, merged or dropped one at a time.
   *
   * Every group of the shapes is tried, so the work doubles with each shape; past `MAX_FACE_SHAPES` only that many
   * are read, which keeps a selection of a great many shapes from hanging the editor.
   */
  shapeFaces(shapes: readonly (readonly PathCommand[])[]): readonly ShapeFace[] {
    const ck = this.ck;
    const paths = shapes.slice(0, MAX_FACE_SHAPES).map((commands) => this.pathFrom(commands));
    const faces: ShapeFace[] = [];
    for (let mask = 1; mask < 1 << paths.length; mask++) {
      const members = paths.map((_, i) => i).filter((i) => (mask & (1 << i)) !== 0);
      // Inside every shape of the group…
      let piece: Path | null = null;
      for (const i of members) {
        const shape = paths[i]!;
        if (!piece) {
          piece = new ck.PathBuilder().addPath(shape)?.detachAndDelete() ?? null;
          continue;
        }
        const next: Path | null = ck.Path.MakeFromOp(piece, shape, ck.PathOp.Intersect);
        piece.delete();
        piece = next;
      }
      // …and outside all the rest.
      for (let i = 0; piece && i < paths.length; i++) {
        if (members.includes(i)) continue;
        const next: Path | null = ck.Path.MakeFromOp(piece, paths[i]!, ck.PathOp.Difference);
        piece.delete();
        piece = next;
      }
      if (!piece) continue;
      if (!piece.isEmpty()) {
        const commands = this.commandsOf(piece);
        if (commands.length > 0) faces.push({ members, commands });
      }
      piece.delete();
    }
    for (const path of paths) path.delete();
    return faces;
  }

  /** A boolean group's combined shape as path commands (GeometryService); null when it combines nothing. */
  booleanOutline(node: SceneNode, store: DocumentStore): PathCommand[] | null {
    if (node.type !== 'BOOLEAN_OPERATION') return null;
    const path = this.booleanPath(node, store);
    if (!path) return null;
    const commands = path.isEmpty() ? null : this.commandsOf(path);
    path.delete();
    return commands;
  }

  private booleanPath(node: BooleanOperationNode, store: DocumentStore, depth = 0): Path | null {
    const ck = this.ck;
    const op = { UNION: ck.PathOp.Union, SUBTRACT: ck.PathOp.Difference, INTERSECT: ck.PathOp.Intersect, EXCLUDE: ck.PathOp.XOR }[node.booleanOperation];
    let result: Path | null = null;
    for (const childId of store.children(node.id)) {
      const child = store.get(childId);
      if (!child || !isSceneNode(child) || !child.visible) continue;
      const outline = this.withStrokeArea(this.backdropOutline(child, store, depth + 1), child);
      if (!outline) continue;
      const m = matrixOf(child.transform);
      const placed = new ck.PathBuilder().addPath(outline, [m.a, m.c, m.e, m.b, m.d, m.f, 0, 0, 1])?.detachAndDelete() ?? null;
      outline.delete();
      if (!placed) continue;
      if (!result) {
        result = placed;
        continue;
      }
      // Subtract removes each later (higher) layer from the bottom one; the others combine in order.
      const merged: Path | null = ck.Path.MakeFromOp(result, placed, op);
      result.delete();
      placed.delete();
      result = merged;
    }
    return result;
  }

  /** A boolean group: its combined shape painted with its own fills and strokes. */
  private drawBoolean(canvas: Canvas, node: BooleanOperationNode): void {
    const path = this.drawStore ? this.booleanPath(node, this.drawStore) : null;
    if (!path) return;
    for (const paint of node.fills) {
      if (!paint.visible || paint.opacity <= 0) continue;
      this.configurePaint(this.fillPaint, paint, node.size);
      canvas.drawPath(path, this.fillPaint);
    }
    this.drawStrokes(canvas, node, path);
    path.delete();
  }

  /** The closed regions of a vector layer as one path, each region filled by its own winding rule; null without regions. */
  private vectorFillPath(node: VectorNode): Path | null {
    const network = node.vectorNetwork;
    let combined: Path | null = null;
    for (const region of network.regions) {
      const path = this.pathFrom(regionFillPath(network, region), region.windingRule === 'EVENODD');
      if (!combined) {
        combined = path;
        continue;
      }
      const merged: Path | null = this.ck.Path.MakeFromOp(combined, path, this.ck.PathOp.Union);
      combined.delete();
      path.delete();
      combined = merged;
    }
    return combined;
  }

  /** A vector layer: fills over its closed regions, strokes along every segment with the endpoint cap. */
  private drawVector(canvas: Canvas, node: VectorNode, store: DocumentStore): void {
    const fillPath = this.vectorFillPath(node);
    const network = node.vectorNetwork;
    if (fillPath && network.regions.some((r) => r.fills)) {
      // Regions painted with the Paint tool use their own fills; the others use the layer's.
      for (const region of network.regions) {
        const path = this.pathFrom(regionFillPath(network, region), region.windingRule === 'EVENODD');
        for (const paint of region.fills ?? node.fills) {
          if (!paint.visible || paint.opacity <= 0) continue;
          this.configurePaint(this.fillPaint, paint, node.size);
          canvas.drawPath(path, this.fillPaint);
        }
        path.delete();
      }
    } else if (fillPath) {
      for (const paint of node.fills) {
        if (!paint.visible || paint.opacity <= 0) continue;
        this.configurePaint(this.fillPaint, paint, node.size);
        canvas.drawPath(fillPath, this.fillPaint);
      }
    }
    const widths = node.strokeWidths;
    // A brush paints the stroke as its own shape, and takes the width points with it; the variable-width
    // outline is for a stroke drawn as a line.
    const chain = widths && widths.length > 0 && !node.strokeDashes && node.brushId === undefined ? strokeChain(node.vectorNetwork) : null;
    // A custom brush paints the stroke as its own shape along the path, filled with the stroke's paints.
    const brush = node.brushId === undefined ? undefined : store.get(node.brushId);
    const brushChain = isBrush(brush) && node.strokeWeight > 0 ? strokeChain(node.vectorNetwork) : null;
    if (isBrush(brush) && brushChain) {
      const builder = new this.ck.PathBuilder();
      for (const polygon of brushStrokeOutlines(brushChain, brush.vectorNetwork, brush.size, brush.brushKind, node.strokeWeight, { settings: node.brushSettings, widths: node.strokeWidths }))
        builder.addPolygon(
          polygon.flatMap((q) => [q.x, q.y]),
          true,
        );
      const outline = builder.detachAndDelete();
      for (const paint of node.strokes) {
        if (!paint.visible || paint.opacity <= 0) continue;
        this.configurePaint(this.fillPaint, paint, node.size);
        canvas.drawPath(outline, this.fillPaint);
      }
      outline.delete();
    } else if (widths && chain) {
      // A variable-width stroke is its outline, filled with the stroke paints.
      const builder = new this.ck.PathBuilder();
      for (const polygon of variableWidthOutline(chain, widths, node.strokeWeight))
        builder.addPolygon(
          polygon.flatMap((q) => [q.x, q.y]),
          true,
        );
      const outline = builder.detachAndDelete();
      for (const paint of node.strokes) {
        if (!paint.visible || paint.opacity <= 0) continue;
        this.configurePaint(this.fillPaint, paint, node.size);
        canvas.drawPath(outline, this.fillPaint);
      }
      outline.delete();
    } else if (node.strokeWeight > 0 && node.vectorNetwork.segments.length > 0) {
      // A dynamic stroke bumps the path before it is stroked; it follows the path, so it is the same on every draw.
      const commands = networkStrokePath(node.vectorNetwork);
      const full = this.pathFrom(hasDynamicStroke(node.dynamicStroke) ? dynamicStrokePath(commands, node.dynamicStroke) : commands);
      const ends = this.vectorEnds(node);
      // Every end alike, and none of them drawn as its own artwork: the stroke's own cap draws them all.
      const plain = ends.every((end) => end.cap === (ends[0]?.cap ?? 'NONE') && !isMarkerCap(end.cap)) ? (ends[0]?.cap ?? 'NONE') : null;
      const size = lineCapSize(node.strokeWeight);
      // A triangle's flat end would poke out of its tip, so the path stops at the triangle's base.
      const tips = ends.filter((end) => end.cap === 'TRIANGLE_ARROW');
      const strokePath = (tips.length > 0 ? this.insetEnds(full, tips, size * COS30) : null) ?? full;
      this.applyStrokeStyle(node);
      const cap = plain === 'ROUND' ? this.ck.StrokeCap.Round : plain === 'SQUARE' ? this.ck.StrokeCap.Square : this.ck.StrokeCap.Butt;
      for (const paint of node.strokes) {
        if (!paint.visible || paint.opacity <= 0) continue;
        this.configurePaint(this.strokePaint, paint, node.size);
        // Dashes keep their own cap.
        if (!node.strokeDashes) this.strokePaint.setStrokeCap(cap);
        canvas.save();
        if (node.strokeAlign !== 'CENTER' && fillPath) {
          // Inside/outside strokes of closed regions: a double-width stroke clipped to (or outside) the filled area.
          this.strokePaint.setStrokeWidth(node.strokeWeight * 2);
          canvas.clipPath(fillPath, node.strokeAlign === 'INSIDE' ? this.ck.ClipOp.Intersect : this.ck.ClipOp.Difference, true);
        } else {
          this.strokePaint.setStrokeWidth(node.strokeWeight);
        }
        canvas.drawPath(strokePath, this.strokePaint);
        canvas.restore();
        // End points are part of the ink the stroke draws, and are always solid.
        if (plain === null) {
          this.configurePaint(this.fillPaint, paint, node.size);
          this.resetStrokeStyle();
          this.strokePaint.setStrokeWidth(node.strokeWeight);
          for (const end of ends) this.drawCapAt(canvas, end.cap, end.point, end.angle, node.strokeWeight, size);
          this.applyStrokeStyle(node);
        }
      }
      this.resetStrokeStyle();
      if (strokePath !== full) strokePath.delete();
      full.delete();
    }
    fillPath?.delete();
  }

  private pathFrom(commands: readonly PathCommand[], evenOdd = false): Path {
    const builder = new this.ck.PathBuilder();
    if (evenOdd) builder.setFillType(this.ck.FillType.EvenOdd);
    for (const c of commands) {
      if (c.op === 'M') builder.moveTo(c.x, c.y);
      else if (c.op === 'L') builder.lineTo(c.x, c.y);
      else if (c.op === 'C') builder.cubicTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
      else builder.close();
    }
    return builder.detachAndDelete();
  }

  /** Clips a frame's children to its outline. */
  private clipToFrame(canvas: Canvas, node: Extract<SceneNode, { type: 'FRAME' }>): void {
    const path = this.shapePath(node);
    if (path) {
      canvas.clipPath(path, this.ck.ClipOp.Intersect, true);
      path.delete();
    } else {
      canvas.clipRRect(this.rrect(node), this.ck.ClipOp.Intersect, true);
    }
  }

  /** Lines are stroked on center from (0,0) to (width,0), with an independent marker at each end. */
  private drawLine(canvas: Canvas, node: LineNode): void {
    const w = node.strokeWeight;
    const length = node.size.width;
    if (w <= 0) return;
    const size = lineCapSize(w);
    // A triangle's butt end would poke out of its tip, so the body stops at the triangle's base.
    const inset = (cap: StrokeCap) => (cap === 'TRIANGLE_ARROW' ? Math.min(size * COS30, length / 2) : 0);
    for (const paint of node.strokes) {
      if (!paint.visible || paint.opacity <= 0) continue;
      const lineSize = { width: node.size.width, height: Math.max(node.strokeWeight, 1) };
      this.configurePaint(this.strokePaint, paint, lineSize);
      this.configurePaint(this.fillPaint, paint, lineSize);
      this.strokePaint.setStrokeWidth(w);
      this.applyStrokeStyle(node);
      canvas.drawLine(inset(node.startCap), 0, length - inset(node.endCap), 0, this.strokePaint);
      // End markers are always solid.
      this.resetStrokeStyle();
      this.drawCap(canvas, node.startCap, 0, -1, w, size);
      this.drawCap(canvas, node.endCap, length, 1, w, size);
    }
  }

  /**
   * A line end marker as an area, the same shape `drawCap` paints: null for a marker that is only the stroke's
   * own cap (round and square are already in the stroked line) or for no marker at all.
   */
  private capPath(cap: StrokeCap, x: number, dir: 1 | -1, weight: number, size: number): Path | null {
    const ck = this.ck;
    const back = x - dir * size * COS30;
    const spread = size * SIN30;
    switch (cap) {
      case 'NONE':
      case 'ROUND':
      case 'SQUARE':
        return null;
      case 'CIRCLE_FILLED':
        return new ck.PathBuilder().addOval(ck.LTRBRect(x - size / 2, -size / 2, x + size / 2, size / 2)).detachAndDelete();
      case 'LINE_ARROW': {
        // The line arrow is drawn as a stroke rather than filled, so its area is that stroke's.
        const open = new ck.PathBuilder().addPolygon([back, -spread, x, 0, back, spread], false).detachAndDelete();
        const stroked = open.makeStroked({ width: weight, cap: ck.StrokeCap.Butt, join: ck.StrokeJoin.Miter });
        open.delete();
        return stroked;
      }
      case 'TRIANGLE_ARROW':
        return new ck.PathBuilder().addPolygon([back, -spread, x, 0, back, spread], true).detachAndDelete();
      // The reversed triangle is the same shape turned to point back down the line rather than off it.
      case 'TRIANGLE_FILLED':
        return new ck.PathBuilder().addPolygon([x, -spread, back, 0, x, spread], true).detachAndDelete();
      case 'DIAMOND_FILLED':
        return new ck.PathBuilder().addPolygon([x - size / 2, 0, x, -size / 2, x + size / 2, 0, x, size / 2], true).detachAndDelete();
    }
  }

  /**
   * The open ends of a vector layer's path, each with the end point it draws. None while the ends are not
   * drawn as end points: a dashed stroke keeps its dashes' own cap, and a stroke drawn as an area — a brush,
   * or a width that varies — ends in the shape it tapers to, which is why the reference's own table says a
   * width profile takes an arrowhead off.
   */
  private vectorEnds(node: VectorNode): (OpenEnd & { readonly cap: StrokeCap })[] {
    if (node.strokeDashes || node.strokeWidths?.length || node.brushId !== undefined) return [];
    const ends = openEnds(node.vectorNetwork).map((end) => ({ ...end, cap: capOfEnd(node.vectorNetwork.vertices[end.vertex], node.endpointCap) }));
    if (!hasDynamicStroke(node.dynamicStroke)) return ends;
    // A dynamic stroke bumps the path away from its own points, so an end point goes where the ink stops.
    const bumped = bumpedEnds(networkStrokePath(node.vectorNetwork), node.dynamicStroke);
    return ends.map((end) => {
      const moved = bumped.find((b) => Math.hypot(b.from.x - end.point.x, b.from.y - end.point.y) < 0.01);
      return moved ? { ...end, point: moved.point, angle: moved.angle } : end;
    });
  }

  /** The path with every contour that stops at one of these ends shortened there by `inset`; null when nothing is left. */
  private insetEnds(path: Path, ends: readonly OpenEnd[], inset: number): Path | null {
    const at = (point: Float32Array | number[], end: OpenEnd) => Math.hypot(point[0]! - end.point.x, point[1]! - end.point.y) < 0.01;
    const builder = new this.ck.PathBuilder();
    const iterator = new this.ck.ContourMeasureIter(path, false, 1);
    let drawn = false;
    for (let contour = iterator.next(); contour; contour = iterator.next()) {
      const length = contour.length();
      const cut = Math.min(inset, length / 2);
      const from = ends.some((end) => at(contour.getPosTan(0), end)) ? cut : 0;
      const to = length - (ends.some((end) => at(contour.getPosTan(length), end)) ? cut : 0);
      if (length > 0 && to > from) {
        const segment = contour.getSegment(from, to, true);
        builder.addPath(segment);
        segment.delete();
        drawn = true;
      }
      contour.delete();
    }
    iterator.delete();
    const inseted = builder.detachAndDelete();
    if (drawn) return inseted;
    inseted.delete();
    return null;
  }

  /** Draws an end point where a path stops, turned to face the way the path leaves it. */
  private drawCapAt(canvas: Canvas, cap: StrokeCap, point: Vec2, angle: number, weight: number, size: number): void {
    if (cap === 'NONE') return;
    canvas.save();
    canvas.translate(point.x, point.y);
    canvas.rotate((angle * 180) / Math.PI, 0, 0);
    this.drawCap(canvas, cap, 0, 1, weight, size);
    canvas.restore();
  }

  /** Draws a line end marker at (x, 0); `dir` is the outward direction along the line (±1). */
  private drawCap(canvas: Canvas, cap: StrokeCap, x: number, dir: 1 | -1, weight: number, size: number): void {
    const back = x - dir * size * COS30;
    const spread = size * SIN30;
    switch (cap) {
      case 'NONE':
        return;
      case 'ROUND':
        canvas.drawCircle(x, 0, weight / 2, this.fillPaint);
        return;
      case 'SQUARE':
        canvas.drawRect(this.ck.LTRBRect(Math.min(x, x + (dir * weight) / 2), -weight / 2, Math.max(x, x + (dir * weight) / 2), weight / 2), this.fillPaint);
        return;
      case 'CIRCLE_FILLED':
        canvas.drawCircle(x, 0, size / 2, this.fillPaint);
        return;
      case 'LINE_ARROW':
      case 'TRIANGLE_ARROW':
      case 'TRIANGLE_FILLED':
      case 'DIAMOND_FILLED': {
        const points =
          cap === 'DIAMOND_FILLED'
            ? [x - size / 2, 0, x, -size / 2, x + size / 2, 0, x, size / 2]
            : cap === 'TRIANGLE_FILLED'
              ? [x, -spread, back, 0, x, spread]
              : [back, -spread, x, 0, back, spread];
        const path = new this.ck.PathBuilder().addPolygon(points, cap !== 'LINE_ARROW').detachAndDelete();
        canvas.drawPath(path, cap === 'LINE_ARROW' ? this.strokePaint : this.fillPaint);
        path.delete();
        return;
      }
    }
  }

  private rrect(node: { size: Size; cornerRadius: number; cornerRadii?: CornerRadii | undefined }): RRect {
    const { width: w, height: h } = node.size;
    const r = node.cornerRadii ?? {
      topLeft: node.cornerRadius,
      topRight: node.cornerRadius,
      bottomRight: node.cornerRadius,
      bottomLeft: node.cornerRadius,
    };
    const max = Math.min(w, h) / 2;
    const c = (v: number) => Math.min(Math.max(0, v), max);
    return Float32Array.of(0, 0, w, h, c(r.topLeft), c(r.topLeft), c(r.topRight), c(r.topRight), c(r.bottomRight), c(r.bottomRight), c(r.bottomLeft), c(r.bottomLeft));
  }

  /** Sets a paint's color or gradient shader for a layer of the given size, plus its blend mode. */
  private configurePaint(target: CkPaint, paint: Paint, size: Size): void {
    if (paint.type === 'SOLID') {
      target.setShader(null as never);
      target.setColor(this.color(paint.color, paint.opacity));
    } else if (paint.type === 'PATTERN') {
      // Pattern shaders are recorded before the layer draws (see preparePatterns).
      const shader = this.patternShaders.get(paint);
      target.setShader(shader ?? (null as never));
      target.setColor(shader ? this.ck.Color4f(1, 1, 1, paint.opacity) : this.ck.TRANSPARENT);
    } else if (paint.type === 'IMAGE' || paint.type === 'VIDEO') {
      // A video fill shows its poster, or in presentation view the current frame of the video playing.
      const frame = paint.type === 'VIDEO' ? (this.videoFrame?.(paint.videoHash) ?? null) : paint.imageHash ? (this.imageFrame?.(paint.imageHash) ?? null) : null;
      const shader = this.imageShader(paint.type === 'VIDEO' ? { ...paint, type: 'IMAGE' } : paint, size, frame);
      target.setShader(shader);
      shader.delete();
      target.setColor(this.ck.Color4f(1, 1, 1, paint.opacity));
    } else {
      const shader = this.gradientShader(paint, size);
      target.setShader(shader);
      shader.delete();
      // The shader supplies color; the paint's alpha applies the paint opacity.
      target.setColor(this.ck.Color4f(1, 1, 1, paint.opacity));
    }
    this.applyBlend(target, paint.blendMode);
  }

  /**
   * Image fill shader placed by `imagePlacement` (FILL/FIT/CROP draw once with transparent
   * edges, TILE repeats). Images not loaded yet are requested from the image source and drawn
   * as a checkerboard placeholder until they arrive, as are paints without an image.
   */
  private imageShader(paint: ImagePaint, size: Size, frame: CkImage | null = null): Shader {
    const ck = this.ck;
    // `frame` is a video's current frame, drawn instead of the stored image.
    const image = frame ?? (paint.imageHash ? this.decodedImage(paint.imageHash, paint.gifFrame ?? 0) : null);
    if (!image) {
      this.checker ??= this.makeChecker();
      if (!this.checker) return ck.Shader.MakeColor(ck.Color4f(0.8, 0.8, 0.8, 1), ck.ColorSpace.SRGB);
      return this.checker.makeShaderOptions(ck.TileMode.Repeat, ck.TileMode.Repeat, ck.FilterMode.Nearest, ck.MipmapMode.None);
    }
    const placement = imagePlacement(paint, { width: image.width(), height: image.height() }, size);
    if (!placement) return ck.Shader.MakeColor(ck.TRANSPARENT, ck.ColorSpace.SRGB);
    const m = placement.matrix;
    const tile = placement.tile ? ck.TileMode.Repeat : ck.TileMode.Decal;
    const local: number[] = [m.a, m.c, m.e, m.b, m.d, m.f, 0, 0, 1];
    // An export can ask for the image to be resampled for detail or for hard edges; the canvas draws it bilinear.
    const shader =
      this.resampling === 'DETAILED'
        ? image.makeShaderCubic(tile, tile, 1 / 3, 1 / 3, local)
        : image.makeShaderOptions(tile, tile, this.resampling === 'BASIC' ? ck.FilterMode.Nearest : ck.FilterMode.Linear, ck.MipmapMode.None, local);
    if (!hasAdjustments(paint.filters)) return shader;
    this.adjustEffect ??= ck.RuntimeEffect.Make(IMAGE_ADJUST_SKSL);
    if (!this.adjustEffect) return shader;
    const adjusted = this.adjustEffect.makeShaderWithChildren(adjustmentValues(paint.filters), [shader]);
    shader.delete();
    return adjusted;
  }

  /** A stored image, decoded: for an animated GIF, the frame asked for (frames past the last wrap around). */
  private decodedImage(hash: string, frame = 0): CkImage | null {
    const key = frame > 0 ? `${hash}#${frame}` : hash;
    const cached = this.imageCache.get(key);
    if (cached !== undefined) return cached;
    const asset = this.images?.get(hash);
    if (!asset) {
      this.images?.request(hash);
      return null;
    }
    const image = frame > 0 ? this.animatedFrame(asset.bytes, frame) : this.ck.MakeImageFromEncoded(asset.bytes);
    this.imageCache.set(key, image);
    return image;
  }

  /** A frame of an animated image; the image itself when it isn't animated. */
  private animatedFrame(bytes: Uint8Array, frame: number): CkImage | null {
    const animation = this.ck.MakeAnimatedImageFromEncoded(bytes);
    if (!animation) return this.ck.MakeImageFromEncoded(bytes);
    try {
      const count = Math.max(1, animation.getFrameCount());
      for (let i = 0; i < frame % count; i++) animation.decodeNextFrame();
      return animation.makeImageAtCurrentFrame();
    } finally {
      animation.delete();
    }
  }

  /** 16×16 tile of 8px white and light gray squares. */
  private makeChecker(): CkImage | null {
    const ck = this.ck;
    const pixels = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const v = x < 8 === y < 8 ? 255 : 204;
        pixels.set([v, v, v, 255], (y * 16 + x) * 4);
      }
    }
    return ck.MakeImage({ width: 16, height: 16, alphaType: ck.AlphaType.Unpremul, colorType: ck.ColorType.RGBA_8888, colorSpace: ck.ColorSpace.SRGB }, pixels, 16 * 4);
  }

  /**
   * Gradient shader in unit gradient space (see GradientPaint), mapped onto the layer by
   * scale(width, height) · gradientTransform. Diamond gradients sample a linear ramp by
   * |x − ½| + |y − ½| distance in an SkSL shader.
   */
  private gradientShader(paint: GradientPaint, size: Size): Shader {
    const ck = this.ck;
    const stops = [...paint.gradientStops].sort((a, b) => a.position - b.position);
    const colors = stops.map((s) => this.color(s.color));
    const positions = stops.map((s) => s.position);
    const [a, b, c, d, e, f] = paint.gradientTransform;
    // Lines have no height; give their gradient the stroke's thickness so it stays defined.
    const w = Math.max(size.width, 1e-6);
    const h = Math.max(size.height, 1e-6);
    const local = [w * a, w * c, w * e, h * b, h * d, h * f, 0, 0, 1];
    switch (paint.type) {
      case 'GRADIENT_LINEAR':
        return ck.Shader.MakeLinearGradient([0, 0.5], [1, 0.5], colors, positions, ck.TileMode.Clamp, local);
      case 'GRADIENT_RADIAL':
        return ck.Shader.MakeRadialGradient([0.5, 0.5], 0.5, colors, positions, ck.TileMode.Clamp, local);
      case 'GRADIENT_ANGULAR':
        return ck.Shader.MakeSweepGradient(0.5, 0.5, colors, positions, ck.TileMode.Clamp, local);
      case 'GRADIENT_DIAMOND': {
        const ramp = ck.Shader.MakeLinearGradient([0, 0.5], [1, 0.5], colors, positions, ck.TileMode.Clamp);
        this.diamondEffect ??= ck.RuntimeEffect.Make(DIAMOND_SKSL);
        const shader = this.diamondEffect ? this.diamondEffect.makeShaderWithChildren([], [ramp], local) : ck.Shader.MakeRadialGradient([0.5, 0.5], 0.5, colors, positions, ck.TileMode.Clamp, local);
        ramp.delete();
        return shader;
      }
    }
  }

  private applyBlend(target: CkPaint, mode: Paint['blendMode']): void {
    const resolved = this.blend.resolve(mode);
    if ('mode' in resolved) {
      target.setBlender(null as never);
      target.setBlendMode(resolved.mode);
    } else {
      target.setBlender(resolved.blender);
    }
  }

  /** A document color as an (extended) sRGB Color4f; P3 files convert, and a P3 surface keeps the wide gamut. */
  private color(c: Color, opacity = 1): Float32Array {
    const s = documentToSrgb(c, this.profile);
    return this.ck.Color4f(s.r, s.g, s.b, c.a * opacity);
  }
}
