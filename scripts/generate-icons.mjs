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

// Generates the PWA icons (own artwork) with CanvasKit, fully offline.
// Run: npm run icons   → public/icons/icon-192.png, icon-512.png, icon-maskable-512.png, icon.svg
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit.js');
const CK = await CanvasKitInit({ locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`) });

const BG = [30, 30, 30];
const TILES = [
  { x: 5, y: 5, r: 1.5, color: [13, 153, 255] },
  { x: 13, y: 5, r: 3, color: [20, 174, 92] },
  { x: 5, y: 13, r: 3, color: [151, 71, 255] },
  { x: 13, y: 13, r: 0.5, color: [255, 205, 41] },
];

/** Logo on a 24-unit grid scaled into `size`, with `inset` fraction of padding (maskable safe zone). */
function drawIcon(size, inset, rounded) {
  const surface = CK.MakeSurface(size, size);
  const canvas = surface.getCanvas();
  canvas.clear(CK.TRANSPARENT);
  const paint = new CK.Paint();
  paint.setAntiAlias(true);
  paint.setColor(CK.Color(...BG, 1));
  if (rounded) canvas.drawRRect(CK.RRectXY(CK.LTRBRect(0, 0, size, size), size * 0.22, size * 0.22), paint);
  else canvas.drawRect(CK.LTRBRect(0, 0, size, size), paint);
  const unit = (size * (1 - inset * 2)) / 14;
  const offset = size * inset - 5 * unit;
  for (const t of TILES) {
    paint.setColor(CK.Color(...t.color, 1));
    const l = offset + t.x * unit;
    const top = offset + t.y * unit;
    canvas.drawRRect(CK.RRectXY(CK.LTRBRect(l, top, l + 6 * unit, top + 6 * unit), t.r * unit, t.r * unit), paint);
  }
  paint.delete();
  const image = surface.makeImageSnapshot();
  const png = image.encodeToBytes(CK.ImageFormat.PNG, 100);
  image.delete();
  surface.delete();
  return png;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect width="24" height="24" rx="5.3" fill="rgb(${BG.join(',')})"/>
  ${TILES.map((t) => `<rect x="${t.x}" y="${t.y}" width="6" height="6" rx="${t.r}" fill="rgb(${t.color.join(',')})"/>`).join('\n  ')}
</svg>
`;

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', drawIcon(192, 0.14, true));
writeFileSync('public/icons/icon-512.png', drawIcon(512, 0.14, true));
writeFileSync('public/icons/icon-maskable-512.png', drawIcon(512, 0.22, false));
writeFileSync('public/icons/icon.svg', svg);
console.log('Icons written to public/icons');
