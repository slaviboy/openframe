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

import { useState } from 'react';
import { EXPORT_FORMAT_LABELS, exportFileName, exportScale, formatExportConstraint } from '@/core/export/export-settings';
import type { SceneNode } from '@/core/schema/document';
import { layersWithExports, renderExports } from '@/editor/commands/export';
import type { Editor } from '@/editor/editor';
import { saveExports } from '../panels/inspector/ExportSection';
import findStyles from '../panels/find/FindPanel.module.css';
import styles from './Dialog.module.css';

/**
 * Export (File > Export, ⇧⌘E): every export configuration of the layers on the current page, with its file name, format,
 * scale and size in pixels. Uncheck the ones to leave out; clicking a layer's name selects it on the canvas; Export saves
 * the checked files (several as a ZIP archive).
 */
export function ExportDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const ids = layersWithExports(editor);
  editor.scene.ensure(editor.pageId);
  const rows = ids.flatMap((id) => {
    const node = editor.doc.get(id) as SceneNode;
    const bounds = editor.scene.paintBounds(id) ?? editor.scene.worldBounds(id);
    return (node.exportSettings ?? []).map((setting, index) => {
      const scale = bounds ? exportScale(setting.constraint, bounds.width, bounds.height) : 1;
      return {
        key: `${id}:${index}`,
        id,
        path: exportFileName(node.name, setting),
        detail: `${EXPORT_FORMAT_LABELS[setting.format]} · ${formatExportConstraint(setting.constraint)}${bounds ? ` · ${Math.max(1, Math.round(bounds.width * scale))} × ${Math.max(1, Math.round(bounds.height * scale))}` : ''}`,
      };
    });
  });
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = useState('');
  const checked = rows.filter((row) => !unchecked.has(row.key));

  const exportChecked = () => {
    const assets = renderExports(editor, [...new Set(checked.map((row) => row.id))], new Set(checked.map((row) => row.key)));
    if (assets === null) {
      setStatus('The rendering engine is still loading.');
      return;
    }
    if (assets.length === 0) {
      setStatus('Nothing to export: the layers have no visible area.');
      return;
    }
    saveExports(assets, 'Export');
    onClose();
  };

  return (
    <div
      className={styles.backdrop}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        className={styles.dialog}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <h2 id="export-title" className={styles.title}>
          Export
        </h2>
        <div className={styles.body}>
          {rows.length === 0 ? (
            <p>No layers on this page have export settings. Add them in the Export section of the right sidebar.</p>
          ) : (
            <ul className={findStyles.results} aria-label="Exports">
              {rows.map((row) => (
                <li key={row.key} className={styles.row}>
                  <input
                    type="checkbox"
                    aria-label={`Export ${row.path}`}
                    checked={!unchecked.has(row.key)}
                    onChange={(e) => {
                      const next = new Set(unchecked);
                      if (e.target.checked) next.delete(row.key);
                      else next.add(row.key);
                      setUnchecked(next);
                    }}
                  />
                  <button type="button" className={findStyles.result} title={`Select ${row.path}`} onClick={() => editor.state.select([row.id])}>
                    {row.path}
                    <span className={findStyles.page}>{row.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {status && <p role="status">{status}</p>}
        </div>
        <footer className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.primary} disabled={checked.length === 0} onClick={exportChecked}>
            {checked.length === 1 ? 'Export 1 file' : `Export ${checked.length} files`}
          </button>
        </footer>
      </div>
    </div>
  );
}
