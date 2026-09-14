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

import type { CanvasKit, Image as CkImage, Paint, Surface } from 'canvaskit-wasm';
import { documentColorProfile } from '@/core/color/color-profile';
import type { Id } from '@/core/ids/ids';
import type { Rect } from '@/core/math/rect';
import type { DocumentStore } from '@/core/document/store';
import type { PresentedScene } from '@/core/prototype/presentation';
import { matchedLayersStore, smartAnimateStore, withoutMatchingLayersStore } from '@/core/prototype/smart-animate';
import type { RuntimeDocument } from '@/editor/prototype-runtime';
import { topLevelFrame } from '@/core/prototype/reactions';
import { scrolledFrameStore } from '@/core/prototype/scroll';
import type { Vec2 } from '@/core/math/vec';
import { SceneIndex } from '@/core/scene/scene-index';
import type { Color, SceneNode } from '@/core/schema/document';
import { cjkScriptFor, containsCjk } from '@/core/text/cjk';
import { containsEmoji } from '@/core/text/emoji';
import type { Editor } from '@/editor/editor';
import { loadCanvasKit } from '@/engine/ck/canvaskit';
import { SceneRenderer } from '@/engine/render/scene-renderer';
import { loadBundledFonts, loadEmojiFont } from '@/engine/text/bundled-fonts';
import { loadCjkSubsets } from '@/engine/text/cjk-fonts';
import { TextShaper } from '@/engine/text/text-shaper';

const HINT_COLOR = { r: 13 / 255, g: 153 / 255, b: 1 };

/**
 * Draws presentation view with CanvasKit: each frame is rendered once at its scale into an image, and the scene
 * composites those images (moved and faded by transitions), overlay backgrounds and hotspot hints.
 */
export class PresentationRenderer {
  private ck: CanvasKit | null = null;
  private renderer: SceneRenderer | null = null;
  private shaper: TextShaper | null = null;
  private surface: Surface | null = null;
  private paint: Paint | null = null;
  private readonly frames = new Map<string, CkImage | null>();
  /** The last image of each frame with scrolled content, and the scroll it shows. */
  private readonly scrolled = new Map<Id, { readonly key: string; readonly image: CkImage | null }>();
  /** The document interactive components switched variants in, drawn instead of the editor's; null for the editor's. */
  private runtime: RuntimeDocument | null = null;

  private get doc(): DocumentStore {
    return this.runtime?.doc ?? this.editor.doc;
  }

  private get index(): SceneIndex {
    return this.runtime?.index ?? this.editor.scene;
  }

  /** Draws another document from now on (null for the editor's own). */
  setDocument(runtime: RuntimeDocument | null): void {
    this.runtime = runtime;
    this.invalidate();
  }
  private size = { width: 0, height: 0, dpr: 1 };
  private disposed = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly editor: Editor,
    private readonly canvas: HTMLCanvasElement,
    /** Called when what is drawn changed (images or fonts arrived). */
    private readonly onInvalidate: () => void,
    /** Whether this renderer sets the editor's text layout (presentation view's own editor), or leaves the editor's (inline preview). */
    private readonly ownsTextLayout = true,
  ) {}

  /** Drops the cached frame images, after the document changed (inline preview follows edits). */
  refresh(): void {
    this.invalidate();
  }

  async load(): Promise<void> {
    const [ck, fonts] = await Promise.all([loadCanvasKit(), loadBundledFonts()]);
    if (this.disposed) return;
    this.ck = ck;
    this.renderer = new SceneRenderer(ck, this.editor.images);
    this.shaper = new TextShaper(ck, fonts);
    this.shaper.registerFonts(this.editor.fonts.list());
    this.renderer.setTextShaper(this.shaper);
    if (this.ownsTextLayout) this.editor.setTextLayout(this.shaper);
    this.paint = new ck.Paint();
    this.paint.setAntiAlias(true);
    this.cleanups.push(this.editor.images.subscribe(() => this.invalidate()));
    this.loadTextFonts();
    this.createSurface();
  }

  /** The color emoji font and CJK subsets load when the file's text needs them. */
  private loadTextFonts(): void {
    const requestedCjk = new Set<string>();
    let emoji = false;
    for (const node of this.editor.doc.nodes()) {
      if (node.type !== 'TEXT') continue;
      if (!emoji && containsEmoji(node.characters)) {
        emoji = true;
        loadEmojiFont()
          .then((font) => {
            if (this.disposed || !this.shaper) return;
            this.shaper.registerFallbackFonts([font]);
            this.invalidate();
          })
          .catch((error: unknown) => console.warn(error));
      }
      if (containsCjk(node.characters)) {
        loadCjkSubsets(cjkScriptFor(node.characters, node.fontName.family), node.characters, requestedCjk)
          .then((subsets) => {
            if (this.disposed || !this.shaper || subsets.length === 0) return;
            this.shaper.registerCjkSubsets(subsets);
            this.invalidate();
          })
          .catch((error: unknown) => console.warn(error));
      }
    }
  }

  private invalidate(): void {
    for (const image of this.frames.values()) image?.delete();
    this.frames.clear();
    for (const entry of this.scrolled.values()) entry.image?.delete();
    this.scrolled.clear();
    this.onInvalidate();
  }

  resize(width: number, height: number, dpr: number): void {
    this.size = { width, height, dpr };
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.createSurface();
  }

  private createSurface(): void {
    if (!this.ck) return;
    this.surface?.delete();
    const colorSpace = documentColorProfile(this.editor.doc) === 'DISPLAY_P3' ? this.ck.ColorSpace.DISPLAY_P3 : this.ck.ColorSpace.SRGB;
    this.surface = this.ck.MakeWebGLCanvasSurface(this.canvas, colorSpace) ?? this.ck.MakeSWCanvasSurface(this.canvas);
  }

  /** A frame of a document rendered at a scale into an image. */
  private renderFrame(store: DocumentStore, index: SceneIndex, frameId: Id, scale: number): CkImage | null {
    const { ck, renderer, editor } = this;
    if (!ck || !renderer) return null;
    // The index is built lazily: build it before reading the frame's bounds.
    index.ensure(editor.pageId);
    const node = store.get(frameId) as SceneNode | undefined;
    const origin = index.worldBounds(frameId);
    if (!node || !origin) return null;
    const width = node.size.width * scale;
    const height = node.size.height * scale;
    const surface = ck.MakeSurface(Math.max(1, Math.ceil(width * this.size.dpr)), Math.max(1, Math.ceil(height * this.size.dpr)));
    if (!surface) return null;
    try {
      renderer.render(surface.getCanvas(), store, index, editor.pageId, { x: origin.x, y: origin.y, zoom: scale, width, height, dpr: this.size.dpr }, { only: frameId, colorProfile: documentColorProfile(editor.doc) });
      surface.flush();
      return surface.makeImageSnapshot();
    } finally {
      surface.delete();
    }
  }

  /** A frame rendered at a scale (cached until images or fonts change). */
  private frameImage(frameId: Id, scale: number): CkImage | null {
    if (!this.ck || !this.renderer) return null;
    const key = `${frameId}:${scale.toFixed(4)}:${this.size.dpr}`;
    if (this.frames.has(key)) return this.frames.get(key)!;
    const image = this.renderFrame(this.doc, this.index, frameId, scale);
    this.frames.set(key, image);
    return image;
  }

  /** A frame with its scrolling frames scrolled; null when none of them is scrolled (the cached image applies). */
  private scrolledFrameImage(frameId: Id, scale: number, scroll: ReadonlyMap<Id, Vec2>): CkImage | null {
    const own = [...scroll].filter(([id, offset]) => (offset.x !== 0 || offset.y !== 0) && topLevelFrame(this.doc, id) === frameId);
    if (own.length === 0 || !this.ck || !this.renderer) return null;
    const key = `${scale.toFixed(4)}:${this.size.dpr}:${own.map(([id, offset]) => `${id}=${offset.x},${offset.y}`).join(';')}`;
    const cached = this.scrolled.get(frameId);
    if (cached?.key === key) return cached.image;
    cached?.image?.delete();
    const store = scrolledFrameStore(this.doc, frameId, scroll);
    const index = new SceneIndex(store);
    index.ensure(this.editor.pageId);
    const image = this.renderFrame(store, index, frameId, scale);
    this.scrolled.set(frameId, { key, image });
    return image;
  }

  /** The destination of a smart animate transition, `progress` of the way from the frame left (not cached). */
  private smartFrameImage(fromFrame: Id, toFrame: Id, progress: number, scale: number): CkImage | null {
    return this.storeFrameImage(smartAnimateStore(this.doc, fromFrame, toFrame, progress), toFrame, scale);
  }

  /** A frame of a scratch document holding it (not cached). */
  private storeFrameImage(store: DocumentStore, frameId: Id, scale: number): CkImage | null {
    if (!this.ck || !this.renderer) return null;
    const index = new SceneIndex(store);
    index.ensure(this.editor.pageId);
    return this.renderFrame(store, index, frameId, scale);
  }

  draw(scene: PresentedScene | null, background: Color, hints: readonly Rect[], scroll: ReadonlyMap<Id, Vec2> = new Map()): void {
    const { ck, surface, paint } = this;
    if (!ck || !surface || !paint) return;
    const canvas = surface.getCanvas();
    canvas.clear(ck.Color4f(background.r, background.g, background.b, 1));
    canvas.save();
    canvas.scale(this.size.dpr, this.size.dpr);
    paint.setStyle(ck.PaintStyle.Fill);
    let clipped = false;
    for (const item of scene?.items ?? []) {
      if (item.kind === 'device') {
        // The device: a dark body with a thin edge, and its screen.
        const body = ck.RRectXY(ck.XYWHRect(item.body.x, item.body.y, item.body.width, item.body.height), item.bodyRadius, item.bodyRadius);
        paint.setColor(ck.Color4f(0.08, 0.08, 0.09, 1));
        canvas.drawRRect(body, paint);
        paint.setStyle(ck.PaintStyle.Stroke);
        paint.setStrokeWidth(1.5);
        paint.setColor(ck.Color4f(0.36, 0.36, 0.4, 1));
        canvas.drawRRect(body, paint);
        paint.setStyle(ck.PaintStyle.Fill);
        paint.setColor(ck.Color4f(0, 0, 0, 1));
        canvas.drawRRect(ck.RRectXY(ck.XYWHRect(item.screen.x, item.screen.y, item.screen.width, item.screen.height), item.screenRadius, item.screenRadius), paint);
        continue;
      }
      if (!clipped && scene?.clip) {
        const { rect, radius } = scene.clip;
        canvas.save();
        canvas.clipRRect(ck.RRectXY(ck.XYWHRect(rect.x, rect.y, rect.width, rect.height), radius, radius), ck.ClipOp.Intersect, true);
        clipped = true;
      }
      if (item.kind === 'dim') {
        paint.setColor(ck.Color4f(item.color.r, item.color.g, item.color.b, item.color.a));
        canvas.drawRect(ck.XYWHRect(item.x, item.y, item.width, item.height), paint);
        continue;
      }
      if (item.alpha <= 0) continue;
      // Smart animate and Animate matching layers frames are drawn fresh rather than cached.
      const live = item.smart
        ? this.smartFrameImage(item.smart.from, item.frameId, item.smart.progress, item.scale)
        : item.matched
          ? this.storeFrameImage(matchedLayersStore(this.doc, item.matched.from, item.frameId, item.matched.progress), item.frameId, item.scale)
          : item.without
            ? this.storeFrameImage(withoutMatchingLayersStore(this.doc, item.frameId, item.without), item.frameId, item.scale)
            : null;
      const image = live ?? this.scrolledFrameImage(item.frameId, item.scale, scroll) ?? this.frameImage(item.frameId, item.scale);
      if (!image) continue;
      paint.setColor(ck.Color4f(0, 0, 0, Math.min(1, item.alpha)));
      canvas.drawImageRect(image, ck.XYWHRect(0, 0, image.width(), image.height()), ck.XYWHRect(item.x, item.y, item.width, item.height), paint);
      live?.delete();
    }
    if (clipped) canvas.restore();
    for (const rect of hints) {
      paint.setStyle(ck.PaintStyle.Fill);
      paint.setColor(ck.Color4f(HINT_COLOR.r, HINT_COLOR.g, HINT_COLOR.b, 0.15));
      canvas.drawRect(ck.XYWHRect(rect.x, rect.y, rect.width, rect.height), paint);
      paint.setStyle(ck.PaintStyle.Stroke);
      paint.setStrokeWidth(2);
      paint.setColor(ck.Color4f(HINT_COLOR.r, HINT_COLOR.g, HINT_COLOR.b, 1));
      canvas.drawRect(ck.XYWHRect(rect.x, rect.y, rect.width, rect.height), paint);
    }
    canvas.restore();
    surface.flush();
  }

  dispose(): void {
    this.disposed = true;
    for (const cleanup of this.cleanups) cleanup();
    for (const image of this.frames.values()) image?.delete();
    this.frames.clear();
    for (const entry of this.scrolled.values()) entry.image?.delete();
    this.scrolled.clear();
    this.surface?.delete();
    this.surface = null;
    this.paint?.delete();
    this.renderer?.dispose();
  }
}
