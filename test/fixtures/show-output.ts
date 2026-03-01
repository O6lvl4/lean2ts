import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractFromInspectResults } from "../../src/extractor/index.js";
import { generate } from "../../src/generator/index.js";
import type { EnvInspectResponse } from "../../src/pantograph/protocol.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(resolve(__dirname, "real-pantograph-output.json"), "utf-8"));
const inspectMap = new Map<string, EnvInspectResponse>(Object.entries(data.inspect));
const result = extractFromInspectResults(data.processFile.newConstants, inspectMap);
const files = generate(result.declarations);

for (const [name, content] of Object.entries(files)) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${"=".repeat(60)}\n`);
  console.log(content);
}
