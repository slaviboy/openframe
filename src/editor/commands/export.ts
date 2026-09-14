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

import { defaultExportSetting, EXPORT_MIME_TYPES, exportFileName, exportScale, uniqueFileNames, type ExportSetting } from '@/core/export/export-settings';
import type { Id } from '@/core/ids/ids';
import { isSceneNode, type SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';

function layers(editor: Editor, ids: readonly Id[]): SceneNode[] {
  return ids.map((id) => editor.doc.get(id)).filter((node): node is SceneNode => node !== undefined && isSceneNode(node));
}

const settingsOf = (node: SceneNode | undefined): readonly ExportSetting[] => node?.exportSettings ?? [];

/** Adds an export configuration (1x PNG) to layers, the + in the Export section. One undo step. */
export function addExportSetting(editor: Editor, ids: readonly Id[]): boolean {
  const targets = layers(editor, ids);
  if (targets.length === 0) return false;
  editor.history.run('Add export', (tx) =>
    targets.forEach((node) => tx.set(node.id, 'exportSettings', [...settingsOf(tx.store.get(node.id) as SceneNode), defaultExportSetting()])),
  );
  return true;
}

/** Changes an export configuration of layers (its format, scale or suffix). One undo step. */
export function updateExportSetting(editor: Editor, ids: readonly Id[], index: number, patch: Partial<ExportSetting>): boolean {
  const targets = layers(editor, ids).filter((node) => settingsOf(node)[index] !== undefined);
  if (targets.length === 0) return false;
  editor.history.run('Change export', (tx) =>
    targets.forEach((node) => tx.set(node.id, 'exportSettings', settingsOf(tx.store.get(node.id) as SceneNode).map((setting, i) => (i === index ? { ...setting, ...patch } : setting)))),
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

/** An exported file: the layer and configuration it comes from, its path (folders from the layer's name) and contents. */
export interface ExportedAsset {
  readonly nodeId: Id;
  readonly setting: ExportSetting;
  readonly path: string;
  readonly type: string;
  readonly bytes: Uint8Array;
}

/**
 * Renders the export configurations of layers into files, named from the layer names (made unique). A layer's size for
 * fixed-width and fixed-height scales is its painted bounds, effects included. Null while the rendering engine isn't
 * ready; configurations with nothing to draw are skipped.
 */
export function renderExports(editor: Editor, ids: readonly Id[], only?: ReadonlySet<string>): ExportedAsset[] | null {
  const engine = editor.thumbnails;
  if (!engine) return null;
  const assets: ExportedAsset[] = [];
  for (const node of layers(editor, ids)) {
    const pageId = editor.doc.pageOf(node.id);
    if (pageId === null) continue;
    editor.scene.ensure(pageId);
    const bounds = editor.scene.paintBounds(node.id) ?? editor.scene.worldBounds(node.id);
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) continue;
    settingsOf(node).forEach((setting, index) => {
      if (only && !only.has(`${node.id}:${index}`)) return;
      const bytes = engine.exportImage(editor.doc, editor.scene, pageId, node.id, exportScale(setting.constraint, bounds.width, bounds.height), setting.format);
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
