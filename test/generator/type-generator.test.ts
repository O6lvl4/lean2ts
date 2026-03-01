import { describe, it, expect } from "vitest";
import { generateTypes, renderType } from "../../src/generator/type-generator.js";
import type { LeanDecl, IRType } from "../../src/ir/types.js";

describe("renderType", () => {
  it("primitive", () => {
    expect(renderType({ kind: "primitive", name: "number" })).toBe("number");
  });

  it("array", () => {
    expect(
      renderType({
        kind: "array",
        element: { kind: "primitive", name: "string" },
      })
    ).toBe("ReadonlyArray<string>");
  });

  it("option", () => {
    expect(
      renderType({
        kind: "option",
        inner: { kind: "primitive", name: "number" },
      })
    ).toBe("number | undefined");
  });

  it("tuple", () => {
    expect(
      renderType({
        kind: "tuple",
        elements: [
          { kind: "primitive", name: "string" },
          { kind: "primitive", name: "number" },
        ],
      })
    ).toBe("readonly [string, number]");
  });

  it("ref", () => {
    expect(renderType({ kind: "ref", name: "Foo" })).toBe("Foo");
  });
});

describe("generateTypes", () => {
  it("structure → interface", () => {
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
          {
            name: "expenses",
            type: {
              kind: "array",
              element: {
                kind: "tuple",
                elements: [
                  { kind: "primitive", name: "string" },
                  { kind: "primitive", name: "number" },
                ],
              },
            },
            hasDefault: true,
          },
        ],
      },
    ];

    const result = generateTypes(decls);
    expect(result).toContain("export interface RevenueInput");
    expect(result).toContain("readonly monthlyRevenue: number;");
    expect(result).toContain("readonly expenses?: ReadonlyArray<readonly [string, number]>;");
  });

  it("inductive → discriminated union + guards", () => {
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

    const result = generateTypes(decls);
    expect(result).toContain("export type RecordType =");
    expect(result).toContain('{ readonly tag: "revenue" }');
    expect(result).toContain('{ readonly tag: "salary" }');
    expect(result).toContain("export function isRevenue");
    expect(result).toContain("export function isSalary");
  });

  it("structure with typeParams → generic interface", () => {
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

    const result = generateTypes(decls);
    expect(result).toContain("export interface Wrapper<α>");
    expect(result).toContain("readonly value: α;");
  });

  it("inductive with typeParams → generic union + guards", () => {
    const decls: LeanDecl[] = [
      {
        kind: "inductive",
        name: "Option",
        typeParams: [{ name: "α" }],
        variants: [
          {
            name: "Option.some",
            tag: "some",
            fields: [
              { name: "val", type: { kind: "ref", name: "α" }, hasDefault: false },
            ],
          },
          { name: "Option.none", tag: "none", fields: [] },
        ],
      },
    ];

    const result = generateTypes(decls);
    expect(result).toContain("export type Option<α> =");
    expect(result).toContain("readonly val: α");
    expect(result).toContain("export function isSome<α>(x: Option<α>)");
    expect(result).toContain("export function isNone<α>(x: Option<α>)");
  });

  it("inductive with fields → union with payload", () => {
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

    const result = generateTypes(decls);
    expect(result).toContain("readonly radius: number");
    expect(result).toContain("readonly width: number");
    expect(result).toContain("readonly height: number");
  });
});
