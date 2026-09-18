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

import { describe, expect, test } from 'vitest';
import { pdfFromJpeg } from './pdf-document';

/** Bytes standing in for a JPEG; the writer carries them through without reading them. */
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const read = (pdf: Uint8Array) => String.fromCharCode(...pdf);

describe('a PDF carrying a layer', () => {
  test('it is a one-page PDF whose page is the layer’s size in points', () => {
    const text = read(pdfFromJpeg(jpeg, 120, 80, 240, 160));
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/MediaBox [0 0 120 80]');
    expect(text).toContain('/Count 1');
    expect(text).toContain('120 0 0 80 0 0 cm');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  test('the image is carried as the JPEG it was given, at its own pixel size', () => {
    const pdf = pdfFromJpeg(jpeg, 10, 10, 20, 20);
    const text = read(pdf);
    expect(text).toContain('/Filter /DCTDecode');
    expect(text).toContain('/Width 20');
    expect(text).toContain('/Height 20');
    expect(text).toContain(`/Length ${jpeg.length}`);
    // The bytes themselves are in there, between the stream markers.
    const start = text.indexOf('stream\n', text.indexOf('/DCTDecode')) + 'stream\n'.length;
    expect([...pdf.slice(start, start + jpeg.length)]).toEqual([...jpeg]);
  });

  test('the cross-reference table points at where each object really starts', () => {
    const pdf = pdfFromJpeg(jpeg, 10, 10, 20, 20);
    const text = read(pdf);
    const xref = text.slice(text.indexOf('xref\n'));
    const offsets = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((offset, i) => {
      expect(text.slice(offset)).toMatch(new RegExp(`^${i + 1} 0 obj`));
    });
    // startxref points at the table itself.
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe('xref');
  });
});
