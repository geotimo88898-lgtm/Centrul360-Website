#!/usr/bin/env python3
"""Is the voice clearly understandable over the music? python3 listen.py <id>
Transcribes the final file's sound (out/<id>.mp4, Gemini on Vertex, the same listener as voice.py, ~0,001 $) and compares
it with the spoken lines of the script: word errors (WER). The owner's rule (14.11): the music stays constant and „semi
tare”, the voice on top and clearly understood; a WER above ~5 % means the music is too loud (lower MUSIC_UNDER_VOICE's
level: raise it, e.g. MUSIC_UNDER_VOICE=11 python3 mix.py <id>)."""
import importlib.util, json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('academy_voice', os.path.join(HERE, '..', '..', 'academy-vsl', 'src', 'engine', 'voice.py'))
V = importlib.util.module_from_spec(spec); spec.loader.exec_module(V)
sys.path.insert(0, HERE)
from voice import v2_lines  # noqa: E402

rid = sys.argv[1]
S = json.load(open(os.path.join(HERE, '..', 'scripts', rid, 'script.json')))
want = ' '.join(t for _, _, t in v2_lines(S))
src = os.path.join(HERE, '..', 'scripts', rid, 'build', 'audio.wav') if '--mix' in sys.argv else os.path.join(HERE, '..', 'out', rid + ('-clean.mp4' if '--clean' in sys.argv else '.mp4'))  # --clean: the voice without music (what the listener itself gets wrong)
with tempfile.TemporaryDirectory() as d:
    wav = os.path.join(d, 'mix.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vn', '-ac', '1', '-ar', '16000', wav], check=True)
    heard = V.transcribe(wav)
e, n = V.wer(want, heard)
print(f'{rid}: {len(V.norm(want))} words said, {n} word errors in what the listener heard over the music (WER {e * 100:.1f} %)')
if n: print('  heard:', heard[:600])
