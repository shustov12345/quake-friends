"""Make a small Linux deployment bundle from the tested local build.

The browser and dedicated server need the same PK3 bytes. Store each package
once in the tarball and use tar hardlinks for the HTTP asset paths.
"""
import json
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'runtime' / 'deploy.tar'
manifest = json.loads((ROOT / 'public/assets/manifest.json').read_text())
content = json.loads((ROOT / 'public/content.json').read_text())
if content.get('edition') != 'full' or content.get('originalMaps') != 30:
    raise SystemExit('Build and verify the full game before bundling')

fixed = [
    'server.mjs', 'package.json', 'package-lock.json', 'README.md',
    'deploy/quake-friends.service',
    'public/index.html', 'public/app.js', 'public/style.css',
    'public/favicon.svg', 'public/arena.jpg', 'public/engine.js',
    'public/content.json', 'public/assets/manifest.json',
    'public/licenses/quake3-demo.txt', 'public/licenses/quake3-patch.txt',
    'vendor/ioq3ded.cjs', 'runtime/settings.json',
]
parts = sorted((ROOT / 'base/baseq3').glob('pak*.pk3'))
if len(parts) != 22:
    raise SystemExit(f'Expected 22 game packages; found {len(parts)}')

with tarfile.open(OUTPUT, 'w', format=tarfile.PAX_FORMAT) as archive:
    for name in fixed:
        archive.add(ROOT / name, arcname=name, recursive=False)
    for path in sorted((ROOT / 'node_modules/ws').rglob('*')):
        if path.is_file():
            archive.add(path, arcname=path.relative_to(ROOT).as_posix(), recursive=False)
    for path in parts:
        archive.add(path, arcname=path.relative_to(ROOT).as_posix(), recursive=False)
    for entry in manifest:
        name = entry['name']
        if name.startswith('baseq3/'):
            source = ROOT / 'base' / name
            if not source.is_file() or source.stat().st_size != entry['compressed']:
                raise SystemExit(f'Package mismatch: {name}')
            link = tarfile.TarInfo(f"public/assets/baseq3/{entry['checksum']}-{Path(name).name}")
            link.type = tarfile.LNKTYPE
            link.linkname = f'base/{name}'
            link.mode = 0o644
            archive.addfile(link)
        else:
            source = ROOT / 'public/assets' / f"{entry['checksum']}-{name}"
            if not source.is_file() or source.stat().st_size != entry['compressed']:
                raise SystemExit(f'Installer mismatch: {name}')
            archive.add(source, arcname=source.relative_to(ROOT).as_posix(), recursive=False)
print(f'{OUTPUT}: {OUTPUT.stat().st_size:,} bytes; {len(parts)} PK3 archives')
