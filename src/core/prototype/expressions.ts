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
 * Prototype expression language (Set variable "to" field and Conditional "if").
 *
 * Grammar (lowest → highest precedence), left-associative:
 *   or        := and ( 'or' and )*
 *   and       := compare ( 'and' compare )*
 *   compare   := additive ( ('=='|'!='|'>'|'<'|'>='|'<=') additive )?
 *   additive  := term ( ('+'|'-') term )*
 *   term      := unary ( ('*'|'/') unary )*
 *   unary     := ('!'|'not'|'-') unary | primary
 *   primary   := number | string | 'true' | 'false' | variable | '(' or ')'
 *   variable  := '{' name [ ':' mode ] '}'
 *
 * Variable references are written as `{Group/Name}` or `{Name:Mode}` in the
 * serialized form; the editor renders them as pills.
 */

export type ExprValue = number | string | boolean;

export type Expr =
  | { readonly kind: 'literal'; readonly value: ExprValue }
  | { readonly kind: 'variable'; readonly name: string; readonly mode: string | null }
  | { readonly kind: 'unary'; readonly op: 'not' | 'neg'; readonly operand: Expr }
  | { readonly kind: 'binary'; readonly op: BinaryOp; readonly left: Expr; readonly right: Expr };

export type BinaryOp = '+' | '-' | '*' | '/' | '==' | '!=' | '>' | '<' | '>=' | '<=' | 'and' | 'or';

export class ExpressionError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message);
    this.name = 'ExpressionError';
  }
}

type Token =
  | { t: 'num'; v: number; p: number }
  | { t: 'str'; v: string; p: number }
  | { t: 'var'; name: string; mode: string | null; p: number }
  | { t: 'op'; v: string; p: number }
  | { t: 'eof'; p: number };

const OPERATORS = ['==', '!=', '>=', '<=', '>', '<', '+', '-', '*', '/', '(', ')', '!'];

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
      if (!m) throw new ExpressionError('Invalid number', i);
      out.push({ t: 'num', v: Number(m[0]), p: i });
      i += m[0].length;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let value = '';
      while (j < src.length && src[j] !== ch) {
        if (src[j] === '\\' && j + 1 < src.length) {
          value += src[j + 1];
          j += 2;
        } else {
          value += src[j];
          j++;
        }
      }
      if (j >= src.length) throw new ExpressionError('Unterminated string', i);
      out.push({ t: 'str', v: value, p: i });
      i = j + 1;
      continue;
    }
    if (ch === '{') {
      const end = src.indexOf('}', i);
      if (end < 0) throw new ExpressionError('Unterminated variable reference', i);
      const body = src.slice(i + 1, end);
      const colon = body.lastIndexOf(':');
      const name = (colon >= 0 ? body.slice(0, colon) : body).trim();
      const mode = colon >= 0 ? body.slice(colon + 1).trim() : null;
      if (!name) throw new ExpressionError('Empty variable reference', i);
      out.push({ t: 'var', name, mode: mode || null, p: i });
      i = end + 1;
      continue;
    }
    const word = /^[A-Za-z_]+/.exec(src.slice(i));
    if (word) {
      const w = word[0];
      if (w === 'and' || w === 'or' || w === 'not') out.push({ t: 'op', v: w, p: i });
      else if (w === 'true' || w === 'false') out.push({ t: 'str', v: w, p: i }); // resolved in parser
      else throw new ExpressionError(`Unknown identifier "${w}"; wrap text in quotes`, i);
      i += w.length;
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExpressionError(`Unexpected character "${ch}"`, i);
    out.push({ t: 'op', v: op, p: i });
    i += op.length;
  }
  out.push({ t: 'eof', p: src.length });
  return out;
}

export function parseExpression(src: string): Expr {
  const tokens = tokenize(src);
  // Distinguish boolean keywords from quoted strings by source text.
  let pos = 0;
  const peek = () => tokens[pos]!;
  const isOp = (v: string) => {
    const tk = peek();
    return tk.t === 'op' && tk.v === v;
  };
  const expectOp = (v: string) => {
    if (!isOp(v)) throw new ExpressionError(`Expected "${v}"`, peek().p);
    pos++;
  };

  const binaryLevel = (ops: readonly string[], next: () => Expr) => (): Expr => {
    let left = next();
    for (;;) {
      const tk = peek();
      if (tk.t === 'op' && ops.includes(tk.v)) {
        pos++;
        left = { kind: 'binary', op: tk.v as BinaryOp, left, right: next() };
      } else return left;
    }
  };

  const primary = (): Expr => {
    const tk = peek();
    if (tk.t === 'num') {
      pos++;
      return { kind: 'literal', value: tk.v };
    }
    if (tk.t === 'str') {
      pos++;
      const raw = src.slice(tk.p, tk.p + 5);
      if (raw.startsWith('true')) return { kind: 'literal', value: true };
      if (raw.startsWith('false')) return { kind: 'literal', value: false };
      return { kind: 'literal', value: tk.v };
    }
    if (tk.t === 'var') {
      pos++;
      return { kind: 'variable', name: tk.name, mode: tk.mode };
    }
    if (isOp('(')) {
      pos++;
      const inner = or();
      expectOp(')');
      return inner;
    }
    throw new ExpressionError(tk.t === 'eof' ? 'Unexpected end of expression' : 'Unexpected token', tk.p);
  };

  const unary = (): Expr => {
    if (isOp('!') || isOp('not')) {
      pos++;
      return { kind: 'unary', op: 'not', operand: unary() };
    }
    if (isOp('-')) {
      pos++;
      return { kind: 'unary', op: 'neg', operand: unary() };
    }
    return primary();
  };

  const term = binaryLevel(['*', '/'], unary);
  const additive = binaryLevel(['+', '-'], term);
  const compare = (): Expr => {
    const left = additive();
    const tk = peek();
    if (tk.t === 'op' && ['==', '!=', '>', '<', '>=', '<='].includes(tk.v)) {
      pos++;
      return { kind: 'binary', op: tk.v as BinaryOp, left, right: additive() };
    }
    return left;
  };
  const and = binaryLevel(['and'], compare);
  const or = binaryLevel(['or'], and);

  const result = or();
  if (peek().t !== 'eof') throw new ExpressionError('Unexpected token', peek().p);
  return result;
}

export type VariableResolver = (name: string, mode: string | null) => ExprValue | undefined;

const toNumber = (v: ExprValue, pos: string): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  throw new ExpressionError(`Expected a number in ${pos}`, 0);
};

const toBool = (v: ExprValue): boolean => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return v === 'true' ? true : v === 'false' ? false : v.length > 0;
};

export function evaluateExpression(expr: Expr, resolve: VariableResolver): ExprValue {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'variable': {
      const v = resolve(expr.name, expr.mode);
      if (v === undefined) throw new ExpressionError(`Unknown variable "${expr.name}"`, 0);
      return v;
    }
    case 'unary': {
      const v = evaluateExpression(expr.operand, resolve);
      return expr.op === 'not' ? !toBool(v) : -toNumber(v, 'negation');
    }
    case 'binary': {
      if (expr.op === 'and') return toBool(evaluateExpression(expr.left, resolve)) && toBool(evaluateExpression(expr.right, resolve));
      if (expr.op === 'or') return toBool(evaluateExpression(expr.left, resolve)) || toBool(evaluateExpression(expr.right, resolve));
      const l = evaluateExpression(expr.left, resolve);
      const r = evaluateExpression(expr.right, resolve);
      switch (expr.op) {
        case '+':
          return typeof l === 'string' || typeof r === 'string' ? `${l}${r}` : toNumber(l, '+') + toNumber(r, '+');
        case '-':
          return toNumber(l, '-') - toNumber(r, '-');
        case '*':
          return toNumber(l, '*') * toNumber(r, '*');
        case '/': {
          const d = toNumber(r, '/');
          return d === 0 ? 0 : toNumber(l, '/') / d;
        }
        case '==':
          return looseEquals(l, r);
        case '!=':
          return !looseEquals(l, r);
        case '>':
          return toNumber(l, '>') > toNumber(r, '>');
        case '<':
          return toNumber(l, '<') < toNumber(r, '<');
        case '>=':
          return toNumber(l, '>=') >= toNumber(r, '>=');
        case '<=':
          return toNumber(l, '<=') <= toNumber(r, '<=');
      }
    }
  }
}

function looseEquals(a: ExprValue, b: ExprValue): boolean {
  if (typeof a === typeof b) return a === b;
  return String(a) === String(b);
}
