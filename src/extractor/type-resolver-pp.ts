import type { IRType } from "../ir/types.js";
import { lookupPrimitive, wrapList, wrapOption, wrapProd } from "../lean-ts-map.js";

/**
 * Lean の pp (pretty-print) 文字列を IRType に変換する再帰下降パーサー。
 * パース不能な場合は { kind: "ref", name: "unknown" } にフォールバック。
 */
export function resolveType(pp: string): IRType {
  const parser = new TypeParser(pp.trim());
  return parser.parseType();
}

class TypeParser {
  private pos = 0;
  private readonly input: string;

  constructor(input: string) {
    this.input = input;
  }

  parseType(): IRType {
    return this.parseArrow();
  }

  private parseArrow(): IRType {
    const left = this.parseApp();
    this.skipSpaces();

    if (this.matchStr("→") || this.matchStr("->")) {
      this.skipSpaces();
      const right = this.parseArrow();
      if (right.kind === "function") {
        return {
          kind: "function",
          params: [{ name: "_", type: left }, ...right.params],
          returnType: right.returnType,
        };
      }
      return {
        kind: "function",
        params: [{ name: "_", type: left }],
        returnType: right,
      };
    }

    return left;
  }

  private parseApp(): IRType {
    this.skipSpaces();
    const left = this.parseAtom();
    this.skipSpaces();

    if (this.matchStr("×") || this.matchStr("*")) {
      const elements: IRType[] = [left];
      do {
        this.skipSpaces();
        elements.push(this.parseAtom());
        this.skipSpaces();
      } while (this.matchStr("×") || this.matchStr("*"));
      return wrapProd(elements);
    }

    return left;
  }

  private parseAtom(): IRType {
    this.skipSpaces();

    if (this.peek() === "(") {
      return this.parseParen();
    }

    const ident = this.readIdent();
    if (!ident) return { kind: "ref", name: "unknown" };

    return this.resolveIdent(ident);
  }

  private parseParen(): IRType {
    this.advance(); // skip (
    this.skipSpaces();

    if (this.peek() === ")") {
      this.advance();
      return { kind: "primitive", name: "void" };
    }

    const inner = this.parseType();
    this.skipSpaces();
    this.expect(")");
    return inner;
  }

  private resolveIdent(ident: string): IRType {
    const prim = lookupPrimitive(ident);
    if (prim) return prim.tsType;

    if (ident === "List" || ident === "Array") {
      this.skipSpaces();
      return wrapList(this.parseAtom());
    }
    if (ident === "Option") {
      this.skipSpaces();
      return wrapOption(this.parseAtom());
    }
    if (ident === "Prod") {
      this.skipSpaces();
      const a = this.parseAtom();
      this.skipSpaces();
      return wrapProd([a, this.parseAtom()]);
    }
    if (ident === "Prop" || ident === "Sort" || ident === "Type") {
      return { kind: "primitive", name: "void" };
    }

    return { kind: "ref", name: ident };
  }

  private readIdent(): string {
    const start = this.pos;
    while (this.pos < this.input.length && /[a-zA-Z0-9_.'α-ωΑ-Ω]/.test(this.input[this.pos])) {
      this.pos++;
    }
    return this.input.slice(start, this.pos);
  }

  private skipSpaces(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  private peek(): string | undefined {
    return this.input[this.pos];
  }

  private advance(): void {
    this.pos++;
  }

  private matchStr(s: string): boolean {
    if (this.input.startsWith(s, this.pos)) {
      this.pos += s.length;
      return true;
    }
    return false;
  }

  private expect(ch: string): void {
    if (this.input[this.pos] === ch) {
      this.pos++;
    }
  }
}
