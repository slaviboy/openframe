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

import { exportSvg } from '@/core/export/svg-document';
import type { Vec2 } from '@/core/math/vec';
import { pastePayload, type PasteMode } from '@/editor/clipboard/paste';
import {
  ClipboardError,
  clipboardPlainText,
  createClipboardPayload,
  decodeClipboardHtml,
  encodeClipboardHtml,
  type ClipboardPayload,
} from '@/editor/clipboard/payload';
import type { Editor } from '@/editor/editor';
import {
  allPropertiesPayload,
  decodePropertiesHtml,
  encodePropertiesHtml,
  pasteProperties,
  rowPropertyPayload,
  type PropertiesPayload,
} from '@/editor/clipboard/properties';
import { imageFilesOf } from '../images/import-image';
import { videoFilesOf } from '../images/import-video';
import { isSvgMarkup, svgFilesOf, svgMarkupFile } from '../import/svg-files';
import { IS_MAC } from '../keyboard/keyboard-controller';

const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * Connects the editor to the system clipboard through native copy/cut/paste events, which
 * work in every browser without permission prompts and interoperate between tabs.
 *
 * - ⌘C / ⌘X write an HTML flavor (structured payload) and a plain-text flavor (layer names).
 * - ⌘V pastes; ⇧⌘V ("paste and match style" in browsers) pastes over the selection.
 * - ⇧⌘R pastes to replace. Browsers fire no paste event for it, so it uses the async
 *   Clipboard API when readable, and otherwise the last payload copied in this tab.
 *
 * Text fields keep native clipboard behavior.
 */
export class ClipboardController {
  private lastPayload: ClipboardPayload | null = null;
  private lastProperties: PropertiesPayload | null = null;
  /**
   * Whether the window lost focus since properties were last copied in this tab. Until then the
   * tab's copy is the newest, so pasting skips the system clipboard (whose read may prompt).
   */
  private propertiesMayBeStale = true;
  private pendingMode: PasteMode = 'default';

  constructor(
    private readonly editor: Editor,
    private readonly onError: (message: string) => void = (message) => console.warn(`Openframe: ${message}`),
    private readonly target: Document = document,
    /** Receives image files pasted from the system clipboard (screenshots, copied files). */
    private readonly onImageFiles: ((files: File[]) => void) | null = null,
  ) {
    target.addEventListener('copy', this.onCopy);
    target.addEventListener('cut', this.onCut);
    target.addEventListener('paste', this.onPaste);
    target.addEventListener('keydown', this.onKeyDown, true);
    target.defaultView?.addEventListener('blur', this.onWindowBlur);
  }

  dispose(): void {
    this.target.removeEventListener('copy', this.onCopy);
    this.target.removeEventListener('cut', this.onCut);
    this.target.removeEventListener('paste', this.onPaste);
    this.target.removeEventListener('keydown', this.onKeyDown, true);
    this.target.defaultView?.removeEventListener('blur', this.onWindowBlur);
  }

  /** Leaving the window may mean something newer was copied elsewhere. */
  private readonly onWindowBlur = (): void => {
    this.propertiesMayBeStale = true;
  };

  private readonly onCopy = (e: ClipboardEvent): void => {
    if (isEditableTarget(e.target)) return;
    // A highlighted fill, stroke or effect row in the properties panel copies just that property.
    const row = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-copy-property]') : null;
    if (row && e.clipboardData) {
      const [field, index] = (row.dataset['copyProperty'] ?? '').split(':');
      const payload = field === 'fills' || field === 'strokes' || field === 'effects' || field === 'layoutGuides' ? rowPropertyPayload(this.editor, field, Number(index)) : null;
      if (payload) {
        e.clipboardData.setData('text/html', encodePropertiesHtml(payload));
        e.clipboardData.setData('text/plain', payload.kind === 'effect' ? 'Effect' : payload.kind === 'paint' ? 'Paint' : 'Properties');
        this.lastProperties = payload;
        this.propertiesMayBeStale = false;
        e.preventDefault();
        return;
      }
    }
    if (!this.write(e)) return;
    e.preventDefault();
  };

  private readonly onCut = (e: ClipboardEvent): void => {
    if (isEditableTarget(e.target) || !this.write(e)) return;
    e.preventDefault();
    this.editor.commands.run('edit.delete');
  };

  private readonly onPaste = (e: ClipboardEvent): void => {
    const mode = this.pendingMode;
    this.pendingMode = 'default';
    if (isEditableTarget(e.target)) return;
    const html = e.clipboardData?.getData('text/html') ?? '';
    try {
      // A copied fill, stroke or effect pastes onto the selected layers.
      const property = decodePropertiesHtml(html);
      if (property) {
        e.preventDefault();
        if (property.kind !== 'all') pasteProperties(this.editor, property);
        return;
      }
      const payload = decodeClipboardHtml(html);
      if (!payload) {
        const files = [...imageFilesOf(e.clipboardData), ...videoFilesOf(e.clipboardData), ...svgFilesOf(e.clipboardData)];
        // SVG markup copied from another tool imports as vectors.
        const text = files.length === 0 ? (e.clipboardData?.getData('text/plain') ?? '') : '';
        if (isSvgMarkup(text)) files.push(svgMarkupFile(text));
        if (files.length > 0 && this.onImageFiles) {
          e.preventDefault();
          this.onImageFiles(files);
        }
        return;
      }
      e.preventDefault();
      pastePayload(this.editor, payload, mode);
    } catch (error) {
      e.preventDefault();
      this.onError(error instanceof ClipboardError ? error.message : 'Paste failed');
    }
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const mod = IS_MAC ? e.metaKey : e.ctrlKey;
    if (!mod || !e.shiftKey || e.altKey || isEditableTarget(e.target)) return;
    if (e.code === 'KeyV') {
      // The paste event that follows carries the data; remember the requested mode.
      this.pendingMode = 'over-selection';
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      void this.pasteToReplace();
    }
  };

  private write(e: ClipboardEvent): boolean {
    const payload = createClipboardPayload(this.editor);
    if (!payload || !e.clipboardData) return false;
    e.clipboardData.setData('text/html', encodeClipboardHtml(payload));
    e.clipboardData.setData('text/plain', clipboardPlainText(payload));
    this.lastPayload = payload;
    return true;
  }

  private async pasteToReplace(): Promise<void> {
    await this.paste('replace');
  }

  /** Whether a paste can produce content (a readable system clipboard or an in-tab copy). */
  canPaste(): boolean {
    return this.lastPayload !== null || (typeof navigator !== 'undefined' && !!navigator.clipboard && 'read' in navigator.clipboard);
  }

  /**
   * Copy (or cut) for menus and the command palette, where no native clipboard event exists.
   * Writes to the system clipboard when the browser permits it; the in-tab copy is always kept.
   */
  async copy(cut = false): Promise<void> {
    const payload = createClipboardPayload(this.editor);
    if (!payload) return;
    this.lastPayload = payload;
    try {
      if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([encodeClipboardHtml(payload)], { type: 'text/html' }),
            'text/plain': new Blob([clipboardPlainText(payload)], { type: 'text/plain' }),
          }),
        ]);
      }
    } catch {
      // Permission denied or unsupported: the in-tab copy remains available to paste.
    }
    if (cut) this.editor.commands.run('edit.delete');
  }

  /** Copy properties (⌥⌘C): all properties of the selected layer; kept in this tab and written to the system clipboard when allowed. */
  async copyProperties(): Promise<void> {
    const payload = allPropertiesPayload(this.editor);
    if (!payload) return;
    this.lastProperties = payload;
    this.propertiesMayBeStale = false;
    try {
      if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([encodePropertiesHtml(payload)], { type: 'text/html' }),
            'text/plain': new Blob(['Layer properties'], { type: 'text/plain' }),
          }),
        ]);
      }
    } catch {
      // Permission denied or unsupported: the in-tab copy remains available.
    }
  }

  /** Writes one clipboard item to the system clipboard; false when the browser can't or won't (a notice says why). */
  private async writeItem(item: Record<string, Blob>, failure: string): Promise<boolean> {
    if (!navigator.clipboard || !('write' in navigator.clipboard) || typeof ClipboardItem === 'undefined') {
      this.onError('This browser doesn’t allow writing to the clipboard.');
      return false;
    }
    try {
      await navigator.clipboard.write([new ClipboardItem(item)]);
      return true;
    } catch {
      this.onError(failure);
      return false;
    }
  }

  /** Copy as PNG (⇧⌘C): the selected layer as a PNG image at 2×, written to the system clipboard. */
  async copyAsPng(): Promise<void> {
    const [id] = this.editor.selection;
    const pageId = id === undefined ? null : this.editor.doc.pageOf(id);
    if (id === undefined || pageId === null) return;
    const engine = this.editor.thumbnails;
    if (!engine) {
      this.onError('The rendering engine is still loading.');
      return;
    }
    this.editor.scene.ensure(pageId);
    const bytes = engine.exportImage(this.editor.doc, this.editor.scene, pageId, id, 2, 'PNG');
    if (!bytes) {
      this.onError('Nothing to copy: the layer has no visible area.');
      return;
    }
    await this.writeItem({ 'image/png': new Blob([bytes as BlobPart], { type: 'image/png' }) }, 'The image could not be copied to the clipboard.');
  }

  /** Copy as SVG: the selected layer as SVG markup, written to the system clipboard as text. */
  async copyAsSvg(): Promise<void> {
    const [id] = this.editor.selection;
    if (id === undefined) return;
    const geometry = this.editor.geometry;
    const result = exportSvg(this.editor.doc, id, geometry ? { strokeOutline: (layer) => geometry.strokeOutline(layer) } : {});
    if (!result) {
      this.onError('Nothing to copy: the layer has no area.');
      return;
    }
    const copied = await this.writeItem({ 'text/plain': new Blob([result.svg], { type: 'text/plain' }) }, 'The SVG could not be copied to the clipboard.');
    if (copied && result.skipped.length > 0) this.onError(`Copied as SVG. Left out of the SVG: ${result.skipped.join(', ')}`);
  }

  /** Paste properties (⌥⌘V): reads properties from the system clipboard when permitted, else this tab's last copy. */
  async pasteProperties(): Promise<void> {
    let payload: PropertiesPayload | null = null;
    try {
      if ((!this.lastProperties || this.propertiesMayBeStale) && navigator.clipboard && 'read' in navigator.clipboard) {
        for (const item of await navigator.clipboard.read()) {
          if (!item.types.includes('text/html')) continue;
          payload = decodePropertiesHtml(await (await item.getType('text/html')).text());
          if (payload) break;
        }
      }
    } catch (error) {
      if (error instanceof ClipboardError) {
        this.onError(error.message);
        return;
      }
    }
    // Prefer this tab's copy when it is newer (e.g. a system clipboard write was denied or is stale).
    const local = this.lastProperties;
    if (!payload || (local && (local.copiedAt ?? 0) > (payload.copiedAt ?? 0))) payload = local;
    if (payload) pasteProperties(this.editor, payload);
  }

  /** Whether Paste properties can have content. */
  canPasteProperties(): boolean {
    return this.lastProperties !== null || (typeof navigator !== 'undefined' && !!navigator.clipboard && 'read' in navigator.clipboard);
  }

  /**
   * Paste for menus, the palette and ⇧⌘R: reads the system clipboard when permitted, else the
   * in-tab copy. With `at` (a world point, for "Paste here"), content is centered on that point.
   */
  async paste(mode: PasteMode, at?: Vec2): Promise<void> {
    let payload: ClipboardPayload | null = null;
    let svg = '';
    try {
      if (navigator.clipboard && 'read' in navigator.clipboard) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes('text/html')) {
            payload = decodeClipboardHtml(await (await item.getType('text/html')).text());
            if (payload) break;
          }
          if (!svg && item.types.includes('text/plain')) {
            const text = await (await item.getType('text/plain')).text();
            if (isSvgMarkup(text)) svg = text;
          }
        }
      }
    } catch (error) {
      if (error instanceof ClipboardError) {
        this.onError(error.message);
        return;
      }
      // Permission denied or unsupported: fall back to this tab's last copy.
    }
    if (!payload && svg && this.onImageFiles) {
      this.onImageFiles([svgMarkupFile(svg)]);
      return;
    }
    payload ??= this.lastPayload;
    if (payload) pastePayload(this.editor, payload, mode, at);
  }
}
