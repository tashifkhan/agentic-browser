"""Embedding client for the memory system.

The client is built on first use, not at import, so the backend starts without
a Google key. Provider order:

1. Google (gemini-embedding-2) when GOOGLE_API_KEY is set.
2. OpenAI (text-embedding-3-small) when OPENAI_API_KEY is set.
3. A local hashing embedder. It only captures word overlap, but it keeps
   ingestion and recall working (BM25 still does most of the work) instead of
   failing every request.

Every provider returns EMBEDDING_DIM floats so they fit the OpenSearch
knn_vector mappings. Switching provider changes the vector space, so existing
claims should be re-embedded after a switch.

All public functions are async. The Google and OpenAI clients have native
async methods; the hashing fallback is pure Python and fast.
"""
from __future__ import annotations

import asyncio
import hashlib
import math
import re
from typing import Protocol

from core.config import get_logger, get_settings

logger = get_logger(__name__)

EMBEDDING_DIM = 768
_BATCH = 64


class _Embedder(Protocol):
    async def aembed_documents(self, texts: list[str]) -> list[list[float]]: ...
    async def aembed_query(self, text: str) -> list[float]: ...


class HashingEmbedder:
    """Signed feature hashing over word unigrams and bigrams, L2-normalised."""

    name = "hashing"
    _TOKEN = re.compile(r"[a-z0-9]+")

    def _vector(self, text: str) -> list[float]:
        vec = [0.0] * EMBEDDING_DIM
        tokens = self._TOKEN.findall(text.lower())
        grams = tokens + [f"{a} {b}" for a, b in zip(tokens, tokens[1:])]
        for gram in grams:
            digest = hashlib.blake2b(gram.encode(), digest_size=8).digest()
            idx = int.from_bytes(digest[:4], "little") % EMBEDDING_DIM
            vec[idx] += 1.0 if digest[4] & 1 else -1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    async def aembed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(t) for t in texts]

    async def aembed_query(self, text: str) -> list[float]:
        return self._vector(text)


_client: _Embedder | None = None
_provider: str = ""
_lock = asyncio.Lock()


def _build() -> tuple[_Embedder, str]:
    settings = get_settings()
    if settings.google_api_key:
        from langchain_google_genai import GoogleGenerativeAIEmbeddings

        return GoogleGenerativeAIEmbeddings(
            model="gemini-embedding-2",
            output_dimensionality=EMBEDDING_DIM,
            google_api_key=settings.google_api_key,
        ), "google"
    if settings.openai_api_key:
        from langchain_openai import OpenAIEmbeddings

        return OpenAIEmbeddings(
            model="text-embedding-3-small",
            dimensions=EMBEDDING_DIM,
            api_key=settings.openai_api_key,
        ), "openai"
    logger.warning(
        "No GOOGLE_API_KEY or OPENAI_API_KEY: memory embeddings fall back to local "
        "word hashing, so semantic recall is limited to word overlap."
    )
    return HashingEmbedder(), "hashing"


async def _get() -> _Embedder:
    global _client, _provider
    if _client is None:
        async with _lock:
            if _client is None:
                _client, _provider = _build()
                logger.info("Memory embeddings provider: %s", _provider)
    return _client


def provider() -> str:
    """Name of the active provider, or '' before first use."""
    return _provider


def reset() -> None:
    """Drop the cached client, e.g. after API keys change."""
    global _client, _provider
    _client, _provider = None, ""


async def embed_query(text: str) -> list[float]:
    client = await _get()
    return await client.aembed_query(text or " ")


async def embed_documents(texts: list[str]) -> list[list[float]]:
    """Embed many texts with one request per batch of 64."""
    if not texts:
        return []
    client = await _get()
    out: list[list[float]] = []
    for start in range(0, len(texts), _BATCH):
        chunk = [t or " " for t in texts[start:start + _BATCH]]
        out.extend(await client.aembed_documents(chunk))
    return out
