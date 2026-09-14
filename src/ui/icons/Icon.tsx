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

import type { SVGProps } from 'react';

/**
 * Openframe's own icon set, drawn on a 24×24 grid with a 1px stroke at 16px optical size
 * to match the density of professional design-tool chrome. Icons inherit `currentColor`.
 */
const PATHS = {
  move: <path d="M7.5 5.5v12.8l3.4-3.3 2.2 4.6 1.8-.9-2.2-4.5h4.8z" fill="currentColor" stroke="none" />,
  hand: (
    <path d="M9 12V6.8a1.1 1.1 0 0 1 2.2 0V11m0-5.2V5.6a1.1 1.1 0 0 1 2.2 0V11m0-4.4a1.1 1.1 0 0 1 2.2 0V11m0-2.6a1.1 1.1 0 0 1 2.2 0v4.9c0 3-2.2 5.2-5.1 5.2h-.7c-1.7 0-3-.8-3.9-2.2L6 13.1a1.1 1.1 0 0 1 1.8-1.2L9 13.6" />
  ),
  frame: <path d="M9 5v14M15 5v14M5 9h14M5 15h14" />,
  scale: <path d="M6.5 17.5v-6h6v6zM12.5 11.5l5-5M13.5 6.5h4v4" />,
  section: <path d="M5.5 10V6.5h6V10M5.5 10h13v7.5h-13z" />,
  slice: <path d="m6.5 17.5 11-11M13 17.5h4.5V13" />,
  rectangle: <rect x="6.5" y="6.5" width="11" height="11" rx="0.5" />,
  ellipse: <circle cx="12" cy="12" r="5.5" />,
  line: <path d="m6.5 17.5 11-11" />,
  arrow: <path d="m6.5 17.5 11-11M11.5 6.5h6v6" />,
  polygon: <path d="M12 6 18.5 17.5h-13z" />,
  text: <path d="M6.5 7.5v-1h11v1M12 6.5v11M10 17.5h4" />,
  underline: <path d="M8.5 6.5v5a3.5 3.5 0 0 0 7 0v-5M7 18.5h10" />,
  textLtr: <path d="M10 5.5h7M14 5.5v8M11 5.5a2.75 2.75 0 0 0 0 5.5h3M6 18h12m0 0-2-2m2 2-2 2" />,
  textRtl: <path d="M10 5.5h7M14 5.5v8M11 5.5a2.75 2.75 0 0 0 0 5.5h3M18 18H6m0 0 2-2m-2 2 2 2" />,
  link: <path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1M13.5 10.5a3.5 3.5 0 0 0-5 0L6 13a3.5 3.5 0 0 0 5 5l1-1" />,
  unlink: <path d="M13 7l1-1a3.5 3.5 0 0 1 5 5l-1 1M11 17l-1 1a3.5 3.5 0 0 1-5-5l1-1M6 6l12 12" />,
  indent: <path d="M6.5 6.5h11M11.5 10.5h6M11.5 14h6M6.5 18h11M6.5 10l2.5 2.25L6.5 14.5" />,
  outdent: <path d="M6.5 6.5h11M11.5 10.5h6M11.5 14h6M6.5 18h11M9 10l-2.5 2.25L9 14.5" />,
  strikethrough: <path d="M6.5 12h11M15 8.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.3c0 1.4 1.3 2 3 2.3M9 15.5c0 1.4 1.3 2.5 3 2.5s3-1.1 3-2.5" />,
  textAlignLeft: <path d="M6.5 7.5h11M6.5 10.5h7M6.5 13.5h11M6.5 16.5h7" />,
  textAlignCenter: <path d="M6.5 7.5h11M8.5 10.5h7M6.5 13.5h11M8.5 16.5h7" />,
  textAlignRight: <path d="M6.5 7.5h11M10.5 10.5h7M6.5 13.5h11M10.5 16.5h7" />,
  textAlignJustify: <path d="M6.5 7.5h11M6.5 10.5h11M6.5 13.5h11M6.5 16.5h11" />,
  alignTop: <path d="M6.5 6.5h11M12 9.5v8M9.5 12 12 9.5l2.5 2.5" />,
  alignMiddle: <path d="M6.5 12h11M12 6.5v3M12 14.5v3" />,
  alignBottom: <path d="M6.5 17.5h11M12 6.5v8M9.5 12l2.5 2.5 2.5-2.5" />,
  autoWidth: <path d="M5.5 12h13M8 9.5 5.5 12 8 14.5M16 9.5l2.5 2.5-2.5 2.5" />,
  layoutFreeform: <path d="M6.5 6.5h5v5h-5zM12.5 12.5h5v5h-5z" />,
  layoutVertical: <path d="M7.5 6.5h9v4h-9zM7.5 13.5h9v4h-9z" />,
  layoutHorizontal: <path d="M6.5 7.5h4v9h-4zM13.5 7.5h4v9h-4z" />,
  wrap: <path d="M5.5 7.5h11a2.5 2.5 0 0 1 0 5H9.5m0 0 2-2m-2 2 2 2M5.5 16.5h6" />,
  paddingSides: <path d="M5.5 5.5h13v13h-13zM9 9h6v6H9z" />,
  vector: <path d="M6.5 17.5C8 10 16 14 17.5 6.5M5.5 16.5h2v2h-2zM16.5 5.5h2v2h-2z" />,
  layoutGrid: <path d="M6.5 6.5h4v4h-4zM13.5 6.5h4v4h-4zM6.5 13.5h4v4h-4zM13.5 13.5h4v4h-4z" />,
  ignoreLayout: <path d="M6.5 9.5v-3h3M14.5 6.5h3v3M17.5 14.5v3h-3M9.5 17.5h-3v-3M10.5 10.5h3v3h-3z" />,
  autoHeight: <path d="M12 5.5v13M9.5 8 12 5.5 14.5 8M9.5 16l2.5 2.5 2.5-2.5" />,
  fixedSize: <path d="M6.5 6.5h11v11h-11zM9.5 12h5" />,
  truncate: <path d="M6.5 9.5h11M6.5 13.5h6M15 13.5h.5M17.5 13.5h.5" />,
  star: <path d="M12 6l1.53 4.4 4.65.09-3.71 2.81 1.35 4.46L12 15.1l-3.82 2.66 1.35-4.46-3.71-2.81 4.65-.09z" />,
  chevronDown: <path d="m9.5 11 2.5 2.5 2.5-2.5" />,
  caretRight: <path d="m10.5 9.5 3 2.5-3 2.5z" fill="currentColor" stroke="none" />,
  caretDown: <path d="m9.5 10.5 2.5 3 2.5-3z" fill="currentColor" stroke="none" />,
  eye: (
    <>
      <path d="M4.5 12s2.8-4.5 7.5-4.5 7.5 4.5 7.5 4.5-2.8 4.5-7.5 4.5S4.5 12 4.5 12z" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M6.3 9.6C5.2 10.8 4.5 12 4.5 12s2.8 4.5 7.5 4.5c1 0 2-.2 2.8-.5m2.9-1.7c1.2-1.1 1.8-2.3 1.8-2.3S16.7 7.5 12 7.5c-.6 0-1.2.1-1.8.2" />
      <path d="m5.5 5.5 13 13" />
    </>
  ),
  lock: (
    <>
      <rect x="7.5" y="11" width="9" height="7" rx="1" />
      <path d="M9.5 11V9a2.5 2.5 0 0 1 5 0v2" />
    </>
  ),
  unlock: (
    <>
      <rect x="7.5" y="11" width="9" height="7" rx="1" />
      <path d="M9.5 11V9a2.5 2.5 0 0 1 4.9-.7" />
    </>
  ),
  plus: <path d="M12 6.5v11M6.5 12h11" />,
  search: (
    <>
      <circle cx="11" cy="11" r="4.5" />
      <path d="m14.5 14.5 3.5 3.5" />
    </>
  ),
  close: <path d="m7.5 7.5 9 9m0-9-9 9" />,
  collapse: <path d="m8.5 6.5 3.5 3.5 3.5-3.5M8.5 17.5 12 14l3.5 3.5" />,
  minus: <path d="M6.5 12h11" />,
  file: <path d="M8 4.5h5.5L17 8v11.5H8zM13.5 4.5V8H17" />,
  group: <path d="M6 8V6h2m8 0h2v2m0 8v2h-2m-8 0H6v-2m0-6v4m12-4v4M10 6h4m-4 12h4" />,
  page: <path d="M8 4.5h8v15H8z" />,
  rotation: <path d="M7 17V9.5a2.5 2.5 0 0 1 2.5-2.5H17M14.5 4.5 17 7l-2.5 2.5" />,
  opacity: (
    <>
      <rect x="6.5" y="6.5" width="11" height="11" rx="1" />
      <path d="M6.5 17.5l11-11" />
    </>
  ),
  radius: <path d="M6.5 17.5V11a4.5 4.5 0 0 1 4.5-4.5h6.5" />,
  target: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
    </>
  ),
  mask: (
    <>
      <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  image: (
    <>
      <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" />
      <circle cx="9.75" cy="9.75" r="1.25" />
      <path d="m18.5 14.5-3.5-3.5-9 7.5" />
    </>
  ),
  sidebar: (
    <>
      <rect x="4.5" y="6" width="15" height="12" rx="1.5" />
      <path d="M9.5 6v12" />
    </>
  ),
  logo: (
    <>
      <rect x="5" y="5" width="6" height="6" rx="1.5" />
      <rect x="13" y="5" width="6" height="6" rx="3" />
      <rect x="5" y="13" width="6" height="6" rx="3" />
      <path d="M13 13h6v6h-6z" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
