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
 * Flow descriptions: text with light formatting. `**bold**`, lines starting with `- ` (a bulleted list) or `1. ` (a
 * numbered list), and links written as `[text](https://…)` or as a bare https:// address.
 */

export type DescriptionInline =
  | { readonly type: 'text'; readonly text: string; readonly bold: boolean }
  | { readonly type: 'link'; readonly text: string; readonly href: string; readonly bold: boolean };

export type DescriptionBlock =
  | { readonly type: 'paragraph'; readonly inlines: readonly DescriptionInline[] }
  | { readonly type: 'list'; readonly ordered: boolean; readonly items: readonly (readonly DescriptionInline[])[] };

export type DescriptionFormat = 'bold' | 'bullets' | 'numbers' | 'link';

/** Links a description may open: web pages and email. */
const SAFE_HREF = /^(https?:\/\/|mailto:)/i;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const TOKEN = /\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]+)/g;

/** The formatted text of a line: bold runs (a `**` without a closing one stays as written) and links. */
export function parseInlines(text: string): DescriptionInline[] {
  const out: DescriptionInline[] = [];
  let bold = false;
  let last = 0;
  let markers = [...text.matchAll(TOKEN)].filter((match) => match[0] === '**').length;
  const pushText = (value: string) => {
    if (!value) return;
    const previous = out.at(-1);
    if (previous?.type === 'text' && previous.bold === bold) out[out.length - 1] = { ...previous, text: previous.text + value };
    else out.push({ type: 'text', text: value, bold });
  };
  for (const match of text.matchAll(TOKEN)) {
    pushText(text.slice(last, match.index));
    last = match.index + match[0].length;
    if (match[0] === '**') {
      markers--;
      if (bold || markers >= 1) bold = !bold;
      else pushText('**');
      continue;
    }
    const label = match[1] ?? match[3]!;
    const href = match[2] ?? match[3]!;
    if (SAFE_HREF.test(href)) out.push({ type: 'link', text: label, href, bold });
    else pushText(match[0]);
  }
  pushText(text.slice(last));
  return out;
}

/** A description as blocks: paragraphs (separated by blank lines) and bulleted or numbered lists. */
export function parseDescription(text: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: 'paragraph', inlines: parseInlines(paragraph.join('\n')) });
    paragraph = [];
  };
  for (const line of text.split(/\r?\n/)) {
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      flush();
      const ordered = numbered !== null;
      const inlines = parseInlines(item[1]!);
      const previous = blocks.at(-1);
      if (previous?.type === 'list' && previous.ordered === ordered) blocks[blocks.length - 1] = { ...previous, items: [...previous.items, inlines] };
      else blocks.push({ type: 'list', ordered, items: [inlines] });
    } else if (line.trim() === '') {
      flush();
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/**
 * The description editor's formatting buttons: formats the selected text (`start`–`end`) and returns the new text with
 * the selection to keep. Bold wraps the selection in `**`; the list formats mark each selected line as a list item (or
 * unmark them when all already are); a link makes the selection its text (the address alone when nothing is selected).
 */
export function formatDescription(text: string, start: number, end: number, format: DescriptionFormat, href = ''): { text: string; start: number; end: number } {
  const selected = text.slice(start, end);
  if (format === 'bold') {
    const next = `${text.slice(0, start)}**${selected}**${text.slice(end)}`;
    return { text: next, start: start + 2, end: end + 2 };
  }
  if (format === 'link') {
    const link = selected ? `[${selected}](${href})` : href;
    return { text: `${text.slice(0, start)}${link}${text.slice(end)}`, start, end: start + link.length };
  }
  // The whole lines the selection touches.
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const newline = text.indexOf('\n', end);
  const lineEnd = newline < 0 ? text.length : newline;
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const marker = format === 'bullets' ? BULLET : NUMBERED;
  const unmark = lines.every((line) => marker.test(line));
  const formatted = lines
    .map((line, index) => {
      const content = (BULLET.exec(line) ?? NUMBERED.exec(line))?.[1] ?? line;
      if (unmark) return content;
      return format === 'bullets' ? `- ${content}` : `${index + 1}. ${content}`;
    })
    .join('\n');
  const next = `${text.slice(0, lineStart)}${formatted}${text.slice(lineEnd)}`;
  return { text: next, start: lineStart, end: lineStart + formatted.length };
}

/**
 * Formatted inlines written out as a description holds them: `**bold**` runs and `[text](address)` links (a link showing
 * its own address is written as the address).
 */
export function inlineText(inlines: readonly DescriptionInline[]): string {
  let out = '';
  let bold = false;
  for (const inline of inlines) {
    if (inline.text === '') continue;
    if (inline.bold !== bold) {
      out += '**';
      bold = inline.bold;
    }
    out += inline.type === 'link' ? (inline.text === inline.href ? inline.href : `[${inline.text}](${inline.href})`) : inline.text;
  }
  return bold ? `${out}**` : out;
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inlinesHtml(inlines: readonly DescriptionInline[]): string {
  return inlines
    .map((inline) => {
      const content = inline.type === 'link' ? `<a href="${escapeHtml(inline.href)}">${escapeHtml(inline.text)}</a>` : escapeHtml(inline.text);
      return inline.bold ? `<strong>${content}</strong>` : content;
    })
    .join('');
}

/** A paragraph's inlines split into its lines. */
function inlineLines(inlines: readonly DescriptionInline[]): DescriptionInline[][] {
  const lines: DescriptionInline[][] = [[]];
  for (const inline of inlines) {
    const parts = inline.type === 'text' ? inline.text.split('\n') : [inline.text];
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1]!.push(inline.type === 'text' ? { ...inline, text: part } : inline);
    });
  }
  return lines;
}

/**
 * A description as the rich text editor shows it (HTML, its text escaped): each line of a paragraph in a `div`, an empty
 * one between paragraphs, lists as `ul` or `ol`, bold text as `strong` and links as `a`.
 */
export function descriptionHtml(text: string): string {
  let html = '';
  let previous: DescriptionBlock['type'] | null = null;
  for (const block of parseDescription(text)) {
    if (block.type === 'paragraph') {
      if (previous === 'paragraph') html += '<div><br></div>';
      for (const line of inlineLines(block.inlines)) html += `<div>${line.length > 0 ? inlinesHtml(line) : '<br>'}</div>`;
    } else {
      const tag = block.ordered ? 'ol' : 'ul';
      html += `<${tag}>${block.items.map((item) => `<li>${inlinesHtml(item) || '<br>'}</li>`).join('')}</${tag}>`;
    }
    previous = block.type;
  }
  return html;
}
