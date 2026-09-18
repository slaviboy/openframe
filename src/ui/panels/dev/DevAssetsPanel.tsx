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

import { devAssets, type DevAsset } from '@/editor/commands/dev-assets';
import { renderExportsWithText } from '@/editor/commands/export';
import { useDocumentRevision, useEditor, useEditorState } from '../../hooks/useEditor';
import primitives from '../../primitives/primitives.module.css';
import { saveExports } from '../inspector/ExportSection';
import styles from './InspectPanel.module.css';

/**
 * Dev Mode's assets: everything the page has to hand over. A layer set up for export by hand is offered as it was set
 * up; an icon found by its shape and size is offered as the shape it suits — drawings as SVG, the rest as PNG.
 */
export function DevAssetsPanel() {
  const editor = useEditor();
  const pageId = useEditorState((s) => s.activePageId);
  useDocumentRevision();
  const assets = devAssets(editor, pageId);

  const download = async (chosen: readonly DevAsset[], archive: string) => {
    const rendered = (await Promise.all(chosen.map((asset) => renderExportsWithText(editor, [asset.nodeId], undefined, asset.setting)))).flatMap((assets) => assets ?? []);
    if (rendered.length > 0) saveExports(rendered, archive);
  };

  return (
    <section className={styles.group} aria-label="Assets">
      <h3 className={styles.groupTitle}>Assets</h3>
      {assets.length === 0 ? (
        <p className={styles.empty}>Nothing on this page is set up for export, and no icons were found.</p>
      ) : (
        <>
          {assets.map((asset) => (
            <div key={asset.nodeId} className={styles.row}>
              <button type="button" className={styles.link} aria-label={`Select ${asset.name}`} onClick={() => editor.state.select([asset.nodeId])}>
                {asset.name}
              </button>
              <span className={styles.label}>{asset.detected ? `${asset.setting.format} · icon` : asset.setting.format}</span>
              <button type="button" className={primitives.button} aria-label={`Download ${asset.name}`} onClick={() => download([asset], asset.name)}>
                Download
              </button>
            </div>
          ))}
          <button type="button" className={primitives.button} onClick={() => download(assets, 'assets')}>
            Download all
          </button>
        </>
      )}
    </section>
  );
}
