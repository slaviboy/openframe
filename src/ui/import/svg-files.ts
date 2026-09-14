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

import { importSvg, type SvgElement } from '@/core/import/svg-import';
import type { PlaceableSvg } from '@/editor/commands/import-svg';
import { imageLayerName } from '../images/import-image';

export const SVG_MIME = 'image/svg+xml';
/** The largest SVG file imported. */
export const MAX_SVG_BYTES = 10 * 1024 * 1024;
const MAX_DEPTH = 64;

export class SvgImportError extends Error {
  override name = 'SvgImportError';
}

export const isSvgFile = (file: File): boolean => file.type === SVG_MIME || /\.svg$/i.test(file.name);

/** SVG files in a DataTransfer (drop or paste), in order. */
export const svgFilesOf = (data: DataTransfer | null): File[] => (data ? Array.from(data.files).filter(isSvgFile) : []);

/** Whether text is SVG markup (as other design tools copy it): an `<svg>` root after an optional XML declaration, comments and doctype. */
export const isSvgMarkup = (text: string): boolean => /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>/]/i.test(text);

/** SVG markup as a file, for importing pasted markup like a dropped file. */
export const svgMarkupFile = (text: string): File => new File([text], 'SVG.svg', { type: SVG_MIME });

function toElement(element: Element, depth: number): SvgElement {
  const attributes: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) attributes[attribute.name] = attribute.value;
  return { tag: element.localName, attributes, children: depth < MAX_DEPTH ? Array.from(element.children, (child) => toElement(child, depth + 1)) : [] };
}

/** SVG markup as an element tree; null when it isn't well-formed SVG. Parsing doesn't run scripts or load resources. */
export function parseSvgMarkup(text: string): SvgElement | null {
  const doc = new DOMParser().parseFromString(text, SVG_MIME);
  if (doc.getElementsByTagName('parsererror').length > 0) return null;
  const root = doc.documentElement;
  return root.localName === 'svg' ? toElement(root, 0) : null;
}

/** Reads an SVG file for import, named after the file. */
export async function readSvgFile(file: File): Promise<PlaceableSvg> {
  if (file.size > MAX_SVG_BYTES) throw new SvgImportError(`${file.name} is too large to import.`);
  const root = parseSvgMarkup(await file.text());
  const svg = root && importSvg(root);
  if (!svg) throw new SvgImportError(`${file.name} is not a valid SVG file.`);
  return { name: imageLayerName(file.name), svg };
}
