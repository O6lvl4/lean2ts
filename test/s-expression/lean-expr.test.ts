import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSexp } from "../../src/s-expression/parser.js";
import {
  sexpToLeanExpr,
  referencesBVar,
  getAppHeadName,
  isPropSort,
  unfoldForalls,
  type LeanExpr,
} from "../../src/s-expression/lean-expr.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parse(input: string): LeanExpr {
  return sexpToLeanExpr(parseSexp(input));
}

describe("sexpToLeanExpr", () => {
  it("(:c Nat) → const", () => {
    const expr = parse("(:c Nat)");
    expect(expr).toEqual<LeanExpr>({ tag: "const", name: "Nat" });
  });

  it("bare number → bvar", () => {
    const expr = parse("0");
    expect(expr).toEqual<LeanExpr>({ tag: "bvar", index: 0 });
  });

  it("(:sort 0) → sort (Prop)", () => {
    const expr = parse("(:sort 0)");
    expect(expr.tag).toBe("sort");
    if (expr.tag === "sort") {
      expect(expr.level).toEqual({ tag: "zero" });
    }
  });

  it("(:sort 1) → sort (Type)", () => {
    const expr = parse("(:sort 1)");
    expect(expr.tag).toBe("sort");
    if (expr.tag === "sort") {
      expect(expr.level).toEqual({ tag: "num", value: 1 });
    }
  });

  it("(:sort (+ u 1)) → sort (Type u)", () => {
    const expr = parse("(:sort (+ u 1))");
    expect(expr.tag).toBe("sort");
    if (expr.tag === "sort") {
      expect(expr.level).toEqual({
        tag: "succ",
        base: { tag: "param", name: "u" },
        offset: 1,
      });
    }
  });

  it("(:lit 42) → lit number", () => {
    const expr = parse("(:lit 42)");
    expect(expr).toEqual<LeanExpr>({ tag: "lit", value: 42 });
  });

  it('(:lit "hello") → lit string', () => {
    const expr = parse('(:lit "hello")');
    expect(expr).toEqual<LeanExpr>({ tag: "lit", value: "hello" });
  });

  it("(:forall a (:c Nat) (:c Nat)) → forallE (non-dependent)", () => {
    const expr = parse("(:forall a (:c Nat) (:c Nat))");
    expect(expr.tag).toBe("forallE");
    if (expr.tag === "forallE") {
      expect(expr.name).toBe("a");
      expect(expr.type).toEqual({ tag: "const", name: "Nat" });
      expect(expr.body).toEqual({ tag: "const", name: "Nat" });
      expect(expr.binder).toBe("default");
    }
  });

  it("(:forall n (:c Nat) 0 :i) → implicit forallE", () => {
    const expr = parse("(:forall n (:c Nat) 0 :i)");
    expect(expr.tag).toBe("forallE");
    if (expr.tag === "forallE") {
      expect(expr.name).toBe("n");
      expect(expr.binder).toBe("implicit");
      expect(expr.body).toEqual({ tag: "bvar", index: 0 });
    }
  });

  it("(:lambda x (:c Nat) 0) → lambda", () => {
    const expr = parse("(:lambda x (:c Nat) 0)");
    expect(expr.tag).toBe("lambda");
    if (expr.tag === "lambda") {
      expect(expr.name).toBe("x");
      expect(expr.type).toEqual({ tag: "const", name: "Nat" });
      expect(expr.body).toEqual({ tag: "bvar", index: 0 });
    }
  });

  it("(:let x (:c Nat) (:lit 5) 0) → letE", () => {
    const expr = parse("(:let x (:c Nat) (:lit 5) 0)");
    expect(expr.tag).toBe("letE");
    if (expr.tag === "letE") {
      expect(expr.name).toBe("x");
      expect(expr.value).toEqual({ tag: "lit", value: 5 });
    }
  });

  it("((:c List) (:c Nat)) → app", () => {
    const expr = parse("((:c List) (:c Nat))");
    expect(expr.tag).toBe("app");
    if (expr.tag === "app") {
      expect(expr.fn).toEqual({ tag: "const", name: "List" });
      expect(expr.args).toEqual([{ tag: "const", name: "Nat" }]);
    }
  });

  it("(:fv _uniq.42) → fvar", () => {
    const expr = parse("(:fv _uniq.42)");
    expect(expr.tag).toBe("fvar");
    if (expr.tag === "fvar") {
      expect(expr.name).toBe("_uniq.42");
    }
  });

  it("(:proj Prod 0 x) → proj", () => {
    const expr = parse("(:proj Prod 0 (:fv x))");
    expect(expr.tag).toBe("proj");
    if (expr.tag === "proj") {
      expect(expr.typeName).toBe("Prod");
      expect(expr.idx).toBe(0);
    }
  });

  it("Nat → Nat → Nat (nested forall)", () => {
    const expr = parse("(:forall a (:c Nat) (:forall a (:c Nat) (:c Nat)))");
    expect(expr.tag).toBe("forallE");
    if (expr.tag === "forallE") {
      expect(expr.body.tag).toBe("forallE");
    }
  });

  it("complex: Eq application", () => {
    // (:c Eq) applied to type and two terms
    const expr = parse("((:c Eq) (:c Nat) 0 (:lit 0))");
    expect(expr.tag).toBe("app");
    if (expr.tag === "app") {
      expect(getAppHeadName(expr)).toBe("Eq");
      expect(expr.args).toHaveLength(3);
    }
  });

  it("instance binder :ii", () => {
    const expr = parse("(:forall inst ((:c Add) (:c Nat)) (:c Nat) :ii)");
    expect(expr.tag).toBe("forallE");
    if (expr.tag === "forallE") {
      expect(expr.binder).toBe("instImplicit");
    }
  });
});

describe("referencesBVar", () => {
  it("bvar 0 references 0", () => {
    expect(referencesBVar(parse("0"), 0)).toBe(true);
  });

  it("bvar 1 does not reference 0", () => {
    expect(referencesBVar(parse("1"), 0)).toBe(false);
  });

  it("const does not reference anything", () => {
    expect(referencesBVar(parse("(:c Nat)"), 0)).toBe(false);
  });

  it("app containing bvar references it", () => {
    expect(referencesBVar(parse("((:c Nat.succ) 0)"), 0)).toBe(true);
  });

  it("forallE body shifts index", () => {
    // (:forall a (:c Nat) 0) - body's 0 refers to inner binder, not outer
    // referencesBVar checks if the *whole* expression refers to bvar at index 0
    // The body has bvar 0 which after shift refers to the inner binder
    const expr = parse("(:forall a (:c Nat) 0)");
    // From outside, bvar 0 in the body maps to bvar 1 from outside
    expect(referencesBVar(expr, 0)).toBe(false);
  });
});

describe("isPropSort", () => {
  it("(:sort 0) is Prop", () => {
    expect(isPropSort(parse("(:sort 0)"))).toBe(true);
  });

  it("(:sort 1) is not Prop", () => {
    expect(isPropSort(parse("(:sort 1)"))).toBe(false);
  });
});

describe("unfoldForalls", () => {
  it("Nat → Nat → Nat", () => {
    const expr = parse("(:forall a (:c Nat) (:forall b (:c Nat) (:c Nat)))");
    const { params, body } = unfoldForalls(expr);
    expect(params).toHaveLength(2);
    expect(params[0].name).toBe("a");
    expect(params[1].name).toBe("b");
    expect(body).toEqual({ tag: "const", name: "Nat" });
  });

  it("implicit params are marked", () => {
    const expr = parse("(:forall n (:c Nat) (:forall m (:c Nat) (:c Nat) :i) :i)");
    const { params } = unfoldForalls(expr);
    expect(params).toHaveLength(2);
    expect(params[0].binder).toBe("implicit");
    expect(params[1].binder).toBe("implicit");
  });

  it("non-forall body is returned as-is", () => {
    const expr = parse("(:c Nat)");
    const { params, body } = unfoldForalls(expr);
    expect(params).toHaveLength(0);
    expect(body).toEqual({ tag: "const", name: "Nat" });
  });
});

describe("getAppHeadName", () => {
  it("const → name", () => {
    expect(getAppHeadName(parse("(:c Eq)"))).toBe("Eq");
  });

  it("app with const head", () => {
    expect(getAppHeadName(parse("((:c List) (:c Nat))"))).toBe("List");
  });

  it("bvar → undefined", () => {
    expect(getAppHeadName(parse("0"))).toBeUndefined();
  });
});

// ─── Real Pantograph output verification ───

describe("real Pantograph sexp parsing", () => {
  const realDataPath = resolve(__dirname, "../fixtures/real-pantograph-output.json");
  let realData: any;
  try {
    realData = JSON.parse(readFileSync(realDataPath, "utf-8"));
  } catch {
    // File may not exist in CI
    realData = null;
  }

  function countUnknowns(expr: LeanExpr): number {
    if (expr.tag === "unknown") return 1;
    let count = 0;
    if (expr.tag === "app") {
      count += countUnknowns(expr.fn);
      for (const a of expr.args) count += countUnknowns(a);
    }
    if ("type" in expr && typeof (expr as any).type === "object" && (expr as any).type?.tag) {
      count += countUnknowns((expr as any).type);
    }
    if ("body" in expr && typeof (expr as any).body === "object" && (expr as any).body?.tag) {
      count += countUnknowns((expr as any).body);
    }
    if ("value" in expr && typeof (expr as any).value === "object" && (expr as any).value?.tag) {
      count += countUnknowns((expr as any).value);
    }
    if (expr.tag === "proj") count += countUnknowns(expr.expr);
    return count;
  }

  it.skipIf(!realData)("all sexp strings parse without errors", () => {
    const errors: string[] = [];
    for (const [name, info] of Object.entries(realData!.inspect as Record<string, any>)) {
      for (const field of ["type", "value"]) {
        const sexp = info[field]?.sexp;
        if (!sexp) continue;
        try {
          parseSexp(sexp);
        } catch (e: any) {
          errors.push(`${name}.${field}: ${e.message}`);
        }
      }
    }
    expect(errors).toEqual([]);
  });

  it.skipIf(!realData)("all sexp strings convert to LeanExpr without unknown nodes", () => {
    const issues: string[] = [];
    for (const [name, info] of Object.entries(realData!.inspect as Record<string, any>)) {
      for (const field of ["type", "value"]) {
        const sexp = info[field]?.sexp;
        if (!sexp) continue;
        const node = parseSexp(sexp);
        const expr = sexpToLeanExpr(node);
        const unk = countUnknowns(expr);
        if (unk > 0) {
          issues.push(`${name}.${field}: ${unk} unknown nodes`);
        }
      }
    }
    expect(issues).toEqual([]);
  });

  it.skipIf(!realData)("key declarations parse to expected structure", () => {
    const inspect = realData!.inspect as Record<string, any>;

    // Point.mk: (:forall x (:c Nat) (:forall y (:c Nat) (:c Point)))
    const pointMk = parse(inspect["Point.mk"].type.sexp);
    expect(pointMk.tag).toBe("forallE");
    if (pointMk.tag === "forallE") {
      expect(pointMk.name).toBe("x");
      expect(pointMk.binder).toBe("default");
    }

    // Wrapper.mk has implicit type param
    const wrapperMk = parse(inspect["Wrapper.mk"].type.sexp);
    const wParams = unfoldForalls(wrapperMk);
    expect(wParams.params[0].binder).toBe("implicit"); // α
    expect(wParams.params[1].binder).toBe("default"); // value
    expect(wParams.params[2].binder).toBe("default"); // label

    // stringify has universe polymorphism and instance implicit
    const stringify = parse(inspect["stringify"].type.sexp);
    const sParams = unfoldForalls(stringify);
    expect(sParams.params[0].binder).toBe("implicit"); // α
    expect(sParams.params[1].binder).toBe("instImplicit"); // [ToString α]
    expect(sParams.params[2].binder).toBe("default"); // x
    // Universe level check
    if (sParams.params[0].type.tag === "sort") {
      expect(sParams.params[0].type.level.tag).toBe("succ");
    }

    // add_zero theorem: Prop-valued conclusion
    const addZero = parse(inspect["add_zero"].type.sexp);
    const azParams = unfoldForalls(addZero);
    expect(azParams.params[0].name).toBe("n");
    expect(getAppHeadName(azParams.body)).toBe("Eq");

    // and_comm_prop: Prop params with (:sort 0)
    const andComm = parse(inspect["and_comm_prop"].type.sexp);
    const acParams = unfoldForalls(andComm);
    expect(acParams.params[0].name).toBe("a");
    expect(isPropSort(acParams.params[0].type)).toBe(true);
  });
});
