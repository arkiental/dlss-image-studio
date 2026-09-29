"""Collect the licenses shipped with our locked Windows and frontend dependencies."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
metadata = json.loads(subprocess.check_output([
    'cargo', 'metadata', '--manifest-path', str(ROOT / 'src-tauri/Cargo.toml'),
    '--format-version', '1', '--filter-platform', 'x86_64-pc-windows-msvc'
], cwd=ROOT))
ids = {node['id'] for node in metadata['resolve']['nodes']}
packages = [(p['name'], p['version'], p.get('license'), Path(p['manifest_path']).parent)
            for p in metadata['packages'] if p['id'] in ids and p['source']]
seen = set()

def npm_package(name):
    if name in seen:
        return
    seen.add(name)
    folder = ROOT / 'node_modules' / name
    package = json.loads((folder / 'package.json').read_text(encoding='utf-8'))
    packages.append((name, package['version'], package.get('license'), folder))
    for child in package.get('dependencies', {}):
        npm_package(child)

for name in json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['dependencies']:
    npm_package(name)

groups = {}
missing = []
for name, version, license_id, folder in sorted(packages):
    candidates = [p for p in folder.iterdir() if p.is_file() and
                  (p.name.upper().startswith(('LICENSE', 'LICENCE', 'NOTICE', 'COPYING')))]
    if not candidates:
        supplement=ROOT/'third_party/licenses'/name
        if supplement.exists():
            candidates=[p for p in supplement.iterdir() if p.is_file() and p.name!='SOURCE.txt']
    if not candidates:
        missing.append(f'{name} {version}: {license_id}')
    for path in sorted(candidates):
        content = path.read_text(encoding='utf-8', errors='replace')
        key = hashlib.sha256(content.encode()).hexdigest()
        entry = groups.setdefault(key, {'text': content, 'packages': []})
        entry['packages'].append(f'{name} {version} ({license_id}; {path.name})')

parts = [
    'DLSS Image Studio — third-party notices\n\n'
    'These notices cover the locked open-source Windows build and frontend dependencies.\n'
    'Some listed packages are build tools and are not linked into the application.\n'
    'Visual Enhancer, Neuroframe and NVIDIA neural-runtime binaries are NOT bundled.\n'
    'Their separate installation remains subject to their distributors’ terms.\n'
]
parts.append('Included NVIDIA Streamline headers (MIT):\n' +
             (ROOT / 'third_party/streamline/LICENSE.txt').read_text(encoding='utf-8'))
parts.append('Source packages (unmodified open-source dependencies):\n' + '\n'.join(f'{name} {version}: https://crates.io/crates/{name}/{version}' if not str(folder).startswith(str(ROOT / 'node_modules')) else f'{name} {version}: https://www.npmjs.com/package/{name}/v/{version}' for name,version,_,folder in sorted(packages)))
for entry in groups.values():
    parts.append('\n'.join(entry['packages']) + '\n\n' + entry['text'])
if missing:
    parts.append('Dependency metadata without a license text in the installed package:\n' + '\n'.join(missing))
notices = ('\n\n' + '=' * 78 + '\n\n').join(parts)
(ROOT / 'THIRD_PARTY_NOTICES.txt').write_text('\n'.join(line.rstrip() for line in notices.splitlines()) + '\n', encoding='utf-8')
print(json.dumps({'packages': len(packages), 'license_texts': len(groups), 'missing': missing}, indent=2))
