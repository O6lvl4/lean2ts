// ─── Sexp Tokens ───

export type SexpToken =
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "keyword"; value: string }
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "ident"; value: string };

// ─── Sexp AST ───

export type SexpNode =
  | { kind: "atom"; value: string }
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "keyword"; value: string }
  | { kind: "list"; children: SexpNode[] };

// ─── Tokenizer ───

export function tokenize(input: string): SexpToken[] {
  const tokens: SexpToken[] = [];
  let pos = 0;

  while (pos < input.length) {
    const ch = input[pos];

    // whitespace
    if (/\s/.test(ch)) {
      pos++;
      continue;
    }

    // parentheses
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      pos++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      pos++;
      continue;
    }

    // quoted string
    if (ch === '"') {
      pos++;
      let str = "";
      while (pos < input.length && input[pos] !== '"') {
        if (input[pos] === "\\" && pos + 1 < input.length) {
          pos++;
          str += input[pos];
        } else {
          str += input[pos];
        }
        pos++;
      }
      pos++; // skip closing "
      tokens.push({ kind: "string", value: str });
      continue;
    }

    // keyword (starts with :)
    if (ch === ":") {
      pos++;
      let kw = "";
      while (pos < input.length && /[a-zA-Z_]/.test(input[pos])) {
        kw += input[pos];
        pos++;
      }
      tokens.push({ kind: "keyword", value: kw });
      continue;
    }

    // number or identifier
    if (/[a-zA-Z0-9_.'α-ωΑ-Ω\u2070-\u209F]/.test(ch)) {
      let word = "";
      while (
        pos < input.length &&
        /[a-zA-Z0-9_.'α-ωΑ-Ω\u2070-\u209F]/.test(input[pos])
      ) {
        word += input[pos];
        pos++;
      }
      // pure number?
      if (/^\d+$/.test(word)) {
        tokens.push({ kind: "number", value: Number(word) });
      } else {
        tokens.push({ kind: "ident", value: word });
      }
      continue;
    }

    // special unicode: +, ×, etc. as ident chars
    if (ch === "+" || ch === "×") {
      tokens.push({ kind: "ident", value: ch });
      pos++;
      continue;
    }

    // underscore as standalone atom
    if (ch === "_") {
      tokens.push({ kind: "ident", value: "_" });
      pos++;
      continue;
    }

    // skip unknown
    pos++;
  }

  return tokens;
}

// ─── Parser ───

export function parseSexp(input: string): SexpNode {
  const tokens = tokenize(input);
  const ctx = { tokens, pos: 0 };
  const result = parseNode(ctx);
  return result;
}

export function parseSexpMulti(input: string): SexpNode[] {
  const tokens = tokenize(input);
  const ctx = { tokens, pos: 0 };
  const nodes: SexpNode[] = [];
  while (ctx.pos < ctx.tokens.length) {
    nodes.push(parseNode(ctx));
  }
  return nodes;
}

interface ParseCtx {
  tokens: SexpToken[];
  pos: number;
}

function parseNode(ctx: ParseCtx): SexpNode {
  if (ctx.pos >= ctx.tokens.length) {
    return { kind: "atom", value: "" };
  }

  const tok = ctx.tokens[ctx.pos];

  switch (tok.kind) {
    case "lparen": {
      ctx.pos++; // skip (
      const children: SexpNode[] = [];
      while (
        ctx.pos < ctx.tokens.length &&
        ctx.tokens[ctx.pos].kind !== "rparen"
      ) {
        children.push(parseNode(ctx));
      }
      if (ctx.pos < ctx.tokens.length) {
        ctx.pos++; // skip )
      }
      return { kind: "list", children };
    }
    case "rparen": {
      // unexpected ), skip
      ctx.pos++;
      return { kind: "atom", value: "" };
    }
    case "keyword": {
      ctx.pos++;
      return { kind: "keyword", value: tok.value };
    }
    case "number": {
      ctx.pos++;
      return { kind: "number", value: tok.value };
    }
    case "string": {
      ctx.pos++;
      return { kind: "string", value: tok.value };
    }
    case "ident": {
      ctx.pos++;
      return { kind: "atom", value: tok.value };
    }
  }
}
