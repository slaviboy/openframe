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

/** A color with channels from 0 to 1. */
export interface SvgColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** An SVG paint value: no paint, a color, the current color, or a reference to a paint server (a gradient or pattern). */
export type SvgPaintValue =
  | { readonly kind: 'none' }
  | { readonly kind: 'color'; readonly color: SvgColor }
  | { readonly kind: 'currentColor' }
  | { readonly kind: 'reference'; readonly id: string };

/** The CSS named colors (and SVG's), as hex. */
const NAMED = Object.fromEntries(
  (
    'aliceblue:f0f8ff,antiquewhite:faebd7,aqua:00ffff,aquamarine:7fffd4,azure:f0ffff,beige:f5f5dc,bisque:ffe4c4,black:000000,' +
    'blanchedalmond:ffebcd,blue:0000ff,blueviolet:8a2be2,brown:a52a2a,burlywood:deb887,cadetblue:5f9ea0,chartreuse:7fff00,' +
    'chocolate:d2691e,coral:ff7f50,cornflowerblue:6495ed,cornsilk:fff8dc,crimson:dc143c,cyan:00ffff,darkblue:00008b,darkcyan:008b8b,' +
    'darkgoldenrod:b8860b,darkgray:a9a9a9,darkgreen:006400,darkgrey:a9a9a9,darkkhaki:bdb76b,darkmagenta:8b008b,darkolivegreen:556b2f,' +
    'darkorange:ff8c00,darkorchid:9932cc,darkred:8b0000,darksalmon:e9967a,darkseagreen:8fbc8f,darkslateblue:483d8b,darkslategray:2f4f4f,' +
    'darkslategrey:2f4f4f,darkturquoise:00ced1,darkviolet:9400d3,deeppink:ff1493,deepskyblue:00bfff,dimgray:696969,dimgrey:696969,' +
    'dodgerblue:1e90ff,firebrick:b22222,floralwhite:fffaf0,forestgreen:228b22,fuchsia:ff00ff,gainsboro:dcdcdc,ghostwhite:f8f8ff,' +
    'gold:ffd700,goldenrod:daa520,gray:808080,green:008000,greenyellow:adff2f,grey:808080,honeydew:f0fff0,hotpink:ff69b4,' +
    'indianred:cd5c5c,indigo:4b0082,ivory:fffff0,khaki:f0e68c,lavender:e6e6fa,lavenderblush:fff0f5,lawngreen:7cfc00,lemonchiffon:fffacd,' +
    'lightblue:add8e6,lightcoral:f08080,lightcyan:e0ffff,lightgoldenrodyellow:fafad2,lightgray:d3d3d3,lightgreen:90ee90,lightgrey:d3d3d3,' +
    'lightpink:ffb6c1,lightsalmon:ffa07a,lightseagreen:20b2aa,lightskyblue:87cefa,lightslategray:778899,lightslategrey:778899,' +
    'lightsteelblue:b0c4de,lightyellow:ffffe0,lime:00ff00,limegreen:32cd32,linen:faf0e6,magenta:ff00ff,maroon:800000,' +
    'mediumaquamarine:66cdaa,mediumblue:0000cd,mediumorchid:ba55d3,mediumpurple:9370db,mediumseagreen:3cb371,mediumslateblue:7b68ee,' +
    'mediumspringgreen:00fa9a,mediumturquoise:48d1cc,mediumvioletred:c71585,midnightblue:191970,mintcream:f5fffa,mistyrose:ffe4e1,' +
    'moccasin:ffe4b5,navajowhite:ffdead,navy:000080,oldlace:fdf5e6,olive:808000,olivedrab:6b8e23,orange:ffa500,orangered:ff4500,' +
    'orchid:da70d6,palegoldenrod:eee8aa,palegreen:98fb98,paleturquoise:afeeee,palevioletred:db7093,papayawhip:ffefd5,peachpuff:ffdab9,' +
    'peru:cd853f,pink:ffc0cb,plum:dda0dd,powderblue:b0e0e6,purple:800080,rebeccapurple:663399,red:ff0000,rosybrown:bc8f8f,' +
    'royalblue:4169e1,saddlebrown:8b4513,salmon:fa8072,sandybrown:f4a460,seagreen:2e8b57,seashell:fff5ee,sienna:a0522d,silver:c0c0c0,' +
    'skyblue:87ceeb,slateblue:6a5acd,slategray:708090,slategrey:708090,snow:fffafa,springgreen:00ff7f,steelblue:4682b4,tan:d2b48c,' +
    'teal:008080,thistle:d8bfd8,tomato:ff6347,turquoise:40e0d0,violet:ee82ee,wheat:f5deb3,white:ffffff,whitesmoke:f5f5f5,' +
    'yellow:ffff00,yellowgreen:9acd32'
  )
    .split(',')
    .map((pair) => pair.split(':') as [string, string]),
);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function fromHex(hex: string): SvgColor | null {
  if (!/^[0-9a-f]+$/i.test(hex)) return null;
  const expanded = hex.length === 3 || hex.length === 4 ? [...hex].map((c) => c + c).join('') : hex;
  if (expanded.length !== 6 && expanded.length !== 8) return null;
  const channel = (i: number) => parseInt(expanded.slice(i, i + 2), 16) / 255;
  return { r: channel(0), g: channel(2), b: channel(4), a: expanded.length === 8 ? channel(6) : 1 };
}

/** A number, or a percentage of `scale` (for rgb channels 255, for alpha 1). */
function component(text: string, scale: number): number | null {
  const match = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(%?)$/i.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return match[2] === '%' ? (value / 100) * scale : value;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const f = (n: number) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

/** Parses a color function's arguments: comma or space separated, with an optional `/ alpha`. */
function functionArguments(body: string): { values: string[]; alpha: string | undefined } | null {
  const [main, alpha, extra] = body.split('/');
  if (extra !== undefined || main === undefined) return null;
  const values = main.includes(',') ? main.split(',').map((part) => part.trim()) : main.trim().split(/\s+/);
  if (values.length === 4 && alpha === undefined) return { values: values.slice(0, 3), alpha: values[3] };
  return values.length === 3 ? { values, alpha: alpha?.trim() } : null;
}

/** An SVG or CSS color value (hex, rgb(), rgba(), hsl(), hsla(), a named color or transparent); null when it isn't one. */
export function parseSvgColor(value: string): SvgColor | null {
  const text = value.trim().toLowerCase();
  if (text.startsWith('#')) return fromHex(text.slice(1));
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (NAMED[text]) return fromHex(NAMED[text]!);
  const call = /^(rgba?|hsla?)\((.*)\)$/.exec(text);
  if (!call) return null;
  const args = functionArguments(call[2]!);
  if (!args) return null;
  const alpha = args.alpha === undefined ? 1 : component(args.alpha, 1);
  if (alpha === null) return null;
  if (call[1]!.startsWith('rgb')) {
    const channels = args.values.map((part) => component(part, 255));
    if (channels.some((c) => c === null)) return null;
    const [r, g, b] = channels as [number, number, number];
    return { r: clamp01(r / 255), g: clamp01(g / 255), b: clamp01(b / 255), a: clamp01(alpha) };
  }
  const hue = Number(args.values[0]!.replace(/deg$/, ''));
  const saturation = component(args.values[1]!, 1);
  const lightness = component(args.values[2]!, 1);
  if (!Number.isFinite(hue) || saturation === null || lightness === null || !args.values[1]!.endsWith('%') || !args.values[2]!.endsWith('%')) return null;
  const [r, g, b] = hslToRgb(((hue % 360) + 360) % 360, clamp01(saturation), clamp01(lightness));
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(alpha) };
}

/** An SVG paint (a `fill` or `stroke` value): none, a color, currentColor or a url() reference; null when it isn't valid. */
export function parseSvgPaint(value: string): SvgPaintValue | null {
  const text = value.trim();
  if (text.toLowerCase() === 'none') return { kind: 'none' };
  if (text.toLowerCase() === 'currentcolor') return { kind: 'currentColor' };
  const reference = /^url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/i.exec(text);
  if (reference) return { kind: 'reference', id: reference[2]! };
  const color = parseSvgColor(text);
  return color ? { kind: 'color', color } : null;
}
