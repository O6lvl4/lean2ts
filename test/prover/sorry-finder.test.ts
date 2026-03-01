import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  findSorries,
  replaceSorry,
  replaceSorries,
} from "../../src/prover/sorry-finder.js";

const fixturesDir = resolve(import.meta.dirname, "../fixtures/sorry-examples");

describe("findSorries", () => {
  it("simple.lean から 1 つの sorry を検出する", () => {
    const source = readFileSync(resolve(fixturesDir, "simple.lean"), "utf-8");
    const sorries = findSorries(source);

    expect(sorries).toHaveLength(1);
    expect(sorries[0].name).toBe("add_zero");
    expect(sorries[0].statement).toContain("theorem add_zero");
    expect(sorries[0].statement).toContain("sorry");
    expect(source.slice(sorries[0].sorryOffset, sorries[0].sorryOffset + 5)).toBe("sorry");
  });

  it("simple.lean のコンテキストに import と構造体定義が含まれる", () => {
    const source = readFileSync(resolve(fixturesDir, "simple.lean"), "utf-8");
    const sorries = findSorries(source);

    expect(sorries[0].context).toContain("import Init");
    expect(sorries[0].context).toContain("structure Point");
    expect(sorries[0].context).toContain("def double");
  });

  it("two-sorries.lean から 2 つの sorry を検出する", () => {
    const source = readFileSync(
      resolve(fixturesDir, "two-sorries.lean"),
      "utf-8",
    );
    const sorries = findSorries(source);

    expect(sorries).toHaveLength(2);
    expect(sorries[0].name).toBe("add_zero");
    expect(sorries[1].name).toBe("zero_add");
  });

  it("各 sorry のオフセットが正しい", () => {
    const source = readFileSync(
      resolve(fixturesDir, "two-sorries.lean"),
      "utf-8",
    );
    const sorries = findSorries(source);

    for (const s of sorries) {
      expect(source.slice(s.sorryOffset, s.sorryOffset + 5)).toBe("sorry");
    }
  });

  it("sorry がないテキストでは空配列を返す", () => {
    const source = `import Init\n\ntheorem add_zero (n : Nat) : n + 0 = n := by simp\n`;
    expect(findSorries(source)).toHaveLength(0);
  });

  it("lemma も検出する", () => {
    const source = `lemma foo : True := by sorry\n`;
    const sorries = findSorries(source);
    expect(sorries).toHaveLength(1);
    expect(sorries[0].name).toBe("foo");
  });
});

describe("replaceSorry", () => {
  it("sorry を指定タクティクで置換する", () => {
    const source = "theorem add_zero (n : Nat) : n + 0 = n := by sorry\n";
    const sorries = findSorries(source);
    const result = replaceSorry(source, sorries[0].sorryOffset, "simp");
    expect(result).toBe(
      "theorem add_zero (n : Nat) : n + 0 = n := by simp\n",
    );
  });

  it("長いタクティクで置換できる", () => {
    const source = "theorem add_zero (n : Nat) : n + 0 = n := by sorry\n";
    const sorries = findSorries(source);
    const result = replaceSorry(
      source,
      sorries[0].sorryOffset,
      "simp [Nat.add_zero]",
    );
    expect(result).toContain("by simp [Nat.add_zero]");
  });
});

describe("replaceSorries", () => {
  it("複数の sorry を一括置換する", () => {
    const source = readFileSync(
      resolve(fixturesDir, "two-sorries.lean"),
      "utf-8",
    );
    const sorries = findSorries(source);

    const replacements = sorries.map((s) => ({
      sorryOffset: s.sorryOffset,
      tactic: "simp",
    }));

    const result = replaceSorries(source, replacements);
    expect(result).not.toContain("sorry");
    expect(result.match(/simp/g)).toHaveLength(2);
  });
});
