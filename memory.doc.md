# Memory System — Implementation Reference

This document describes the memory system as built. It covers every file, class, method, threshold, and data-flow decision. Use it as the definitive guide for understanding or extending the codebase.

---

## Package Layout

```
memory/
├── models/
│   ├── enums.py          — all domain enums + decay rate constants
│   ├── schemas.py        — Pydantic domain schemas + API I/O types
│   └── orm.py            — SQLAlchemy 2.0 ORM models (9 tables)
├── db/
│   ├── postgres.py       — async engine, session factory
│   ├── neo4j_client.py   — async Neo4j driver wrapper + singleton
│   └── opensearch_client.py — OpenSearch client + 3 index definitions
├── ingestion/
│   ├── extractor.py      — LLM extraction + Google embeddings
│   ├── memory_gate.py    — rule-based filter before any write
│   ├── chat.py           — chat turn ingestion pipeline
│   ├── document.py       — PDF / DOCX / TXT ingestion pipeline
│   └── gmail.py          — Gmail OAuth thread ingestion
├── graph/
│   ├── operations.py     — Neo4j write helpers
│   ├── traversal.py      — BFS expansion, timeline, profile
│   └── entity_resolution.py — cosine-based entity deduplication
├── retrieval/
│   ├── query_planner.py  — LLM query classification + heuristic fallback
│   ├── hybrid.py         — 10-step retrieval pipeline
│   ├── scoring.py        — composite scorer + redundancy penalty
│   └── context_assembler.py — token-budgeted prompt assembly
├── maintenance/
│   ├── decay.py          — exponential decay + stale marking
│   ├── dedup.py          — claim-level deduplication
│   ├── promotion.py      — tier promotion / demotion
│   ├── agents.py         — Curator / Skeptic / Judge pipeline
│   └── consolidation.py  — four maintenance rhythms orchestrator
├── api/
│   └── router.py         — 17 FastAPI endpoints
└── service.py            — top-level MemoryService orchestrator
```

---

## 1. Models (`memory/models/`)

### 1.1 Enums (`enums.py`)

| Enum | Values |
|---|---|
| `SourceType` | `CHAT`, `EMAIL`, `DOCUMENT`, `SYSTEM` |
| `MemoryClass` | `WORKING`, `EPISODIC`, `SEMANTIC`, `PROCEDURAL`, `SOCIAL`, `REFLECTIVE` |
| `MemoryTier` | `WORKING`, `SHORT_TERM`, `LONG_TERM`, `PERMANENT` |
| `MemorySegment` | `CORE_IDENTITY`, `PREFERENCES_AND_CORRECTIONS`, `PROJECTS_AND_GOALS`, `PEOPLE_AND_RELATIONSHIPS`, `SKILLS_AND_BACKGROUND`, `COMMUNICATIONS_AND_COMMITMENTS`, `CONTEXTUAL_INCIDENTS`, `REFLECTIONS_AND_SUMMARIES` |
| `ClaimStatus` | `ACTIVE`, `PROVISIONAL`, `STALE`, `ARCHIVED`, `SUPERSEDED` |
| `EntityType` | `PERSON`, `ORGANIZATION`, `PROJECT`, `SKILL`, `PREFERENCE`, `CONSTRAINT`, `TASK`, `EVENT`, `DOCUMENT`, `TOPIC`, `LOCATION`, `EMAIL_THREAD`, `RESUME_SECTION` |
| `EvidenceType` | `EXTRACTED`, `INFERRED`, `USER_STATED`, `USER_CONFIRMED`, `SYSTEM_DERIVED` |
| `FeedbackKind` | `THUMBS_UP`, `THUMBS_DOWN`, `CONFIRMED`, `EXPLICIT_CORRECTION` |

**Decay rate constants:**

```python
TIER_DECAY_RATE: dict[MemoryTier, float] = {
    MemoryTier.WORKING:    0.15,
    MemoryTier.SHORT_TERM: 0.03,
    MemoryTier.LONG_TERM:  0.005,
    MemoryTier.PERMANENT:  0.0,
}

SEGMENT_DECAY_RATE: dict[MemorySegment, float] = {
    MemorySegment.PREFERENCES_AND_CORRECTIONS: 0.0,
    MemorySegment.CORE_IDENTITY:               0.001,
    MemorySegment.SKILLS_AND_BACKGROUND:       0.002,
    MemorySegment.PEOPLE_AND_RELATIONSHIPS:    0.003,
    MemorySegment.PROJECTS_AND_GOALS:          0.01,
    MemorySegment.REFLECTIONS_AND_SUMMARIES:   0.002,
    MemorySegment.COMMUNICATIONS_AND_COMMITMENTS: 0.05,
    MemorySegment.CONTEXTUAL_INCIDENTS:        0.1,
}
```

### 1.2 Schemas (`schemas.py`)

Domain read schemas (one per table): `SourceSchema`, `ArtifactSchema`, `EntitySchema`, `ClaimSchema`, `EvidenceSchema`, `ClaimRelationSchema`, `RetrievalLogSchema`, `FeedbackEventSchema`, `MaintenanceRunSchema`.

Extraction intermediaries: `CandidateEntity`, `CandidateClaim`, `ExtractionResult`.

API request/response types:

| Type | Purpose |
|---|---|
| `MemorySearchRequest` | hybrid search query + filters |
| `MemorySearchResult` | claim + score + provenance |
| `ContextPackage` | full assembled context for LLM injection |
| `StoreClaimRequest` | manual claim write |
| `UpdateClaimRequest` | patch claim fields |
| `ForgetRequest` | delete by claim_id / entity_id / pattern |
| `GraphExpandRequest` | BFS expansion parameters |
| `GraphExpandResult` | nodes + edges from Neo4j |
| `TimelineRequest` | entity/topic + time range |
| `IngestChatRequest` | chat turn content + metadata |
| `IngestDocumentResult` | extraction stats |
| `GmailSyncResult` | threads processed + claims written |

### 1.3 ORM (`orm.py`)

SQLAlchemy 2.0 `DeclarativeBase`. Nine ORM classes:

| ORM class | Table | Key columns |
|---|---|---|
| `SourceORM` | `sources` | `source_id UUID PK`, `source_type`, `title`, `trust_level` |
| `ArtifactORM` | `artifacts` | `artifact_id UUID PK`, `source_id FK`, `artifact_type`, `text`, `parser_version` |
| `EntityORM` | `entities` | `entity_id UUID PK`, `entity_type`, `canonical_name`, `aliases ARRAY(Text)`, `description`, `metadata JSONB` |
| `ClaimORM` | `claims` | `claim_id UUID PK`, `claim_text`, `predicate`, `subject_entity_id FK`, `object_entity_id FK`, `memory_class`, `segment`, `tier`, `status`, `confidence`, `base_importance`, `trust_score`, `decay_rate`, `access_count`, `retrieval_hit_count`, `contradiction_count`, `user_confirmed BOOL`, `needs_confirmation BOOL`, `valid_from`, `valid_to`, `last_accessed_at`, `created_at`, `updated_at` |
| `EvidenceORM` | `evidence` | `evidence_id UUID PK`, `claim_id FK`, `artifact_id FK`, `evidence_type`, `support_count` |
| `ClaimRelationORM` | `claim_relations` | `relation_id UUID PK`, `source_claim_id FK`, `target_claim_id FK`, `relation_type` |
| `RetrievalLogORM` | `retrieval_log` | `log_id UUID PK`, `query`, `claim_ids ARRAY`, `was_used BOOL` |
| `FeedbackEventORM` | `feedback_events` | `event_id UUID PK`, `claim_id FK`, `kind`, `comment` |
| `MaintenanceRunORM` | `maintenance_runs` | `run_id UUID PK`, `run_type`, `status`, `claims_reviewed`, `claims_updated`, `claims_archived`, `error`, `started_at`, `finished_at` |

The `touch_updated_at()` Postgres trigger fires on `UPDATE` to `entities` and `claims`.

---

## 2. Database Layer (`memory/db/`)

### 2.1 PostgreSQL (`postgres.py`)

```python
engine = create_async_engine(
    get_settings().postgres_dsn,
    pool_size=10, max_overflow=20, pool_pre_ping=True,
)
AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)

@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

`init_db()` runs `CREATE TABLE IF NOT EXISTS` for all ORM models via `Base.metadata.create_all`.

### 2.2 Neo4j (`neo4j_client.py`)

Class `Neo4jClient` wraps the async `neo4j` Python driver.

| Method | Purpose |
|---|---|
| `connect()` | creates `AsyncGraphDatabase.driver` from `get_settings().neo4j_uri` |
| `close()` | closes driver |
| `create_constraints()` | `UNIQUE` constraints on `Entity.entity_id` and `Claim.claim_id` |
| `upsert_entity(entity_id, entity_type, canonical_name, aliases, description)` | MERGE on entity_id, SET all properties |
| `upsert_claim_node(claim_id, claim_text, predicate, segment, tier, confidence)` | MERGE on claim_id |
| `create_entity_relation(from_id, to_id, relation_type)` | MERGE edge with `type` property |
| `link_claim_to_entity(claim_id, entity_id, role)` | MERGE `(Claim)-[:ABOUT {role}]->(Entity)` |
| `link_claim_to_source(claim_id, source_id)` | MERGE `(Claim)-[:FROM_SOURCE]->(Source)` |
| `create_claim_relation(source_claim_id, target_claim_id, relation_type)` | MERGE `(Claim)-[r:RELATION]->(Claim)` |
| `expand_entity(entity_id, hops, edge_types)` | BFS Cypher returning nodes + edges within `hops` |
| `find_entity_by_name(name)` | regex + alias CONTAINS match |

Singleton: `get_neo4j() -> Neo4jClient`

### 2.3 OpenSearch (`opensearch_client.py`)

Three indices, all with `knn: true` and 768-dim HNSW vectors:

| Index | Content | Key fields |
|---|---|---|
| `memory_claims` | claim text + metadata | `claim_id`, `claim_text`, `segment`, `memory_class`, `tier`, `status`, `confidence`, `base_importance`, `trust_score`, `predicate`, `user_confirmed`, `embedding (knn_vector 768)` |
| `memory_artifacts` | raw text chunks | `artifact_id`, `source_id`, `artifact_type`, `text`, `embedding (knn_vector 768)` |
| `memory_entities` | entity info | `entity_id`, `entity_type`, `canonical_name`, `description`, `aliases`, `embedding (knn_vector 768)` |

HNSW config: `space_type: cosinesimil`, `engine: lucene`.

**Search methods:**

`knn_search(index, embedding, k, filters)` — pure vector KNN query.

`text_search(index, query, fields, size, filters)` — `multi_match` best_fields BM25.

`hybrid_search(index, query_text, embedding, k, filters)` — calls both with `k*2`, then applies Reciprocal Rank Fusion:

```
score(doc) = Σ 1 / (60 + rank)
```

Final list is top-k by RRF score.

Singleton: `get_opensearch() -> OpenSearchClient`

---

## 3. Ingestion (`memory/ingestion/`)

### 3.1 Extractor (`extractor.py`)

Wraps `ChatGoogleGenerativeAI` (via `core.llm`) and `GoogleGenerativeAIEmbeddings`.

```python
_EMBEDDINGS = GoogleGenerativeAIEmbeddings(
    model="models/text-embedding-004",
    google_api_key=get_settings().google_api_key,
)
EXTRACTOR_VERSION = "1.0.0"
```

**`Extractor.extract(text, source_type, trust_level, context) -> ExtractionResult`**

- Sends structured JSON extraction prompt to LLM (system prompt + text up to 6000 chars)
- LLM returns entities + claims + summary in exact JSON schema
- Parses into `CandidateEntity` / `CandidateClaim` lists; skips malformed items with debug log
- `source_trust = min(trust_level / 10.0, 1.0)`

**`Extractor.embed(texts) -> list[list[float]]`** — batch embed via `embed_documents`.

**`Extractor.embed_one(text) -> list[float]`** — single embed via `embed_query`.

**`Extractor.summarize(text, max_sentences) -> str`** — cheap LLM call, `text[:4000]`.

### 3.2 Memory Gate (`memory_gate.py`)

Runs **before** any DB write. Output: `GateDecision` = `STORE_AUTO | STORE_PROVISIONAL | REJECT`.

**Injection pattern check** (always REJECT if matched):
```python
_INJECTION_PATTERNS = [
    "ignore previous", "forget everything", "disregard",
    "new instructions", "system prompt", "you are now",
    "act as", "override", "jailbreak",
]
```

**Effective confidence calculation:**
```python
effective_conf = claim.confidence * (0.5 + 0.5 * source_trust)
```

**Decision tree:**

1. Injection pattern in claim text → `REJECT`
2. `evidence_type == INFERRED` and `source_trust < 0.4` and `effective_conf < 0.2` → `REJECT`
3. `segment in {PREFERENCES, CORE_IDENTITY, SKILLS}` → `STORE_AUTO`
4. `effective_conf >= 0.45` and not low-trust inferred → `STORE_AUTO`
5. `segment in {COMMUNICATIONS, CONTEXTUAL}` → `STORE_PROVISIONAL`
6. Default → `STORE_PROVISIONAL`

### 3.3 Chat Ingestion (`chat.py`)

**`ChatIngestionPipeline.process(req: IngestChatRequest)`**

1. Create `SourceORM` (type=`CHAT`, trust_level=9)
2. Create `ArtifactORM` for the raw turn text
3. Index artifact to OpenSearch
4. Call `Extractor.extract()` with `trust_level=9`
5. For each `CandidateEntity`: upsert to Postgres + Neo4j + OpenSearch
6. For each `CandidateClaim`: run Memory Gate → write to Postgres → Neo4j → OpenSearch

Helper `_upsert_entity(session, candidate) -> EntityORM` is shared with `document.py`. Helper `_infer_tier(segment, confidence) -> str` assigns tier from segment priority.

### 3.4 Document Ingestion (`document.py`)

Supported formats: PDF (via `pdfminer`), DOCX (via `python-docx`), TXT (plain read).

**Resume detection `_is_resume(filename, text)`**: filename contains `resume`/`cv` **or** ≥3 section headers matched from `{experience, education, skills, projects, certifications, summary, objective}`.

**Chunking strategy:**

| Document type | Chunk size | Overlap |
|---|---|---|
| Resume | 800 chars | 100 chars |
| Regular doc | 1200 chars | 200 chars |

Resume claims default tier: `long_term` (not `permanent` — resume data may become stale).

Pipeline also generates one full-document summary artifact via `Extractor.summarize()`.

### 3.5 Gmail Ingestion (`gmail.py`)

Trust levels: outgoing mail `_OUTGOING_TRUST = 9`, incoming mail `_INCOMING_TRUST = 4`.

`_strip_quoted(text)` removes `>` reply lines and signature blocks (`-- ` separator).

Per-thread processing:
1. Generate thread-level summary artifact
2. Per-message: strip quoted text → create artifact → extract claims
3. Gate rejects all procedural claims from incoming email (source_trust enforced)

---

## 4. Graph Layer (`memory/graph/`)

### 4.1 Operations (`operations.py`)

`GraphOperations` — thin wrappers coordinating Postgres + Neo4j writes:

| Method | What it does |
|---|---|
| `sync_entity_to_neo4j(entity_id)` | Fetches entity from Postgres, calls `neo4j_client.upsert_entity()` |
| `add_entity_relation(from_id, to_id, relation_type)` | Writes `ClaimRelationORM` to Postgres + edge to Neo4j |
| `delete_entity(entity_id)` | Marks entity deleted in Postgres, removes Neo4j node |
| `sync_claim_to_neo4j(claim_id)` | Fetches claim from Postgres, upserts claim node + links entities |
| `create_claim_relation(source_id, target_id, rel_type)` | Postgres row + Neo4j edge |
| `mark_supersedes(new_claim_id, old_claim_id)` | Creates `SUPERSEDES` relation |
| `mark_contradicts(claim_a_id, claim_b_id)` | Creates bidirectional `CONTRADICTS` edges |

### 4.2 Traversal (`traversal.py`)

`GraphTraversal` uses both Neo4j and Postgres to assemble rich context.

**`local_expand(entity_names, hops=2, edge_types=None) -> list[ClaimSchema]`**

1. Resolve entity names to IDs via `neo4j_client.find_entity_by_name()`
2. BFS in Neo4j: `expand_entity(entity_id, hops, edge_types)`
3. Collect claim IDs from returned nodes
4. Fetch `ClaimORM` rows from Postgres by those IDs
5. Return as `ClaimSchema` list

**`timeline(entity_name, start, end) -> list[ClaimSchema]`** — chronological by `valid_from`.

**`get_procedural_memories(limit=30) -> list[ClaimSchema]`** — always-loaded preferences and corrections; fetches active claims from `preferences_and_corrections` segment ordered by `base_importance DESC`.

**`get_profile_summary() -> str`** — top 20 active claims from `core_identity` + `skills_and_background`, formatted as bullet list.

**`community_summary_search(query_embedding, k=5) -> list[str]`** — KNN search on `memory_artifacts` filtered by `artifact_type = community_summary`.

### 4.3 Entity Resolution (`entity_resolution.py`)

```python
MERGE_THRESHOLD  = 0.94  # auto-merge
REVIEW_THRESHOLD = 0.85  # flag for review
```

**`EntityResolver.find_duplicates() -> list[tuple[EntityORM, EntityORM, float]]`**

1. Fetch all entities + their embeddings from OpenSearch
2. Pairwise cosine similarity comparison
3. Return pairs above `REVIEW_THRESHOLD`

**`EntityResolver.auto_merge(keep, drop, session)`**

1. Re-point all FK references (`claims.subject_entity_id`, `claims.object_entity_id`, `evidence`) from `drop` to `keep`
2. Merge `drop.aliases` into `keep.aliases`
3. APOC `apoc.refactor.mergeNodes` in Neo4j
4. Delete `drop` entity document from OpenSearch
5. Delete `drop` ORM row

**`EntityResolver.resolve_and_merge_batch() -> dict`** — runs `find_duplicates()`, auto-merges all pairs at ≥ `MERGE_THRESHOLD`, returns `{pairs_found, auto_merged, flagged_for_review}`.

---

## 5. Retrieval (`memory/retrieval/`)

### 5.1 Query Planner (`query_planner.py`)

**`QueryPlanner.plan(query: str) -> QueryPlan`**

1. Sends JSON classification prompt to LLM
2. Falls back to `_heuristic_plan()` on parse error

`QueryPlan` dataclass fields:
- `query_type: QueryType` — `FACTUAL | PROCEDURAL | RELATIONAL | TEMPORAL | PREFERENCE`
- `entity_mentions: list[str]`
- `time_constraint: str | None`
- `needs_graph_traversal: bool`
- `needs_email_context: bool`
- `needs_resume_context: bool`
- `preference_sensitive: bool`
- `suggested_segments: list[MemorySegment]`
- `suggested_predicates: list[str]`

`_heuristic_plan()` uses regex for simple classification without LLM cost.

### 5.2 Hybrid Retrieval (`hybrid.py`)

**`HybridRetriever.search(query, k=10, filters=None) -> list[tuple[ClaimORM, float]]`**

10-step pipeline:

1. **Query plan** — `QueryPlanner.plan(query)`
2. **Embed query** — `Extractor.embed_one(query)` → 768-dim float list
3. **Load procedurals** — `GraphTraversal.get_procedural_memories()` always included
4. **Hybrid OpenSearch** — `hybrid_search(IDX_CLAIMS, query, embedding, k=k*2, filters)`
5. **Post-filter** — remove `ARCHIVED`, `SUPERSEDED`; apply `suggested_segments` filter from plan
6. **Postgres fetch** — load full `ClaimORM` rows by IDs from step 4
7. **Graph expansion** — if `plan.needs_graph_traversal`, call `local_expand()` for entity mentions
8. **Score** — `score_claim()` + `apply_redundancy_penalty()` for all candidates
9. **Log retrieval** — write `RetrievalLogORM` row to Postgres
10. **Bump access counts** — `UPDATE claims SET access_count = access_count + 1` for top-k

### 5.3 Scoring (`scoring.py`)

**`score_claim(claim, semantic_sim, graph_relevance, rrf_score, now) -> float`**

```python
W_SEMANTIC   = 0.30
W_GRAPH      = 0.15
W_TIME       = 0.15
W_IMPORTANCE = 0.15
W_TRUST      = 0.10
W_USAGE      = 0.10
W_CONFLICT   = 0.05   # penalty weight

sem = max(semantic_sim, min(rrf_score * 60, 1.0))
conflict_pen = min(claim.contradiction_count * 0.15, 0.5)
usage_score  = retrieval_hit_count / max(access_count, 1)

S = W_SEMANTIC * sem
  + W_GRAPH    * graph_relevance
  + W_TIME     * time_score
  + W_IMPORTANCE * base_importance
  + W_TRUST    * trust_score
  + W_USAGE    * usage_score
  - W_CONFLICT * conflict_pen
```

**Decay formula `_decay_weight(claim, now) -> float`:**

```
W(t) = base_importance · e^(-λ·Δt) · usage_mult · confidence
```
- `λ = max(TIER_DECAY_RATE[tier], claim.decay_rate)`
- `Δt` in days since `last_accessed_at` (or `created_at`)
- `usage_mult = min(1 + 0.05 · access_count, 2.0)` — capped at 2×

**`apply_redundancy_penalty(scored, claim_embeddings, penalty=0.3, sim_threshold=0.92)`**

Sorts by score descending, applies 30% multiplicative penalty to any claim whose cosine similarity to a previously-seen selected claim exceeds 0.92.

### 5.4 Context Assembler (`context_assembler.py`)

`ContextAssembler(total_token_budget=3000)`

**Budget allocation:**

| Section | Share |
|---|---|
| Procedural (always-on preferences) | 15% |
| Profile summary | 15% |
| Semantic search results | 25% |
| Graph expansion results | 25% |
| Evidence snippets | 20% |

Token counting uses `tiktoken.encoding_for_model("cl100k_base")`.

**`format_for_prompt(package: ContextPackage) -> str`** renders the package as structured markdown with section headers — ready for direct injection into an LLM system prompt.

---

## 6. Maintenance (`memory/maintenance/`)

### 6.1 Decay Engine (`decay.py`)

`STALE_THRESHOLD = 0.05`

**`DecayEngine.run(batch_size=500) -> dict`**

- Fetches `batch_size` active/provisional claims ordered by `last_accessed_at ASC`
- Computes `_effective_weight(claim)` using same formula as scoring's `_decay_weight()`
- Claims below `STALE_THRESHOLD` → `status = STALE`
- Syncs status change to OpenSearch via `update_document()`
- Returns `{checked, marked_stale}`

**`DecayEngine.archive_stale(older_than_days=14) -> dict`**

- Fetches stale claims older than `older_than_days`
- Moves to `ARCHIVED` status in Postgres + OpenSearch
- Returns `{archived}`

### 6.2 Deduplication Engine (`dedup.py`)

`DEDUP_THRESHOLD = 0.93`

**`DeduplicationEngine.run(batch_size=300) -> dict`**

1. Fetches recent active claims with embeddings from OpenSearch
2. Pairwise cosine comparison (O(n²) within batch)
3. For pairs above `DEDUP_THRESHOLD`: merge lower-confidence claim into higher
4. On merge:
   - Re-point `EvidenceORM` rows to keeper
   - Bump `keeper.support_count`
   - Mark dropped claim `SUPERSEDED` in Postgres + OpenSearch
5. Returns `{duplicates_found, merged}`

### 6.3 Promotion Engine (`promotion.py`)

**Promotion thresholds:**

```python
_PROMOTE_ST_TO_LT = {
    "min_access_count":    3,
    "min_retrieval_hits":  2,
    "min_confidence":      0.55,
}
_PROMOTE_LT_TO_PERM = {
    "min_access_count":    8,
    "min_retrieval_hits":  5,
    "min_confidence":      0.75,
}
_DEMOTE_LT_DAYS = 30         # days without access before demotion
_DEMOTE_HIT_RATE_MAX = 0.1   # max hit-rate to qualify for demotion
```

**`PromotionEngine.run(batch_size=300) -> dict`**

- `SHORT_TERM` → `LONG_TERM` if meets `_PROMOTE_ST_TO_LT` criteria
- `LONG_TERM` → `PERMANENT` if meets `_PROMOTE_LT_TO_PERM` criteria
  - Auto-sets `user_confirmed = True` if `confidence >= 0.8`
- `LONG_TERM` → `SHORT_TERM` demotion if no access in 30 days and hit_rate ≤ 0.1
- `PERMANENT` tier never auto-demotes

### 6.4 Maintenance Agents (`agents.py`)

Three LLM agents implementing a cheapest-first decision ladder.

**`AgentDecision`**: `KEEP | ARCHIVE | DELETE | PROMOTE | DEMOTE | MERGE | FLAG_REVIEW`

**`AgentVerdict`** dataclass: `decision, reasoning, confidence, merge_target_id`

**`CuratorAgent.evaluate(claim) -> AgentVerdict`**

- Single LLM call with structured JSON response
- Prompt includes: claim text, segment, tier, confidence, importance, trust, access counts, contradiction count, user_confirmed, status
- Returns `AgentVerdict` parsed from JSON; default to `KEEP` on parse error

**`SkepticAgent.challenge(claim, curator_verdict) -> dict`**

- Activated only for `ARCHIVE`, `DELETE`, or high-stakes `PROMOTE` decisions
- Returns `{agree: bool, reasoning: str, confidence: float}`

**`JudgeAgent.adjudicate(claim, curator, skeptic_response) -> AgentVerdict`**

- Activated only when Skeptic disagrees AND both Curator and Skeptic confidence ≥ 0.6
- Final binding decision; defaults to `FLAG_REVIEW` on parse error

**`MaintenanceAgentPipeline.run_claim(claim) -> AgentVerdict`** — decision ladder:

1. **Fast rules** (free):
   - `user_confirmed AND tier=permanent AND segment=preferences` → `KEEP` (conf=1.0)
   - `status=stale AND access_count=0` → `ARCHIVE` (conf=0.9)
   - `access_count≥10 AND hits≥7 AND contradictions=0 AND confidence≥0.8` → `PROMOTE` (conf=0.85)
2. **Curator** — always runs if fast rules don't match
3. **Skeptic** — only for destructive or high-stakes decisions
4. **Judge** — only on Curator/Skeptic disagreement with conf≥0.6 each

### 6.5 Consolidation Runner (`consolidation.py`)

`ConsolidationRunner` orchestrates four maintenance rhythms. All runs write to `maintenance_runs` table via `_start_run()` / `_finish_run()`.

| Rhythm | Trigger | Operations |
|---|---|---|
| `micro_reflection` | After each chat turn | Confirms stats updated; no dedup (cheap) |
| `hourly` | APScheduler every hour | `dedup(100)` + `promotion(100)` |
| `nightly` | APScheduler 3 AM daily | `decay(500)` → `archive_stale(14d)` → `dedup(300)` → `promotion(300)` → `agent_review(50)` |
| `weekly` | APScheduler Sunday 4 AM | `entity_resolution` → `community_summaries` → full `nightly` |

**`_generate_community_summaries()`**: For each of 5 segments (`core_identity`, `skills_and_background`, `projects_and_goals`, `people_and_relationships`, `preferences_and_corrections`), fetches top 30 active claims by importance, LLM-summarizes them into 5 sentences, stores as `community_summary` artifact in both Postgres and OpenSearch.

---

## 7. API (`memory/api/router.py`)

All 17 endpoints are under the prefix `/api/memory/`. Heavy operations are queued as `BackgroundTasks`.

### Search & Retrieval

| Method | Path | Description |
|---|---|---|
| `POST` | `/search` | Hybrid vector + BM25 + graph search |
| `POST` | `/context` | Token-budgeted `ContextPackage` for LLM injection |
| `GET` | `/explain/{claim_id}` | Full provenance: source, evidence, confidence |
| `GET` | `/profile` | Compact profile from `core_identity` + `skills` claims |

### Write

| Method | Path | Description |
|---|---|---|
| `POST` | `/store` | Manually store a new claim |
| `PATCH` | `/claims/{claim_id}` | Update fields on existing claim |
| `POST` | `/confirm/{claim_id}` | Mark claim user-confirmed, set `status=active` |
| `POST` | `/forget` | Delete by claim_id, entity_id, or text pattern |

### Feedback

| Method | Path | Description |
|---|---|---|
| `POST` | `/feedback` | Record thumbs_up / thumbs_down / confirmed / explicit_correction |
| `POST` | `/mark-used` | Mark list of claim IDs as used in final answer |

### Graph

| Method | Path | Description |
|---|---|---|
| `POST` | `/graph/expand` | BFS subgraph expansion around an entity |
| `POST` | `/timeline` | Chronological claim timeline for entity/topic |

### Ingestion (all background)

| Method | Path | Description |
|---|---|---|
| `POST` | `/ingest/chat` | Ingest single chat turn |
| `POST` | `/ingest/document` | Upload PDF / DOCX / TXT |
| `POST` | `/ingest/gmail` | Trigger Gmail OAuth thread sync |

### Maintenance

| Method | Path | Description |
|---|---|---|
| `POST` | `/maintenance/run` | Trigger `micro_reflection|hourly|nightly|weekly` |
| `GET` | `/maintenance/history` | Recent `MaintenanceRunORM` rows (default limit 20) |

---

## 8. Service Layer (`memory/service.py`)

`MemoryService` is the single public interface wiring all subsystems together.

| Method | Subsystems touched |
|---|---|
| `search(req)` | `HybridRetriever` → `ContextAssembler` partial |
| `get_context(query, token_budget)` | `HybridRetriever` → `ContextAssembler` |
| `explain(claim_id)` | Postgres `ClaimORM` + `EvidenceORM` + `SourceORM` |
| `store_claim(req)` | Memory Gate → Postgres → Neo4j → OpenSearch |
| `update_claim(claim_id, req)` | Postgres update + OpenSearch sync |
| `confirm_claim(claim_id)` | Sets `user_confirmed=True`, `status=active` |
| `forget(req)` | Postgres delete + Neo4j delete + OpenSearch delete |
| `graph_expand(req)` | `GraphTraversal.local_expand()` |
| `get_timeline(req)` | `GraphTraversal.timeline()` |
| `get_profile_summary()` | `GraphTraversal.get_profile_summary()` |
| `ingest_chat(req)` | `ChatIngestionPipeline.process()` |
| `ingest_document(data, filename, …)` | `DocumentIngestionPipeline.process()` |
| `ingest_gmail(credentials, …)` | `GmailIngestionPipeline.process()` |
| `record_feedback(claim_id, kind, comment)` | `FeedbackEventORM` insert + confidence adjustment |
| `mark_retrieval_used(claim_ids)` | `retrieval_hit_count` increment |
| `run_maintenance(run_type)` | `ConsolidationRunner.<rhythm>()` |

---

## 9. Application Integration (`api/main.py`)

The FastAPI lifespan context manager connects all three stores on startup and tears them down on shutdown:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    neo4j = get_neo4j()
    await neo4j.connect()
    await neo4j.create_constraints()

    os_client = get_opensearch()
    os_client.connect()
    os_client.ensure_indices()

    await init_db()        # creates Postgres tables if missing

    scheduler = AsyncIOScheduler()
    scheduler.add_job(consolidation.hourly,  "interval",  hours=1)
    scheduler.add_job(consolidation.nightly, "cron",      hour=3)
    scheduler.add_job(consolidation.weekly,  "cron",      day_of_week="sun", hour=4)
    scheduler.start()

    app.include_router(memory_router, prefix="/api/memory")
    yield

    scheduler.shutdown()
    await neo4j.close()
    os_client.close()
```

---

## 10. Infrastructure

### Docker services (`docker-compose.yml`)

| Service | Image | Host port | Default creds |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | 5433 | `agentic / agentic_secret / agentic_memory` |
| `neo4j` | `neo4j:5-community` | 7474 (HTTP), 7687 (Bolt) | `neo4j / neo4j_secret` |
| `opensearch` | `opensearchproject/opensearch:2.17.0` | 9201 | no auth (dev) |
| `opensearch-dashboards` | `opensearchproject/opensearch-dashboards:2.17.0` | 5602 | — |

All services share the `agentic_net` bridge network and named volumes for persistence.

### Postgres schema (`migrations/` + `models/db/memory.py`)

Extensions: `uuid-ossp`, `pg_trgm` are installed by numbered migrations.

Tables: `sources`, `artifacts`, `entities`, `claims`, `evidence`, `claim_relations`, `retrieval_log`, `feedback_events`, `maintenance_runs`.

Trigger `touch_updated_at()` fires `BEFORE UPDATE` on `entities` and `claims` to keep `updated_at` current. It is installed by `migrations/0003_memory_postgres_indexes.py`.

---

## 11. Configuration (`core/config.py`)

`Settings(BaseSettings)` loads from `.env` (case-insensitive, ignores unknown keys). All database coordinates default to the Docker compose values.

Relevant defaults:

| Key | Default |
|---|---|
| `postgres_port` | 5433 |
| `opensearch_port` | 9201 |
| `ollama_base_url` | `http://localhost:11434` |
| `google_api_key` | `""` |

Computed fields: `postgres_dsn` (SQLAlchemy async URL), `opensearch_url`, `logging_level`.

Singleton: `get_settings()` is `@lru_cache(maxsize=1)`.

---

## 12. Key Invariants

1. **Postgres is the system of record.** OpenSearch and Neo4j are always derived from Postgres. If a secondary store write fails, it is logged but does not roll back the Postgres commit.

2. **Memory Gate runs before every write.** No claim is persisted unless it passes injection detection and threshold checks.

3. **Permanent + user-confirmed preferences are never auto-deleted.** The fast-rule in `MaintenanceAgentPipeline._fast_rules()` short-circuits to `KEEP` with confidence=1.0.

4. **Procedural memories load on every retrieval.** Preferences and corrections are always included in the context package regardless of semantic relevance.

5. **Redundancy penalty runs after scoring.** `apply_redundancy_penalty()` ensures diverse results even when multiple very similar claims score high.

6. **Trust modulates confidence, not the inverse.** Effective confidence = `claim.confidence * (0.5 + 0.5 * source_trust)`. The raw claim confidence is preserved; trust is applied at gate time only.
