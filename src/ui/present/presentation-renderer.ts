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

import type { AnimatedImage, CanvasKit, Image as CkImage, Paint, Surface } from 'canvaskit-wasm';
import { documentColorProfile } from '@/core/color/color-profile';
import type { Id } from '@/core/ids/ids';
import type { Rect } from '@/core/math/rect';
import type { DocumentStore } from '@/core/document/store';
import type { PresentedScene } from '@/core/prototype/presentation';
import { matchedLayersStore, smartAnimateStore, withoutMatchingLayersStore } from '@/core/prototype/smart-animate';
import type { RuntimeDocument } from '@/editor/prototype-runtime';
import { topLevelFrame } from '@/core/prototype/reactions';
import { scrolledFrameStore } from '@/core/prototype/scroll';
import { imageHashesIn, videoFillsIn, videoFillsOf, videoOptionsOf, type VideoOptions } from '@/core/prototype/video';
import type { Vec2 } from '@/core/math/vec';
import { SceneIndex } from '@/core/scene/scene-index';
import type { Color, MediaAction, SceneNode } from '@/core/schema/document';
import { cjkScriptFor, containsCjk } from '@/core/text/cjk';
import { containsEmoji } from '@/core/text/emoji';
import type { Editor } from '@/editor/editor';
import { loadCanvasKit } from '@/engine/ck/canvaskit';
import { SceneRenderer } from '@/engine/render/scene-renderer';
import { loadBundledFonts, loadEmojiFont } from '@/engine/text/bundled-fonts';
import { loadCjkSubsets } from '@/engine/text/cjk-fonts';
import { TextShaper } from '@/engine/text/text-shaper';

const HINT_COLOR = { r: 13 / 255, g: 153 / 255, b: 1 };

/** An animated GIF playing: the frame shown moves on once its delay passes, until the GIF's loops are done. */
interface GifPlayer {
  readonly animation: AnimatedImage;
  nextAt: number;
  finished: boolean;
}

/** A GIF frame's delay: like browsers, delays under 20 ms play at 100 ms. */
const gifDelay = (ms: number): number => (ms < 20 ? 100 : ms);

/** A video fill shown, and whether its video is playing. */
export interface VideoState {
  readonly nodeId: Id;
  readonly playing: boolean;
}

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
  /** The elements playing video fills, by video hash. */
  private readonly videos = new Map<string, { readonly element: HTMLVideoElement; readonly url: string }>();
  /** The videos of the frames shown at the last sync. */
  private shownVideos = new Set<string>();
  /** State sharing waiting for a video's element: the time and play state it takes, by video hash. */
  private readonly pendingShares = new Map<string, { readonly time: number; readonly playing: boolean; readonly muted: boolean }>();
  /** Whether each frame holds video fills. */
  private readonly videoFrames = new Map<Id, boolean>();
  /** Video frames made for the frame being rendered, deleted once it is. */
  private readonly videoImages: CkImage[] = [];
  /** Called as a video plays (with its time) and when it ends: video triggers listen. */
  onVideoTime: ((videoHash: string, time: number, ended: boolean) => void) | null = null;
  /** Animated GIF players by image hash (null for images that aren't animated GIFs). */
  private readonly gifs = new Map<string, GifPlayer | null>();
  /** The animated GIFs in each frame. */
  private readonly gifFrames = new Map<Id, string[]>();

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
    this.videoFrames.clear();
    this.gifFrames.clear();
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
      renderer.render(
        surface.getCanvas(),
        store,
        index,
        editor.pageId,
        { x: origin.x, y: origin.y, zoom: scale, width, height, dpr: this.size.dpr },
        { only: frameId, colorProfile: documentColorProfile(editor.doc), videoFrame: (hash) => this.videoImage(hash), imageFrame: (hash) => this.gifImage(hash) },
      );
      surface.flush();
      return surface.makeImageSnapshot();
    } finally {
      surface.delete();
      for (const image of this.videoImages.splice(0)) image.delete();
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

  /** Whether a frame holds video fills (drawn fresh each time, with the videos' current frames). */
  private hasVideo(frameId: Id): boolean {
    let has = this.videoFrames.get(frameId);
    if (has === undefined) this.videoFrames.set(frameId, (has = videoFillsIn(this.doc, frameId).length > 0));
    return has;
  }

  /** A frame rendered now, with its scrolled content (not cached). */
  private freshFrameImage(frameId: Id, scale: number, scroll: ReadonlyMap<Id, Vec2>): CkImage | null {
    const scrolled = [...scroll].some(([id, offset]) => (offset.x !== 0 || offset.y !== 0) && topLevelFrame(this.doc, id) === frameId);
    return scrolled ? this.storeFrameImage(scrolledFrameStore(this.doc, frameId, scroll), frameId, scale) : this.renderFrame(this.doc, this.index, frameId, scale);
  }

  /** A video's current frame as an image, for the frame being rendered (null until the video has one). */
  private videoImage(hash: string): CkImage | null {
    const video = this.videos.get(hash);
    if (!this.ck || !video || video.element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
    const image = this.ck.MakeImageFromCanvasImageSource(video.element);
    this.videoImages.push(image);
    return image;
  }

  /**
   * Plays the video fills of the frames shown: a video starts when its frame shows if it autoplays (without sound when
   * the browser doesn't allow sound yet), loops when set to, and pauses where it is when its frame is no longer shown.
   * Returns the video fills shown and whether each is playing.
   */
  syncVideos(frameIds: readonly Id[]): VideoState[] {
    const shown = new Map<string, { readonly nodeId: Id; readonly options: VideoOptions }>();
    for (const frameId of frameIds) {
      for (const fill of videoFillsIn(this.doc, frameId)) if (!shown.has(fill.paint.videoHash)) shown.set(fill.paint.videoHash, { nodeId: fill.nodeId, options: videoOptionsOf(fill.paint) });
    }
    for (const [hash, video] of this.videos) if (!shown.has(hash) && this.shownVideos.has(hash)) video.element.pause();
    const states: VideoState[] = [];
    for (const [hash, { nodeId, options }] of shown) {
      const video = this.videoFor(hash);
      if (video) {
        video.element.loop = options.loop;
        if (!this.shownVideos.has(hash) && options.autoplay) this.play(video.element, options.muted);
      }
      states.push({ nodeId, playing: video !== null && !video.element.paused && !video.element.ended });
    }
    // A video whose bytes weren't loaded yet counts as shown once its element exists, so it starts then.
    this.shownVideos = new Set([...shown.keys()].filter((hash) => this.videos.has(hash)));
    return states;
  }

  /** The element playing a video, made once its bytes are loaded (requested when they aren't yet). */
  private videoFor(hash: string): { readonly element: HTMLVideoElement; readonly url: string } | null {
    const existing = this.videos.get(hash);
    if (existing) return existing;
    const asset = this.editor.images.get(hash);
    if (!asset) {
      this.editor.images.request(hash);
      return null;
    }
    const element = document.createElement('video');
    element.playsInline = true;
    element.preload = 'auto';
    // Kept in the page, out of sight: some browsers don't decode videos that aren't.
    element.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    const url = URL.createObjectURL(new Blob([asset.bytes as Uint8Array<ArrayBuffer>], { type: asset.mime }));
    for (const type of ['loadeddata', 'play', 'pause', 'ended', 'seeked']) element.addEventListener(type, () => this.onInvalidate());
    element.addEventListener('timeupdate', () => this.onVideoTime?.(hash, element.currentTime, false));
    element.addEventListener('ended', () => this.onVideoTime?.(hash, element.currentTime, true));
    element.src = url;
    document.body.append(element);
    const video = { element, url };
    this.videos.set(hash, video);
    this.applyShare(hash);
    return video;
  }

  /** The animated GIFs of a frame's image fills (once their images are loaded). */
  private animatedGifsIn(frameId: Id): string[] {
    let hashes = this.gifFrames.get(frameId);
    if (!hashes) this.gifFrames.set(frameId, (hashes = imageHashesIn(this.doc, frameId).filter((hash) => this.gifFor(hash) !== null)));
    return hashes;
  }

  /** The player of an animated GIF (a GIF with more than one frame), made once its bytes are loaded. */
  private gifFor(hash: string): GifPlayer | null {
    if (this.gifs.has(hash)) return this.gifs.get(hash) ?? null;
    const asset = this.editor.images.get(hash);
    // Not remembered until loaded: images arriving invalidate the frames, which look again.
    if (!this.ck || !asset) return null;
    let player: GifPlayer | null = null;
    if (asset.mime === 'image/gif') {
      const animation = this.ck.MakeAnimatedImageFromEncoded(asset.bytes);
      if (animation && animation.getFrameCount() > 1) player = { animation, nextAt: performance.now() + gifDelay(animation.currentFrameDuration()), finished: false };
      else animation?.delete();
    }
    this.gifs.set(hash, player);
    return player;
  }

  /** An animated GIF's current frame, moved on as its frame delays pass (null for other images). */
  private gifImage(hash: string): CkImage | null {
    const player = this.gifs.get(hash);
    if (!player) return null;
    const now = performance.now();
    // After a long pause (a hidden tab), the GIF goes on from where it was rather than catching up.
    if (now - player.nextAt > 1000) player.nextAt = now;
    while (!player.finished && now >= player.nextAt) {
      const delay = player.animation.decodeNextFrame();
      if (delay < 0) player.finished = true;
      else player.nextAt += gifDelay(delay);
    }
    const image = player.animation.makeImageAtCurrentFrame();
    if (image) this.videoImages.push(image);
    return image;
  }

  /** How many animated GIFs of the frames shown are still playing (the view keeps drawing while one is). */
  animatingGifs(frameIds: readonly Id[]): number {
    const hashes = new Set(frameIds.flatMap((frameId) => this.animatedGifsIn(frameId)));
    return [...hashes].filter((hash) => this.gifs.get(hash)?.finished === false).length;
  }

  /** Runs a video action on the video of a layer's video fill: play, pause, sound, or its time. */
  controlVideo(nodeId: Id, action: MediaAction, amount: number): void {
    const fill = videoFillsOf(this.doc.get(nodeId) as SceneNode | undefined)[0];
    const video = fill ? this.videoFor(fill.paint.videoHash) : null;
    if (!video) return;
    const { element } = video;
    const end = Number.isFinite(element.duration) ? element.duration : Number.MAX_SAFE_INTEGER;
    switch (action) {
      case 'PLAY':
        this.play(element, element.muted);
        break;
      case 'PAUSE':
        element.pause();
        break;
      case 'TOGGLE_PLAY_PAUSE':
        if (element.paused || element.ended) this.play(element, element.muted);
        else element.pause();
        break;
      case 'MUTE':
        element.muted = true;
        break;
      case 'UNMUTE':
        element.muted = false;
        break;
      case 'TOGGLE_MUTE_UNMUTE':
        element.muted = !element.muted;
        break;
      case 'SKIP_FORWARD':
        element.currentTime = Math.min(end, element.currentTime + amount);
        break;
      case 'SKIP_BACKWARD':
        element.currentTime = Math.max(0, element.currentTime - amount);
        break;
      case 'SKIP_TO':
        element.currentTime = Math.min(end, amount);
        break;
    }
    this.onInvalidate();
  }

  /** Reset video state: a frame's videos go back to the beginning, and play again only if they autoplay. */
  resetVideos(frameId: Id): void {
    for (const fill of videoFillsIn(this.doc, frameId)) {
      const video = this.videos.get(fill.paint.videoHash);
      if (!video) continue;
      video.element.pause();
      video.element.currentTime = 0;
      // The next sync starts it again when it autoplays.
      this.shownVideos.delete(fill.paint.videoHash);
    }
  }

  /**
   * State sharing: a video takes the time and play state of another, and keeps them rather than autoplaying — as soon as
   * its element exists (its bytes may still be loading).
   */
  shareVideo(fromHash: string, toHash: string): void {
    const source = this.videos.get(fromHash);
    if (!source) return;
    const { element } = source;
    this.pendingShares.set(toHash, { time: element.currentTime, playing: !element.paused && !element.ended, muted: element.muted });
    if (this.videos.has(toHash)) this.applyShare(toHash);
    else this.videoFor(toHash);
  }

  /** Gives a video the state shared with it, if any. */
  private applyShare(hash: string): void {
    const shared = this.pendingShares.get(hash);
    const video = this.videos.get(hash);
    if (!shared || !video) return;
    this.pendingShares.delete(hash);
    const end = Number.isFinite(video.element.duration) ? video.element.duration : Number.MAX_SAFE_INTEGER;
    video.element.currentTime = Math.min(end, shared.time);
    if (shared.playing) this.play(video.element, shared.muted);
    else video.element.pause();
    // Counted as shown already, so autoplay leaves it as it is.
    this.shownVideos.add(hash);
    this.onInvalidate();
  }

  private play(element: HTMLVideoElement, muted: boolean): void {
    element.muted = muted;
    element.play().catch(() => {
      // Browsers allow sound only after the user interacts with the page: play without it.
      if (element.muted) return;
      element.muted = true;
      element.play().catch(() => undefined);
    });
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
        // The device: a body in its model's color with a thin edge, and its screen.
        const body = ck.RRectXY(ck.XYWHRect(item.body.x, item.body.y, item.body.width, item.body.height), item.bodyRadius, item.bodyRadius);
        paint.setColor(ck.Color4f(item.bodyColor.r, item.bodyColor.g, item.bodyColor.b, item.bodyColor.a));
        canvas.drawRRect(body, paint);
        paint.setStyle(ck.PaintStyle.Stroke);
        paint.setStrokeWidth(1.5);
        paint.setColor(ck.Color4f(item.edgeColor.r, item.edgeColor.g, item.edgeColor.b, item.edgeColor.a));
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
      // Smart animate, Animate matching layers and frames with videos are drawn fresh rather than cached.
      const live = item.smart
        ? this.smartFrameImage(item.smart.from, item.frameId, item.smart.progress, item.scale)
        : item.matched
          ? this.storeFrameImage(matchedLayersStore(this.doc, item.matched.from, item.frameId, item.matched.progress), item.frameId, item.scale)
          : item.without
            ? this.storeFrameImage(withoutMatchingLayersStore(this.doc, item.frameId, item.without), item.frameId, item.scale)
            : this.hasVideo(item.frameId) || this.animatedGifsIn(item.frameId).length > 0
              ? this.freshFrameImage(item.frameId, item.scale, scroll)
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
    for (const { element, url } of this.videos.values()) {
      element.pause();
      element.removeAttribute('src');
      element.load();
      element.remove();
      URL.revokeObjectURL(url);
    }
    this.videos.clear();
    for (const player of this.gifs.values()) player?.animation.delete();
    this.gifs.clear();
  }
}
