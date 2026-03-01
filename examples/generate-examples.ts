import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EnvInspectResponse } from "../src/pantograph/protocol.js";
import { extractFromInspectResults } from "../src/extractor/index.js";
import { generate } from "../src/generator/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureFile = resolve(
  __dirname,
  "../test/fixtures/real-pantograph-output.json"
);

interface FixtureData {
  processFile: { newConstants: string[] };
  inspect: Record<string, EnvInspectResponse>;
}

interface Example {
  name: string;
  dir: string;
  constants: string[];
}

const examples: Example[] = [
  {
    name: "point",
    dir: resolve(__dirname, "point/generated"),
    constants: ["Point", "Point.mk", "double", "add_zero"],
  },
  {
    name: "color-shape",
    dir: resolve(__dirname, "color-shape/generated"),
    constants: [
      "Color",
      "Color.red",
      "Color.green",
      "Color.blue",
      "Shape",
      "Shape.circle",
      "Shape.rect",
      "Shape.point",
      "add",
    ],
  },
  {
    name: "generics",
    dir: resolve(__dirname, "generics/generated"),
    constants: [
      "Wrapper",
      "Wrapper.mk",
      "swap",
      "listHead",
      "stringify",
      "and_comm_prop",
    ],
  },
];

async function main() {
  const raw = await readFile(fixtureFile, "utf-8");
  const data = JSON.parse(raw) as FixtureData;
  const inspectMap = new Map<string, EnvInspectResponse>(
    Object.entries(data.inspect)
  );

  for (const example of examples) {
    const result = extractFromInspectResults(example.constants, inspectMap);

    if (result.errors.length > 0) {
      console.error(`[${example.name}] errors:`, result.errors);
    }

    const files = generate(result.declarations);

    await mkdir(example.dir, { recursive: true });

    const written: string[] = [];
    for (const [filename, content] of Object.entries(files)) {
      if (!content) continue;
      const filePath = resolve(example.dir, filename);
      await writeFile(filePath, content, "utf-8");
      written.push(filename);
    }

    console.log(
      `[${example.name}] generated ${written.length} files (${written.join(", ")}) → ${example.dir}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
