from __future__ import annotations

import base64
import logging
import os
from functools import lru_cache
from pathlib import Path

from Crypto.Cipher import AES

from core.config import get_settings

logger = logging.getLogger(__name__)

# Bootstrap key file. Persisted alongside the project so a single-user dev
# install works out of the box; users who care can override via env.
_KEY_FILE = Path(__file__).resolve().parent.parent / ".oauth_encryption_key"


class CryptoNotConfigured(RuntimeError):
    pass


def _generate_key() -> str:
    return base64.urlsafe_b64encode(os.urandom(32)).decode("ascii")


def _load_or_create_local_key() -> str | None:
    try:
        if _KEY_FILE.exists():
            text = _KEY_FILE.read_text().strip()
            if text:
                return text
        # Generate a new one and persist it (chmod 600).
        key = _generate_key()
        _KEY_FILE.write_text(key + "\n")
        try:
            os.chmod(_KEY_FILE, 0o600)
        except OSError:
            pass
        logger.warning(
            "OAUTH_ENCRYPTION_KEY was not set; generated one and saved to %s. "
            "For production set OAUTH_ENCRYPTION_KEY in env to a stable value.",
            _KEY_FILE,
        )
        return key
    except OSError:
        logger.exception("Failed to read/create local oauth encryption key file")
        return None


@lru_cache(maxsize=1)
def _key() -> bytes:
    raw = get_settings().oauth_encryption_key or os.environ.get("OAUTH_ENCRYPTION_KEY", "")
    if not raw:
        raw = _load_or_create_local_key() or ""
    if not raw:
        raise CryptoNotConfigured(
            "OAUTH_ENCRYPTION_KEY is not set and a local key file could not be created. "
            "Set OAUTH_ENCRYPTION_KEY in your environment to a 32-byte base64-url value."
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
