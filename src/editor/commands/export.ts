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

import { DEFAULT_PDF_QUALITY, defaultExportSetting, EXPORT_MIME_TYPES, exportFileName, exportScale, uniqueFileNames, type ExportImageOptions, type ExportSetting } from '@/core/export/export-settings';
import { pdfFromJpeg } from '@/core/export/pdf-document';
import { animatedGifHash } from '../images/animated-gif';
import { textLayersUnder, textOutlinesFor } from './outline-text';
import { exportSvg } from '@/core/export/svg-document';
import type { PathCommand } from '@/core/geometry/corners';
import type { Id } from '@/core/ids/ids';
import { isSceneNode, type SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';

function layers(editor: Editor, ids: readonly Id[]): SceneNode[] {
  return ids.map((id) => editor.doc.get(id)).filter((node): node is SceneNode => node !== undefined && isSceneNode(node));
}

const settingsOf = (node: SceneNode | undefined, fallback?: ExportSetting): readonly ExportSetting[] => {
  const own = node?.exportSettings ?? [];
  // Dev Mode downloads a layer that carries no export configuration of its own, with one supplied for the occasion.
  return own.length > 0 || !fallback ? own : [fallback];
};

/** Adds an export configuration (1x PNG) to layers, the + in the Export section. One undo step. */
export function addExportSetting(editor: Editor, ids: readonly Id[]): boolean {
  const targets = layers(editor, ids);
  if (targets.length === 0) return false;
  editor.history.run('Add export', (tx) => targets.forEach((node) => tx.set(node.id, 'exportSettings', [...settingsOf(tx.store.get(node.id) as SceneNode), defaultExportSetting()])));
  return true;
}

/** Changes an export configuration of layers (its format, scale or suffix). One undo step. */
export function updateExportSetting(editor: Editor, ids: readonly Id[], index: number, patch: Partial<ExportSetting>): boolean {
  const targets = layers(editor, ids).filter((node) => settingsOf(node)[index] !== undefined);
  if (targets.length === 0) return false;
  editor.history.run('Change export', (tx) =>
    targets.forEach((node) =>
      tx.set(
        node.id,
        'exportSettings',
        settingsOf(tx.store.get(node.id) as SceneNode).map((setting, i) => (i === index ? { ...setting, ...patch } : setting)),
      ),
    ),
  );
  return true;
}

/** Removes an export configuration from layers. One undo step. */
export function removeExportSetting(editor: Editor, ids: readonly Id[], index: number): boolean {
  const targets = layers(editor, ids).filter((node) => settingsOf(node)[index] !== undefined);
  if (targets.length === 0) return false;
  editor.history.run('Remove export', (tx) =>
    targets.forEach((node) => {
      const next = settingsOf(tx.store.get(node.id) as SceneNode).filter((_, i) => i !== index);
      tx.set(node.id, 'exportSettings', next.length > 0 ? next : undefined);
    }),
  );
  return true;
}

/** What a configuration asks of the rendering engine: the settings that reach the picture rather than its size. */
const imageOptions = (setting: ExportSetting): ExportImageOptions => ({
  ...(setting.colorProfile ? { colorProfile: setting.colorProfile } : {}),
  ...(setting.resampling ? { resampling: setting.resampling } : {}),
  ...(setting.quality !== undefined ? { quality: setting.quality } : {}),
  ...(setting.contentsOnly === false ? { contentsOnly: false } : {}),
});

/** An exported file: the layer and configuration it comes from, its path (folders from the layer's name) and contents. */
export interface ExportedAsset {
  readonly nodeId: Id;
  readonly setting: ExportSetting;
  readonly path: string;
  readonly type: string;
  readonly bytes: Uint8Array;
  /** For SVG: what was left out (`layer name: what`) because SVG export doesn't support it. */
  readonly skipped?: readonly string[];
}

/**
 * Renders the export configurations of layers into files, named from the layer names (made unique). A layer's size for
 * fixed-width and fixed-height scales is its painted bounds, effects included; SVG exports at 1x. Null while the rendering
 * engine an image needs isn't ready; configurations with nothing to draw are skipped.
 */
export function renderExports(editor: Editor, ids: readonly Id[], only?: ReadonlySet<string>, fallback?: ExportSetting, text?: ReadonlyMap<Id, PathCommand[]>): ExportedAsset[] | null {
  const engine = editor.thumbnails;
  const wanted = (node: SceneNode, index: number) => !only || only.has(`${node.id}:${index}`);
  const needsEngine = layers(editor, ids).some((node) => settingsOf(node, fallback).some((setting, index) => setting.format !== 'SVG' && setting.format !== 'GIF' && wanted(node, index)));
  if (needsEngine && !engine) return null;
  const assets: ExportedAsset[] = [];
  for (const node of layers(editor, ids)) {
    const pageId = editor.doc.pageOf(node.id);
    if (pageId === null) continue;
    editor.scene.ensure(pageId);
    const bounds = editor.scene.paintBounds(node.id) ?? editor.scene.worldBounds(node.id);
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) continue;
    settingsOf(node, fallback).forEach((setting, index) => {
      if (!wanted(node, index)) return;
      if (setting.format === 'SVG') {
        const geometry = editor.geometry;
        const result = exportSvg(editor.doc, node.id, {
          ...(geometry ? { strokeOutline: (layer: SceneNode) => geometry.strokeOutline(layer), booleanOutline: (layer: SceneNode) => geometry.booleanOutline(layer, editor.doc) } : {}),
          ...(text ? { textOutline: (layer: SceneNode) => text.get(layer.id) ?? null } : {}),
          image: (hash: string) => {
            const stored = editor.images.get(hash);
            return stored ? { bytes: stored.bytes, type: stored.mime, size: { width: stored.width, height: stored.height } } : null;
          },
          ...(setting.svgIdAttribute ? { idAttribute: true } : {}),
          ...(setting.svgSimplifyStroke ? { simplifyStroke: true } : {}),
        });
        if (result)
          assets.push({ nodeId: node.id, setting, path: exportFileName(node.name, setting), type: EXPORT_MIME_TYPES.SVG, bytes: new TextEncoder().encode(result.svg), skipped: result.skipped });
        return;
      }
      if (setting.format === 'PDF') {
        // A PDF page the layer's own size in points, carrying the layer drawn as a JPEG.
        if (!engine) return;
        const scale = exportScale(setting.constraint, bounds.width, bounds.height);
        const jpeg = engine.exportImage(editor.doc, editor.scene, pageId, node.id, scale, 'JPG', { ...imageOptions(setting), quality: setting.quality ?? DEFAULT_PDF_QUALITY });
        if (!jpeg) return;
        const pdf = pdfFromJpeg(jpeg, bounds.width, bounds.height, Math.round(bounds.width * scale), Math.round(bounds.height * scale));
        assets.push({ nodeId: node.id, setting, path: exportFileName(node.name, setting), type: EXPORT_MIME_TYPES.PDF, bytes: pdf, skipped: ['text as text', 'shapes as shapes'] });
        return;
      }
      if (setting.format === 'GIF') {
        // The original GIF, so its frame delays and loop count survive the export; at 1x, as the file was made.
        const hash = animatedGifHash(editor, node.id);
        const bytes = hash ? editor.images.get(hash)?.bytes : undefined;
        if (bytes) assets.push({ nodeId: node.id, setting, path: exportFileName(node.name, setting), type: EXPORT_MIME_TYPES.GIF, bytes });
        return;
      }
      if (!engine) return;
      const bytes = engine.exportImage(editor.doc, editor.scene, pageId, node.id, exportScale(setting.constraint, bounds.width, bounds.height), setting.format, imageOptions(setting));
      if (bytes) assets.push({ nodeId: node.id, setting, path: exportFileName(node.name, setting), type: EXPORT_MIME_TYPES[setting.format], bytes });
    });
  }
  const paths = uniqueFileNames(assets.map((asset) => asset.path));
  return assets.map((asset, i) => ({ ...asset, path: paths[i]! }));
}

/** The layers of a page with export configurations, in layer order (File > Export, ⇧⌘E). */
export function layersWithExports(editor: Editor, pageId: Id = editor.pageId): Id[] {
  return [...editor.doc.descendants(pageId, false)].filter((id) => settingsOf(editor.doc.get(id) as SceneNode | undefined).length > 0);
}

/**
 * The same, with the glyph outlines of every text layer an SVG export reaches worked out first — reading a font
 * file has to be waited for, and writing the markup cannot. Anything but SVG goes through unchanged.
 */
export async function renderExportsWithText(editor: Editor, ids: readonly Id[], only?: ReadonlySet<string>, fallback?: ExportSetting): Promise<ExportedAsset[] | null> {
  const svgRoots = layers(editor, ids).filter((node) => settingsOf(node, fallback).some((setting) => setting.format === 'SVG'));
  const texts = textLayersUnder(
    editor,
    svgRoots.map((node) => node.id),
  );
  if (texts.length === 0) return renderExports(editor, ids, only, fallback);
  const { bundledFontLoader } = await import('@/engine/text/outline-font');
  const load = bundledFontLoader((family) => editor.textLayout?.fontBytesOf?.(family) ?? null);
  const outlines = new Map<Id, PathCommand[]>();
  for (const { node, commands } of await textOutlinesFor(editor, texts, load)) outlines.set(node.id, [...commands]);
  return renderExports(editor, ids, only, fallback, outlines);
}
