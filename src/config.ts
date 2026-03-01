export interface Lean2TsConfig {
  /** 入力 .lean ファイルパス */
  input: string;
  /** 出力ディレクトリ */
  outDir: string;
  /** pantograph-repl のパス */
  pantographPath: string;
  /** Lean モジュール名 */
  modules: string[];
  /** テスト生成をスキップ */
  noTests: boolean;
  /** スタブ生成をスキップ */
  noStubs: boolean;
  /** Pantograph 通信ログ出力 */
  verbose: boolean;
  /** 生成内容を表示のみ（書き込みなし） */
  dryRun: boolean;
}

export const defaultConfig: Omit<Lean2TsConfig, "input"> = {
  outDir: "./generated",
  pantographPath: "pantograph-repl",
  modules: [],
  noTests: false,
  noStubs: false,
  verbose: false,
  dryRun: false,
};
