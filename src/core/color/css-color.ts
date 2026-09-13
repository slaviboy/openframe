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

import { hslToRgb, parseHex, type ColorProfile, type RGBA } from './color';

/** A parsed CSS color: channels in the color space it was written in (sRGB or Display P3), alpha 0–1. */
export interface ParsedCssColor {
  readonly color: RGBA;
  readonly space: 'srgb' | 'display-p3';
}

// CSS Color Module Level 4 named colors.
const NAMED =
  'aliceblue:f0f8ff,antiquewhite:faebd7,aqua:00ffff,aquamarine:7fffd4,azure:f0ffff,beige:f5f5dc,bisque:ffe4c4,black:000000,' +
  'blanchedalmond:ffebcd,blue:0000ff,blueviolet:8a2be2,brown:a52a2a,burlywood:deb887,cadetblue:5f9ea0,chartreuse:7fff00,' +
  'chocolate:d2691e,coral:ff7f50,cornflowerblue:6495ed,cornsilk:fff8dc,crimson:dc143c,cyan:00ffff,darkblue:00008b,' +
  'darkcyan:008b8b,darkgoldenrod:b8860b,darkgray:a9a9a9,darkgreen:006400,darkgrey:a9a9a9,darkkhaki:bdb76b,darkmagenta:8b008b,' +
  'darkolivegreen:556b2f,darkorange:ff8c00,darkorchid:9932cc,darkred:8b0000,darksalmon:e9967a,darkseagreen:8fbc8f,' +
  'darkslateblue:483d8b,darkslategray:2f4f4f,darkslategrey:2f4f4f,darkturquoise:00ced1,darkviolet:9400d3,deeppink:ff1493,' +
  'deepskyblue:00bfff,dimgray:696969,dimgrey:696969,dodgerblue:1e90ff,firebrick:b22222,floralwhite:fffaf0,forestgreen:228b22,' +
  'fuchsia:ff00ff,gainsboro:dcdcdc,ghostwhite:f8f8ff,gold:ffd700,goldenrod:daa520,gray:808080,green:008000,greenyellow:adff2f,' +
  'grey:808080,honeydew:f0fff0,hotpink:ff69b4,indianred:cd5c5c,indigo:4b0082,ivory:fffff0,khaki:f0e68c,lavender:e6e6fa,' +
  'lavenderblush:fff0f5,lawngreen:7cfc00,lemonchiffon:fffacd,lightblue:add8e6,lightcoral:f08080,lightcyan:e0ffff,' +
  'lightgoldenrodyellow:fafad2,lightgray:d3d3d3,lightgreen:90ee90,lightgrey:d3d3d3,lightpink:ffb6c1,lightsalmon:ffa07a,' +
  'lightseagreen:20b2aa,lightskyblue:87cefa,lightslategray:778899,lightslategrey:778899,lightsteelblue:b0c4de,lightyellow:ffffe0,' +
  'lime:00ff00,limegreen:32cd32,linen:faf0e6,magenta:ff00ff,maroon:800000,mediumaquamarine:66cdaa,mediumblue:0000cd,' +
  'mediumorchid:ba55d3,mediumpurple:9370db,mediumseagreen:3cb371,mediumslateblue:7b68ee,mediumspringgreen:00fa9a,' +
  'mediumturquoise:48d1cc,mediumvioletred:c71585,midnightblue:191970,mintcream:f5fffa,mistyrose:ffe4e1,moccasin:ffe4b5,' +
  'navajowhite:ffdead,navy:000080,oldlace:fdf5e6,olive:808000,olivedrab:6b8e23,orange:ffa500,orangered:ff4500,orchid:da70d6,' +
  'palegoldenrod:eee8aa,palegreen:98fb98,paleturquoise:afeeee,palevioletred:db7093,papayawhip:ffefd5,peachpuff:ffdab9,' +
  'peru:cd853f,pink:ffc0cb,plum:dda0dd,powderblue:b0e0e6,purple:800080,rebeccapurple:663399,red:ff0000,rosybrown:bc8f8f,' +
  'royalblue:4169e1,saddlebrown:8b4513,salmon:fa8072,sandybrown:f4a460,seagreen:2e8b57,seashell:fff5ee,sienna:a0522d,' +
  'silver:c0c0c0,skyblue:87ceeb,slateblue:6a5acd,slategray:708090,slategrey:708090,snow:fffafa,springgreen:00ff7f,' +
  'steelblue:4682b4,tan:d2b48c,teal:008080,thistle:d8bfd8,tomato:ff6347,turquoise:40e0d0,violet:ee82ee,wheat:f5deb3,' +
  'white:ffffff,whitesmoke:f5f5f5,yellow:ffff00,yellowgreen:9acd32';
let namedColors: Map<string, string> | null = null;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A number or percentage; `scale` is the value 100% maps to. */
function component(token: string | undefined, scale: number): number | null {
  if (token === undefined || token === '') return null;
  if (token.toLowerCase() === 'none') return 0;
  const percent = token.endsWith('%');
  const n = Number(percent ? token.slice(0, -1) : token);
  if (!Number.isFinite(n)) return null;
  return percent ? (n / 100) * scale : n;
}

function hueDegrees(token: string | undefined): number | null {
  if (token === undefined) return null;
  const m = /^(-?[\d.]+(?:e-?\d+)?)(deg|rad|grad|turn)?$/i.exec(token);
  if (!m) return token.toLowerCase() === 'none' ? 0 : null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  switch (m[2]?.toLowerCase()) {
    case 'rad':
      return (n * 180) / Math.PI;
    case 'grad':
      return n * 0.9;
    case 'turn':
      return n * 360;
    default:
      return n;
  }
}

/**
 * Parses a CSS color: hex (`#rgb`, `#rrggbbaa`, or bare hex digits), `rgb()`/`rgba()` and
 * `hsl()`/`hsla()` in comma or space syntax, `color(srgb …)` and `color(display-p3 …)`, named colors
 * and `transparent`. Returns null for anything else.
 */
export function parseCssColor(input: string): ParsedCssColor | null {
  const text = input.trim().toLowerCase().replace(/;$/, '').trim();
  if (text === '') return null;
  if (text === 'transparent') return { color: { r: 0, g: 0, b: 0, a: 0 }, space: 'srgb' };
  namedColors ??= new Map(NAMED.split(',').map((entry) => entry.split(':') as [string, string]));
  const named = namedColors.get(text);
  if (named) return { color: parseHex(named)!, space: 'srgb' };
  if (/^#?[0-9a-f]+$/.test(text)) {
    const hex = parseHex(text);
    return hex ? { color: hex, space: 'srgb' } : null;
  }
  const fn = /^(rgba?|hsla?|color)\((.*)\)$/.exec(text);
  if (!fn) return null;
  const kind = fn[1]!;
  const tokens = fn[2]!.replace(/,/g, ' ').replace(/\//g, ' / ').trim().split(/\s+/);
  let space: ParsedCssColor['space'] = 'srgb';
  if (kind === 'color') {
    const name = tokens.shift();
    if (name === 'display-p3') space = 'display-p3';
    else if (name !== 'srgb') return null;
  }
  const slash = tokens.indexOf('/');
  const channels = slash >= 0 ? tokens.slice(0, slash) : tokens.slice(0, 3);
  const alphaToken = slash >= 0 ? tokens[slash + 1] : tokens[3];
  const extra = slash >= 0 ? tokens.length - slash - 2 : tokens.length - 4;
  if (channels.length !== 3 || extra > 0 || (slash >= 0 && alphaToken === undefined)) return null;
  const alpha = alphaToken === undefined ? 1 : component(alphaToken, 1);
  if (alpha === null) return null;

  if (kind.startsWith('hsl')) {
    const h = hueDegrees(channels[0]);
    const s = component(channels[1], 100);
    const l = component(channels[2], 100);
    if (h === null || s === null || l === null) return null;
    return { color: hslToRgb({ h, s: clamp01(s / 100), l: clamp01(l / 100) }, clamp01(alpha)), space };
  }
  // rgb() channels are 0–255; color() channels are 0–1.
  const scale = kind === 'color' ? 1 : 255;
  const values = channels.map((t) => component(t, scale));
  if (values.some((v) => v === null)) return null;
  const [r, g, b] = values.map((v) => clamp01(v! / scale)) as [number, number, number];
  return { color: { r, g, b, a: clamp01(alpha) }, space };
}

const round = (v: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/**
 * CSS text for a color with its opacity, as shown by the color picker's CSS format:
 * `rgba(R, G, B, A)` in sRGB files, `color(display-p3 r g b / a)` in Display P3 files.
 */
export function formatCssColor(color: RGBA, opacity: number, profile: ColorProfile): string {
  const a = round(clamp01(opacity), 2);
  if (profile === 'DISPLAY_P3') {
    return `color(display-p3 ${round(clamp01(color.r), 4)} ${round(clamp01(color.g), 4)} ${round(clamp01(color.b), 4)} / ${a})`;
  }
  const c255 = (v: number) => Math.round(clamp01(v) * 255);
  return `rgba(${c255(color.r)}, ${c255(color.g)}, ${c255(color.b)}, ${a})`;
}
