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

import { useEffect, useState } from 'react';
import {
  DEFAULT_JPEG_QUALITY,
  DEFAULT_PDF_QUALITY,
  EXPORT_FORMAT_LABELS,
  EXPORT_FORMATS,
  EXPORT_SCALE_PRESETS,
  formatExportConstraint,
  parseExportConstraint,
  QUALITY_PRESETS,
  type ExportFormat,
  type ExportSetting,
} from '@/core/export/export-settings';
import type { SceneNode } from '@/core/schema/document';
import { addExportSetting, removeExportSetting, renderExportsWithText, updateExportSetting, type ExportedAsset } from '@/editor/commands/export';
import { downloadBytes, zipFiles } from '@/platform/download';
import { animatedGifHash } from '@/editor/images/animated-gif';
import { useEditor } from '../../hooks/useEditor';
import { IconButton } from '../../primitives/IconButton';
import primitives from '../../primitives/primitives.module.css';
import styles from './Inspector.module.css';

/** The file name of an export on its own, without the folders its layer name makes. */
const baseName = (path: string) => path.split('/').at(-1)!;

/** Saves exported files: one file as itself, several as a ZIP archive named after the layer (or "Export"). */
export function saveExports(assets: readonly ExportedAsset[], archiveName: string): void {
  if (assets.length === 1) {
    downloadBytes(baseName(assets[0]!.path), assets[0]!.bytes, assets[0]!.type);
    return;
  }
  downloadBytes(`${archiveName}.zip`, zipFiles(assets), 'application/zip');
}

/** The id of the scale presets list, rendered once per Export section. */
const SCALE_PRESETS_ID = 'export-scale-presets';

/** A scale typed or picked from the presets, applied when it is committed. */
function ScaleInput({ label, setting, onChange }: { label: string; setting: ExportSetting; onChange: (setting: Partial<ExportSetting>) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const fixedScale = setting.format === 'SVG' || setting.format === 'GIF';
  const commit = () => {
    if (draft === null) return;
    const constraint = parseExportConstraint(draft);
    setDraft(null);
    if (constraint) onChange({ constraint });
  };
  return (
    <input
      className={primitives.textInput}
      aria-label={label}
      list={SCALE_PRESETS_ID}
      // SVG exports at 1x, and a GIF export is the original file.
      disabled={fixedScale}
      title={fixedScale ? `${setting.format} exports at 1x` : undefined}
      value={fixedScale ? '1x' : (draft ?? formatExportConstraint(setting.constraint))}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/**
 * The settings a format of its own carries, opened from the export configuration they belong to. Which are shown
 * follows the format: SVG has markup of its own to steer, and only the raster formats have a color profile or a
 * resampling method. The reference's "Include bounding box" is not among them — a layer already exports as its own box,
 * which is what that setting asks for — and SVG text is always outlined, since that is how it is exported at all.
 */
function FormatSettings({ name, setting, onChange }: { name: string; setting: ExportSetting; onChange: (patch: Partial<ExportSetting>) => void }) {
  const { format } = setting;
  const raster = format === 'PNG' || format === 'JPG' || format === 'WEBP';
  const compressed = format === 'JPG' || format === 'PDF';
  if (format === 'GIF') return null;
  return (
    <details className={styles.exportSettings}>
      <summary>{name} settings</summary>
      {(raster || format === 'SVG') && (
        <label className={styles.checkbox}>
          <input type="checkbox" checked={setting.contentsOnly !== false} onChange={(e) => onChange({ contentsOnly: e.target.checked ? undefined : false })} />
          Ignore overlapping layers
        </label>
      )}
      {format === 'SVG' && (
        <>
          <label className={styles.checkbox}>
            <input type="checkbox" checked={setting.svgIdAttribute === true} onChange={(e) => onChange({ svgIdAttribute: e.target.checked ? true : undefined })} />
            Include &quot;id&quot; attribute
          </label>
          <label className={styles.checkbox}>
            <input type="checkbox" checked={setting.svgSimplifyStroke === true} onChange={(e) => onChange({ svgSimplifyStroke: e.target.checked ? true : undefined })} />
            Simplify stroke
          </label>
        </>
      )}
      {raster && (
        <div className={styles.field}>
          <span>Color profile</span>
          <select
            className={primitives.select}
            aria-label={`${name} color profile`}
            value={setting.colorProfile ?? 'FILE'}
            onChange={(e) => onChange({ colorProfile: e.target.value === 'FILE' ? undefined : (e.target.value as 'SRGB' | 'DISPLAY_P3') })}
          >
            <option value="FILE">Same as file</option>
            <option value="SRGB">sRGB</option>
            <option value="DISPLAY_P3">Display P3</option>
          </select>
        </div>
      )}
      {compressed && (
        <div className={styles.field}>
          <span>Image quality</span>
          <select
            className={primitives.select}
            aria-label={`${name} image quality`}
            value={setting.quality ?? (format === 'PDF' ? DEFAULT_PDF_QUALITY : DEFAULT_JPEG_QUALITY)}
            onChange={(e) => onChange({ quality: Number(e.target.value) })}
          >
            {QUALITY_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {(raster || format === 'PDF') && (
        <div className={styles.field}>
          <span>Image resampling</span>
          <select
            className={primitives.select}
            aria-label={`${name} image resampling`}
            value={setting.resampling ?? 'DETAILED'}
            onChange={(e) => onChange({ resampling: e.target.value as 'DETAILED' | 'BASIC' })}
          >
            <option value="DETAILED">Detailed</option>
            <option value="BASIC">Basic</option>
          </select>
        </div>
      )}
    </details>
  );
}

/**
 * The Export section of the right sidebar: export configurations of the selected layers (format, scale as a multiplier
 * or fixed width or height, and a file name suffix), Preview of a single layer's first export, and Export, which saves
 * the files (several as a ZIP archive, in folders from slash-separated layer names).
 */
export function ExportSection({ nodes }: { nodes: readonly SceneNode[] }) {
  const editor = useEditor();
  const ids = nodes.map((n) => n.id);
  // A GIF export copies the layer's own animated GIF, so it is offered only while every selected layer has one.
  const canExportGif = nodes.length > 0 && nodes.every((n) => animatedGifHash(editor, n.id) !== undefined);
  const serialized = new Set(nodes.map((n) => JSON.stringify(n.exportSettings ?? [])));
  const mixed = serialized.size > 1;
  const settings: readonly ExportSetting[] = mixed ? [] : (nodes[0]?.exportSettings ?? []);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  // The preview's object URL is released when it changes or the section goes away.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const exportNow = async () => {
    const assets = await renderExportsWithText(editor, ids);
    if (assets === null) {
      setStatus('The rendering engine is still loading.');
      return;
    }
    if (assets.length === 0) {
      setStatus('Nothing to export: the layers have no visible area.');
      return;
    }
    saveExports(assets, nodes.length === 1 ? baseName(nodes[0]!.name) || 'Export' : 'Export');
    const left = [...new Set(assets.flatMap((asset) => asset.skipped ?? []))];
    setStatus(`${assets.length === 1 ? `Exported ${baseName(assets[0]!.path)}` : `Exported ${assets.length} files`}${left.length > 0 ? `. Left out of the SVG: ${left.join(', ')}` : ''}`);
  };
  const togglePreview = async () => {
    if (preview) {
      setPreview(null);
      return;
    }
    const [first] = (await renderExportsWithText(editor, ids.slice(0, 1), new Set([`${ids[0]}:0`]))) ?? [];
    if (first) setPreview(URL.createObjectURL(new Blob([first.bytes as BlobPart], { type: first.type })));
  };

  return (
    <section className={styles.section} aria-label="Export">
      <header className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Export</h3>
        <div className={styles.sectionActions}>
          <IconButton icon="plus" label="Add export" onClick={() => addExportSetting(editor, ids)} />
        </div>
      </header>
      {(mixed || settings.length > 0) && (
        <div className={styles.sectionBody}>
          {mixed && <p className={styles.hint}>Click + to replace mixed export settings</p>}
          <datalist id={SCALE_PRESETS_ID}>
            {EXPORT_SCALE_PRESETS.map((preset) => (
              <option key={preset} value={preset} />
            ))}
          </datalist>
          {settings.map((setting, index) => {
            const name = `Export ${index + 1}`;
            const change = (patch: Partial<ExportSetting>) => updateExportSetting(editor, ids, index, patch);
            return (
              <div key={index} className={styles.exportRow} role="group" aria-label={name}>
                <ScaleInput label={`${name} scale`} setting={setting} onChange={change} />
                <input
                  className={primitives.textInput}
                  aria-label={`${name} suffix`}
                  placeholder="Suffix"
                  defaultValue={setting.suffix}
                  key={`${index}-${setting.suffix}`}
                  spellCheck={false}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  onBlur={(e) => {
                    if (e.currentTarget.value !== setting.suffix) change({ suffix: e.currentTarget.value });
                  }}
                />
                <select className={primitives.select} aria-label={`${name} format`} value={setting.format} onChange={(e) => change({ format: e.target.value as ExportFormat })}>
                  {EXPORT_FORMATS.filter((format) => format !== 'GIF' || canExportGif || setting.format === 'GIF').map((format) => (
                    <option key={format} value={format}>
                      {EXPORT_FORMAT_LABELS[format]}
                    </option>
                  ))}
                </select>
                <IconButton icon="minus" label={`Remove ${name.toLowerCase()}`} onClick={() => removeExportSetting(editor, ids, index)} />
                <FormatSettings name={name} setting={setting} onChange={change} />
              </div>
            );
          })}
          {settings.length > 0 && (
            <div className={styles.buttonRow}>
              <button type="button" className={primitives.button} onClick={() => void exportNow()}>
                {nodes.length === 1 ? `Export ${baseName(nodes[0]!.name)}` : `Export ${nodes.length} layers`}
              </button>
              {nodes.length === 1 && (
                <button type="button" className={primitives.button} aria-pressed={preview !== null} onClick={() => void togglePreview()}>
                  Preview
                </button>
              )}
            </div>
          )}
          {preview && <img className={styles.exportPreview} src={preview} alt={`Preview of ${nodes[0]?.name ?? 'the export'}`} />}
          {status && (
            <p className={styles.hint} role="status">
              {status}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
