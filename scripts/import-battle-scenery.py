"""Archive generated originals and make small WebP scenery assets from the recorded manifest."""
import json
import shutil
import sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
manifest_dir = root / "artwork" / "battle-scenery"
source_dir = Path(sys.argv[1])
for asset in json.loads((manifest_dir / "manifest.json").read_text(encoding="utf-8"))["assets"]:
    original = source_dir / asset["source"]
    shutil.copy2(original, manifest_dir / asset["source"])
    with Image.open(original) as image:
        delivery = image.convert("RGB")
        delivery.thumbnail((1600, 1000), Image.Resampling.LANCZOS)
        target = root / asset["delivery"]
        delivery.save(target, format="WEBP", quality=83, method=6)
        print(f'{asset["id"]}: {delivery.width}x{delivery.height}, {target.stat().st_size // 1024} KB')
