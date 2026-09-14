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

import { groupFinalizer } from '@/core/document/groups';
import { constraintsFinalizer } from '@/core/document/constraints';
import { createAutoLayoutFinalizer } from '@/core/layout/auto-layout';
import { vectorFinalizer } from '@/core/vector/vector-finalizer';
import { assertDocumentInvariants } from '@/core/document/invariants';
import type { DocumentStore } from '@/core/document/store';
import { History, type ChangeSet } from '@/core/history/history';
import type { Id, IdGenerator } from '@/core/ids/ids';
import { unionAll, type Rect } from '@/core/math/rect';
import { SceneIndex } from '@/core/scene/scene-index';
import type { TextLayoutService } from '@/core/text/text-layout';
import type { SpellChecker } from '@/core/text/spelling';
import { createTextFinalizer, fitTextBox } from '@/core/text/text-resize';
import type { Color, Transform } from '@/core/schema/document';
import type { Vec2 } from '@/core/math/vec';
import { CommandRegistry } from './commands/registry';
import { ImageRegistry } from './images/image-registry';
import { FontRegistry } from './fonts/font-registry';
import { EditorStore } from './stores/editor-store';
import { fitRect, visibleWorldRect, type Viewport } from './viewport/viewport';

export interface EditorMeta {
  readonly pageId: Id;
  readonly selection: readonly Id[];
}

/**
 * Remembers the last duplication so a following ⌘D can repeat the offset between each copy
 * and its source (the reference editor's "repeat last offset" behavior).
 */
export interface DuplicateMemory {
  readonly clones: readonly Id[];
  /** Transform of each clone's source at the time it was duplicated. */
  readonly sourceTransforms: ReadonlyMap<Id, Transform>;
}

export interface CanvasInsets {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface EditorOptions {
  doc: DocumentStore;
  ids: IdGenerator;
  pageId?: Id;
  /** Run structural invariants after each commit (dev/test builds). */
  validate?: boolean;
}

/**
 * The editor facade: owns document, history, editor state and derived scene data,
 * and is the object that tools, commands and UI talk to. It has no React or DOM
 * dependencies so it can be tested headlessly.
 */
export class Editor {
  readonly doc: DocumentStore;
  readonly ids: IdGenerator;
  readonly history: History<EditorMeta>;
  readonly state: EditorStore;
  readonly scene: SceneIndex;
  readonly commands = new CommandRegistry(this);
  /** Image assets referenced by image paints (bytes live outside the document). */
  readonly images = new ImageRegistry();
  /** Fonts the user uploaded or loaded from this device (bundled fonts are built into the engine). */
  readonly fonts = new FontRegistry();
  /** Reads the rendered scene color at a canvas point (CSS pixels); set by the canvas host. */
  sampleCanvasPixel: ((screen: Vec2) => Color | null) | null = null;
  /** Lets the UI pick a color by clicking the canvas; set by the tool manager. Resolves null when canceled. */
  pickColorFromCanvas: (() => Promise<Color | null>) | null = null;
  /** Lets the UI pick a layer by clicking the canvas (without selecting it); set by the tool manager. */
  pickLayerFromCanvas: (() => Promise<Id | null>) | null = null;
  /** Text shaping and layout; installed by the canvas host once the engine and fonts load. */
  textLayout: TextLayoutService | null = null;

  /** Installs (or removes) the text layout service used to fit text boxes, place carets and hit-test text. */
  setTextLayout(layout: TextLayoutService | null): void {
    this.textLayout = layout;
    this.state.setTextLayoutReady(layout !== null);
  }

  /** Spell checker for text being edited (misspelled words are underlined), or null when spelling isn't checked. */
  spelling: SpellChecker | null = null;

  setSpellChecker(checker: SpellChecker | null): void {
    this.spelling = checker;
    this.requestRender();
  }

  /**
   * Refits auto-sized text layers after fonts became available (bundled fallbacks or user fonts
   * loaded later), without an undo step: the user didn't change anything.
   */
  refitText(): void {
    const layout = this.textLayout;
    if (!layout || this.history.inTransaction) return;
    this.history.run(
      'Fit text to fonts',
      (tx) => {
        for (const node of this.doc.nodes()) if (node.type === 'TEXT') fitTextBox(tx, node, layout);
      },
      { undoable: false },
    );
  }

  /** Installs (or removes, with null) the canvas pixel reader used by the eyedropper. */
  setCanvasSampler(sampler: ((screen: Vec2) => Color | null) | null): void {
    this.sampleCanvasPixel = sampler;
  }
  /** Canvas size in CSS pixels; updated by the canvas host. */
  canvasSize = { width: 1200, height: 800 };
  /**
   * Canvas edges covered by floating UI panels, in CSS pixels; updated by the shell.
   * Rulers sit just inside the uncovered area.
   */
  canvasInsets: CanvasInsets = { left: 0, right: 0, top: 0, bottom: 0 };
  duplicateMemory: DuplicateMemory | null = null;
  /** Nudge distances in canvas pixels: arrow keys move by `small`, Shift + arrow keys by `big`. */
  nudgeAmounts: { readonly small: number; readonly big: number } = { small: 1, big: 10 };
  private readonly renderListeners = new Set<() => void>();

  constructor(options: EditorOptions) {
    this.doc = options.doc;
    this.ids = options.ids;
    for (const node of this.doc.nodes()) this.ids.observe(node.id);
    const firstPage = options.pageId && this.doc.get(options.pageId)?.type === 'PAGE' ? options.pageId : this.doc.pages()[0];
    if (!firstPage) throw new Error('Document has no pages');
    this.state = new EditorStore(this.doc, firstPage);
    this.scene = new SceneIndex(this.doc);
    this.images.subscribe(() => this.requestRender());
    this.history = new History<EditorMeta>({
      store: this.doc,
      captureMeta: () => ({ pageId: this.state.activePageId, selection: this.state.selection }),
      restoreMeta: (meta) => {
        if (this.doc.has(meta.pageId) && meta.pageId !== this.state.activePageId) this.state.setActivePage(meta.pageId);
        this.state.select(meta.selection.filter((id) => this.doc.has(id)));
      },
      // Text boxes fit their content before groups measure their children.
      // Constraints move children of resized frames before text boxes fit and groups measure them.
      // Constraints and text sizes settle before auto layout measures its children; groups hug the result.
      finalizers: [vectorFinalizer, constraintsFinalizer, createTextFinalizer(() => this.textLayout), createAutoLayoutFinalizer(() => this.textLayout), groupFinalizer],
      // Constraints and auto layout follow resize drags live.
      previewFinalizers: [vectorFinalizer, constraintsFinalizer, createAutoLayoutFinalizer(() => this.textLayout, { preview: true })],
      ...(options.validate ? { validate: assertDocumentInvariants } : {}),
    });
    // The scene index must learn about every change before anything renders or hit-tests.
    this.history.subscribe((change) => this.scene.applyChange(change));
    this.history.subscribe((change) => this.onChange(change));
    this.state.subscribe(() => this.requestRender());
  }

  get pageId(): Id {
    return this.state.activePageId;
  }

  get selection(): readonly Id[] {
    return this.state.selection;
  }

  /** Subscribe to "something visible changed" (document or editor state). */
  onRender(listener: () => void): () => void {
    this.renderListeners.add(listener);
    return () => this.renderListeners.delete(listener);
  }

  requestRender(): void {
    for (const listener of this.renderListeners) listener();
  }

  setViewport(viewport: Viewport): void {
    this.state.setViewport(viewport);
  }

  /** Sets the nudge preference; values that are not positive finite numbers fall back to 1 and 10. */
  setNudgeAmounts(small: number, big: number): void {
    const valid = (value: number, fallback: number) => (Number.isFinite(value) && value > 0 ? value : fallback);
    this.nudgeAmounts = { small: valid(small, 1), big: valid(big, 10) };
  }

  setCanvasInsets(insets: CanvasInsets): void {
    const c = this.canvasInsets;
    if (c.left === insets.left && c.right === insets.right && c.top === insets.top && c.bottom === insets.bottom) return;
    this.canvasInsets = insets;
    this.requestRender();
  }

  /** World bounds of the current selection, or null. */
  selectionBounds(ids: readonly Id[] = this.selection): Rect | null {
    this.scene.ensure(this.pageId);
    return unionAll(ids.map((id) => this.scene.worldBounds(id)).filter((r): r is Rect => r !== null));
  }

  /** Bounds of all top-level layers on the current page. */
  pageContentBounds(): Rect | null {
    return this.selectionBounds(this.doc.children(this.pageId));
  }

  /**
   * Brings a world rectangle into view: nothing when it is already fully visible, a pan to center
   * it when it fits at the current zoom, otherwise zoom to fit it.
   */
  revealRect(rect: Rect | null): void {
    if (!rect) return;
    const v = this.state.viewport;
    const { width, height } = this.canvasSize;
    const view = visibleWorldRect(v, width, height);
    if (rect.x >= view.x && rect.y >= view.y && rect.x + rect.width <= view.x + view.width && rect.y + rect.height <= view.y + view.height) return;
    if (rect.width > view.width || rect.height > view.height) {
      this.zoomToRect(rect);
      return;
    }
    this.setViewport({ zoom: v.zoom, x: rect.x + rect.width / 2 - width / 2 / v.zoom, y: rect.y + rect.height / 2 - height / 2 / v.zoom });
  }

  zoomToRect(rect: Rect | null, maxZoom?: number): void {
    if (!rect) return;
    const { width, height } = this.canvasSize;
    this.setViewport(fitRect(rect, width, height, 64, maxZoom));
  }

  private onChange(change: ChangeSet): void {
    if (change.source !== 'preview') this.state.pruneSelection();
    this.requestRender();
  }
}
