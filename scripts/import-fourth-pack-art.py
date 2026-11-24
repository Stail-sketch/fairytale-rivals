"""Import an ImageGen original and encode an unchanged, smaller delivery WebP."""
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
card_id, source_path = sys.argv[1:3]
if not re.fullmatch(r'(FT-\d{4}|token-set4-[a-z-]+)', card_id):
    raise ValueError('Invalid card ID')
source = Path(source_path).resolve()
original = root / 'artwork' / 'set-4' / f'card-{card_id}.png'
delivery = root / 'apps' / 'web' / 'assets' / f'card-{card_id}.webp'
records = root / 'artwork' / 'set-4' / 'imports'
records.mkdir(parents=True, exist_ok=True)
if not original.exists():
    shutil.copyfile(source, original)
elif source != original and original.read_bytes() != source.read_bytes():
    raise ValueError('Refusing to overwrite an existing original')
with Image.open(original) as image:
    if image.width != image.height:
        raise ValueError('Expected square artwork')
    width, height = image.size
    # Mechanical size/format conversion only; the generated illustration is not repainted.
    resized = image.convert('RGB')
    resized.thumbnail((768, 768), Image.Resampling.LANCZOS)
    resized.save(delivery, 'WEBP', quality=88, method=6)
record = {'id': card_id, 'original': original.relative_to(root).as_posix(),
          'delivery': delivery.relative_to(root).as_posix(), 'width': width, 'height': height,
          'sha256': hashlib.sha256(original.read_bytes()).hexdigest(),
          'deliverySha256': hashlib.sha256(delivery.read_bytes()).hexdigest(),
          'generationFile': source.name, 'generator': 'image_gen', 'review': 'pending-visual-review'}
(records / f'{card_id}.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'id': card_id, 'deliveryBytes': delivery.stat().st_size}))
