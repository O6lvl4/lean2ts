import { describe, it, expect } from "vitest";
import { readFile, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EnvInspectResponse } from "../../src/pantograph/protocol.js";
import { classify } from "../../src/extractor/classifier.js";
import { parseStructure } from "../../src/extractor/structure-parser.js";
import { parseInductive } from "../../src/extractor/inductive-parser.js";
import { parseTheorem } from "../../src/extractor/theorem-parser.js";
import { parseDef } from "../../src/extractor/def-parser.js";
import { extractFromInspectResults } from "../../src/extractor/index.js";
import { generate } from "../../src/generator/index.js";
import type { LeanDecl } from "../../src/ir/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "../fixtures");

interface FixtureData {
  processFile: { newConstants: string[] };
  inspect: Record<string, EnvInspectResponse>;
}

async function loadFixtures(): Promise<FixtureData> {
  const raw = await readFile(
    resolve(fixturesDir, "pantograph-responses.json"),
    "utf-8"
  );
  return JSON.parse(raw) as FixtureData;
}

describe("E2E: fixtures → IR → generated code", () => {
  it("全パイプラインを通して正しいコードが生成される", async () => {
    const fixtures = await loadFixtures();
    const constants = fixtures.processFile.newConstants;
    const inspectMap = fixtures.inspect;

    // Step 1: classify + parse
    const declarations: LeanDecl[] = [];
    const skipped: string[] = [];

    for (const name of constants) {
      const info = inspectMap[name];
      if (!info) continue;

      const kind = classify(name, info);
      if (kind === "skip") {
        skipped.push(name);
        continue;
      }

      switch (kind) {
        case "structure": {
          const ctorName = info.inductInfo?.ctors[0];
          const ctorInfo = ctorName ? inspectMap[ctorName] : undefined;
          if (ctorInfo) {
            declarations.push(parseStructure(name, info, ctorInfo));
          }
          break;
        }
        case "inductive": {
          const ctorInfos = new Map<string, EnvInspectResponse>();
          for (const cn of info.inductInfo?.ctors ?? []) {
            const ci = inspectMap[cn];
            if (ci) ctorInfos.set(cn, ci);
          }
          declarations.push(parseInductive(name, info, ctorInfos));
          break;
        }
        case "theorem":
          declarations.push(parseTheorem(name, info));
          break;
        case "def":
          declarations.push(parseDef(name, info));
          break;
      }
    }

    // Step 2: verify declarations
    expect(declarations.length).toBeGreaterThan(0);

    const structureNames = declarations
      .filter((d) => d.kind === "structure")
      .map((d) => d.name);
    const inductiveNames = declarations
      .filter((d) => d.kind === "inductive")
      .map((d) => d.name);
    const theoremNames = declarations
      .filter((d) => d.kind === "theorem")
      .map((d) => d.name);
    const defNames = declarations
      .filter((d) => d.kind === "def")
      .map((d) => d.name);

    expect(structureNames).toContain("RevenueInput");
    expect(inductiveNames).toContain("RecordType");
    expect(inductiveNames).toContain("Shape");
    expect(theoremNames).toContain("totalExpenses_empty");
    expect(defNames).toContain("totalExpenses");

    // コンストラクタ・リカーサーはスキップされる
    expect(skipped).toContain("RecordType.revenue");
    expect(skipped).toContain("RecordType.rec");

    // Step 3: generate
    const files = generate(declarations);

    // types.ts の検証
    expect(files["types.ts"]).toContain("export type RecordType =");
    expect(files["types.ts"]).toContain('{ readonly tag: "revenue" }');
    expect(files["types.ts"]).toContain("export interface RevenueInput");
    expect(files["types.ts"]).toContain("readonly monthlyRevenue: number");
    expect(files["types.ts"]).toContain("export type Shape =");
    expect(files["types.ts"]).toContain("isRevenue");
    expect(files["types.ts"]).toContain("isCircle");

    // arbitraries.ts の検証
    expect(files["arbitraries.ts"]).toContain("arbRecordType");
    expect(files["arbitraries.ts"]).toContain("arbRevenueInput");
    expect(files["arbitraries.ts"]).toContain("fc.oneof");
    expect(files["arbitraries.ts"]).toContain("fc.record");

    // properties.test.ts の検証
    expect(files["properties.test.ts"]).toContain("describe");
    expect(files["properties.test.ts"]).toContain("fc.assert");

    // stubs.ts の検証
    expect(files["stubs.ts"]).toContain("export function totalExpenses");
    expect(files["stubs.ts"]).toContain("// TODO: implement");
  });

  it("RevenueInput のフィールドが正しく抽出される", async () => {
    const fixtures = await loadFixtures();
    const info = fixtures.inspect["RevenueInput"];
    const ctorInfo = fixtures.inspect["RevenueInput.mk"];
    const result = parseStructure("RevenueInput", info, ctorInfo);

    expect(result.fields).toHaveLength(2);
    expect(result.fields[0].name).toBe("monthlyRevenue");
    expect(result.fields[0].type).toEqual({ kind: "primitive", name: "number" });
    expect(result.fields[0].hasDefault).toBe(false);

    expect(result.fields[1].name).toBe("expenses");
    expect(result.fields[1].hasDefault).toBe(true);
    // List (String × Nat) → ReadonlyArray<readonly [string, number]>
    expect(result.fields[1].type.kind).toBe("array");
  });

  it("Shape の variant が正しく抽出される", async () => {
    const fixtures = await loadFixtures();
    const info = fixtures.inspect["Shape"];
    const ctorInfos = new Map<string, EnvInspectResponse>();
    for (const cn of info.inductInfo!.ctors) {
      ctorInfos.set(cn, fixtures.inspect[cn]);
    }

    const result = parseInductive("Shape", info, ctorInfos);
    expect(result.variants).toHaveLength(2);
    expect(result.variants[0].tag).toBe("circle");
    expect(result.variants[0].fields).toHaveLength(1);
    expect(result.variants[0].fields[0].name).toBe("radius");
    expect(result.variants[1].tag).toBe("rect");
    expect(result.variants[1].fields).toHaveLength(2);
  });

  it("--no-tests --no-stubs で対応ファイルが空になる", async () => {
    const fixtures = await loadFixtures();
    const info = fixtures.inspect["RecordType"];
    const ctorInfos = new Map<string, EnvInspectResponse>();
    for (const cn of info.inductInfo!.ctors) {
      ctorInfos.set(cn, fixtures.inspect[cn]);
    }

    const decls: LeanDecl[] = [parseInductive("RecordType", info, ctorInfos)];
    const files = generate(decls, { noTests: true, noStubs: true });

    expect(files["properties.test.ts"]).toBe("");
    expect(files["stubs.ts"]).toBe("");
  });
});

describe("E2E (sexp path): extractFromInspectResults → IR → generated code", () => {
  it("sexp パスで全宣言が正しく抽出される", async () => {
    const fixtures = await loadFixtures();
    const constants = fixtures.processFile.newConstants;
    const inspectMap = new Map<string, EnvInspectResponse>(
      Object.entries(fixtures.inspect)
    );

    const result = extractFromInspectResults(constants, inspectMap);

    // 宣言が抽出される
    expect(result.declarations.length).toBeGreaterThan(0);

    const structureNames = result.declarations
      .filter((d) => d.kind === "structure")
      .map((d) => d.name);
    const inductiveNames = result.declarations
      .filter((d) => d.kind === "inductive")
      .map((d) => d.name);
    const theoremNames = result.declarations
      .filter((d) => d.kind === "theorem")
      .map((d) => d.name);
    const defNames = result.declarations
      .filter((d) => d.kind === "def")
      .map((d) => d.name);

    // 基本的な宣言
    expect(structureNames).toContain("RevenueInput");
    expect(inductiveNames).toContain("RecordType");
    expect(inductiveNames).toContain("Shape");
    expect(theoremNames).toContain("totalExpenses_empty");
    expect(defNames).toContain("totalExpenses");

    // 新しい高度な宣言
    expect(structureNames).toContain("Pair");
    expect(theoremNames).toContain("nat_pos_or_zero");
    expect(defNames).toContain("listLength");

    // コンストラクタ・リカーサーはスキップされる
    expect(result.skipped).toContain("RecordType.revenue");
    expect(result.skipped).toContain("RecordType.rec");
    expect(result.skipped).toContain("Pair.mk");
  });

  it("sexp パスで RevenueInput のフィールドが正しく抽出される", async () => {
    const fixtures = await loadFixtures();
    const inspectMap = new Map<string, EnvInspectResponse>(
      Object.entries(fixtures.inspect)
    );

    const result = extractFromInspectResults(
      ["RevenueInput", "RevenueInput.mk"],
      inspectMap
    );

    const structure = result.declarations.find(
      (d) => d.kind === "structure" && d.name === "RevenueInput"
    );
    expect(structure).toBeDefined();
    if (structure?.kind !== "structure") throw new Error("not a structure");

    expect(structure.fields).toHaveLength(2);
    expect(structure.fields[0].name).toBe("monthlyRevenue");
    expect(structure.fields[0].type).toEqual({ kind: "primitive", name: "number" });
    expect(structure.fields[0].hasDefault).toBe(false);

    expect(structure.fields[1].name).toBe("expenses");
    expect(structure.fields[1].hasDefault).toBe(true);
    expect(structure.fields[1].type.kind).toBe("array");
  });

  it("sexp パスで Pair 構造体が型パラメータ付きで抽出される", async () => {
    const fixtures = await loadFixtures();
    const inspectMap = new Map<string, EnvInspectResponse>(
      Object.entries(fixtures.inspect)
    );

    const result = extractFromInspectResults(
      ["Pair", "Pair.mk"],
      inspectMap
    );

    const structure = result.declarations.find(
      (d) => d.kind === "structure" && d.name === "Pair"
    );
    expect(structure).toBeDefined();
    if (structure?.kind !== "structure") throw new Error("not a structure");

    // 型パラメータ
    expect(structure.typeParams).toHaveLength(2);
    expect(structure.typeParams[0].name).toBe("α");
    expect(structure.typeParams[1].name).toBe("β");

    // フィールド
    expect(structure.fields).toHaveLength(2);
    expect(structure.fields[0].name).toBe("fst");
    expect(structure.fields[0].type).toEqual({ kind: "ref", name: "α" });
    expect(structure.fields[1].name).toBe("snd");
    expect(structure.fields[1].type).toEqual({ kind: "ref", name: "β" });
  });

  it("sexp パスで Shape の variant が正しく抽出される", async () => {
    const fixtures = await loadFixtures();
    const inspectMap = new Map<string, EnvInspectResponse>(
      Object.entries(fixtures.inspect)
    );

    const result = extractFromInspectResults(
      ["Shape", "Shape.circle", "Shape.rect"],
      inspectMap
    );

    const inductive = result.declarations.find(
      (d) => d.kind === "inductive" && d.name === "Shape"
    );
    expect(inductive).toBeDefined();
    if (inductive?.kind !== "inductive") throw new Error("not inductive");

    expect(inductive.variants).toHaveLength(2);
    expect(inductive.variants[0].tag).toBe("circle");
    expect(inductive.variants[0].fields).toHaveLength(1);
    expect(inductive.variants[0].fields[0].name).toBe("radius");
    expect(inductive.variants[0].fields[0].type).toEqual({
      kind: "primitive",
      name: "number",
    });
    expect(inductive.variants[1].tag).toBe("rect");
    expect(inductive.variants[1].fields).toHaveLength(2);
  });

  it("sexp パスで totalExpenses_empty 定理が含意として抽出される", async () => {
    const fixtures = await loadFixtures();
    const inspectMap = new Map<string, EnvInspectResponse>(
      Object.entries(fixtures.inspect)
    );

    const result = extractFromInspectResults(
      ["totalExpenses_empty"],
      inspectMap
    );

    const theorem = result.declarations.find(
      (d) => d.kind === "theorem" && d.name === "totalExpenses_empty"
    );
    expect(theorem).toBeDefined();
    if (theorem?.kind !== "theorem") throw new Error("not a theorem");

    // universals: input : RevenueInput
    expect(theorem.universals).toHaveLength(1);
    expect(theorem.universals[0].name).toBe("input");
    expect(theorem.universals[0].type).toEqual({
      kind: "ref",
      name: "RevenueInput",
    });

    // prop: implies(eq, eq)
    expect(theorem.prop.kind).toBe("implies");
    if (theorem.prop.kind !== "implies") throw new Error("not implies");
    expect(theorem.prop.premise.kind).toBe("eq");
    expect(theorem.prop.conclusion.kind).toBe("eq");
  });

  it("sexp パスで nat_pos_or_zero 定理が Or/Lt として抽出される", async () => {
    const fixtures = await loadFixtures();
    const inspectMap = new Map<string, EnvInspectResponse>(
      Object.entries(fixtures.inspect)
    );

    const result = extractFromInspectResults(
      ["nat_pos_or_zero"],
      inspectMap
    );

    const theorem = result.declarations.find(
      (d) => d.kind === "theorem" && d.name === "nat_pos_or_zero"
    );
    expect(theorem).toBeDefined();
    if (theorem?.kind !== "theorem") throw new Error("not a theorem");

    // universals: n : Nat
    expect(theorem.universals).toHaveLength(1);
    expect(theorem.universals[0].name).toBe("n");
    expect(theorem.universals[0].type).toEqual({
      kind: "primitive",
      name: "number",
    });

    // prop: or(eq(n, 0), lt(0, n))
    expect(theorem.prop.kind).toBe("or");
    if (theorem.prop.kind !== "or") throw new Error("not or");
    expect(theorem.prop.left.kind).toBe("eq");
    expect(theorem.prop.right.kind).toBe("lt");
  });

  it("sexp パスで listLength が implicit 型パラメータ付きで抽出される", async () => {
    const fixtures = await loadFixtures();
    const inspectMap = new Map<string, EnvInspectResponse>(
      Object.entries(fixtures.inspect)
    );

    const result = extractFromInspectResults(
      ["listLength"],
      inspectMap
    );

    const def = result.declarations.find(
      (d) => d.kind === "def" && d.name === "listLength"
    );
    expect(def).toBeDefined();
    if (def?.kind !== "def") throw new Error("not a def");

    // 型パラメータ: α
    expect(def.typeParams).toHaveLength(1);
    expect(def.typeParams[0].name).toBe("α");

    // パラメータ: a : List α → ReadonlyArray<α>
    expect(def.params).toHaveLength(1);
    expect(def.params[0].type.kind).toBe("array");

    // 戻り値: Nat → number
    expect(def.returnType).toEqual({ kind: "primitive", name: "number" });
  });

  it("sexp パスの抽出結果からコード生成が成功する", async () => {
    const fixtures = await loadFixtures();
    const constants = fixtures.processFile.newConstants;
    const inspectMap = new Map<string, EnvInspectResponse>(
      Object.entries(fixtures.inspect)
    );

    const result = extractFromInspectResults(constants, inspectMap);
    const files = generate(result.declarations);

    // types.ts
    expect(files["types.ts"]).toContain("export interface RevenueInput");
    expect(files["types.ts"]).toContain("export type RecordType =");
    expect(files["types.ts"]).toContain("export type Shape =");
    expect(files["types.ts"]).toContain("export interface Pair");

    // arbitraries.ts
    expect(files["arbitraries.ts"]).toContain("arbRevenueInput");
    expect(files["arbitraries.ts"]).toContain("arbRecordType");
    expect(files["arbitraries.ts"]).toContain("arbPair");

    // properties.test.ts
    expect(files["properties.test.ts"]).toContain("fc.assert");

    // stubs.ts
    expect(files["stubs.ts"]).toContain("export function totalExpenses");
    expect(files["stubs.ts"]).toContain("export function listLength");
  });
});

// ─── Real Pantograph output E2E tests ───

async function loadRealData(): Promise<FixtureData | null> {
  const path = resolve(fixturesDir, "real-pantograph-output.json");
  try {
    await access(path);
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as FixtureData;
  } catch {
    return null;
  }
}

describe("E2E (real Pantograph data): comprehensive.lean → IR", () => {
  it("全宣言の classify が正しく動作する", async () => {
    const data = await loadRealData();
    if (!data) return; // CI でファイルがない場合はスキップ

    const constants = data.processFile.newConstants;
    const inspectMap = new Map<string, EnvInspectResponse>(
      Object.entries(data.inspect)
    );

    const result = extractFromInspectResults(constants, inspectMap);

    // エラーなし
    expect(result.errors).toEqual([]);

    // 各カテゴリに宣言がある
    const kinds = result.declarations.map((d) => d.kind);
    expect(kinds).toContain("structure");
    expect(kinds).toContain("inductive");
    expect(kinds).toContain("theorem");
    expect(kinds).toContain("def");

    // 構造体
    const structures = result.declarations.filter((d) => d.kind === "structure");
    const structureNames = structures.map((d) => d.name);
    expect(structureNames).toContain("Point");
    expect(structureNames).toContain("Config");
    expect(structureNames).toContain("Wrapper");
    expect(structureNames).toContain("KeyValue");

    // 帰納型
    const inductives = result.declarations.filter((d) => d.kind === "inductive");
    const inductiveNames = inductives.map((d) => d.name);
    expect(inductiveNames).toContain("Color");
    expect(inductiveNames).toContain("Shape");
    expect(inductiveNames).toContain("MyOption");
    expect(inductiveNames).toContain("MyList");

    // 定理
    const theorems = result.declarations.filter((d) => d.kind === "theorem");
    const theoremNames = theorems.map((d) => d.name);
    expect(theoremNames).toContain("add_zero");
    expect(theoremNames).toContain("pos_implies_nonzero");
    expect(theoremNames).toContain("and_comm_prop");
    expect(theoremNames).toContain("zero_or_pos");

    // 関数定義
    const defs = result.declarations.filter((d) => d.kind === "def");
    const defNames = defs.map((d) => d.name);
    expect(defNames).toContain("double");
    expect(defNames).toContain("add");
    expect(defNames).toContain("identity");
    expect(defNames).toContain("listHead");
    expect(defNames).toContain("myLength");
    expect(defNames).toContain("orDefault");
    expect(defNames).toContain("swap");
    expect(defNames).toContain("stringify");
    expect(defNames).toContain("flattenOpt");
    expect(defNames).toContain("addAndShow");
  });

  it("Point 構造体のフィールドが正しい", async () => {
    const data = await loadRealData();
    if (!data) return;

    const inspectMap = new Map<string, EnvInspectResponse>(
      Object.entries(data.inspect)
    );
    const result = extractFromInspectResults(["Point", "Point.mk"], inspectMap);

    const point = result.declarations.find(
      (d) => d.kind === "structure" && d.name === "Point"
    );
    expect(point).toBeDefined();
    if (point?.kind !== "structure") throw new Error("not structure");

    expect(point.fields).toHaveLength(2);
    expect(point.fields[0].name).toBe("x");
    expect(point.fields[0].type).toEqual({ kind: "primitive", name: "number" });
    expect(point.fields[1].name).toBe("y");
    expect(point.fields[1].type).toEqual({ kind: "primitive", name: "number" });
    expect(point.typeParams).toHaveLength(0);
  });

  it("Wrapper ジェネリック構造体が型パラメータ付きで抽出される", async () => {
    const data = await loadRealData();
    if (!data) return;

    const inspectMap = new Map<string, EnvInspectResponse>(
      Object.entries(data.inspect)
    );
    const result = extractFromInspectResults(
      ["Wrapper", "Wrapper.mk"],
      inspectMap
    );

    const wrapper = result.declarations.find(
      (d) => d.kind === "structure" && d.name === "Wrapper"
    );
    expect(wrapper).toBeDefined();
    if (wrapper?.kind !== "structure") throw new Error("not structure");

    expect(wrapper.typeParams).toHaveLength(1);
    expect(wrapper.typeParams[0].name).toBe("α");

    expect(wrapper.fields).toHaveLength(2);
    expect(wrapper.fields[0].name).toBe("value");
    expect(wrapper.fields[0].type).toEqual({ kind: "ref", name: "α" });
    expect(wrapper.fields[1].name).toBe("label");
    expect(wrapper.fields[1].type).toEqual({ kind: "primitive", name: "string" });
  });

  it("Color enum が正しく抽出される", async () => {
    const data = await loadRealData();
    if (!data) return;

    const inspectMap = new Map<string, EnvInspectResponse>(
      Object.entries(data.inspect)
    );
    const result = extractFromInspectResults(
      ["Color", "Color.red", "Color.green", "Color.blue"],
      inspectMap
    );

    const color = result.declarations.find(
      (d) => d.kind === "inductive" && d.name === "Color"
    );
    expect(color).toBeDefined();
    if (color?.kind !== "inductive") throw new Error("not inductive");

    expect(color.variants).toHaveLength(3);
    expect(color.variants[0].tag).toBe("red");
    expect(color.variants[0].fields).toHaveLength(0);
    expect(color.variants[1].tag).toBe("green");
    expect(color.variants[2].tag).toBe("blue");
  });

  it("Shape inductive のフィールド付きバリアントが正しい", async () => {
    const data = await loadRealData();
    if (!data) return;

    const inspectMap = new Map<string, EnvInspectResponse>(
      Object.entries(data.inspect)
    );
    const result = extractFromInspectResults(
      ["Shape", "Shape.circle", "Shape.rect", "Shape.point"],
      inspectMap
    );

    const shape = result.declarations.find(
      (d) => d.kind === "inductive" && d.name === "Shape"
    );
    expect(shape).toBeDefined();
    if (shape?.kind !== "inductive") throw new Error("not inductive");

    expect(shape.variants).toHaveLength(3);

    const circle = shape.variants.find((v) => v.tag === "circle");
    expect(circle).toBeDefined();
    expect(circle!.fields).toHaveLength(1);
    expect(circle!.fields[0].name).toBe("radius");

    const rect = shape.variants.find((v) => v.tag === "rect");
    expect(rect).toBeDefined();
    expect(rect!.fields).toHaveLength(2);
    expect(rect!.fields[0].name).toBe("width");
    expect(rect!.fields[1].name).toBe("height");

    const point = shape.variants.find((v) => v.tag === "point");
    expect(point).toBeDefined();
    expect(point!.fields).toHaveLength(0);
  });

  it("add_zero 定理が Eq として抽出される", async () => {
    const data = await loadRealData();
    if (!data) return;

    const inspectMap = new Map<string, EnvInspectResponse>(
      Object.entries(data.inspect)
    );
    const result = extractFromInspectResults(["add_zero"], inspectMap);

    const theorem = result.declarations.find(
      (d) => d.kind === "theorem" && d.name === "add_zero"
    );
    expect(theorem).toBeDefined();
    if (theorem?.kind !== "theorem") throw new Error("not theorem");

    expect(theorem.universals).toHaveLength(1);
    expect(theorem.universals[0].name).toBe("n");
    expect(theorem.prop.kind).toBe("eq");
  });

  it("zero_or_pos 定理が Or として抽出される", async () => {
    const data = await loadRealData();
    if (!data) return;

    const inspectMap = new Map<string, EnvInspectResponse>(
      Object.entries(data.inspect)
    );
    const result = extractFromInspectResults(["zero_or_pos"], inspectMap);

    const theorem = result.declarations.find(
      (d) => d.kind === "theorem" && d.name === "zero_or_pos"
    );
    expect(theorem).toBeDefined();
    if (theorem?.kind !== "theorem") throw new Error("not theorem");

    expect(theorem.universals).toHaveLength(1);
    expect(theorem.universals[0].name).toBe("n");
    expect(theorem.prop.kind).toBe("or");
  });

  it("stringify が型クラスパラメータを正しくスキップする", async () => {
    const data = await loadRealData();
    if (!data) return;

    const inspectMap = new Map<string, EnvInspectResponse>(
      Object.entries(data.inspect)
    );
    const result = extractFromInspectResults(["stringify"], inspectMap);

    const def = result.declarations.find(
      (d) => d.kind === "def" && d.name === "stringify"
    );
    expect(def).toBeDefined();
    if (def?.kind !== "def") throw new Error("not def");

    // implicit α と instImplicit [ToString α] はスキップ
    expect(def.params).toHaveLength(1);
    expect(def.params[0].name).toBe("x");
    expect(def.returnType).toEqual({ kind: "primitive", name: "string" });
  });

  it("swap が Prod を tuple として解釈する", async () => {
    const data = await loadRealData();
    if (!data) return;

    const inspectMap = new Map<string, EnvInspectResponse>(
      Object.entries(data.inspect)
    );
    const result = extractFromInspectResults(["swap"], inspectMap);

    const def = result.declarations.find(
      (d) => d.kind === "def" && d.name === "swap"
    );
    expect(def).toBeDefined();
    if (def?.kind !== "def") throw new Error("not def");

    // implicit α, β はスキップ、explicit p : Prod α β
    expect(def.params).toHaveLength(1);
    expect(def.params[0].name).toBe("p");
    expect(def.params[0].type.kind).toBe("tuple");

    expect(def.returnType.kind).toBe("tuple");
  });

  it("実データからコード生成が成功する", async () => {
    const data = await loadRealData();
    if (!data) return;

    const constants = data.processFile.newConstants;
    const inspectMap = new Map<string, EnvInspectResponse>(
      Object.entries(data.inspect)
    );

    const result = extractFromInspectResults(constants, inspectMap);
    expect(result.errors).toEqual([]);

    const files = generate(result.declarations);

    expect(files["types.ts"]).toContain("export interface Point");
    expect(files["types.ts"]).toContain("export interface Config");
    expect(files["types.ts"]).toContain("export type Color =");
    expect(files["types.ts"]).toContain("export type Shape =");

    expect(files["arbitraries.ts"]).toContain("arbPoint");
    expect(files["arbitraries.ts"]).toContain("arbColor");

    expect(files["stubs.ts"]).toContain("export function double");
    expect(files["stubs.ts"]).toContain("export function add");
  });
});
