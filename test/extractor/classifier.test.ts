import { describe, it, expect } from "vitest";
import { classify } from "../../src/extractor/classifier.js";
import type { EnvInspectResponse } from "../../src/pantograph/protocol.js";

describe("classify", () => {
  it("constructorInfo → skip", () => {
    const info: EnvInspectResponse = {
      type: { pp: "RecordType" },
      constructorInfo: { induct: "RecordType", cidx: 0, numParams: 0, numFields: 0 },
    };
    expect(classify("RecordType.revenue", info)).toBe("skip");
  });

  it("recursorInfo → skip", () => {
    const info: EnvInspectResponse = {
      type: { pp: "..." },
      recursorInfo: {
        all: ["RecordType"],
        numParams: 0,
        numIndices: 0,
        numMotives: 1,
        numMinors: 2,
        rules: [],
      },
    };
    expect(classify("RecordType.rec", info)).toBe("skip");
  });

  it("inductInfo with 1 ctor → structure", () => {
    const info: EnvInspectResponse = {
      type: { pp: "Type" },
      inductInfo: {
        numParams: 0,
        numIndices: 0,
        all: ["RevenueInput"],
        ctors: ["RevenueInput.mk"],
        isRec: false,
        isReflexive: false,
        isNested: false,
      },
    };
    expect(classify("RevenueInput", info)).toBe("structure");
  });

  it("inductInfo with 2+ ctors → inductive", () => {
    const info: EnvInspectResponse = {
      type: { pp: "Type" },
      inductInfo: {
        numParams: 0,
        numIndices: 0,
        all: ["RecordType"],
        ctors: ["RecordType.revenue", "RecordType.salary"],
        isRec: false,
        isReflexive: false,
        isNested: false,
      },
    };
    expect(classify("RecordType", info)).toBe("inductive");
  });

  it("type with = → theorem", () => {
    const info: EnvInspectResponse = {
      type: { pp: "∀ (input : RevenueInput), input.expenses = [] → totalExpenses input = 0" },
    };
    expect(classify("totalExpenses_empty", info)).toBe("theorem");
  });

  it("function type without Prop → def", () => {
    const info: EnvInspectResponse = {
      type: { pp: "(input : RevenueInput) → Nat" },
    };
    expect(classify("totalExpenses", info)).toBe("def");
  });
});
