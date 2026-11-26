"""Import the two CC0 VFX archives without adding a runtime dependency."""
import argparse
import hashlib
import json
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
from PIL import Image, ImageChops

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--spritecanvas-zip', required=True, type=Path)
parser.add_argument('--kenney-zip', required=True, type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
folder = root / 'artwork/vfx'
folder.mkdir(parents=True, exist_ok=True)
records, atlases = [], {}

def record(output, raw, creator, source, download, member, conversion):
    records.append({'file': output.name, 'creator': creator, 'source': source, 'download': download,
                    'license': 'CC0-1.0', 'sourceMember': member,
                    'sourceSha256': hashlib.sha256(raw).hexdigest(),
                    'outputSha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'conversion': conversion})

with ZipFile(args.spritecanvas_zip) as archive:
    license_bytes = archive.read('effects/LICENSE.txt')
    if b'CC0' not in license_bytes:
        raise ValueError('SpriteCanvas CC0 license was not found')
    for name in ['LICENSE.txt', 'README.txt']:
        (folder / ('spritecanvas-' + name)).write_bytes(archive.read('effects/' + name))
    for name in ['sword-slash', 'hit-spark', 'fireball', 'lightning', 'explosion', 'ice-burst']:
        stem = 'effects-' + name
        raw = archive.read('effects/' + stem + '.png')
        atlas = json.loads(archive.read('effects/' + stem + '.json'))
        image = Image.open(BytesIO(raw)).convert('RGBA')
        output = root / 'apps/web/assets' / ('vfx-' + name + '.webp')
        image.save(output, 'WEBP', quality=90, method=6)
        frames = [frame['frame'] for frame in atlas['frames'].values()]
        for frame in frames:
            if frame['x'] + frame['w'] > image.width or frame['y'] + frame['h'] > image.height:
                raise ValueError('Frame is outside image bounds')
        atlases[name] = {'file': output.name, 'width': image.width, 'height': image.height, 'frames': frames}
        (folder / (stem + '.json')).write_text(json.dumps(atlas, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        record(output, raw, 'SpriteCanvas', 'https://spritecanvas.com/free-sprite-sheets/effects/',
               'https://spritecanvas.com/free/effects.zip', 'effects/' + stem + '.png',
               'PNG to WebP quality 90; original frame bounds and alpha preserved')

with ZipFile(args.kenney_zip) as archive:
    license_bytes = archive.read('License.txt')
    if b'CC0' not in license_bytes:
        raise ValueError('Kenney CC0 license was not found')
    (folder / 'kenney-LICENSE.txt').write_bytes(license_bytes)
    for name in ['circle_02', 'light_03', 'star_06', 'twirl_02']:
        raw = archive.read('PNG/' + name + '.png')
        image = Image.open(BytesIO(raw)).convert('RGBA')
        alpha = ImageChops.multiply(image.convert('L'), image.getchannel('A'))
        particle = Image.new('RGBA', image.size, 'white')
        particle.putalpha(alpha)
        particle = particle.resize((256, 256), Image.Resampling.LANCZOS)
        output = root / 'apps/web/assets' / ('vfx-particle-' + name.replace('_', '-') + '.webp')
        particle.save(output, 'WEBP', lossless=True, method=6)
        record(output, raw, 'Kenney Vleugels', 'https://kenney.nl/assets/particle-pack',
               'https://opengameart.org/sites/default/files/kenney_particlePack.zip', 'PNG/' + name + '.png',
               'White-on-black light mask to white luminance alpha; resized to 256px; lossless WebP')

(folder / 'manifest.json').write_text(json.dumps({'verifiedOn': '2026-11-26', 'assets': records}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(root / 'apps/web/vfx-atlases.js').write_text('// Original frame rectangles retained from the CC0 SpriteCanvas atlases.\nexport const vfxAtlases = ' + json.dumps(atlases, indent=2) + '\n', encoding='utf-8')
print('Imported', len(records), 'VFX assets')
