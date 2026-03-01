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

    this.rl = createInterface({ input: this.proc.stdout! });
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

    // ready. を待つ
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (this.ready) {
          clearInterval(check);
          resolve();
        }
      }, 50);
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

    return new Promise<PantographResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Pantograph request timed out: ${command.cmd}`));
      }, this.options.timeout!);

      this.pending.push({
        resolve: (resp) => {
          clearTimeout(timer);
          resolve(resp);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.proc!.stdin!.write(line + "\n");
    });
  }

  /** .lean ファイルを処理し、新しい定数名の一覧を返す */
  async processFile(filePath: string): Promise<string[]> {
    const resp = (await this.send({
      cmd: "frontend.process",
      payload: {
        fileName: filePath,
        readHeader: true,
        inheritEnv: true,
        newConstants: true,
      },
    })) as FrontendProcessResponse;

    if (isPantographError(resp)) {
      throw new Error(`Pantograph error: ${(resp as any).desc}`);
    }

    // units 配列の各ユニットから newConstants を集約
    const constants: string[] = [];
    for (const unit of resp.units ?? []) {
      if (unit.newConstants) {
        constants.push(...unit.newConstants);
      }
    }
    return constants;
  }

  /** 定数を inspect し、型情報等を返す */
  async inspect(name: string): Promise<EnvInspectResponse> {
    const resp = (await this.send({
      cmd: "env.inspect",
      payload: {
        name,
        value: true,
      },
    })) as EnvInspectResponse;

    if (isPantographError(resp)) {
      throw new Error(`Pantograph error inspecting "${name}": ${(resp as any).desc}`);
    }

    return resp;
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
