import { spawn, type ChildProcess } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import type {
  PantographCommand,
  PantographResponse,
  FrontendProcessResponse,
  EnvInspectResponse,
  OptionsSetPayload,
} from "./protocol.js";
import { isPantographError } from "./protocol.js";

export interface PantographClientOptions {
  pantographPath: string;
  leanPath?: string;
  modules?: string[];
  verbose?: boolean;
  timeout?: number;
}

export class PantographClient {
  private proc: ChildProcess | null = null;
  private rl: Interface | null = null;
  private ready = false;
  private pending: Array<{
    resolve: (value: PantographResponse) => void;
    reject: (err: Error) => void;
  }> = [];
  private readonly options: PantographClientOptions;

  constructor(options: PantographClientOptions) {
    this.options = {
      timeout: 30_000,
      ...options,
    };
  }

  async start(): Promise<void> {
    const args: string[] = [];
    if (this.options.modules?.length) {
      for (const mod of this.options.modules) {
        args.push("--modules", mod);
      }
    }

    const env = { ...process.env };
    if (this.options.leanPath) {
      env.LEAN_PATH = this.options.leanPath;
    }

    this.proc = spawn(this.options.pantographPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

    const stdout = this.proc.stdout;
    if (!stdout) {
      throw new Error("Failed to create Pantograph process stdout");
    }
    this.rl = createInterface({ input: stdout });
    this.rl.on("line", (line) => {
      if (this.options.verbose) {
        process.stderr.write(`[pantograph] < ${line}\n`);
      }

      // Pantograph は起動時に "ready." を出力する
      if (!this.ready) {
        if (line.trim() === "ready.") {
          this.ready = true;
          return;
        }
      }

      const pending = this.pending.shift();
      if (pending) {
        try {
          pending.resolve(JSON.parse(line) as PantographResponse);
        } catch {
          pending.reject(new Error(`Failed to parse Pantograph response: ${line}`));
        }
      }
    });

    this.proc.stderr?.on("data", (chunk: Buffer) => {
      if (this.options.verbose) {
        process.stderr.write(`[pantograph stderr] ${chunk.toString()}`);
      }
    });

    this.proc.on("error", (err) => {
      for (const p of this.pending) {
        p.reject(err);
      }
      this.pending = [];
    });

    this.proc.on("exit", (code) => {
      const err = new Error(`Pantograph exited with code ${code}`);
      for (const p of this.pending) {
        p.reject(err);
      }
      this.pending = [];
    });

    // ready. を待つ（タイムアウト付き）
    const timeout = this.options.timeout ?? 30_000;
    await new Promise<void>((resolve, reject) => {
      const check = setInterval(() => {
        if (this.ready) {
          clearInterval(check);
          clearTimeout(timer);
          resolve();
        }
      }, 50);
      const timer = setTimeout(() => {
        clearInterval(check);
        reject(new Error(`Pantograph startup timed out after ${timeout}ms`));
      }, timeout);
    });

    // sexp + pp 出力を有効化
    await this.send({
      cmd: "options.set",
      payload: {
        printExprAST: true,
        printExprPretty: true,
      } satisfies OptionsSetPayload,
    });
  }

  private send(command: PantographCommand): Promise<PantographResponse> {
    if (!this.proc?.stdin?.writable) {
      return Promise.reject(new Error("Pantograph process not running"));
    }

    const line = JSON.stringify(command);
    if (this.options.verbose) {
      process.stderr.write(`[pantograph] > ${line}\n`);
    }

    const proc = this.proc;
    return new Promise<PantographResponse>((resolve, reject) => {
      const entry = {
        resolve: (resp: PantographResponse) => {
          clearTimeout(timer);
          resolve(resp);
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
      };

      const timer = setTimeout(() => {
        // タイムアウト時に pending キューからエントリを除去
        // Pantograph がハングした場合、後続レスポンスのズレを防ぐ
        const idx = this.pending.indexOf(entry);
        if (idx >= 0) this.pending.splice(idx, 1);
        reject(new Error(`Pantograph request timed out: ${command.cmd}`));
      }, this.options.timeout ?? 30_000);

      this.pending.push(entry);

      proc.stdin?.write(line + "\n");
    });
  }

  /** .lean ファイルを処理し、新しい定数名の一覧を返す */
  async processFile(filePath: string): Promise<string[]> {
    const rawResp = await this.send({
      cmd: "frontend.process",
      payload: {
        fileName: filePath,
        readHeader: true,
        inheritEnv: true,
        newConstants: true,
      },
    });

    if (isPantographError(rawResp)) {
      throw new Error(`Pantograph error: ${rawResp.desc}`);
    }

    const resp = rawResp as FrontendProcessResponse;

    // units 配列の各ユニットから newConstants を集約
    const constants: string[] = [];
    for (const unit of resp.units ?? []) {
      if (unit.newConstants) {
        constants.push(...unit.newConstants);
      }
    }
    return constants;
  }

  /** .lean ファイルを処理し、エラーメッセージを含む診断情報を返す */
  async processFileWithDiagnostics(filePath: string): Promise<{
    constants: string[];
    errors: string[];
    warnings: string[];
  }> {
    const rawResp = await this.send({
      cmd: "frontend.process",
      payload: {
        fileName: filePath,
        readHeader: true,
        inheritEnv: true,
        newConstants: true,
      },
    });

    if (isPantographError(rawResp)) {
      throw new Error(`Pantograph error: ${rawResp.desc}`);
    }

    const resp = rawResp as FrontendProcessResponse;
    const constants: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const unit of resp.units ?? []) {
      if (unit.newConstants) {
        constants.push(...unit.newConstants);
      }
      for (const msg of unit.messages ?? []) {
        if (msg.severity === "error") {
          errors.push(msg.data);
        } else if (msg.severity === "warning") {
          warnings.push(msg.data);
        }
      }
    }

    return { constants, errors, warnings };
  }

  /** 定数を inspect し、型情報等を返す */
  async inspect(name: string): Promise<EnvInspectResponse> {
    const rawResp = await this.send({
      cmd: "env.inspect",
      payload: {
        name,
        value: true,
      },
    });

    if (isPantographError(rawResp)) {
      throw new Error(`Pantograph error inspecting "${name}": ${rawResp.desc}`);
    }

    return rawResp as EnvInspectResponse;
  }

  async stop(): Promise<void> {
    if (this.proc) {
      this.rl?.close();
      this.proc.stdin?.end();
      this.proc.kill();
      this.proc = null;
      this.rl = null;
      this.ready = false;
    }
  }
}
