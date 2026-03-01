export interface SorryLocation {
  /** 定理/補題名 */
  name: string;
  /** 定理文全体（theorem ... := by sorry） */
  statement: string;
  /** sorry の文字位置（ファイル先頭からのオフセット） */
  sorryOffset: number;
  /** sorry の前にある import や def（LLM に渡す文脈） */
  context: string;
}

/**
 * Lean テキストから sorry を含む定理/補題を検出する。
 *
 * `:= by sorry` パターンを先に見つけ、直前の `theorem|lemma` 宣言を
 * 逆方向に探索して定理情報を構築する。
 * これにより `[\s\S]*?` が複数定理をまたぐ問題を回避する。
 */
export function findSorries(leanSource: string): SorryLocation[] {
  const results: SorryLocation[] = [];

  // まず `:= by sorry` の位置を全て見つける
  const sorryPattern = /:=\s*by\s+sorry/g;
  let sorryMatch: RegExpExecArray | null;

  while ((sorryMatch = sorryPattern.exec(leanSource)) !== null) {
    const sorryOffset =
      sorryMatch.index + sorryMatch[0].lastIndexOf("sorry");

    // sorry より前のテキストから直前の theorem/lemma 宣言を探す
    const textUpToSorry = leanSource.slice(0, sorryMatch.index + sorryMatch[0].length);
    const declRegex = /^(theorem|lemma)\s+(\S+)/gm;
    let declMatch: RegExpExecArray | null;
    let lastDecl: RegExpExecArray | null = null;

    while ((declMatch = declRegex.exec(textUpToSorry)) !== null) {
      lastDecl = declMatch;
    }

    if (!lastDecl) continue;

    const name = lastDecl[2];
    const declStart = lastDecl.index;
    const statement = leanSource.slice(
      declStart,
      sorryMatch.index + sorryMatch[0].length,
    );
    const context = leanSource.slice(0, declStart).trimEnd();

    results.push({
      name,
      statement,
      sorryOffset,
      context,
    });
  }

  return results;
}

/**
 * sorry を指定タクティクで置換した Lean テキストを生成する。
 *
 * 複数の sorry を一度に置換する場合、後ろから置換してオフセットを壊さないようにする。
 */
export function replaceSorry(
  leanSource: string,
  sorryOffset: number,
  tactic: string,
): string {
  const sorryLen = "sorry".length;
  return (
    leanSource.slice(0, sorryOffset) +
    tactic +
    leanSource.slice(sorryOffset + sorryLen)
  );
}

/**
 * 複数の sorry を一括置換する。
 * replacements は { sorryOffset, tactic } の配列。
 * オフセットが大きい方から順に置換する。
 */
export function replaceSorries(
  leanSource: string,
  replacements: Array<{ sorryOffset: number; tactic: string }>,
): string {
  // 後ろから置換してオフセットを壊さない
  const sorted = [...replacements].sort(
    (a, b) => b.sorryOffset - a.sorryOffset,
  );
  let result = leanSource;
  for (const { sorryOffset, tactic } of sorted) {
    result = replaceSorry(result, sorryOffset, tactic);
  }
  return result;
}
