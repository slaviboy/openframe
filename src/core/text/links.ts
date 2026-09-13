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

import { valuesEqual } from '../ops/equality';
import { textSegments, type RunsNode } from './style-runs';

/** Longest link address kept in a document. */
export const MAX_URL_LENGTH = 2048;

const SCHEME = /^([a-z][a-z0-9+-]*):/i;
/** host[:port] then an optional path, query or fragment. Hosts are names, IPv4 or bracketed IPv6. */
const ADDRESS = /^(\[[0-9a-f:.]+\]|[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*)(:\d{1,5})?([/?#]\S*)?$/iu;
/** A bare host name needs a top-level domain ("example.com"), so single words aren't links. */
const TOP_LEVEL_DOMAIN = /\.\p{L}{2,}$/u;

/**
 * A typed or pasted link as a web address: http and https addresses, and bare host names
 * ("example.com/file") as https. The scheme and host are lowercased and an empty path becomes "/".
 * Other schemes (javascript:, mailto:, file: …) are not links.
 */
export function normalizeUrl(input: string): string | null {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  const scheme = SCHEME.exec(text)?.[1]?.toLowerCase();
  let rest: string;
  if (scheme) {
    if ((scheme !== 'http' && scheme !== 'https') || !text.slice(scheme.length + 1).startsWith('//')) return null;
    rest = text.slice(scheme.length + 3);
  } else {
    rest = text;
  }
  const match = ADDRESS.exec(rest);
  if (!match) return null;
  const [, host = '', port = '', path = ''] = match;
  if (!scheme && !TOP_LEVEL_DOMAIN.test(host)) return null;
  const href = `${scheme ?? 'https'}://${host.toLowerCase()}${port}${path || '/'}`;
  return href.length <= MAX_URL_LENGTH ? href : null;
}

/** Clipboard text that turns selected characters into a link when pasted: an http(s) or www. address. */
export function pastedUrl(text: string): string | null {
  const trimmed = text.trim();
  return /^(https?:\/\/|www\.)/i.test(trimmed) ? normalizeUrl(trimmed) : null;
}

export interface TextLink {
  readonly start: number;
  readonly end: number;
  readonly url: string;
}

/**
 * The link at a caret or covering a selection: the whole run of characters with that link. A caret
 * belongs to the link of the character before it, or else of the character after it; a selection
 * only when every selected character has the same link.
 */
export function linkAt(node: RunsNode, start: number, end: number): TextLink | null {
  const segments = textSegments(node);
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  const indexOf = (offset: number) => segments.findIndex((s) => offset >= s.start && offset < s.end);
  let index: number;
  if (to > from) {
    const covered = segments.filter((s) => s.end > from && s.start < to);
    if (!covered[0]?.hyperlink || covered.some((s) => !valuesEqual(s.hyperlink, covered[0]!.hyperlink))) return null;
    index = segments.indexOf(covered[0]);
  } else {
    const before = from > 0 ? indexOf(from - 1) : -1;
    const after = indexOf(from);
    index = before >= 0 && segments[before]!.hyperlink ? before : after >= 0 && segments[after]!.hyperlink ? after : -1;
    if (index < 0) return null;
  }
  const link = segments[index]!.hyperlink!;
  let first = index;
  let last = index;
  while (first > 0 && valuesEqual(segments[first - 1]!.hyperlink, link)) first--;
  while (last < segments.length - 1 && valuesEqual(segments[last + 1]!.hyperlink, link)) last++;
  return { start: segments[first]!.start, end: segments[last]!.end, url: link.value };
}
