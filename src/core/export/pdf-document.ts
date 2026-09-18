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

/**
 * A one-page PDF holding a JPEG image.
 *
 * The rendering engine has no PDF of its own, so a layer is drawn to a JPEG and that image is carried in a PDF
 * whose page is the layer's own size in points (one design pixel to one point). The image is the picture rather
 * than the shapes, so text in it is not selectable and the drawing does not scale without loss — which is what
 * the feature matrix records.
 */
export function pdfFromJpeg(jpeg: Uint8Array, pageWidth: number, pageHeight: number, pixelWidth: number, pixelHeight: number): Uint8Array {
  const width = round(pageWidth);
  const height = round(pageHeight);
  const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;

  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (bytes: Uint8Array) => {
    parts.push(bytes);
    length += bytes.length;
  };
  // PDF syntax is ASCII, and the core carries no web types, so the bytes are taken straight off the string.
  const text = (value: string) => {
    const bytes = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff;
    push(bytes);
  };
  /** Starts an object, remembering where it begins so the cross-reference table can point at it. */
  const object = (index: number, body: string) => {
    offsets[index] = length;
    text(`${index} 0 obj\n${body}\n`);
  };

  text('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj`);

  // The image itself, carried as the JPEG bytes the engine produced (DCTDecode is JPEG).
  offsets[4] = length;
  text(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.round(pixelWidth)} /Height ${Math.round(pixelHeight)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  text('\nendstream\nendobj\n');

  offsets[5] = length;
  text(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

  // The cross-reference table says where every object starts, which is why the offsets are counted in bytes.
  const start = length;
  const entries = ['0000000000 65535 f \n', ...[1, 2, 3, 4, 5].map((i) => `${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`)];
  text(`xref\n0 6\n${entries.join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** PDF numbers are written plainly, so a size is rounded rather than left in exponent form. */
const round = (value: number): string => String(Math.round(Math.max(1, value) * 100) / 100);
