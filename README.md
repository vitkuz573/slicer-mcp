# slicer-mcp

Headless slicing MCP: OrcaSlicer engine + Anycubic Kobra S1 profiles.

## Setup

1. OrcaSlicer portable on Windows, e.g. `C:\Tools\OrcaSlicer` (`orca-slicer.exe`).
2. Profiles default to AnycubicSlicerNext resources
   (`C:\Program Files\AnycubicSlicerNext\resources\profiles\Anycubic`).
3. Env overrides: `ORCA_BIN`, `SLICER_PROFILES_ROOT`, `SLICER_WORK_DIR`.

```bash
cd ~/slicer-mcp
npm install   # inside WSL: /usr/bin/npm
npm run build
```

## opencode config

```json
{
  "mcpServers": {
    "slicer": {
      "command": ["wsl", "/usr/bin/node", "<path-to>/slicer-mcp/dist/index.js"]
    }
  }
}
```

## Tools

- `slicer_status` — engine + profiles check
- `slicer_list_profiles` — machine/process/filament presets
- `slicer_slice` — model -> sliced .3mf (rotate/scale/overrides supported)

Pipeline goal: slice -> upload to Anycubic cloud -> print via anycubic-mcp.
