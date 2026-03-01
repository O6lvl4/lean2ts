import { describe, it, expect } from "vitest";
import { generateArbitraries, renderArbitrary } from "../../src/generator/arbitrary-generator.js";
import type { LeanDecl, IRType } from "../../src/ir/types.js";

describe("renderArbitrary", () => {
  it("number → fc.nat()", () => {
    expect(renderArbitrary({ kind: "primitive", name: "number" })).toBe("fc.nat()");
  });

  it("string → fc.string()", () => {
    expect(renderArbitrary({ kind: "primitive", name: "string" })).toBe("fc.string()");
  });

  it("array → fc.array(...)", () => {
    expect(
      renderArbitrary({
        kind: "array",
        element: { kind: "primitive", name: "number" },
      })
    ).toBe("fc.array(fc.nat())");
  });

  it("option → fc.option(...)", () => {
    expect(
      renderArbitrary({
        kind: "option",
        inner: { kind: "primitive", name: "string" },
      })
    ).toBe('fc.option(fc.string(), { nil: undefined })');
  });

  it("tuple → fc.tuple(...)", () => {
    expect(
      renderArbitrary({
        kind: "tuple",
        elements: [
          { kind: "primitive", name: "string" },
          { kind: "primitive", name: "number" },
        ],
      })
    ).toBe("fc.tuple(fc.string(), fc.nat())");
  });
});

describe("generateArbitraries", () => {
  it("structure → fc.record", () => {
    const decls: LeanDecl[] = [
      {
        kind: "structure",
        name: "RevenueInput",
        typeParams: [],
        fields: [
          {
            name: "monthlyRevenue",
            type: { kind: "primitive", name: "number" },
            hasDefault: false,
          },
        ],
      },
    ];

    const result = generateArbitraries(decls);
    expect(result).toContain("export const arbRevenueInput");
    expect(result).toContain("fc.record");
    expect(result).toContain("monthlyRevenue: fc.nat()");
  });

  it("inductive (no fields) → fc.oneof with constants", () => {
    const decls: LeanDecl[] = [
      {
        kind: "inductive",
        name: "RecordType",
        typeParams: [],
        variants: [
          { name: "RecordType.revenue", tag: "revenue", fields: [] },
          { name: "RecordType.salary", tag: "salary", fields: [] },
        ],
      },
    ];

    const result = generateArbitraries(decls);
    expect(result).toContain("export const arbRecordType");
    expect(result).toContain("fc.oneof");
    expect(result).toContain('fc.constant({ tag: "revenue" as const })');
  });

  it("structure with typeParams → factory function", () => {
    const decls: LeanDecl[] = [
      {
        kind: "structure",
        name: "Wrapper",
        typeParams: [{ name: "α" }],
        fields: [
          {
            name: "value",
            type: { kind: "ref", name: "α" },
            hasDefault: false,
          },
        ],
      },
    ];

    const result = generateArbitraries(decls);
    expect(result).toContain("export function arbWrapper<α>(arbΑ: fc.Arbitrary<α>): fc.Arbitrary<Wrapper<α>>");
    expect(result).toContain("value: arbΑ,");
  });

  it("inductive with typeParams → factory function", () => {
    const decls: LeanDecl[] = [
      {
        kind: "inductive",
        name: "MyOption",
        typeParams: [{ name: "α" }],
        variants: [
          {
            name: "MyOption.some",
            tag: "some",
            fields: [
              { name: "val", type: { kind: "ref", name: "α" }, hasDefault: false },
            ],
          },
          { name: "MyOption.none", tag: "none", fields: [] },
        ],
      },
    ];

    const result = generateArbitraries(decls);
    expect(result).toContain("export function arbMyOption<α>(arbΑ: fc.Arbitrary<α>): fc.Arbitrary<MyOption<α>>");
    expect(result).toContain("val: arbΑ");
  });

  it("inductive (with fields) → fc.oneof with records", () => {
    const decls: LeanDecl[] = [
      {
        kind: "inductive",
        name: "Shape",
        typeParams: [],
        variants: [
          {
            name: "Shape.circle",
            tag: "circle",
            fields: [
              { name: "radius", type: { kind: "primitive", name: "number" }, hasDefault: false },
            ],
          },
          {
            name: "Shape.rect",
            tag: "rect",
            fields: [
              { name: "width", type: { kind: "primitive", name: "number" }, hasDefault: false },
              { name: "height", type: { kind: "primitive", name: "number" }, hasDefault: false },
            ],
          },
        ],
      },
    ];

    const result = generateArbitraries(decls);
    expect(result).toContain("fc.record({ tag: fc.constant(\"circle\" as const), radius: fc.nat() })");
    expect(result).toContain("width: fc.nat()");
  });
});
