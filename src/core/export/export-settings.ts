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

// Export settings are validated in the document schema, which configures zod first (constructing schemas here, before
// that configuration, would make them probe `eval`, which the Content Security Policy reports).
import type { ExportConstraint, ExportSetting } from '../schema/document';

export type { ExportConstraint, ExportSetting };

/** Raster export formats: PNG (with transparency), JPG (on white) and WebP. */
export const EXPORT_FORMATS = ['PNG', 'JPG', 'WEBP'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_FORMAT_LABELS: Readonly<Record<ExportFormat, string>> = { PNG: 'PNG', JPG: 'JPG', WEBP: 'WebP' };
const EXTENSIONS: Readonly<Record<ExportFormat, string>> = { PNG: 'png', JPG: 'jpg', WEBP: 'webp' };
export const EXPORT_MIME_TYPES: Readonly<Record<ExportFormat, string>> = { PNG: 'image/png', JPG: 'image/jpeg', WEBP: 'image/webp' };

/** Scale presets offered in the Export section. */
export const EXPORT_SCALE_PRESETS: readonly string[] = ['0.5x', '0.75x', '1x', '1.5x', '2x', '3x', '4x', '512w', '512h'];

/** The largest bitmap an export makes, per side, in pixels. */
export const MAX_EXPORT_SIDE = 16_384;

export const defaultExportSetting = (): ExportSetting => ({ format: 'PNG', suffix: '', constraint: { type: 'SCALE', value: 1 } });

/**
 * Parses a scale as typed in the Export section: a number followed by `x` is a multiplier, `w` a fixed width and `h` a
 * fixed height (in pixels); a bare number is a multiplier. Null when it isn't one of those.
 */
export function parseExportConstraint(input: string): ExportConstraint | null {
  const match = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*([xwh]?)\s*$/i.exec(input);
  if (!match) return null;
  const value = Number(match[1]);
  if (!(value > 0) || value > 100_000) return null;
  const unit = match[2]!.toLowerCase();
  return { type: unit === 'w' ? 'WIDTH' : unit === 'h' ? 'HEIGHT' : 'SCALE', value };
}

/** A constraint as shown in the Export section (`2x`, `512w`, `100h`). */
export function formatExportConstraint(constraint: ExportConstraint): string {
  const value = Number.isInteger(constraint.value) ? String(constraint.value) : String(Math.round(constraint.value * 1000) / 1000);
  return `${value}${constraint.type === 'WIDTH' ? 'w' : constraint.type === 'HEIGHT' ? 'h' : 'x'}`;
}

/** The pixel scale of an export of something `width` × `height` wide, capped so neither side exceeds MAX_EXPORT_SIDE. */
export function exportScale(constraint: ExportConstraint, width: number, height: number): number {
  const scale = constraint.type === 'WIDTH' ? constraint.value / Math.max(width, 1e-6) : constraint.type === 'HEIGHT' ? constraint.value / Math.max(height, 1e-6) : constraint.value;
  const largest = Math.max(width, height) * scale;
  return largest > MAX_EXPORT_SIDE ? MAX_EXPORT_SIDE / Math.max(width, height) : scale;
}

/** Replaces characters file systems don't allow in names (control characters and <>:"\\|?*) with underscores. */
const safeName = (text: string): string => [...text].map((c) => (c.charCodeAt(0) < 32 || '<>:"\\|?*'.includes(c) ? '_' : c)).join('');

/**
 * The path of an exported file: the layer name's slash-separated parts become nested folders, the last part the file
 * name, followed by the suffix and the format's extension (`button/pill/default` → `button/pill/default@2x.png`).
 */
export function exportFileName(layerName: string, setting: ExportSetting): string {
  const parts = layerName
    .split('/')
    .map((part) => safeName(part).trim())
    .filter((part) => part !== '' && part !== '.' && part !== '..');
  const path = parts.length > 0 ? parts : ['Untitled'];
  const suffix = safeName(setting.suffix).replaceAll('/', '_');
  return `${path.join('/')}${suffix}.${EXTENSIONS[setting.format]}`;
}

/** Makes file paths unique by numbering repeats before the extension (`icon.png`, `icon 2.png`). */
export function uniqueFileNames(paths: readonly string[]): string[] {
  const used = new Set<string>();
  return paths.map((path) => {
    if (!used.has(path)) {
      used.add(path);
      return path;
    }
    const dot = path.lastIndexOf('.');
    const [base, extension] = dot > path.lastIndexOf('/') ? [path.slice(0, dot), path.slice(dot)] : [path, ''];
    for (let i = 2; ; i++) {
      const candidate = `${base} ${i}${extension}`;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
  });
}
