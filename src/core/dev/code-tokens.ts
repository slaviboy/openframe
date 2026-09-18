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

import type { CodeLanguage } from './code-gen';

/**
 * Colouring for the code Dev Mode shows.
 *
 * This is deliberately not a general highlighter and not a dependency: the page's CSP forbids `eval`
 * and `new Function`, which rules out most of them, and the only input these scanners ever see is what
 * `code-gen.ts` writes a line at a time. Three scanners is enough for the five languages we generate,
 * and anything they cannot classify falls through to `plain` rather than being guessed at.
 *
 * The kind names are the reference's own (`token property`, `token punctuation`, `token plain`, …),
 * taken from the saved Dev Mode pages. `tag` and `attribute` are ours: no reference capture of Android
 * XML exists, so nothing says what the reference calls those.
 */
export type TokenKind = 'plain' | 'property' | 'punctuation' | 'operator' | 'number' | 'unit' | 'string' | 'comment' | 'keyword' | 'function' | 'chit' | 'tag' | 'attribute';

export interface CodeToken {
  readonly kind: TokenKind;
  readonly text: string;
  /** Only on a `chit`: the colour its swatch is drawn in. A chit carries no text of its own. */
  readonly swatch?: string;
}

/** Collects `plain` runs so a scanner can emit a classified token without tracking the gap before it. */
class Run {
  private plain = '';
  readonly tokens: CodeToken[] = [];

  add(text: string): void {
    this.plain += text;
  }

  push(kind: TokenKind, text: string): void {
    this.flush();
    this.tokens.push({ kind, text });
  }

  /** The reference's colour swatch: its own token, drawn from the value that follows it. */
  pushChit(color: string): void {
    this.flush();
    this.tokens.push({ kind: 'chit', text: '', swatch: color });
  }

  flush(): void {
    if (this.plain !== '') {
      this.tokens.push({ kind: 'plain', text: this.plain });
      this.plain = '';
    }
  }

  done(): CodeToken[] {
    this.flush();
    return this.tokens;
  }
}

const HEX = /^#[0-9a-fA-F]{3,8}/;
const NUMBER = /^-?\d+(\.\d+)?/;
/** Compose writes a colour as `0xAARRGGBB`; the swatch is drawn from its last six digits. */
const HEX_LITERAL = /^0[xX][0-9a-fA-F]{6,8}/;
const UNIT = /^(px|rem|pt|dp|sp|em|%|deg|s|ms)\b/;
const CSS_FUNCTION = /^[A-Za-z-][\w-]*(?=\()/;

/** The value half of a CSS declaration, and any line that is not a declaration at all. */
function scanCssValue(text: string): CodeToken[] {
  const run = new Run();
  let rest = text;
  while (rest.length > 0) {
    const hex = HEX.exec(rest);
    if (hex) {
      // The reference draws a colour swatch before the value it belongs to, as its own `chit` token.
      run.pushChit(hex[0]);
      run.push('plain', hex[0]);
      rest = rest.slice(hex[0].length);
      continue;
    }
    const fn = CSS_FUNCTION.exec(rest);
    if (fn) {
      run.push('function', fn[0]);
      rest = rest.slice(fn[0].length);
      continue;
    }
    const number = NUMBER.exec(rest);
    if (number) {
      run.push('number', number[0]);
      rest = rest.slice(number[0].length);
      const unit = UNIT.exec(rest);
      if (unit) {
        run.push('unit', unit[0]);
        rest = rest.slice(unit[0].length);
      }
      continue;
    }
    const quote = rest[0];
    if (quote === '"' || quote === "'") {
      const end = rest.indexOf(quote, 1);
      const literal = end === -1 ? rest : rest.slice(0, end + 1);
      run.push('string', literal);
      rest = rest.slice(literal.length);
      continue;
    }
    const head = rest[0] ?? '';
    if (';,()'.includes(head)) run.push('punctuation', head);
    else run.add(head);
    rest = rest.slice(1);
  }
  return run.done();
}

function tokenizeCss(line: string): CodeToken[] {
  if (line.trimStart().startsWith('/*')) return [{ kind: 'comment', text: line }];
  const colon = line.indexOf(':');
  if (colon === -1) return scanCssValue(line);
  const head = line.slice(0, colon);
  const indent = /^\s*/.exec(head)?.[0] ?? '';
  const tokens: CodeToken[] = [];
  if (indent !== '') tokens.push({ kind: 'plain', text: indent });
  tokens.push({ kind: 'property', text: head.slice(indent.length) }, { kind: 'punctuation', text: ':' });
  return [...tokens, ...scanCssValue(line.slice(colon + 1))];
}

/** Words the languages we generate write that are not names of things. */
const KEYWORDS = new Set(['let', 'var', 'val', 'fun', 'func', 'return', 'true', 'false', 'null', 'nil', 'import', 'if', 'else']);

const IDENTIFIER = /^[A-Za-z_][\w.]*/;
const CALL_NAME = /^[A-Za-z_][\w]*(?=\()/;

/** Swift, Kotlin and anything else shaped like them. */
function tokenizeCLike(line: string): CodeToken[] {
  const run = new Run();
  let rest = line;
  while (rest.length > 0) {
    if (rest.startsWith('//')) {
      run.push('comment', rest);
      break;
    }
    if (rest.startsWith('"')) {
      let end = 1;
      while (end < rest.length && rest[end] !== '"') end += rest[end] === '\\' ? 2 : 1;
      const literal = rest.slice(0, Math.min(end + 1, rest.length));
      run.push('string', literal);
      rest = rest.slice(literal.length);
      continue;
    }
    const call = CALL_NAME.exec(rest);
    if (call) {
      run.push('function', call[0]);
      rest = rest.slice(call[0].length);
      continue;
    }
    const literal = HEX_LITERAL.exec(rest);
    if (literal) {
      run.pushChit(`#${literal[0].slice(-6)}`);
      run.push('number', literal[0]);
      rest = rest.slice(literal[0].length);
      continue;
    }
    const number = NUMBER.exec(rest);
    if (number) {
      run.push('number', number[0]);
      rest = rest.slice(number[0].length);
      continue;
    }
    const word = IDENTIFIER.exec(rest);
    if (word) {
      if (KEYWORDS.has(word[0])) run.push('keyword', word[0]);
      else run.add(word[0]);
      rest = rest.slice(word[0].length);
      continue;
    }
    const head = rest[0] ?? '';
    if ('(){}[],;:'.includes(head)) run.push('punctuation', head);
    else if ('=.+-*/<>'.includes(head)) run.push('operator', head);
    else run.add(head);
    rest = rest.slice(1);
  }
  return run.done();
}

const XML_ATTRIBUTE = /^[A-Za-z_][\w:.-]*(?==)/;
const XML_TAG = /^<\/?[A-Za-z_][\w.-]*/;

function tokenizeXml(line: string): CodeToken[] {
  if (line.trimStart().startsWith('<!--')) return [{ kind: 'comment', text: line }];
  const run = new Run();
  let rest = line;
  while (rest.length > 0) {
    const tag = XML_TAG.exec(rest);
    if (tag) {
      const bracket = tag[0].startsWith('</') ? '</' : '<';
      run.push('punctuation', bracket);
      run.push('tag', tag[0].slice(bracket.length));
      rest = rest.slice(tag[0].length);
      continue;
    }
    if (rest.startsWith('/>')) {
      run.push('punctuation', '/>');
      rest = rest.slice(2);
      continue;
    }
    const attribute = XML_ATTRIBUTE.exec(rest);
    if (attribute) {
      run.push('attribute', attribute[0]);
      rest = rest.slice(attribute[0].length);
      continue;
    }
    if (rest.startsWith('"')) {
      const end = rest.indexOf('"', 1);
      const literal = end === -1 ? rest : rest.slice(0, end + 1);
      run.push('string', literal);
      rest = rest.slice(literal.length);
      continue;
    }
    const head = rest[0] ?? '';
    if (head === '=') run.push('operator', '=');
    else if ('<>'.includes(head)) run.push('punctuation', head);
    else run.add(head);
    rest = rest.slice(1);
  }
  return run.done();
}

/** Splits one generated line into the spans the code well colours. Concatenating them returns the line. */
export function tokenizeLine(line: string, language: CodeLanguage): readonly CodeToken[] {
  if (line === '') return [{ kind: 'plain', text: '' }];
  switch (language) {
    case 'CSS':
      return tokenizeCss(line);
    case 'ANDROID_XML':
      return tokenizeXml(line);
    case 'SWIFTUI':
    case 'UIKIT':
    case 'COMPOSE':
      return tokenizeCLike(line);
  }
}
