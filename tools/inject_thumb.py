"""Inject Anycubic-style thumbnail into a sliced 3mf.

- gcode block: '; THUMBNAIL_BLOCK_START' / '; thumbnail begin WxH SIZE' / '; <b64>' / '; thumbnail end'
- Metadata/plate_1.png + [Content_Types] entry + md5 refresh.

Usage: inject_thumb.py IN.3mf THUMB.png [OUT.3mf]  (default: overwrite IN.3mf)
"""
import base64
import hashlib
import sys
import zipfile

zin_path, png_path = sys.argv[1], sys.argv[2]
zout_path = sys.argv[3] if len(sys.argv) > 3 else zin_path

with open(png_path, "rb") as f:
    png = f.read()
b64 = base64.b64encode(png).decode()

zin = zipfile.ZipFile(zin_path)
g = zin.read("Metadata/plate_1.gcode").decode("utf-8", "replace").splitlines(keepends=True)
block = ["; THUMBNAIL_BLOCK_START\n", f"; thumbnail begin 300x300 {len(png)}\n"]
for i in range(0, len(b64), 78):
    block.append("; " + b64[i:i + 78] + "\n")
block.append("; thumbnail end\n")
gtext = "".join([g[0]] + block + g[1:])
md5 = hashlib.md5(gtext.encode("utf-8")).hexdigest()

ct = zin.read("[Content_Types].xml").decode("utf-8")
if "plate_1.png" not in ct:
    ct = ct.replace(
        "</Types>",
        '  <Override PartName="/Metadata/plate_1.png" ContentType="image/png" />\n</Types>',
    )

import io
buf = io.BytesIO()
zout = zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED)
for name in zin.namelist():
    if name in ("Metadata/plate_1.gcode", "Metadata/plate_1.gcode.md5", "[Content_Types].xml"):
        continue
    zout.writestr(name, zin.read(name))
zout.writestr("Metadata/plate_1.gcode", gtext)
zout.writestr("Metadata/plate_1.gcode.md5", md5 + "\n")
zout.writestr("[Content_Types].xml", ct)
zout.writestr("Metadata/plate_1.png", png)
zout.close()
zin.close()
with open(zout_path, "wb") as f:
    f.write(buf.getvalue())
print("injected", zout_path)
