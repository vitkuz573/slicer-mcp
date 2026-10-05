# slicer-mcp

Headless slicing MCP: OrcaSlicer engine + Anycubic Kobra S1 profiles.

## Setup

1. OrcaSlicer portable on Windows, e.g. `C:\Tools\OrcaSlicer` (`orca-slicer.exe`).
2. Profiles default to AnycubicSlicerNext resources
   (`C:\Program Files\AnycubicSlicerNext\resources\profiles\Anycubic`).
3. Env overrides: `ORCA_BIN`, `SLICER_PROFILES_ROOT`, `SLICER_WORK_DIR`.

```bash
git clone https://github.com/vitkuz573/slicer-mcp.git
cd slicer-mcp
npm install
npm run build
```

## opencode config

Add this to `~/.config/opencode/opencode.jsonc`, adjusting the two paths to
wherever you cloned the repo:

```jsonc title="~/.config/opencode/opencode.jsonc"
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "slicer": {
        "type": "local",
        "command": ["node", "/path/to/slicer-mcp/dist/index.js"],
        "cwd": "/path/to/slicer-mcp"
      }
    }
  }
}
```

## Tools

- `slicer_status` — engine + profiles check
- `slicer_list_profiles` — machine/process/filament presets
- `slicer_slice` — model -> sliced .3mf (rotate/scale/overrides supported)
- `slicer_thumbnail` — render a top-view PNG and inject the Anycubic thumbnail block

## Related

- [anycubic-mcp](https://github.com/vitkuz573/anycubic-mcp) — Anycubic Cloud printers
- [gcode-mcp](https://github.com/vitkuz573/gcode-mcp) — reconstruct a 3D model from sliced gcode

Pipeline: slice with `slicer-mcp`, recover the model with `gcode-mcp`, then
upload and print with `anycubic-mcp`.

## License

MIT
