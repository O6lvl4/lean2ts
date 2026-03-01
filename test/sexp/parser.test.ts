import { describe, it, expect } from "vitest";
import { tokenize, parseSexp, type SexpNode } from "../../src/sexp/parser.js";

describe("tokenize", () => {
  it("simple constant", () => {
    const tokens = tokenize("(:c Nat)");
    expect(tokens).toEqual([
      { kind: "lparen" },
      { kind: "keyword", value: "c" },
      { kind: "ident", value: "Nat" },
      { kind: "rparen" },
    ]);
  });

  it("bare number", () => {
    const tokens = tokenize("0");
    expect(tokens).toEqual([{ kind: "number", value: 0 }]);
  });

  it("string literal", () => {
    const tokens = tokenize('(:lit "hello")');
    expect(tokens).toEqual([
      { kind: "lparen" },
      { kind: "keyword", value: "lit" },
      { kind: "string", value: "hello" },
      { kind: "rparen" },
    ]);
  });

  it("nested expression", () => {
    const tokens = tokenize("(:forall a (:c Nat) (:c Nat))");
    expect(tokens).toHaveLength(12);
    expect(tokens[0]).toEqual({ kind: "lparen" });
    expect(tokens[1]).toEqual({ kind: "keyword", value: "forall" });
    expect(tokens[2]).toEqual({ kind: "ident", value: "a" });
  });

  it("dotted name", () => {
    const tokens = tokenize("(:c HAdd.hAdd)");
    expect(tokens[2]).toEqual({ kind: "ident", value: "HAdd.hAdd" });
  });

  it("binder info suffix", () => {
    const tokens = tokenize("(:forall n (:c Nat) 0 :i)");
    expect(tokens[tokens.length - 2]).toEqual({ kind: "keyword", value: "i" });
  });

  it("level with +", () => {
    const tokens = tokenize("(:sort (+ u 1))");
    expect(tokens).toContainEqual({ kind: "ident", value: "+" });
    expect(tokens).toContainEqual({ kind: "ident", value: "u" });
    expect(tokens).toContainEqual({ kind: "number", value: 1 });
  });
});

describe("parseSexp", () => {
  it("(:c Nat)", () => {
    const node = parseSexp("(:c Nat)");
    expect(node).toEqual<SexpNode>({
      kind: "list",
      children: [
        { kind: "keyword", value: "c" },
        { kind: "atom", value: "Nat" },
      ],
    });
  });

  it("bare number", () => {
    const node = parseSexp("0");
    expect(node).toEqual<SexpNode>({ kind: "number", value: 0 });
  });

  it("nested forall", () => {
    const node = parseSexp("(:forall a (:c Nat) (:forall b (:c Nat) (:c Nat)))");
    expect(node.kind).toBe("list");
    if (node.kind === "list") {
      expect(node.children[0]).toEqual({ kind: "keyword", value: "forall" });
      expect(node.children[1]).toEqual({ kind: "atom", value: "a" });
      // 3rd child is (:c Nat)
      expect(node.children[2]).toEqual({
        kind: "list",
        children: [
          { kind: "keyword", value: "c" },
          { kind: "atom", value: "Nat" },
        ],
      });
      // 4th child is the inner forall
      expect(node.children[3].kind).toBe("list");
    }
  });

  it("application with nested const", () => {
    const node = parseSexp("((:c List) (:c Nat))");
    expect(node.kind).toBe("list");
    if (node.kind === "list") {
      expect(node.children).toHaveLength(2);
      expect(node.children[0].kind).toBe("list"); // (:c List)
      expect(node.children[1].kind).toBe("list"); // (:c Nat)
    }
  });

  it("(:sort 0)", () => {
    const node = parseSexp("(:sort 0)");
    expect(node).toEqual<SexpNode>({
      kind: "list",
      children: [
        { kind: "keyword", value: "sort" },
        { kind: "number", value: 0 },
      ],
    });
  });

  it("(:sort (+ u 1))", () => {
    const node = parseSexp("(:sort (+ u 1))");
    expect(node.kind).toBe("list");
    if (node.kind === "list") {
      expect(node.children[0]).toEqual({ kind: "keyword", value: "sort" });
      const levelNode = node.children[1];
      expect(levelNode.kind).toBe("list");
      if (levelNode.kind === "list") {
        expect(levelNode.children[0]).toEqual({ kind: "atom", value: "+" });
        expect(levelNode.children[1]).toEqual({ kind: "atom", value: "u" });
        expect(levelNode.children[2]).toEqual({ kind: "number", value: 1 });
      }
    }
  });

  it("complex expression: Nat.add type", () => {
    const node = parseSexp("(:forall a (:c Nat) (:forall a (:c Nat) (:c Nat)))");
    expect(node.kind).toBe("list");
  });

  it("implicit binder", () => {
    const node = parseSexp("(:forall n (:c Nat) (:c Nat) :i)");
    expect(node.kind).toBe("list");
    if (node.kind === "list") {
      expect(node.children[node.children.length - 1]).toEqual({
        kind: "keyword",
        value: "i",
      });
    }
  });
});
