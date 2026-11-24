"""Encode the user's ten WAV tracks without changing their musical content."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import wave

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('--ffmpeg', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
tracks = {'menu': 'メニュー', 'deck': 'デッキ編集', 'arena': '闘技場関係',
          'warrior': '勇者', 'mage': '魔法使い', 'fighter': '格闘', 'priest': '賢者',
          'merchant': '商人', 'seer': '占い', 'swordsman': '魔剣士'}
records = []
for track_id, title in tracks.items():
    source = args.source / (title + '.wav')
    output = root / 'apps/web/assets' / ('bgm-' + track_id + '.ogg')
    with wave.open(str(source)) as stream:
        duration = stream.getnframes() / stream.getframerate()
    subprocess.run([args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
                    '-vn', '-map_metadata', '-1', '-c:a', 'libvorbis', '-q:a', '5', '-ar', '44100',
                    '-ac', '2', str(output)], check=True)
    records.append({'id': track_id, 'sourceName': source.name, 'file': output.name,
                    'duration': round(duration, 3), 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                    'deliverySha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'bytes': output.stat().st_size})
    print(track_id, round(duration, 1), output.stat().st_size, flush=True)
folder = root / 'artwork/audio'
folder.mkdir(exist_ok=True)
(folder / 'bgm-manifest.json').write_text(json.dumps({'source': 'User-provided original BGM',
    'conversion': 'Vorbis quality 5, 44.1kHz stereo; no cuts, tempo changes or loudness processing',
    'tracks': records}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
