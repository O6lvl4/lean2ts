/** snake_case → camelCase */
export function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** 先頭を大文字にする */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 先頭を小文字にする */
export function uncapitalize(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** インデントを付加 */
export function indent(text: string, level: number = 1): string {
  const spaces = "  ".repeat(level);
  return text
    .split("\n")
    .map((line) => (line.trim() ? spaces + line : line))
    .join("\n");
}

/** import 文を生成 */
export function genImport(specifiers: string[], from: string): string {
  return `import { ${specifiers.join(", ")} } from "${from}";`;
}

/** 型パラメータリストを <α, β> 形式で返す。空なら空文字列。 */
export function genTypeParams(typeParams: ReadonlyArray<{ name: string }>): string {
  if (typeParams.length === 0) return "";
  return `<${typeParams.map(tp => tp.name).join(", ")}>`;
}

/** JS/TS 予約語セット */
const RESERVED_WORDS = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "enum", "export", "extends",
  "false", "finally", "for", "function", "if", "import", "in",
  "instanceof", "new", "null", "return", "super", "switch", "this",
  "throw", "true", "try", "typeof", "var", "void", "while", "with",
  "yield", "let", "static", "implements", "interface", "package",
  "private", "protected", "public", "await", "async",
]);

/** 予約語ならサフィックスを付けて安全な識別子にする */
export function safeIdent(name: string): string {
  return RESERVED_WORDS.has(name) ? `${name}_` : name;
}

/** コード行を結合（空行区切り） */
export function joinBlocks(blocks: string[]): string {
  return blocks.filter(Boolean).join("\n\n") + "\n";
}
