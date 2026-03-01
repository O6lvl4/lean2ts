import { describe, it, expect } from "vitest";
import { parseDefFromExpr } from "../../src/extractor/def-parser.js";
import type { LeanExpr } from "../../src/sexp/lean-expr.js";

describe("parseDefFromExpr", () => {
  it("extracts explicit Type params as typeParams", () => {
    // swap (α : Type) (β : Type) (a : α) (b : β) : β × α
    const expr: LeanExpr = {
      tag: "forallE",
      name: "α",
      type: { tag: "sort", level: { tag: "num", value: 1 } },
      body: {
        tag: "forallE",
        name: "β",
        type: { tag: "sort", level: { tag: "num", value: 1 } },
        body: {
          tag: "forallE",
          name: "a",
          type: { tag: "bvar", index: 1 }, // α
          body: {
            tag: "forallE",
            name: "b",
            type: { tag: "bvar", index: 1 }, // β
            body: { tag: "bvar", index: 1 }, // β (return type)
            binder: "default",
          },
          binder: "default",
        },
        binder: "default",
      },
      binder: "default",
    };

    const result = parseDefFromExpr("MyModule.swap", expr);
    expect(result.name).toBe("swap");
    expect(result.typeParams).toEqual([{ name: "α" }, { name: "β" }]);
    expect(result.params).toHaveLength(2);
    expect(result.params[0].name).toBe("a");
    expect(result.params[1].name).toBe("b");
  });

  it("extracts implicit type params correctly", () => {
    // identity {α : Type} (a : α) : α
    const expr: LeanExpr = {
      tag: "forallE",
      name: "α",
      type: { tag: "sort", level: { tag: "num", value: 1 } },
      body: {
        tag: "forallE",
        name: "a",
        type: { tag: "bvar", index: 0 }, // α
        body: { tag: "bvar", index: 1 }, // α
        binder: "default",
      },
      binder: "implicit",
    };

    const result = parseDefFromExpr("identity", expr);
    expect(result.typeParams).toEqual([{ name: "α" }]);
    expect(result.params).toHaveLength(1);
    expect(result.params[0].name).toBe("a");
  });

  it("handles no type params", () => {
    // add (x : Nat) (y : Nat) : Nat
    const expr: LeanExpr = {
      tag: "forallE",
      name: "x",
      type: { tag: "const", name: "Nat" },
      body: {
        tag: "forallE",
        name: "y",
        type: { tag: "const", name: "Nat" },
        body: { tag: "const", name: "Nat" },
        binder: "default",
      },
      binder: "default",
    };

    const result = parseDefFromExpr("add", expr);
    expect(result.typeParams).toEqual([]);
    expect(result.params).toHaveLength(2);
  });

  it("handles universe polymorphic Type u", () => {
    // foo (α : Type u) (x : α) : α
    const expr: LeanExpr = {
      tag: "forallE",
      name: "α",
      type: { tag: "sort", level: { tag: "param", name: "u" } },
      body: {
        tag: "forallE",
        name: "x",
        type: { tag: "bvar", index: 0 }, // α
        body: { tag: "bvar", index: 1 }, // α
        binder: "default",
      },
      binder: "default",
    };

    const result = parseDefFromExpr("foo", expr);
    expect(result.typeParams).toEqual([{ name: "α" }]);
    expect(result.params).toHaveLength(1);
    expect(result.params[0].name).toBe("x");
  });
});
