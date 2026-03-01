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

  it("imports types from types.ts when structures exist", () => {
    const decls: LeanDecl[] = [
      {
        kind: "structure",
        name: "RevenueInput",
        fields: [],
      },
      {
        kind: "def",
        name: "calc",
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
