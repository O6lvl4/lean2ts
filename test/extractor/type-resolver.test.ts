import { describe, it, expect } from "vitest";
import { resolveType } from "../../src/extractor/type-resolver.js";
import type { IRType } from "../../src/ir/types.js";

describe("resolveType", () => {
  it("Nat → number", () => {
    expect(resolveType("Nat")).toEqual<IRType>({
      kind: "primitive",
      name: "number",
    });
  });

  it("String → string", () => {
    expect(resolveType("String")).toEqual<IRType>({
      kind: "primitive",
      name: "string",
    });
  });

  it("Bool → boolean", () => {
    expect(resolveType("Bool")).toEqual<IRType>({
      kind: "primitive",
      name: "boolean",
    });
  });

  it("Int → number", () => {
    expect(resolveType("Int")).toEqual<IRType>({
      kind: "primitive",
      name: "number",
    });
  });

  it("List Nat → ReadonlyArray<number>", () => {
    expect(resolveType("List Nat")).toEqual<IRType>({
      kind: "array",
      element: { kind: "primitive", name: "number" },
    });
  });

  it("Option String → string | undefined", () => {
    expect(resolveType("Option String")).toEqual<IRType>({
      kind: "option",
      inner: { kind: "primitive", name: "string" },
    });
  });

  it("String × Nat → readonly [string, number]", () => {
    expect(resolveType("String × Nat")).toEqual<IRType>({
      kind: "tuple",
      elements: [
        { kind: "primitive", name: "string" },
        { kind: "primitive", name: "number" },
      ],
    });
  });

  it("List (String × Nat) → ReadonlyArray<readonly [string, number]>", () => {
    expect(resolveType("List (String × Nat)")).toEqual<IRType>({
      kind: "array",
      element: {
        kind: "tuple",
        elements: [
          { kind: "primitive", name: "string" },
          { kind: "primitive", name: "number" },
        ],
      },
    });
  });

  it("Nat → Nat → Nat → function type", () => {
    const result = resolveType("Nat → Nat → Nat");
    expect(result).toEqual<IRType>({
      kind: "function",
      params: [
        { name: "_", type: { kind: "primitive", name: "number" } },
        { name: "_", type: { kind: "primitive", name: "number" } },
      ],
      returnType: { kind: "primitive", name: "number" },
    });
  });

  it("unknown type → ref", () => {
    expect(resolveType("MyCustomType")).toEqual<IRType>({
      kind: "ref",
      name: "MyCustomType",
    });
  });

  it("Prop → void", () => {
    expect(resolveType("Prop")).toEqual<IRType>({
      kind: "primitive",
      name: "void",
    });
  });

  it("() → void", () => {
    expect(resolveType("()")).toEqual<IRType>({
      kind: "primitive",
      name: "void",
    });
  });
});
