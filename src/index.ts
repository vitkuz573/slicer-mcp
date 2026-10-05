#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configFromEnv, engineVersion, injectThumbnail, listProfiles, renderThumbnail, sliceModel, toWslPath } from "./orca.js";

const server = new McpServer(
  { name: "slicer-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

function asText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

function errText(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

server.registerTool(
  "slicer_status",
  { description: "Check slicing engine presence (OrcaSlicer binary) and profiles root.", inputSchema: {} },
  async () => {
    try {
      const cfg = configFromEnv();
      const v = await engineVersion(cfg);
      const profiles = await listProfiles(cfg, "machine");
      return asText({ bin: cfg.bin, engineOk: v.ok, engineOut: v.out.slice(0, 300), machineProfiles: profiles.machine.length });
    } catch (e) {
      return errText(e);
    }
  }
);

server.registerTool(
  "slicer_list_profiles",
  {
    description: "List available machine/process/filament presets (Anycubic S1 set).",
    inputSchema: { kind: z.enum(["machine", "process", "filament", "all"]).default("all") },
  },
  async (args) => {
    try {
      const a = args as { kind?: "machine" | "process" | "filament" | "all" };
      return asText(await listProfiles(configFromEnv(), a.kind ?? "all"));
    } catch (e) {
      return errText(e);
    }
  }
);

server.registerTool(
  "slicer_slice",
  {
    description: "Headless slice: STL/3MF/STEP -> sliced .3mf (with gcode) via Orca engine + S1 profiles. Overrides use slicer keys (e.g. layer_height, support_type, support_threshold_angle). rotate=[rx,ry,rz] degrees, scale=percent.",
    inputSchema: {
      model: z.string().describe("Path to model file (Windows C:\\... or WSL /home/...)"),
      machine: z.string().optional().describe("Machine preset substring, default Kobra S1 0.4"),
      process: z.string().optional().describe("Process preset substring, default 0.20mm Standard S1"),
      filament: z.string().optional().describe("Filament preset substring"),
      overrides: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      rotate: z.tuple([z.number(), z.number(), z.number()]).optional(),
      scale: z.number().optional(),
      output: z.string().optional(),
      thumbnail: z.boolean().default(true).describe("Auto-render top view + inject Anycubic thumbnail (STL only)"),
    },
    annotations: { readOnlyHint: false },
  },
  async (args) => {
    try {
      const a = args as Parameters<typeof sliceModel>[1];
      return asText(await sliceModel(configFromEnv(), a));
    } catch (e) {
      return errText(e);
    }
  }
);

server.registerTool(
  "slicer_thumbnail",
  {
    description: "Render top-view PNG of an STL and inject Anycubic thumbnail (gcode block + plate PNG) into an existing sliced 3mf. Returns patched copy path.",
    inputSchema: {
      sliced3mf: z.string(),
      model: z.string().describe("Source STL path"),
      rotate: z.tuple([z.number(), z.number(), z.number()]).optional(),
      scale: z.number().optional(),
      output: z.string().optional().describe("Patched copy path; default <tmp>/<name>-thumb.3mf"),
    },
    annotations: { readOnlyHint: false },
  },
  async (args) => {
    try {
      const a = args as { sliced3mf: string; model: string; rotate?: [number, number, number]; scale?: number; output?: string };
      const png = join(tmpdir(), `slicer-thumb-${Date.now()}.png`);
      await renderThumbnail(toWslPath(a.model), png, a.rotate, a.scale);
      const dst = await injectThumbnail(a.sliced3mf, png, a.output ? toWslPath(a.output) : undefined);
      return asText({ output: dst });
    } catch (e) {
      return errText(e);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
