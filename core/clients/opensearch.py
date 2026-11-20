from __future__ import annotations
from typing import Any, Optional

from opensearchpy import OpenSearch, RequestsHttpConnection

from core.config import get_settings as _gs

EMBEDDING_DIM = 768  # Gemini embeddings pinned for index compatibility

# Index names
IDX_CLAIMS    = "memory_claims"
IDX_ARTIFACTS = "memory_artifacts"
IDX_ENTITIES  = "memory_entities"

_CLAIM_MAPPING = {
    "settings": {"index": {"knn": True}},
    "mappings": {
        "properties": {
            "claim_id":       {"type": "keyword"},
            "claim_text":     {"type": "text", "analyzer": "english"},
            "segment":        {"type": "keyword"},
            "memory_class":   {"type": "keyword"},
            "tier":           {"type": "keyword"},
            "status":         {"type": "keyword"},
            "confidence":     {"type": "float"},
            "base_importance":{"type": "float"},
            "trust_score":    {"type": "float"},
            "predicate":      {"type": "keyword"},
            "user_confirmed": {"type": "boolean"},
            "created_at":     {"type": "date"},
            "last_accessed_at":{"type": "date"},
            "valid_from":     {"type": "date"},
            "valid_to":       {"type": "date"},
            "embedding": {
                "type": "knn_vector",
                "dimension": EMBEDDING_DIM,
                "method": {
                    "name": "hnsw",
                    "space_type": "cosinesimil",
                    "engine": "lucene",
                },
            },
        }
    },
}

_ARTIFACT_MAPPING = {
    "settings": {"index": {"knn": True}},
    "mappings": {
        "properties": {
            "artifact_id":   {"type": "keyword"},
            "source_id":     {"type": "keyword"},
            "artifact_type": {"type": "keyword"},
            "text":          {"type": "text", "analyzer": "english"},
            "created_at":    {"type": "date"},
            "embedding": {
                "type": "knn_vector",
                "dimension": EMBEDDING_DIM,
                "method": {
                    "name": "hnsw",
                    "space_type": "cosinesimil",
                    "engine": "lucene",
                },
            },
        }
    },
}

_ENTITY_MAPPING = {
    "settings": {"index": {"knn": True}},
    "mappings": {
        "properties": {
            "entity_id":      {"type": "keyword"},
            "entity_type":    {"type": "keyword"},
            "canonical_name": {"type": "text", "analyzer": "english",
                               "fields": {"keyword": {"type": "keyword"}}},
            "description":    {"type": "text", "analyzer": "english"},
            "aliases":        {"type": "keyword"},
            "embedding": {
                "type": "knn_vector",
                "dimension": EMBEDDING_DIM,
                "method": {
                    "name": "hnsw",
                    "space_type": "cosinesimil",
                    "engine": "lucene",
                },
            },
        }
    },
}


class OpenSearchClient:
    def __init__(self) -> None:
        self._client: Optional[OpenSearch] = None

    def connect(self) -> None:
        self._client = OpenSearch(
            hosts=[{"host": _gs().opensearch_host, "port": _gs().opensearch_port}],
            http_compress=True,
            use_ssl=False,
            verify_certs=False,
            connection_class=RequestsHttpConnection,
        )

    def close(self) -> None:
        if self._client:
            self._client.close()
            self._client = None

    @property
    def client(self) -> OpenSearch:
        if not self._client:
            raise RuntimeError("OpenSearch client not initialised — call connect() first")
        return self._client

    # ── Index management ───────────────────────────────────────────────────────

    def ensure_indices(self) -> None:
        for idx, mapping in [
            (IDX_CLAIMS, _CLAIM_MAPPING),
            (IDX_ARTIFACTS, _ARTIFACT_MAPPING),
            (IDX_ENTITIES, _ENTITY_MAPPING),
        ]:
            if not self.client.indices.exists(index=idx):
                self.client.indices.create(index=idx, body=mapping)

    def clear_memory_indices(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for idx in (IDX_CLAIMS, IDX_ARTIFACTS, IDX_ENTITIES):
            if not self.client.indices.exists(index=idx):
                counts[idx] = 0
                continue
            response = self.client.delete_by_query(
                index=idx,
                body={"query": {"match_all": {}}},
                conflicts="proceed",
                refresh=True,
            )
            counts[idx] = int(response.get("deleted") or 0)
        return counts

    # ── Documents ──────────────────────────────────────────────────────────────

    def index_claim(self, claim_id: str, claim_text: str, embedding: list[float],
                    segment: str, memory_class: str, tier: str, status: str,
                    confidence: float, base_importance: float, trust_score: float,
                    predicate: str = "", user_confirmed: bool = False,
                    created_at: str = "", last_accessed_at: str = "",
                    valid_from: str | None = None, valid_to: str | None = None) -> str:
        doc = {
            "claim_id": claim_id, "claim_text": claim_text, "embedding": embedding,
            "segment": segment, "memory_class": memory_class, "tier": tier,
            "status": status, "confidence": confidence, "base_importance": base_importance,
            "trust_score": trust_score, "predicate": predicate,
            "user_confirmed": user_confirmed, "created_at": created_at or None,
            "last_accessed_at": last_accessed_at or None,
            "valid_from": valid_from, "valid_to": valid_to,
        }
        doc_id = claim_id
        self.client.index(index=IDX_CLAIMS, id=doc_id, body=doc, refresh=True)
        return doc_id

    def index_artifact(self, artifact_id: str, source_id: str, artifact_type: str,
                       text: str, embedding: list[float], created_at: str = "") -> str:
        doc = {
            "artifact_id": artifact_id, "source_id": source_id,
            "artifact_type": artifact_type, "text": text,
            "embedding": embedding, "created_at": created_at or None,
        }
        self.client.index(index=IDX_ARTIFACTS, id=artifact_id, body=doc, refresh=True)
        return artifact_id

    def index_entity(self, entity_id: str, entity_type: str, canonical_name: str,
                     description: str, aliases: list[str], embedding: list[float]) -> str:
        doc = {
            "entity_id": entity_id, "entity_type": entity_type,
            "canonical_name": canonical_name, "description": description,
            "aliases": aliases, "embedding": embedding,
        }
        self.client.index(index=IDX_ENTITIES, id=entity_id, body=doc, refresh=True)
        return entity_id

    def delete_document(self, index: str, doc_id: str) -> None:
        try:
            self.client.delete(index=index, id=doc_id)
        except Exception:
            pass

    def update_document(self, index: str, doc_id: str, fields: dict[str, Any]) -> None:
        self.client.update(index=index, id=doc_id, body={"doc": fields}, refresh=True)

    # ── Filters ────────────────────────────────────────────────────────────────

    @staticmethod
    def _filter_clauses(filters: dict[str, Any] | None) -> list[dict[str, Any]]:
        """{"status": ["active", "provisional"], "tier": "long_term"} -> term/terms clauses."""
        clauses: list[dict[str, Any]] = []
        for key, value in (filters or {}).items():
            if value is None:
                continue
            if isinstance(value, (list, tuple, set)):
                values = list(value)
                if values:
                    clauses.append({"terms": {key: values}})
            else:
                clauses.append({"term": {key: value}})
        return clauses

    @staticmethod
    def _source_spec(with_embedding: bool) -> Any:
        return True if with_embedding else {"excludes": ["embedding"]}

    # ── Vector search ──────────────────────────────────────────────────────────

    def knn_search(self, index: str, embedding: list[float], k: int = 10,
                   filters: dict[str, Any] | None = None,
                   with_embedding: bool = False) -> list[dict[str, Any]]:
        """k-NN search. Filters run inside the kNN clause (Lucene efficient
        filtering), so filtered-out docs don't use up the k slots.

        Each hit carries `_cosine`: the Lucene cosinesimil score is
        (1 + cos) / 2, so cos = 2 * score - 1.
        """
        knn: dict[str, Any] = {"vector": embedding, "k": k}
        clauses = self._filter_clauses(filters)
        if clauses:
            knn["filter"] = {"bool": {"filter": clauses}}
        response = self.client.search(
            index=index,
            body={"size": k, "query": {"knn": {"embedding": knn}},
                  "_source": self._source_spec(with_embedding)},
        )
        return [
            {**hit["_source"], "_score": hit["_score"], "_id": hit["_id"],
             "_cosine": 2.0 * float(hit["_score"]) - 1.0}
            for hit in response["hits"]["hits"]
        ]

    # ── BM25 / full-text search ────────────────────────────────────────────────

    def text_search(self, index: str, query: str, fields: list[str],
                    size: int = 10, filters: dict[str, Any] | None = None,
                    with_embedding: bool = False) -> list[dict[str, Any]]:
        body: dict[str, Any] = {
            "size": size,
            "query": {"bool": {
                "must": [{"multi_match": {"query": query, "fields": fields, "type": "best_fields"}}],
                "filter": self._filter_clauses(filters),
            }},
            "_source": self._source_spec(with_embedding),
        }
        response = self.client.search(index=index, body=body)
        return [
            {**hit["_source"], "_score": hit["_score"], "_id": hit["_id"]}
            for hit in response["hits"]["hits"]
        ]

    # ── Hybrid search (RRF) ────────────────────────────────────────────────────

    def hybrid_search(self, index: str, query_text: str, embedding: list[float],
                      k: int = 10, filters: dict[str, Any] | None = None,
                      with_embedding: bool = False) -> list[dict[str, Any]]:
        """Vector + BM25, fused with reciprocal rank fusion.

        Besides `_rrf_score`, each hit keeps the raw signals so callers can
        score relevance directly: `_cosine` (vector similarity, absent for
        BM25-only hits) and `_bm25_norm` (BM25 score divided by the top BM25
        score in this result set).
        """
        vector_hits = self.knn_search(index, embedding, k=k * 2, filters=filters,
                                      with_embedding=with_embedding)
        text_hits   = self.text_search(index, query_text,
                                       fields=["claim_text^2", "text", "canonical_name", "description"],
                                       size=k * 2, filters=filters, with_embedding=with_embedding)

        scores: dict[str, float] = {}
        docs: dict[str, dict]    = {}
        rrf_k = 60

        for rank, hit in enumerate(vector_hits):
            did = hit["_id"]
            scores[did] = scores.get(did, 0) + 1 / (rrf_k + rank + 1)
            docs[did] = hit

        top_bm25 = max((h["_score"] for h in text_hits), default=0.0) or 1.0
        for rank, hit in enumerate(text_hits):
            did = hit["_id"]
            scores[did] = scores.get(did, 0) + 1 / (rrf_k + rank + 1)
            merged = docs.get(did, hit)
            merged["_bm25_norm"] = float(hit["_score"]) / top_bm25
            docs[did] = merged

        sorted_ids = sorted(scores, key=lambda x: scores[x], reverse=True)[:k]
        results = []
        for did in sorted_ids:
            d = docs[did].copy()
            d["_rrf_score"] = scores[did]
            d.setdefault("_bm25_norm", 0.0)
            results.append(d)
        return results


# ── Module-level singleton ─────────────────────────────────────────────────────

_os_client: Optional[OpenSearchClient] = None


def get_opensearch() -> OpenSearchClient:
    global _os_client
    if _os_client is None:
        _os_client = OpenSearchClient()
    return _os_client
