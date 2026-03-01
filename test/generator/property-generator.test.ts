import { describe, it, expect } from "vitest";
import { generateProperties } from "../../src/generator/property-generator.js";
import type { LeanDecl } from "../../src/ir/types.js";

describe("generateProperties", () => {
  it("returns empty for no theorems", () => {
    const result = generateProperties([]);
    expect(result).toBe("");
  });

  it("generates fc.property for theorem with universals", () => {
    const decls: LeanDecl[] = [
      {
        kind: "theorem",
        name: "add_comm",
        universals: [
          { name: "x", type: { kind: "primitive", name: "number" } },
          { name: "y", type: { kind: "primitive", name: "number" } },
        ],
        prop: {
          kind: "eq",
          left: { kind: "raw", text: "x + y" },
          right: { kind: "raw", text: "y + x" },
        },
      },
    ];

    const result = generateProperties(decls);
    expect(result).toContain("fc.assert");
    expect(result).toContain("fc.property(fc.nat(), fc.nat()");
    expect(result).toContain("(x, y)");
    expect(result).toContain("===");
  });

  it("generates implies as !P || Q", () => {
    const decls: LeanDecl[] = [
      {
        kind: "theorem",
        name: "impl_test",
        universals: [
          { name: "x", type: { kind: "primitive", name: "number" } },
        ],
        prop: {
          kind: "implies",
          premise: {
            kind: "eq",
            left: { kind: "var", name: "x" },
            right: { kind: "literal", value: 0 },
          },
          conclusion: {
            kind: "eq",
            left: { kind: "call", func: "f", args: [{ kind: "var", name: "x" }] },
            right: { kind: "literal", value: 0 },
          },
        },
      },
    ];

    const result = generateProperties(decls);
    expect(result).toContain("!(x === 0)");
    expect(result).toContain("||");
  });

  it("generates forall_in as .every()", () => {
    const decls: LeanDecl[] = [
      {
        kind: "theorem",
        name: "all_pos",
        universals: [
          { name: "xs", type: { kind: "array", element: { kind: "primitive", name: "number" } } },
        ],
        prop: {
          kind: "forall_in",
          variable: "x",
          collection: { kind: "var", name: "xs" },
          body: {
            kind: "eq",
            left: { kind: "var", name: "x" },
            right: { kind: "var", name: "x" },
          },
        },
      },
    ];

    const result = generateProperties(decls);
    expect(result).toContain(".every(");
  });

  it("renders inductive constructor refs as discriminated union literals", () => {
    const decls: LeanDecl[] = [
      {
        kind: "inductive",
        name: "Weather",
        typeParams: [],
        variants: [
          { name: "sunny", tag: "sunny", fields: [] },
          { name: "cloudy", tag: "cloudy", fields: [] },
          { name: "rainy", tag: "rainy", fields: [{ name: "amount", type: { kind: "primitive", name: "number" } }] },
        ],
      },
      {
        kind: "def",
        name: "weatherSeverity",
        typeParams: [],
        params: [{ name: "w", type: { kind: "ref", name: "Weather" } }],
        returnType: { kind: "primitive", name: "number" },
      },
      {
        kind: "theorem",
        name: "sunny_is_zero",
        universals: [],
        prop: {
          kind: "eq",
          left: {
            kind: "call",
            func: "weatherSeverity",
            args: [{ kind: "field", object: { kind: "var", name: "Weather" }, field: "sunny" }],
          },
          right: { kind: "literal", value: 0 },
        },
      },
    ];

    const result = generateProperties(decls);
    // Weather.sunny → { tag: "sunny" } に変換されている
    expect(result).toContain('{ tag: "sunny" }');
    // .tag === "sunny" ではなく、左辺は関数呼び出しなので === 0
    expect(result).toContain("weatherSeverity");
    expect(result).not.toContain("Weather.sunny");
  });

  it("renders zero-field ctor eq as .tag comparison", () => {
    const decls: LeanDecl[] = [
      {
        kind: "inductive",
        name: "Color",
        typeParams: [],
        variants: [
          { name: "red", tag: "red", fields: [] },
          { name: "blue", tag: "blue", fields: [] },
        ],
      },
      {
        kind: "theorem",
        name: "color_eq",
        universals: [
          { name: "c", type: { kind: "ref", name: "Color" } },
        ],
        prop: {
          kind: "eq",
          left: { kind: "var", name: "c" },
          right: { kind: "field", object: { kind: "var", name: "Color" }, field: "red" },
        },
      },
    ];

    const result = generateProperties(decls);
    // c === Color.red → c.tag === "red"
    expect(result).toContain('.tag === "red"');
    expect(result).not.toContain("Color.red");
  });

  it("generates raw as TODO comment", () => {
    const decls: LeanDecl[] = [
      {
        kind: "theorem",
        name: "complex_thm",
        universals: [],
        prop: { kind: "raw", text: "some complex proposition" },
      },
    ];

    const result = generateProperties(decls);
    expect(result).toContain("// TODO:");
    expect(result).toContain("return true;");
  });
});
