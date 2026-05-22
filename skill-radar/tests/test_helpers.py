"""Helper birim testleri. Çalıştır: python -m pytest tests/ (veya python tests/test_helpers.py)."""

from __future__ import annotations

import sys
from pathlib import Path

# radar.py'yi import yolu ekle
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import radar  # noqa: E402


def test_strip_code_fence():
    cases = [
        ("plain text", "plain text"),
        ("```json\n{\"a\":1}\n```", '{"a":1}'),
        ("```\n{\"a\":1}\n```", '{"a":1}'),
        ("```json\n{\"a\":1}\n```\n", '{"a":1}'),
        ("  ```json  \n{\"a\":1}\n  ```  ", '{"a":1}'),
        ("```json\r\n{\"a\":1}\r\n```", '{"a":1}'),
    ]
    for inp, expected in cases:
        got = radar._strip_code_fence(inp)
        assert got == expected, f"strip_code_fence({inp!r}) → {got!r}, expected {expected!r}"


def test_coerce_int():
    cases = [
        (5, 5), ("7", 7), ("  8 ", 8), ("high", 0), (None, 0),
        (True, 0), (False, 0), (7.9, 7), ([5], 0),
    ]
    for v, exp in cases:
        got = radar._coerce_int(v, 0)
        assert got == exp, f"coerce_int({v!r}) → {got!r}, expected {exp!r}"


def test_coerce_str_list():
    cases = [
        (["a", "b"], ["a", "b"]),
        ("deploy", ["deploy"]),
        ("", []),
        (None, []),
        ([1, 2], ["1", "2"]),
    ]
    for v, exp in cases:
        got = radar._coerce_str_list(v)
        assert got == exp, f"coerce_str_list({v!r}) → {got!r}, expected {exp!r}"


def test_sanitize_name():
    cases = [
        ("My Cool Skill", "my-cool-skill"),
        ("hello!!!world", "hello-world"),
        ("", "unnamed-skill"),
        ("---abc---", "abc"),
        ("valid-name", "valid-name"),
    ]
    for v, exp in cases:
        got = radar._sanitize_name(v)
        assert got == exp, f"sanitize_name({v!r}) → {got!r}, expected {exp!r}"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS  {name}")
    print("\nTüm testler geçti.")
