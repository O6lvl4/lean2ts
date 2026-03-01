import { describe, it, expect } from "vitest";
import { parseTheorem } from "../../src/extractor/theorem-parser.js";

describe("parseTheorem", () => {
  it("∀ + 含意 + 等式をパースする", () => {
    const result = parseTheorem("totalExpenses_empty", {
      type: {
        pp: "∀ (input : RevenueInput), input.expenses = [] → totalExpenses input = 0",
      },
    });

    expect(result.kind).toBe("theorem");
    expect(result.name).toBe("totalExpenses_empty");
    expect(result.universals).toHaveLength(1);
    expect(result.universals[0].name).toBe("input");
    expect(result.prop.kind).toBe("implies");
  });

  it("単純な等式をパースする", () => {
    const result = parseTheorem("Ns.simple_eq", {
      type: { pp: "∀ (x : Nat), x + 0 = x" },
    });

    expect(result.name).toBe("simple_eq");
    expect(result.universals).toHaveLength(1);
    expect(result.universals[0].name).toBe("x");
    expect(result.prop.kind).toBe("eq");
  });

  it("不等式をパースする", () => {
    const result = parseTheorem("ne_test", {
      type: { pp: "∀ (x : Nat), x + 1 ≠ 0" },
    });

    expect(result.prop.kind).toBe("neq");
  });

  it("複数パラメータをパースする", () => {
    const result = parseTheorem("add_comm", {
      type: { pp: "∀ (x : Nat) (y : Nat), x + y = y + x" },
    });

    expect(result.universals).toHaveLength(2);
    expect(result.universals[0].name).toBe("x");
    expect(result.universals[1].name).toBe("y");
    expect(result.prop.kind).toBe("eq");
  });
});
