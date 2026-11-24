"""Makes the treasure hunt's two sounds from nothing (no samples): the pick sound and the win jingle.

    python altspace/tools/make_sounds.py            -> altspace/Assets/Kit/Audio/Pick.wav, Win.wav

They replace upstream's "Pick Audio.wav" and "Win Audio.wav" (Epic Stock Media, a commercial library that the
repository's MIT licence cannot cover). Written for this port; same licence as the port (MIT).
Mono, 44.1 kHz, 16-bit. Standard library only.
"""
from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

RATE = 44100
OUT = Path(__file__).resolve().parent.parent / "Assets" / "Kit" / "Audio"


def note(freq: float, seconds: float, volume: float = 0.5, decay: float = 6.0, attack: float = 0.004,
         harmonics: tuple[float, ...] = (1.0, 0.35, 0.18, 0.08)) -> list[float]:
    """A bell-like tone: a few harmonics, a short attack and an exponential fall."""
    n = int(seconds * RATE)
    out = []
    for i in range(n):
        t = i / RATE
        env = min(1.0, t / attack) * math.exp(-decay * t)
        s = sum(a * math.sin(2 * math.pi * freq * (k + 1) * t) for k, a in enumerate(harmonics))
        out.append(volume * env * s / sum(harmonics))
    return out


def mix(into: list[float], sound: list[float], at: float) -> None:
    start = int(at * RATE)
    if len(into) < start + len(sound):
        into.extend([0.0] * (start + len(sound) - len(into)))
    for i, v in enumerate(sound):
        into[start + i] += v


def write(path: Path, samples: list[float]) -> None:
    peak = max(1e-9, max(abs(v) for v in samples))
    gain = 0.89 / peak                                       # about -1 dBFS at the loudest point
    fade = int(0.01 * RATE)                                  # no click at the end
    for i in range(fade):
        samples[-1 - i] *= i / fade
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, v * gain)) * 32767)) for v in samples))
    print(f"{path.name}: {len(samples) / RATE:.2f} s")


def pick() -> list[float]:
    # the classic two-step coin: a short B5, then a ringing E6, with a soft sparkle an octave up
    out: list[float] = []
    mix(out, note(987.77, 0.09, 0.55, decay=18), 0.0)
    mix(out, note(1318.51, 0.55, 0.6, decay=7), 0.075)
    mix(out, note(2637.02, 0.35, 0.12, decay=12, harmonics=(1.0,)), 0.09)
    return out


def win() -> list[float]:
    # a rising C major arpeggio and a held chord on top
    out: list[float] = []
    steps = [523.25, 659.25, 783.99, 1046.50]
    for k, f in enumerate(steps):
        mix(out, note(f, 0.5, 0.45, decay=5), 0.11 * k)
    for f in (523.25, 659.25, 783.99, 1046.50, 1318.51):
        mix(out, note(f, 1.7, 0.28, decay=2.2), 0.5)
    mix(out, note(2093.00, 1.2, 0.08, decay=3, harmonics=(1.0,)), 0.55)
    return out


if __name__ == "__main__":
    write(OUT / "Pick.wav", pick())
    write(OUT / "Win.wav", win())
