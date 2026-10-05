import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function toolsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "tools");
}

function runPython(script: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const child = spawn("/usr/bin/python3", [join(toolsDir(), script), ...args], { timeout: 10 * 60 * 1000 });
    let out = "";
    child.stdout?.on("data", (d) => (out += d.toString().slice(0, 2000)));
    child.stderr?.on("data", (d) => (out += d.toString().slice(0, 2000)));
    child.on("error", (e) => resolve({ ok: false, out: String(e).slice(0, 300) }));
    child.on("close", (code) => resolve({ ok: code === 0, out: out.slice(-1500) }));
  });
}

/** Render top-view PNG of an STL (same orientation math as slice request). */
export async function renderThumbnail(
  modelStl: string,
  outPng: string,
  rotate?: [number, number, number],
  scale?: number
): Promise<string> {
  const args = [modelStl, outPng];
  if (rotate) args.push("--rotate-x", String(rotate[0]), "--rotate-y", String(rotate[1]), "--rotate-z", String(rotate[2]));
  if (scale !== undefined) args.push("--scale", String(scale));
  const r = await runPython("render_thumb.py", args);
  if (!r.ok) throw new Error("render failed: " + r.out);
  return outPng;
}

/** Inject Anycubic thumbnail block + plate PNG. Writes patched COPY (source may live on read-only DrvFs). */
export async function injectThumbnail(sliced3mf: string, png: string, outPath?: string): Promise<string> {
  const src = toWslPath(sliced3mf);
  const dst =
    outPath ??
    join(tmpdir(), basename(src).replace(/\.3mf$/i, "") + "-thumb.3mf");
  const r = await runPython("inject_thumb.py", [src, png, dst]);
  if (!r.ok) throw new Error("inject failed: " + r.out);
  return dst;
}

export interface OrcaConfig {
  bin: string; // Windows path to orca-slicer.exe (server runs in WSL, spawns via interop)
  profilesRoot: string; // Anycubic resources/profiles/Anycubic
  workDir: string; // where outputs go by default (Windows path)
}

export function configFromEnv(): OrcaConfig {
  return {
    bin:
      process.env.ORCA_BIN ||
      "/mnt/c/Tools/OrcaSlicer/orca-slicer.exe",
    profilesRoot:
      process.env.SLICER_PROFILES_ROOT ||
      "/mnt/c/Program Files/AnycubicSlicerNext/resources/profiles/Anycubic",
    workDir: process.env.SLICER_WORK_DIR || "/mnt/c/Users/vitaly/AppData/Local/Temp/opencode/slicer",
  };
}

/** Windows path -> WSL path for local python helpers. */
export function toWslPath(p: string): string {
  const m = p.match(/^([A-Za-z]):\\(.*)$/);
  if (m) return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}`;
  const u = p.match(/^\\\\wsl\.localhost\\Ubuntu\\(.*)$/);
  if (u) return "/" + u[1].replace(/\\/g, "/");
  return p;
}

/** WSL path -> Windows path for the Orca (Windows) process. */
export function toWinPath(p: string): string {
  if (/^[A-Za-z]:\\/.test(p) || p.startsWith("\\\\")) return p;
  if (p.startsWith("/mnt/c/")) return "C:\\" + p.slice(7).replace(/\//g, "\\");
  if (p.startsWith("/mnt/d/")) return "D:\\" + p.slice(7).replace(/\//g, "\\");
  if (p.startsWith("/")) return "\\\\wsl.localhost\\Ubuntu" + p.replace(/\//g, "\\");
  return p;
}

export interface SliceRequest {
  model: string; // STL/3MF/STEP, WSL or Windows path
  machine?: string; // preset file name or substring, default Kobra S1 0.4
  process?: string; // preset file name or substring, default 0.20mm Standard S1
  filament?: string; // preset file name or substring
  overrides?: Record<string, string | number | boolean>; // e.g. {layer_height: 0.2, support_type: 1}
  rotate?: [number, number, number]; // degrees XYZ, applied via --rotate
  scale?: number; // uniform scale percent, applied via --scale
  output?: string; // output .3mf/.gcode path (Windows or WSL); default workDir
  thumbnail?: boolean; // default true: render top view + inject Anycubic thumbnail block (STL models only)
}

export interface SliceResult {
  ok: boolean;
  output: string | null;
  logTail: string;
  ms: number;
}

async function findPreset(dir: string, query: string): Promise<string | null> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return null;
  }
  const q = query.toLowerCase();
  const exact = files.find((f) => f.toLowerCase() === q || f.toLowerCase() === q + ".json");
  if (exact) return join(dir, exact);
  const sub = files.find((f) => f.toLowerCase().includes(q) && f.endsWith(".json"));
  return sub ? join(dir, sub) : null;
}

export async function listProfiles(
  cfg: OrcaConfig,
  kind: "machine" | "process" | "filament" | "all" = "all"
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  const kinds = kind === "all" ? (["machine", "process", "filament"] as const) : [kind];
  for (const k of kinds) {
    try {
      out[k] = (await readdir(join(cfg.profilesRoot, k))).filter((f) => f.endsWith(".json"));
    } catch {
      out[k] = [];
    }
  }
  return out;
}

export function resolveProfiles(cfg: OrcaConfig) {
  return {
    machine: (q?: string) => findPreset(join(cfg.profilesRoot, "machine"), q ?? "kobra s1 0.4 nozzle"),
    process: (q?: string) => findPreset(join(cfg.profilesRoot, "process"), q ?? "0.20mm standard @anycubic kobra s1 0.4 nozzle"),
    filament: (q?: string) => findPreset(join(cfg.profilesRoot, "filament"), q ?? "generic petg"),
  };
}

export function engineVersion(cfg: OrcaConfig): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(cfg.bin, ["--help"], { timeout: 30000 });
    let out = "";
    child.stdout?.on("data", (d) => (out += d.toString().slice(0, 4000)));
    child.stderr?.on("data", (d) => (out += d.toString().slice(0, 4000)));
    child.on("error", (e) => resolve({ ok: false, out: String(e).slice(0, 500) }));
    child.on("close", (code) => resolve({ ok: code === 0, out: out.slice(0, 2000) }));
  });
}

export function sliceModel(cfg: OrcaConfig, req: SliceRequest): Promise<SliceResult> {
  return (async () => {
    const t0 = Date.now();
    const r = resolveProfiles(cfg);
    const machine = await r.machine(req.machine);
    const process = await r.process(req.process);
    const filament = await r.filament(req.filament);
    if (!machine) throw new Error("machine profile not found");
    if (!process) throw new Error("process profile not found");
    const args: string[] = [toWinPath(req.model)];
    // NOTE: Orca CLI requires key=value single-arg form; space-separated
    // booleans are misparsed as input files ("No such file").
    const flag = (k: string, v: string | number | boolean) =>
      `--${k.replace(/_/g, "-")}=${v === true ? 1 : v === false ? 0 : v}`;
    args.push(flag("load-settings", `${toWinPath(process)};${toWinPath(machine)}`));
    if (filament) args.push(flag("load-filaments", toWinPath(filament)));
    if (req.rotate) args.push(flag("rotate-x", req.rotate[0]), flag("rotate-y", req.rotate[1]), flag("rotate", req.rotate[2]));
    if (req.scale !== undefined) args.push(flag("scale", req.scale));
    for (const [k, v] of Object.entries(req.overrides ?? {})) {
      args.push(flag(k, v));
    }
    const outPath = req.output ?? join(cfg.workDir, `slice-${Date.now()}.3mf`);
    args.push(flag("slice", 0), flag("export-3mf", toWinPath(outPath)));
    const log = await new Promise<string>((resolve) => {
      const child = spawn(cfg.bin, args, { timeout: 30 * 60 * 1000 });
      let text = "";
      child.stdout?.on("data", (d) => (text += d.toString()));
      child.stderr?.on("data", (d) => (text += d.toString()));
      child.on("error", (e) => resolve("SPAWN_ERROR " + String(e).slice(0, 300)));
      child.on("close", (code) => resolve(`exit=${code}\n` + text.slice(-3000)));
    });
    const ok = log.startsWith("exit=0");
    let thumbNote = "";
    let finalOut: string | null = ok ? outPath : null;
    if (ok && req.thumbnail !== false && /\.stl$/i.test(req.model)) {
      try {
        const png = join(tmpdir(), `slicer-thumb-${Date.now()}.png`);
        await renderThumbnail(toWslPath(req.model), png, req.rotate, req.scale);
        finalOut = await injectThumbnail(outPath, png);
        thumbNote = "\nthumbnail injected -> " + finalOut;
      } catch (e) {
        thumbNote = "\nthumbnail skipped: " + (e instanceof Error ? e.message : String(e)).slice(0, 200);
      }
    }
    return { ok, output: finalOut, logTail: (log + thumbNote).slice(-2000), ms: Date.now() - t0 };
  })();
}
