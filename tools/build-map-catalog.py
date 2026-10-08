#!/usr/bin/env python3
"""Build the admin map list from the Quake III arena metadata in installed PK3s."""
import json
import re
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
packs = sorted((root / "base" / "baseq3").glob("*.pk3"))
maps = {}

for pack in packs:
    with zipfile.ZipFile(pack) as archive:
        for name in archive.namelist():
            if not (name == "scripts/arenas.txt" or name.endswith(".arena")):
                continue
            text = archive.read(name).decode("latin-1")
            for block in re.findall(r"\{([^{}]*)\}", text):
                fields = {}
                for line in block.splitlines():
                    match = re.match(r"\s*(\w+)\s+(?:\"([^\"]*)\"|([^\s]+))", line)
                    if match:
                        fields[match.group(1)] = match.group(2) or match.group(3)
                map_id = fields.get("map", "").lower()
                if not map_id or map_id in maps:
                    continue
                types = fields.get("type", "").split()
                modes = [
                    mode
                    for source_type, mode in (
                        ("ffa", "ffa"), ("tourney", "duel"),
                        ("team", "tdm"), ("ctf", "ctf")
                    )
                    if source_type in types
                ]
                if map_id == "q3dm0":
                    modes = ["ffa"]
                if not modes:
                    continue
                maps[map_id] = {
                    "id": map_id,
                    "title": fields.get("longname", map_id),
                    "modes": modes,
                    "group": "original" if pack.name.startswith("pak0") else "extra",
                }

assert len(maps) == 35, f"Expected 35 maps, found {len(maps)}"
assert maps["q3tourney4"]["title"] == "Vertical Vengeance"
target = root / "data" / "maps.json"
target.parent.mkdir(exist_ok=True)
target.write_text(json.dumps(list(maps.values()), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {len(maps)} maps to {target}")
