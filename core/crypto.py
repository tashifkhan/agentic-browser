from __future__ import annotations

import base64
import os
from functools import lru_cache

from Crypto.Cipher import AES

from core.config import get_settings


class CryptoNotConfigured(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _key() -> bytes:
    raw = get_settings().oauth_encryption_key or os.environ.get("OAUTH_ENCRYPTION_KEY", "")
    if not raw:
        raise CryptoNotConfigured(
            "OAUTH_ENCRYPTION_KEY is not set. Generate one with: "
            "python -c \"import os,base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode())\""
        )
    try:
        key = base64.urlsafe_b64decode(raw)
    except Exception as exc:
        raise CryptoNotConfigured("OAUTH_ENCRYPTION_KEY must be base64-url-encoded") from exc
    if len(key) != 32:
        raise CryptoNotConfigured("OAUTH_ENCRYPTION_KEY must decode to 32 bytes")
    return key


def encrypt(plaintext: str) -> str:
    """AES-GCM encrypt; returns base64(nonce || ciphertext || tag)."""
    if plaintext is None:
        return ""
    nonce = os.urandom(12)
    cipher = AES.new(_key(), AES.MODE_GCM, nonce=nonce)
    ct, tag = cipher.encrypt_and_digest(plaintext.encode("utf-8"))
    return base64.urlsafe_b64encode(nonce + ct + tag).decode("ascii")


def decrypt(token: str) -> str:
    if not token:
        return ""
    blob = base64.urlsafe_b64decode(token.encode("ascii"))
    nonce, ct, tag = blob[:12], blob[12:-16], blob[-16:]
    cipher = AES.new(_key(), AES.MODE_GCM, nonce=nonce)
    return cipher.decrypt_and_verify(ct, tag).decode("utf-8")
