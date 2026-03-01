import { describe, it, expect } from "vitest";
import { generateStubs } from "../../src/generator/stub-generator.js";
import type { LeanDecl } from "../../src/ir/types.js";

describe("generateStubs", () => {
  it("returns empty for no defs", () => {
    expect(generateStubs([])).toBe("");
  });

  it("generates function stub for def", () => {
    const decls: LeanDecl[] = [
      {
        kind: "def",
        name: "totalExpenses",
        typeParams: [],
        params: [
          {
            name: "input",
            type: { kind: "ref", name: "RevenueInput" },
          },
        ],
        returnType: { kind: "primitive", name: "number" },
      },
    ];

    const result = generateStubs(decls);
    expect(result).toContain("export function totalExpenses");
    expect(result).toContain("input: RevenueInput");
    expect(result).toContain(": number");
    expect(result).toContain("// TODO: implement");
    expect(result).toContain("return 0;");
  });

  it("generates generic function stub for def with typeParams", () => {
    const decls: LeanDecl[] = [
      {
        kind: "def",
        name: "swap",
        typeParams: [{ name: "α" }, { name: "β" }],
        params: [
          { name: "a", type: { kind: "ref", name: "α" } },
          { name: "b", type: { kind: "ref", name: "β" } },
        ],
        returnType: { kind: "tuple", elements: [{ kind: "ref", name: "β" }, { kind: "ref", name: "α" }] },
      },
    ];

    const result = generateStubs(decls);
    expect(result).toContain("export function swap<α, β>(a: α, b: β)");
    expect(result).toContain("readonly [β, α]");
  });

  it("sanitizes reserved word parameter names", () => {
    const decls: LeanDecl[] = [
      {
        kind: "def",
        name: "listHead",
        typeParams: [{ name: "α" }],
        params: [
          { name: "xs", type: { kind: "array", element: { kind: "ref", name: "α" } } },
          { name: "default", type: { kind: "ref", name: "α" } },
        ],
        returnType: { kind: "ref", name: "α" },
      },
    ];

    const result = generateStubs(decls);
    expect(result).toContain("default_: α");
    expect(result).not.toContain("default:");
  });

  it("imports types from types.ts when structures exist", () => {
    const decls: LeanDecl[] = [
      {
        kind: "structure",
        name: "RevenueInput",
        typeParams: [],
        fields: [],
      },
      {
        kind: "def",
        name: "calc",
        typeParams: [],
        params: [
          { name: "input", type: { kind: "ref", name: "RevenueInput" } },
        ],
        returnType: { kind: "primitive", name: "number" },
      },
    ];

    const result = generateStubs(decls);
    expect(result).toContain('import type { RevenueInput } from "./types.js"');
  });
});
