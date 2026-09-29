"""Re-download the pinned, licensed LUT library without changing its manifest."""
import gzip
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

root = Path(__file__).resolve().parents[1] / "public" / "luts"
entries = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
for entry in entries:
    source = entry.get("mirror", entry["url"])
    url = source.replace("https://github.com/", "https://raw.githubusercontent.com/").replace("/blob/", "/")
    with urlopen(url, timeout=60) as response:
        data = response.read(16_000_001)
    if len(data) > 16_000_000 or hashlib.sha256(data).hexdigest() != entry["id"]:
        raise ValueError(f"Source content changed: {entry['name']}")
    (root / entry["file"]).write_bytes(gzip.compress(data, mtime=0))
    print(entry["name"])
print(f"Restored {len(entries)} original CUBE tables. No resampling.")
