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

import type { CursorKind } from '@/editor/tools/types';

/**
 * Custom canvas cursors (own artwork) as inline SVG data URIs, so they work offline and
 * under the CSP (`img-src data:`). The rotate cursor is a curved double arrow drawn with a
 * white outline for contrast on any canvas color; rotated per corner.
 */
function rotateSvg(degrees: number): string {
  const arc = 'M7 15a8 8 0 0 1 8-8';
  const heads = 'M4.5 12.5 7 16l3-2.6M12.5 4.5 16 7l-2.6 3';
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>` +
    `<g transform='rotate(${degrees} 12 12)' fill='none' stroke-linecap='round' stroke-linejoin='round'>` +
    `<path d='${arc}' stroke='white' stroke-width='4'/><path d='${heads}' stroke='white' stroke-width='3.5'/>` +
    `<path d='${arc}' stroke='black' stroke-width='1.5'/><path d='${heads}' stroke='black' stroke-width='1.5'/>` +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, auto`;
}

const ROTATE: Record<'rotate-nw' | 'rotate-ne' | 'rotate-se' | 'rotate-sw', string> = {
  'rotate-nw': rotateSvg(0),
  'rotate-ne': rotateSvg(90),
  'rotate-se': rotateSvg(180),
  'rotate-sw': rotateSvg(270),
};

/**
 * The Paint tool's droplet, its tip at the point it would paint: filled in where a click adds the paint, hollow
 * where it would take a region's fill away again. Drawn with a white outline, as the rotate cursor is.
 */
function dropletSvg(filled: boolean): string {
  const drop = 'M6 2c0 0 5 5.2 5 8.4A5 5 0 0 1 1 10.4C1 7.2 6 2 6 2Z';
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>` +
    `<g transform='translate(0 1)' stroke-linecap='round' stroke-linejoin='round'>` +
    `<path d='${drop}' fill='none' stroke='white' stroke-width='4'/>` +
    `<path d='${drop}' fill='${filled ? 'black' : 'white'}' stroke='black' stroke-width='1.5'/>` +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 6 3, crosshair`;
}

const DROPLET: Record<'droplet' | 'droplet-empty', string> = {
  droplet: dropletSvg(true),
  'droplet-empty': dropletSvg(false),
};

/**
 * The eyedropper, verbatim from the reference: The reference ships this cursor as a 32px SVG in its own
 * stylesheet (`.color_swatch--chit`, hotspot `8 24`, the dropper's tip) and as a 4x PNG at runtime. The
 * SVG is the better source, so it is what we use — a white silhouette under a black drawing, with
 * The reference's own drop shadow filter over both. See docs/UI_REFERENCE.md.
 */
function eyedropperSvg(): string {
  const white =
    'M17.0263 19.5948L11.2871 25.334C10.9187 25.7024 10.4443 25.9465 9.93033 26.0322L8.62738 26.2493C6.93533 26.5314 5.46839 25.0644 5.7504 23.3724L5.96756 22.0694C6.05322 21.5554 6.29733 21.0811 6.66578 20.7126L12.405 14.9734C11.7005 13.9741 11.7952 12.5834 12.6893 11.6894C13.5833 10.7953 14.9741 10.7005 15.9734 11.4052L18.1893 9.18935C19.4654 7.91321 21.5344 7.9132 22.8106 9.18935C24.0867 10.4655 24.0867 12.5345 22.8106 13.8107L20.5948 16.0265C21.2994 17.0259 21.2046 18.4166 20.3106 19.3107C19.4164 20.2048 18.0256 20.2995 17.0263 19.5948Z';
  const black =
    'M13.3963 14.6036L13.7926 15L7.37288 21.4198C7.15181 21.6408 7.00534 21.9254 6.95395 22.2338L6.73679 23.5368C6.56758 24.552 7.44775 25.4322 8.46298 25.2629L9.76592 25.0458C10.0743 24.9944 10.3589 24.8479 10.58 24.6269L16.9997 18.2071L17.3962 18.6036C18.0057 19.2131 18.9939 19.2131 19.6034 18.6036C20.2129 17.9941 20.213 17.0059 19.6035 16.3964L19.2071 15.9999L22.1035 13.1036C22.9891 12.2179 22.9891 10.7821 22.1035 9.89645C21.2179 9.01083 19.782 9.01084 18.8964 9.89646L16 12.7928L15.6035 12.3964C14.994 11.7869 14.0058 11.787 13.3964 12.3965C12.7869 13.0059 12.7869 13.9941 13.3963 14.6036ZM14.4997 15.7071L16.2926 17.5L9.87288 23.9198C9.79919 23.9934 9.70432 24.0423 9.60152 24.0594L8.29858 24.2766C7.96017 24.333 7.66678 24.0396 7.72318 23.7012L7.94034 22.3982C7.95747 22.2954 8.00629 22.2005 8.07998 22.1269L14.4997 15.7071Z';
  const shadow = `<defs><filter id='s' x='0' y='0' width='32' height='32' filterUnits='userSpaceOnUse' color-interpolation-filters='sRGB'><feFlood flood-opacity='0' result='bg'/><feColorMatrix in='SourceAlpha' type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0' result='a'/><feOffset dy='1'/><feGaussianBlur stdDeviation='1.5'/><feColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.35 0'/><feBlend mode='normal' in2='bg' result='sh'/><feBlend mode='normal' in='SourceGraphic' in2='sh' result='shape'/></filter></defs>`;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32' fill='none'>` +
    `<g filter='url(#s)'>` +
    `<path fill-rule='evenodd' clip-rule='evenodd' d='${white}' fill='white'/>` +
    `<path fill-rule='evenodd' clip-rule='evenodd' d='${black}' fill='black'/>` +
    `</g>${shadow}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 8 24, crosshair`;
}

const EYEDROPPER = eyedropperSvg();

/** CSS `cursor` value for a tool cursor kind. */
export function cursorCss(kind: CursorKind): string {
  switch (kind) {
    case 'rotate-nw':
    case 'rotate-ne':
    case 'rotate-se':
    case 'rotate-sw':
      return ROTATE[kind];
    case 'droplet':
    case 'droplet-empty':
      return DROPLET[kind];
    case 'eyedropper':
      return EYEDROPPER;
    default:
      return kind;
  }
}
