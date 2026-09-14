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
import type { PresentedScene } from '@/core/prototype/presentation';
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
  private size = { width: 0, height: 0, dpr: 1 };
  private disposed = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly editor: Editor,
    private readonly canvas: HTMLCanvasElement,
    /** Called when what is drawn changed (images or fonts arrived). */
    private readonly onInvalidate: () => void,
  ) {}

  async load(): Promise<void> {
    const [ck, fonts] = await Promise.all([loadCanvasKit(), loadBundledFonts()]);
    if (this.disposed) return;
    this.ck = ck;
    this.renderer = new SceneRenderer(ck, this.editor.images);
    this.shaper = new TextShaper(ck, fonts);
    this.shaper.registerFonts(this.editor.fonts.list());
    this.renderer.setTextShaper(this.shaper);
    this.editor.setTextLayout(this.shaper);
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

  /** A frame rendered at a scale (cached until images or fonts change). */
  private frameImage(frameId: Id, scale: number): CkImage | null {
    const { ck, renderer, editor } = this;
    if (!ck || !renderer) return null;
    const key = `${frameId}:${scale.toFixed(4)}:${this.size.dpr}`;
    if (this.frames.has(key)) return this.frames.get(key)!;
    const node = editor.doc.get(frameId) as SceneNode | undefined;
    const origin = editor.scene.worldBounds(frameId);
    let image: CkImage | null = null;
    if (node && origin) {
      const width = node.size.width * scale;
      const height = node.size.height * scale;
      const surface = ck.MakeSurface(Math.max(1, Math.ceil(width * this.size.dpr)), Math.max(1, Math.ceil(height * this.size.dpr)));
      if (surface) {
        try {
          renderer.render(surface.getCanvas(), editor.doc, editor.scene, editor.pageId, { x: origin.x, y: origin.y, zoom: scale, width, height, dpr: this.size.dpr }, { only: frameId, colorProfile: documentColorProfile(editor.doc) });
          surface.flush();
          image = surface.makeImageSnapshot();
        } finally {
          surface.delete();
        }
      }
    }
    this.frames.set(key, image);
    return image;
  }

  draw(scene: PresentedScene | null, background: Color, hints: readonly Rect[]): void {
    const { ck, surface, paint } = this;
    if (!ck || !surface || !paint) return;
    const canvas = surface.getCanvas();
    canvas.clear(ck.Color4f(background.r, background.g, background.b, 1));
    canvas.save();
    canvas.scale(this.size.dpr, this.size.dpr);
    paint.setStyle(ck.PaintStyle.Fill);
    for (const item of scene?.items ?? []) {
      if (item.kind === 'dim') {
        paint.setColor(ck.Color4f(item.color.r, item.color.g, item.color.b, item.color.a));
        canvas.drawRect(ck.XYWHRect(item.x, item.y, item.width, item.height), paint);
        continue;
      }
      if (item.alpha <= 0) continue;
      const image = this.frameImage(item.frameId, item.scale);
      if (!image) continue;
      paint.setColor(ck.Color4f(0, 0, 0, Math.min(1, item.alpha)));
      canvas.drawImageRect(image, ck.XYWHRect(0, 0, image.width(), image.height()), ck.XYWHRect(item.x, item.y, item.width, item.height), paint);
    }
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
    this.surface?.delete();
    this.surface = null;
    this.paint?.delete();
    this.renderer?.dispose();
  }
}
