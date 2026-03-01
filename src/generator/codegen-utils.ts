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

/** コード行を結合（空行区切り） */
export function joinBlocks(blocks: string[]): string {
  return blocks.filter(Boolean).join("\n\n") + "\n";
}
