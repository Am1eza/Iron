"""Minimal ULID generator — same 26-char Crockford-base32 shape every existing
`price_points.id` and `skus.id` in this database already uses."""
import os, time

_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'


def _enc(n, length):
    out = []
    for _ in range(length):
        out.append(_ALPHABET[n & 31])
        n >>= 5
    return ''.join(reversed(out))


_last_ms = 0
_seq = 0


def ulid(ms=None):
    """Monotonic within a run so a batch insert keeps its emission order."""
    global _last_ms, _seq
    ms = ms if ms is not None else int(time.time() * 1000)
    if ms == _last_ms:
        _seq += 1
    else:
        _last_ms, _seq = ms, int.from_bytes(os.urandom(10), 'big') >> 20
    return _enc(ms, 10) + _enc(_seq, 16)
