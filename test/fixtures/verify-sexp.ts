/**
 * Pantograph を実際に起動して sexp 出力を取得する検証スクリプト。
 * 使い方: npx tsx test/fixtures/verify-sexp.ts
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PANTOGRAPH = "/tmp/Pantograph/.lake/build/bin/repl";
const LEAN_FILE = resolve(__dirname, "comprehensive.lean");
const OUTPUT_FILE = resolve(__dirname, "real-pantograph-output.json");
const LEAN_PATH = [
  `${process.env.HOME}/.elan/toolchains/leanprover--lean4---v4.27.0/lib/lean`,
  "/tmp/Pantograph/.lake/build/lib",
].join(":");

interface PantographResponse {
  [key: string]: unknown;
}

async function main() {
  console.log("Starting Pantograph REPL...");
  const proc = spawn(PANTOGRAPH, [], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, LEAN_PATH },
  });

  const rl = createInterface({ input: proc.stdout! });
  const pending: Array<{
    resolve: (v: PantographResponse) => void;
    reject: (e: Error) => void;
  }> = [];
  let ready = false;

  rl.on("line", (line) => {
    // Pantograph sends "ready." on startup
    if (!ready) {
      if (line.trim() === "ready.") {
        ready = true;
        console.log("Pantograph ready.");
        return;
      }
    }
    const p = pending.shift();
    if (p) {
      try {
        p.resolve(JSON.parse(line));
      } catch {
        p.reject(new Error(`Parse error: ${line}`));
      }
    }
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[pantograph stderr] ${chunk.toString()}`);
  });

  function send(request: Record<string, unknown>): Promise<PantographResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout")), 30000);
      pending.push({
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      proc.stdin!.write(JSON.stringify(request) + "\n");
    });
  }

  // Wait for ready
  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (ready) { clearInterval(check); resolve(); }
    }, 100);
  });

  try {
    // Enable sexp + pp output
    const optResult = await send({
      cmd: "options.set",
      payload: {
        printExprAST: true,
        printExprPretty: true,
      },
    });
    console.log("Options set:", JSON.stringify(optResult));

    // Process the comprehensive Lean file
    console.log(`Processing ${LEAN_FILE}...`);
    const processResult = await send({
      cmd: "frontend.process",
      payload: {
        fileName: LEAN_FILE,
        readHeader: true,
        inheritEnv: true,
        newConstants: true,
      },
    });

    if ((processResult as any).error) {
      console.error("Error processing file:", processResult);
      process.exit(1);
    }

    // Debug: print full response structure
    const units = (processResult as any).units as any[] ?? [];
    console.log(`Found ${units.length} compilation units`);
    // Print all units with their details
    for (let i = 0; i < Math.min(units.length, 5); i++) {
      const u = units[i];
      console.log(`  Unit ${i}: boundary=${JSON.stringify(u.boundary)}, msgs=${u.messages?.length ?? 0}, consts=${JSON.stringify(u.newConstants)}`);
      if (u.messages?.length > 0) {
        for (const m of u.messages) {
          console.log(`    msg: ${JSON.stringify(m).slice(0, 200)}`);
        }
      }
    }
    const newConstants: string[] = [];
    for (const unit of units) {
      // Check various possible field names
      const unitConstants = unit.newConstants ?? unit["newConstants?"] ?? [];
      if (Array.isArray(unitConstants) && unitConstants.length > 0) {
        console.log(`  Unit: ${unitConstants.length} constants`);
        newConstants.push(...unitConstants);
      }
    }
    console.log(`Total: ${newConstants.length} constants`);

    // Inspect each constant
    const inspectResults: Record<string, PantographResponse> = {};
    for (const name of newConstants) {
      try {
        const result = await send({
          cmd: "env.inspect",
          payload: {
            name,
            "value?": true,
          },
        });
        inspectResults[name] = result;
        const typeInfo = (result as any).type;
        console.log(`  ${name}: pp=${typeInfo?.pp?.slice(0, 60) ?? "?"}`);
      } catch (err) {
        console.error(`  Error inspecting ${name}: ${err}`);
      }
    }

    // Save results
    const output = {
      processFile: { newConstants },
      inspect: inspectResults,
    };
    await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\nResults saved to ${OUTPUT_FILE}`);

  } finally {
    proc.stdin?.end();
    proc.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
