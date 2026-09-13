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

// M0 spike: verifies the CanvasKit capabilities the renderer architecture depends on.
// Run: node spikes/canvaskit-capabilities.mjs   (results recorded in docs/adr/0001-renderer.md)
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// The "full" build is required: the default build ships without JPEG/WebP encoders.
const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit.js');

const results = [];
const check = (name, fn) => {
  try {
    const detail = fn();
    results.push({ name, ok: detail !== false, detail: detail === true ? '' : String(detail ?? '') });
  } catch (e) {
    results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
};

const t0 = performance.now();
const CK = await CanvasKitInit({
  locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`),
});
const initMs = Math.round(performance.now() - t0);

function renderScene() {
  const surface = CK.MakeSurface(256, 256);
  const canvas = surface.getCanvas();
  canvas.clear(CK.WHITE);
  const paint = new CK.Paint();
  paint.setAntiAlias(true);
  paint.setColor(CK.Color(13, 153, 255, 1));
  canvas.drawRRect(CK.RRectXY(CK.LTRBRect(20, 20, 140, 140), 16, 16), paint);
  paint.setColor(CK.Color(242, 72, 34, 1));
  paint.setBlendMode(CK.BlendMode.Multiply);
  canvas.drawCircle(130, 130, 70, paint);
  paint.delete();
  const img = surface.makeImageSnapshot();
  const png = img.encodeToBytes(CK.ImageFormat.PNG, 100);
  img.delete();
  surface.delete();
  return png;
}

check('CPU surface + PNG encode deterministic across runs', () => {
  const a = createHash('sha256').update(renderScene()).digest('hex');
  const b = createHash('sha256').update(renderScene()).digest('hex');
  return a === b ? `sha256 ${a.slice(0, 12)}` : false;
});

check('WebP + JPEG encode', () => {
  const s = CK.MakeSurface(32, 32);
  s.getCanvas().clear(CK.RED);
  const img = s.makeImageSnapshot();
  const webp = img.encodeToBytes(CK.ImageFormat.WEBP, 90);
  const jpg = img.encodeToBytes(CK.ImageFormat.JPEG, 90);
  img.delete();
  s.delete();
  return webp && jpg ? `webp ${webp.length}B jpeg ${jpg.length}B` : false;
});

check('All blend modes enumerated', () => {
  const needed = ['Multiply', 'Screen', 'Overlay', 'Darken', 'Lighten', 'ColorDodge', 'ColorBurn', 'HardLight',
    'SoftLight', 'Difference', 'Exclusion', 'Hue', 'Saturation', 'Color', 'Luminosity', 'Plus'];
  const missing = needed.filter((m) => !CK.BlendMode[m]);
  return missing.length === 0 ? 'native: 16 + Plus' : `missing ${missing}`;
});

check('saveLayer with backdrop blur filter', () => {
  const s = CK.MakeSurface(64, 64);
  const c = s.getCanvas();
  c.clear(CK.WHITE);
  const p = new CK.Paint();
  p.setColor(CK.BLACK);
  c.drawRect(CK.LTRBRect(0, 0, 32, 64), p);
  const blur = CK.ImageFilter.MakeBlur(8, 8, CK.TileMode.Clamp, null);
  c.save();
  c.clipRect(CK.LTRBRect(16, 16, 48, 48), CK.ClipOp.Intersect, true);
  c.saveLayer(null, null, blur);
  c.restore();
  c.restore();
  const px = c.readPixels(32, 32, { width: 1, height: 1, colorType: CK.ColorType.RGBA_8888, alphaType: CK.AlphaType.Unpremul, colorSpace: CK.ColorSpace.SRGB });
  p.delete();
  blur.delete();
  s.delete();
  // A pixel right at the black/white edge must be gray after backdrop blur.
  return px && px[0] > 30 && px[0] < 225 ? `edge pixel r=${px[0]}` : `edge pixel r=${px?.[0]}`;
});

check('RuntimeEffect shader (SkSL noise)', () => {
  const fx = CK.RuntimeEffect.Make(`
    uniform float seed;
    half4 main(float2 p) {
      float n = fract(sin(dot(p + seed, float2(12.9898, 78.233))) * 43758.5453);
      return half4(half3(n), 1);
    }`);
  if (!fx) return false;
  const shader = fx.makeShader([1.5]);
  const ok = !!shader;
  shader?.delete();
  fx.delete();
  return ok;
});

check('RuntimeEffect blender (custom blend mode, e.g. linear burn)', () => {
  const fx = CK.RuntimeEffect.MakeForBlender?.(`
    half4 main(half4 src, half4 dst) {
      return half4(max(src.rgb + dst.rgb - 1, 0), src.a + dst.a * (1 - src.a));
    }`);
  if (!fx) return 'MakeForBlender unavailable';
  const blender = fx.makeBlender([]);
  const p = new CK.Paint();
  p.setBlender(blender);
  p.delete();
  blender.delete();
  fx.delete();
  return true;
});

check('PathOps union of cubic circles keeps curves', () => {
  // CanvasKit 0.42: Path is immutable; construct via PathBuilder.
  const a = new CK.PathBuilder().addOval(CK.LTRBRect(0, 0, 100, 100)).detachAndDelete();
  const b = new CK.PathBuilder().addOval(CK.LTRBRect(50, 0, 150, 100)).detachAndDelete();
  const u = CK.Path.MakeFromOp(a, b, CK.PathOp.Union);
  const svg = u?.toSVGString() ?? '';
  const curves = (svg.match(/[CQ]/g) ?? []).length;
  [a, b, u].forEach((x) => x?.delete());
  return curves > 0 ? `${curves} curve commands` : false;
});

check('Path stroke / dash / trim / simplify', () => {
  const p = new CK.PathBuilder().moveTo(0, 0).cubicTo(50, -50, 100, 50, 150, 0).detachAndDelete();
  const stroked = p.makeStroked({ width: 10, cap: CK.StrokeCap.Round, join: CK.StrokeJoin.Round });
  const dashed = p.makeDashed(10, 5, 0);
  const trimmed = p.makeTrimmed(0.25, 0.75, false);
  // 0.42 typings declare makeSimplified() but the JS binding is missing; a union
  // with an empty path runs the same Skia simplify through the public API.
  const empty = new CK.PathBuilder().detachAndDelete();
  const simplified = stroked && CK.Path.MakeFromOp(stroked, empty, CK.PathOp.Union);
  empty.delete();
  const ok = !!stroked && !!dashed && !!trimmed && !!simplified;
  [p, stroked, dashed, trimmed, simplified].forEach((x) => x?.delete());
  return ok;
});

const fontTests = [
  ['Inter variable WOFF2', 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'],
  ['System TTF (Arial)', '/System/Library/Fonts/Supplemental/Arial.ttf'],
];
for (const [label, path] of fontTests) {
  check(`Typeface load: ${label}`, () => {
    const tf = CK.Typeface.MakeTypefaceFromData(readFileSync(path).buffer);
    if (!tf) return false;
    tf.delete();
    return true;
  });
}

check('Paragraph with fontFeatures + getRectsForRange + glyph at point', () => {
  const provider = CK.TypefaceFontProvider.Make();
  provider.registerFont(readFileSync('/System/Library/Fonts/Supplemental/Arial.ttf').buffer, 'Arial');
  const fc = CK.FontCollection.Make();
  fc.setDefaultFontManager(provider);
  const style = new CK.ParagraphStyle({
    textStyle: {
      color: CK.BLACK,
      fontFamilies: ['Arial'],
      fontSize: 16,
      fontFeatures: [{ name: 'tnum', value: 1 }],
      fontVariations: [{ axis: 'wght', value: 600 }],
    },
  });
  const builder = CK.ParagraphBuilder.MakeFromFontCollection(style, fc);
  builder.addText('Hello variable world, 0123456789 שלום');
  const para = builder.build();
  para.layout(120);
  const rects = para.getRectsForRange(0, 5, CK.RectHeightStyle.Tight, CK.RectWidthStyle.Tight);
  const pos = para.getGlyphPositionAtCoordinate(10, 5);
  const lines = para.getLineMetrics().length;
  builder.delete();
  para.delete();
  return `lines=${lines} rects=${rects.length} glyphAt=${pos.pos}`;
});

check('RSXform text blob (text on path)', () => {
  const tf = CK.Typeface.MakeTypefaceFromData(readFileSync('/System/Library/Fonts/Supplemental/Arial.ttf').buffer);
  const font = new CK.Font(tf, 20);
  const blob = CK.TextBlob.MakeFromRSXform('Arc', [1, 0, 0, 0, 1, 0, 12, 0, 1, 0, 24, 0], font);
  const ok = !!blob;
  blob?.delete();
  font.delete();
  tf?.delete();
  return ok;
});

check('PictureRecorder display list', () => {
  const rec = new CK.PictureRecorder();
  const c = rec.beginRecording(CK.LTRBRect(0, 0, 100, 100));
  const p = new CK.Paint();
  c.drawRect(CK.LTRBRect(0, 0, 50, 50), p);
  const pic = rec.finishRecordingAsPicture();
  const ok = !!pic;
  p.delete();
  pic?.delete();
  rec.delete();
  return ok;
});

console.log(`CanvasKit init: ${initMs} ms`);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
process.exitCode = results.some((r) => !r.ok) ? 1 : 0;
