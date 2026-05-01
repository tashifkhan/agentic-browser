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

    # ── Vector search ──────────────────────────────────────────────────────────

    def knn_search(self, index: str, embedding: list[float], k: int = 10,
                   filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        knn_query: dict[str, Any] = {
            "knn": {
                "embedding": {
                    "vector": embedding,
                    "k": k,
                }
            }
        }
        if filters:
            query = {"bool": {"must": [knn_query], "filter": [{"term": filters}]}}
        else:
            query = knn_query

        response = self.client.search(
            index=index,
            body={"size": k, "query": query, "_source": {"excludes": ["embedding"]}},
        )
        return [
            {**hit["_source"], "_score": hit["_score"], "_id": hit["_id"]}
            for hit in response["hits"]["hits"]
        ]

    # ── BM25 / full-text search ────────────────────────────────────────────────

    def text_search(self, index: str, query: str, fields: list[str],
                    size: int = 10, filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        must: list[dict] = [{"multi_match": {"query": query, "fields": fields, "type": "best_fields"}}]
        body: dict[str, Any] = {
            "size": size,
            "query": {"bool": {"must": must}},
            "_source": {"excludes": ["embedding"]},
        }
        if filters:
            body["query"]["bool"]["filter"] = [{"term": filters}]
        response = self.client.search(index=index, body=body)
        return [
            {**hit["_source"], "_score": hit["_score"], "_id": hit["_id"]}
            for hit in response["hits"]["hits"]
        ]

    # ── Hybrid search (RRF) ────────────────────────────────────────────────────

    def hybrid_search(self, index: str, query_text: str, embedding: list[float],
                      k: int = 10, filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        vector_hits = self.knn_search(index, embedding, k=k * 2, filters=filters)
        text_hits   = self.text_search(index, query_text,
                                       fields=["claim_text^2", "text", "canonical_name", "description"],
                                       size=k * 2, filters=filters)

        # Reciprocal Rank Fusion
        scores: dict[str, float] = {}
        docs: dict[str, dict]    = {}
        rrf_k = 60

        for rank, hit in enumerate(vector_hits):
            did = hit["_id"]
            scores[did] = scores.get(did, 0) + 1 / (rrf_k + rank + 1)
            docs[did] = hit

        for rank, hit in enumerate(text_hits):
            did = hit["_id"]
            scores[did] = scores.get(did, 0) + 1 / (rrf_k + rank + 1)
            docs[did] = hit

        sorted_ids = sorted(scores, key=lambda x: scores[x], reverse=True)[:k]
        results = []
        for did in sorted_ids:
            d = docs[did].copy()
            d["_rrf_score"] = scores[did]
            results.append(d)
        return results


# ── Module-level singleton ─────────────────────────────────────────────────────

_os_client: Optional[OpenSearchClient] = None


def get_opensearch() -> OpenSearchClient:
    global _os_client
    if _os_client is None:
        _os_client = OpenSearchClient()
    return _os_client
