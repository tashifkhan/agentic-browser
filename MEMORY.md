# Agentic Memory System

A production-grade, event-sourced, claim-centric personal knowledge system built on three stores: **PostgreSQL** (system of record), **Neo4j** (knowledge graph), and **OpenSearch** (vector + BM25 retrieval).

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Architecture Overview](#2-architecture-overview)
3. [Data Model](#3-data-model)
4. [Memory Classification](#4-memory-classification)
5. [Ingestion Pipelines](#5-ingestion-pipelines)
6. [Memory Gate](#6-memory-gate)
7. [Knowledge Graph](#7-knowledge-graph)
8. [Retrieval Pipeline](#8-retrieval-pipeline)
9. [Scoring Formula](#9-scoring-formula)
10. [Context Assembly](#10-context-assembly)
11. [Maintenance Loops](#11-maintenance-loops)
12. [Curator / Skeptic / Judge Agents](#12-curator--skeptic--judge-agents)
13. [Decay and Promotion](#13-decay-and-promotion)
14. [Entity Resolution](#14-entity-resolution)
15. [Self-Evolution via Feedback](#15-self-evolution-via-feedback)
16. [Deletion and Forget Semantics](#16-deletion-and-forget-semantics)
17. [API Reference](#17-api-reference)
18. [Storage Architecture](#18-storage-architecture)
19. [Configuration](#19-configuration)

---

## 1. Design Philosophy

The system stores **claims**, not chunks.

A **claim** is a structured belief: `"User prefers Python for scripting tasks"`. It has:
- A subject entity and predicate
- A confidence score, trust score, importance weight
- A source with provenance (which document, email, or chat turn produced it)
- A lifecycle (active → stale → archived or superseded)
- A decay rate that depends on its segment and tier

This is fundamentally different from embedding a wall of text and hoping similarity search finds the right sentence. Claims can be contradicted, versioned, confirmed, and reasoned over. Chunks cannot.

**Five non-negotiable properties:**

| Property | What it means |
|---|---|
| Provenance | Every claim knows exactly where it came from |
| Auditability | You can ask "why do you believe X?" and get a traceable answer |
| Deletability | Forgetting is complete — all stores, all indices |
| Contradiction-awareness | Two conflicting beliefs are tracked, not blindly overwritten |
| Decay | Old, unaccessed memories lose weight — they don't disappear, they fade |

---

## 2. Architecture Overview

```
User / Chat / Gmail / Document Upload
              │
              ▼
        FastAPI Gateway  (/api/memory/*)
              │
              ▼
       MemoryService  (memory/service.py)
              │
    ┌─────────┴──────────┐
    │                    │
    ▼                    ▼
Write Pipeline      Retrieval Pipeline
    │                    │
    ▼                    ▼
Extractor           QueryPlanner
MemoryGate          HybridRetriever
    │                    │
    ▼              ┌─────┴──────┐
Dual-write         │            │
    │           OpenSearch   Neo4j
    ├─► PostgreSQL  (vector+BM25) (graph)
    ├─► Neo4j              │
    └─► OpenSearch         ▼
                    ContextAssembler
                          │
                          ▼
                    LLM Response

              ▼ (background)
       ConsolidationRunner
   micro / hourly / nightly / weekly
       Decay · Dedup · Promotion
       Curator · Skeptic · Judge
```

---

## 3. Data Model

### Sources

Everything starts with a **source** — the raw origin of information.

| Field | Description |
|---|---|
| `source_type` | `chat`, `email`, `resume_pdf`, `document`, `manual`, `system` |
| `trust_level` | 1–10. Chat=9, outgoing email=9, incoming email=4, doc=7 |
| `external_id` | Gmail thread ID, file hash, session ID |
| `raw_uri` | Path to original payload in object store |

### Artifacts

Parsed/chunked text derived from sources. Each chunk gets embedded and indexed in OpenSearch.

| Field | Description |
|---|---|
| `artifact_type` | `chunk`, `chat_turn`, `thread_summary`, `document_summary`, `community_summary` |
| `opensearch_id` | ID of the vector document in OpenSearch |
| `char_start/end` | Span within the original source text |

### Entities

Canonical objects that appear in the knowledge graph. Mirrored in both Postgres and Neo4j.

Examples: `Tashif` (person), `Python` (skill), `GSoC Project` (project), `Google` (organization)

| Field | Description |
|---|---|
| `entity_type` | `person`, `organization`, `project`, `skill`, `preference`, `task`, `location`, ... |
| `canonical_name` | Normalized primary name |
| `aliases` | All known alternate names |
| `neo4j_node_id` | ID in Neo4j graph |
| `opensearch_id` | ID of entity embedding in OpenSearch |

### Claims ← core object

The atomic unit of memory. Every fact the system holds is a claim.

```
"User prefers Python for scripting."
subject: User  predicate: PREFERS  object: Python
segment: preferences_and_corrections
tier: permanent  confidence: 0.91  trust: 1.0
```

| Field | Description |
|---|---|
| `claim_text` | Full natural-language statement |
| `predicate` | `PREFERS`, `STUDIES`, `WORKS_ON`, `KNOWS`, `IS`, `HAS`, etc. |
| `subject_entity_id` | FK to entities table |
| `object_entity_id` | FK to entities table (or `object_literal` for scalar values) |
| `memory_class` | working / episodic / semantic / procedural / social / reflective |
| `tier` | working / short_term / long_term / permanent |
| `segment` | One of 8 memory segments (see §4) |
| `status` | active / provisional / superseded / stale / archived / deleted |
| `base_importance` | 0–1, set at ingestion |
| `confidence` | 0–1, updated by feedback and usage |
| `trust_score` | 0–1, derived from source trust |
| `decay_rate` | λ in the decay formula |
| `access_count` | Total times retrieved |
| `retrieval_hit_count` | Times actually used in a final answer |
| `contradiction_count` | How many contradicting claims exist |
| `user_confirmed` | Explicitly approved by user |
| `valid_from / valid_to` | Temporal validity window |

### Evidence

Links each claim back to the source artifact that produced it, with span offsets and extraction confidence.

### Claim Relations

Tracks how claims relate to each other:

| Relation | Meaning |
|---|---|
| `SUPERSEDES` | New claim replaces the old one |
| `CONTRADICTS` | Two claims conflict — both kept, contradiction_count bumped |
| `SUPPORTS` | Additional evidence strengthens an existing claim |

---

## 4. Memory Classification

### Memory Classes

| Class | What it stores | Examples |
|---|---|---|
| `working` | Current session scratchpad | Active task state |
| `episodic` | What happened | "Met recruiter on March 3" |
| `semantic` | Stable facts | "User studied ECS at JIIT" |
| `procedural` | How the assistant should behave | "Never use emojis", "Always respond in Python" |
| `social` | People and relationships | "Alice is a recruiter at Google" |
| `reflective` | Summaries and patterns | "User tends to work on backend projects" |

### Memory Tiers (lifecycle)

```
working ──► short_term ──► long_term ──► permanent
  │              │              │              │
minutes        days           weeks      forever (unless deleted)
  │              │              │
  └─ expire  └─ decay      └─ decay slowly
```

- **working**: Ephemeral, not persisted beyond current session state
- **short_term**: Default for new claims. Decays at λ≈0.03/day
- **long_term**: Promoted after repeated successful retrievals. λ≈0.005/day
- **permanent**: User-confirmed or high-utility procedural/preference facts. λ=0

### Memory Segments

Segments act as top-level categories. The segment determines default decay rate and gate behavior.

| Segment | Decay Rate | Auto-store? |
|---|---|---|
| `preferences_and_corrections` | 0 (never) | Yes — always |
| `core_identity` | 0.001 | Yes |
| `skills_and_background` | 0.002 | Yes |
| `people_and_relationships` | 0.003 | Yes |
| `projects_and_goals` | 0.01 | Context-dependent |
| `reflections_and_summaries` | 0.002 | System-generated |
| `communications_and_commitments` | 0.05 | Provisional by default |
| `contextual_incidents` | 0.1 | Provisional by default |

---

## 5. Ingestion Pipelines

### Chat Ingestion (`/api/memory/ingest/chat`)

Processes a single user/assistant turn.

```
user_message + assistant_message
        │
        ▼
   Persist source (trust=9)
        │
        ▼
   Embed combined text ──► OpenSearch artifact
        │
        ▼
   LLM Extraction (Extractor)
   ├── entities: canonical_name, entity_type, aliases
   └── claims: text, predicate, subject, object, segment, confidence
        │
        ▼
   Entity upsert (Postgres + Neo4j + OpenSearch)
        │
        ▼
   MemoryGate evaluation (per claim)
   ├── STORE_AUTO ──► status=active
   ├── STORE_PROVISIONAL ──► status=provisional
   └── REJECT ──► discarded
        │
        ▼
   Write claims (Postgres + Neo4j + OpenSearch)
        │
        ▼
   Link evidence (claim ←→ artifact ←→ source)
```

All heavy work (extraction, embedding, graph writes) runs **synchronously** in the background task so the HTTP response returns immediately.

### Document Ingestion (`/api/memory/ingest/document`)

Handles PDF, DOCX, and plain text.

1. Extract raw text via `pdfminer` (PDF) or `python-docx` (DOCX)
2. Detect if document is a **resume** (filename heuristic + section header count)
3. If resume: split by section (`education`, `experience`, `skills`, `projects`, ...)
4. If regular doc: split into 1200-char overlapping chunks
5. Each chunk → embed → index as artifact
6. Extract entities and claims per chunk, with section context hint
7. Resume claims start as `long_term` (not permanent) — they may become stale

### Gmail Ingestion (`/api/memory/ingest/gmail`)

Trust-aware email processing.

```
Thread metadata
    │
    ▼
Fetch full thread (Gmail API)
    │
    ▼
Per message:
  ├── Strip quoted replies + signatures
  ├── Determine direction: outgoing (trust=9) vs incoming (trust=4)
  └── Embed message ──► artifact
    │
    ▼
Thread summary (LLM) ──► artifact
    │
    ▼
Per-message extraction:
  - Context includes: direction, subject, participants
  - Procedural claims from incoming email → REJECTED by gate
  - Commitments and facts → provisional by default
```

**Key safety rule:** Email content is treated as **data**, never as **instructions**. The memory gate rejects any procedural claim extracted from an untrusted email source.

---

## 6. Memory Gate

The gate runs before any claim is written to storage. It's **rules-first** — no LLM required for most decisions.

### Decision tree

```
Claim candidate
      │
      ├─► Injection pattern detected? ──► REJECT
      │     (ignore previous, act as, jailbreak, ...)
      │
      ├─► Procedural claim from external source? ──► REJECT
      │
      ├─► Effective confidence < 0.2 from low-trust source? ──► REJECT
      │
      ├─► High-priority segment (preferences, identity, skills)? ──► STORE_AUTO
      │
      ├─► User-stated or confirmed evidence? ──► STORE_AUTO
      │
      ├─► needs_confirmation=true or provisional segment? ──► STORE_PROVISIONAL
      │
      ├─► Low confidence or inferred? ──► STORE_PROVISIONAL
      │
      └─► Default: passes all rules ──► STORE_AUTO
```

**Effective confidence** = `claim.confidence × (0.5 + 0.5 × source_trust)`

This means a claim with 0.8 confidence from a low-trust source (trust=0.3) gets effective confidence of `0.8 × 0.65 = 0.52` — still storeable, but as provisional.

---

## 7. Knowledge Graph

Neo4j stores a **hybrid graph** of entity nodes and claim nodes.

### Node types

- `Entity` — canonical objects (person, skill, project, ...)
- `Claim` — belief nodes linked to evidence
- `Source` — source nodes for provenance edges

### Key relationships

| Edge | Meaning |
|---|---|
| `(Claim)-[:SUBJECT]->(Entity)` | Claim is about this entity |
| `(Claim)-[:OBJECT]->(Entity)` | Claim refers to this entity as object |
| `(Claim)-[:SUPPORTED_BY]->(Source)` | Provenance link |
| `(Entity)-[:PREFERS]->(Entity)` | Direct entity relation |
| `(Entity)-[:WORKS_ON]->(Entity)` | Project affiliation |
| `(Entity)-[:KNOWS]->(Entity)` | Social relation |
| `(Claim)-[:SUPERSEDES]->(Claim)` | Version history |
| `(Claim)-[:CONTRADICTS]->(Claim)` | Conflict tracking |

### Why hybrid (entity + claim nodes)?

Pure entity graphs lose claim-level metadata (confidence, source, validity). Pure claim graphs lose entity-level reasoning. The hybrid lets you:
- Ask "what do we know about Python?" via entity traversal
- Ask "is this belief still valid?" via claim node attributes
- Ask "where did this belief come from?" via claim → source edges

### Graph RAG modes

**Local Graph RAG** (precise queries):
```
seed entities → 1–2 hop BFS expansion → collect attached claims → answer
```
Used for: "What did that recruiter say about the project?"

**Global Graph RAG** (broad synthesis):
```
community summary nodes → vector search → drill into evidence
```
Used for: "What themes keep appearing across my emails and projects?"

---

## 8. Retrieval Pipeline

Every query goes through a structured pipeline:

### Step 1: Query planning

`QueryPlanner` classifies the query and extracts retrieval signals:

| Query type | Strategy |
|---|---|
| `factual_recall` | Vector + BM25, no graph needed |
| `relational` | Graph traversal from seed entities |
| `temporal` | Claim timeline sorted by `valid_from` |
| `preference_sensitive` | Load preferences segment first |
| `email_specific` | Prioritize `communications_and_commitments` + email artifacts |
| `profile` | Load `core_identity` + `skills_and_background` |

The planner uses the LLM for a cheap structured-output call, with a regex/keyword heuristic fallback.

### Step 2: Procedural memory load

Preferences and behavioral constraints are **always loaded first**, regardless of query type. They cap at 15% of the context token budget.

### Step 3: Hybrid vector + BM25 search (OpenSearch)

Two parallel searches are run and merged with **Reciprocal Rank Fusion (RRF)**:

```
RRF score = Σ 1 / (k + rank_i)    where k=60
```

- **KNN search**: cosine similarity on 768-dim Google `text-embedding-004` vectors
- **BM25**: full-text match on `claim_text` with English analyzer

RRF avoids score normalization issues between the two retrieval systems.

### Step 4: Graph traversal (conditional)

If the query plan flags `needs_graph_traversal=true` and entity mentions are found:
- Find seed entities in Neo4j
- Run 1–2 hop BFS
- Collect attached claim IDs
- These claims get a `graph_relevance` bonus in scoring

### Step 5: Composite scoring

See §9.

### Step 6: Redundancy penalty

After scoring, near-duplicate claims (cosine similarity ≥ 0.92) are penalised by 30% to enforce answer diversity.

### Step 7: Access bump

Retrieved claims get `access_count += 1` and `last_accessed_at = now`. This feeds the decay and promotion calculations.

---

## 9. Scoring Formula

Each retrieved claim receives a composite score:

```
S = α·s_semantic + β·s_graph + γ·s_time + δ·s_importance + ε·s_trust + ζ·s_usage − η·s_conflict
```

| Component | Weight | Source |
|---|---|---|
| `s_semantic` | 0.30 | RRF score from OpenSearch hybrid search |
| `s_graph` | 0.15 | 0.4 if claim appeared in graph expansion, else 0 |
| `s_time` | 0.15 | Decay weight W(t) |
| `s_importance` | 0.15 | `base_importance` field |
| `s_trust` | 0.10 | `trust_score` field |
| `s_usage` | 0.10 | `retrieval_hit_count / access_count` |
| `s_conflict` | −0.05 | `contradiction_count × 0.15`, capped at 0.5 |

### Decay weight

```
W(t) = I · e^(−λ·Δt) · U · C

where:
  I = base_importance
  λ = max(tier_default_rate, claim.decay_rate)
  Δt = days since last_accessed_at
  U = min(1 + 0.05 × access_count, 2.0)  ← usage multiplier
  C = confidence
```

Preferences have λ=0, so they never decay. Contextual incidents decay at λ=0.1/day — a week-old context item has weight `e^(−0.7) ≈ 0.50` of its original.

---

## 10. Context Assembly

The `ContextAssembler` packs retrieval results into a token-budgeted block for the LLM.

### Token budget allocation (default 3000 tokens)

| Slot | Fraction | Content |
|---|---|---|
| Procedural | 15% | Preferences + behavioral constraints |
| Profile | 15% | Core identity + skills summary |
| Semantic facts | 25% | Top ranked claims from hybrid search |
| Graph context | 25% | Claims from graph traversal |
| Source evidence | 20% | Supporting artifact snippets |

The assembler uses tiktoken (`cl100k_base`) to count tokens precisely and truncates each slot independently.

### Output format

```markdown
## User Profile
- User studies Electronics and Computer Science at JIIT
- User is based in Delhi, India

## Preferences & Instructions
- User prefers Python for all scripting tasks
- User does not want code commented unless explicitly asked

## Relevant Facts
- User is currently working on a web scraping project (confidence=0.82)
- User knows JavaScript but prefers not to use it (confidence=0.74)

## Graph Context
- Recruiter Alice mentioned the GSoC project in March 2026
```

---

## 11. Maintenance Loops

Four scheduled rhythms run automatically via APScheduler:

### Micro-reflection (real-time, after each chat turn)
- Access stats bumped
- Retrieval logged
- No heavy processing

### Hourly
- Deduplication scan (100 claims)
- Promotion pass (100 claims)

### Nightly (3 AM)
- Full decay pass (500 claims)
- Archive long-stale claims (older than 14 days of stale status)
- Full deduplication (300 claims)
- Full promotion pass (300 claims)
- Agent review of provisional + stale claims (50 claims via Curator/Skeptic/Judge)

### Weekly (Sunday 4 AM)
- Entity resolution: auto-merge high-similarity duplicates (cosine ≥ 0.94)
- Community summary generation (per segment)
- Full nightly pass

---

## 12. Curator / Skeptic / Judge Agents

The multi-agent maintenance pipeline uses a **decision ladder** to avoid expensive LLM calls for routine decisions.

```
Claim batch
    │
    ▼
[1] Deterministic fast rules (free)
    ├── User-confirmed permanent preference → KEEP (always)
    ├── Stale + zero accesses → ARCHIVE (always)
    └── High access + high confidence + no contradictions → PROMOTE (always)
    │
    ▼ (if no fast rule applies)
[2] Curator (cheap LLM)
    → proposes: keep / archive / delete / promote / demote / flag_review
    │
    ├── Non-destructive decision? ──► APPLY DIRECTLY
    │
    └── Destructive or high-stakes?
           │
           ▼
    [3] Skeptic (cheap LLM)
        → challenges the Curator's proposal
        │
        ├── Agrees → APPLY Curator's decision
        │
        └── Disagrees with high confidence on both sides?
               │
               ▼
        [4] Judge (expensive LLM)
            → final binding decision
```

Only the top ~5% of ambiguous cases reach the Judge. This keeps maintenance cost proportional to genuine uncertainty.

### When Skeptic activates

- Curator proposes `archive` or `delete`
- Curator proposes promoting a `preferences_and_corrections` claim to permanent

### Judge arbitration criteria

- Both Curator confidence ≥ 0.6 AND Skeptic confidence ≥ 0.6
- They disagree
- → Judge decides; result is final

If Skeptic disagrees but confidence is low, the claim is `flag_review` — surfaced to the user for confirmation.

---

## 13. Decay and Promotion

### Promotion path

```
provisional ──► active (agent review or user confirm)

active, short_term ──► long_term
  when: access_count ≥ 3 AND retrieval_hits ≥ 2 AND confidence ≥ 0.55

active, long_term ──► permanent
  when: access_count ≥ 8 AND retrieval_hits ≥ 5 AND confidence ≥ 0.75
        AND contradiction_count == 0
```

### Demotion path

```
long_term ──► short_term
  when: idle for 30+ days AND hit_rate < 10%
```

Permanent memories **never auto-demote**. They can only be demoted by the user explicitly (or via `forget`).

---

## 14. Entity Resolution

Duplicate entities arise naturally — "ECS" and "Electronics and Computer Science" should be the same node.

### Matching signals

1. Exact string match → immediate auto-merge
2. Alias intersection → high-confidence merge
3. Email address match → auto-merge
4. **Embedding cosine similarity ≥ 0.94** → auto-merge
5. **Cosine similarity 0.85–0.94** → flagged for human review

### Merge procedure

When entity B is merged into entity A:
1. All `subject_entity_id` and `object_entity_id` FKs pointing to B → repointed to A
2. B's `canonical_name` added to A's `aliases`
3. Neo4j: APOC `mergeNodes` transfers all edges to A, deletes B
4. OpenSearch: B's entity doc deleted
5. B's status set to `"deleted"` in Postgres

---

## 15. Self-Evolution via Feedback

The system improves retrieval quality over time by tracking what actually helped.

### Feedback signals

| Signal | Effect |
|---|---|
| `thumbs_up` / `confirmed` | `retrieval_hit_count += 1`, `confidence × 1.05` |
| `explicit_correction` | `trust_score × 0.7`, `confidence × 0.6` |
| `thumbs_down` / `ignored` | Logged; used in nightly promotion scoring |
| `mark-used` call | `retrieval_hit_count += 1` for all claims that made the final answer |

### How retrieval improves

- Claims with higher `retrieval_hit_count` get a stronger `s_usage` score component
- High-hit claims are promoted faster (tier ladder)
- Low-hit claims decay faster and eventually reach the stale threshold
- Correction signals reduce trust score, which directly reduces composite score

---

## 16. Deletion and Forget Semantics

When you call `POST /api/memory/forget`, deletion is **complete across all stores**.

```
ForgetRequest
  ├── claim_ids: explicit UUIDs
  ├── entity_ids: explicit UUIDs
  └── pattern: fuzzy match on claim_text

For each matched claim:
  ├── Postgres: status = "deleted"
  ├── OpenSearch: document deleted (not just marked)
  └── Neo4j: claim node detached and deleted

For each matched entity:
  ├── Postgres: status = "deleted"
  ├── OpenSearch: entity embedding deleted
  └── Neo4j: entity node detached and deleted (all edges removed)
```

Evidence and retrieval logs are **not deleted** — they form an audit trail. If you need full GDPR-style erasure, a separate hard-delete pipeline can cascade-delete evidence rows.

---

## 17. API Reference

All endpoints under `/api/memory/`.

### Search & Retrieval

| Method | Path | Description |
|---|---|---|
| `POST` | `/search` | Hybrid search with tier/segment/class filters |
| `POST` | `/context` | Assemble token-budgeted context for a query |
| `GET` | `/explain/{claim_id}` | Full provenance for a claim |
| `GET` | `/profile` | Compact user profile summary |

### Write

| Method | Path | Description |
|---|---|---|
| `POST` | `/store` | Manually write a claim |
| `PATCH` | `/claims/{claim_id}` | Update fields on an existing claim |
| `POST` | `/confirm/{claim_id}` | Mark claim user-confirmed, activate if provisional |
| `POST` | `/forget` | Delete by ID or text pattern |

### Feedback

| Method | Path | Description |
|---|---|---|
| `POST` | `/feedback` | Record thumbs_up/down/confirmed/correction |
| `POST` | `/mark-used` | Mark claim IDs as used in final answer |

### Graph

| Method | Path | Description |
|---|---|---|
| `POST` | `/graph/expand` | Expand local subgraph around an entity |
| `POST` | `/timeline` | Chronological claim timeline for entity/topic |

### Ingestion

| Method | Path | Description |
|---|---|---|
| `POST` | `/ingest/chat` | Ingest a user/assistant chat turn |
| `POST` | `/ingest/document` | Upload PDF/DOCX/TXT for ingestion |
| `POST` | `/ingest/gmail` | Trigger Gmail OAuth sync |

### Maintenance

| Method | Path | Description |
|---|---|---|
| `POST` | `/maintenance/run` | Trigger `micro_reflection / hourly / nightly / weekly` |
| `GET` | `/maintenance/history` | Recent maintenance run log |

---

## 18. Storage Architecture

| Store | Role | Port |
|---|---|---|
| **PostgreSQL 16** | System of record for all metadata, claims, provenance, audit | 5433 |
| **Neo4j 5** | Knowledge graph — entity relations, claim links, graph traversal | 7474 (HTTP) / 7687 (Bolt) |
| **OpenSearch 2.17** | Vector KNN + BM25 full-text for hybrid retrieval | 9201 |
| **OpenSearch Dashboards** | UI for inspecting indices | 5602 |

### OpenSearch indices

| Index | Embedding dim | Primary use |
|---|---|---|
| `memory_claims` | 768 | Claim retrieval (KNN + BM25) |
| `memory_artifacts` | 768 | Chunk retrieval + community summaries |
| `memory_entities` | 768 | Entity similarity for resolution |

### Embeddings

All vectors use Google **`text-embedding-004`** (768 dimensions). The model is called via `langchain_google_genai.GoogleGenerativeAIEmbeddings`.

### Dual-write pattern

Every write goes to all three stores atomically within a single async session:
1. PostgreSQL → source of truth, FK integrity
2. OpenSearch → vector index (sync, returns immediately)
3. Neo4j → graph node + edges (async, via bolt driver)

If Neo4j or OpenSearch write fails, the Postgres record is still committed. The maintenance pipeline can detect and re-sync orphaned records.

---

## 19. Configuration

Configuration uses **Pydantic Settings** (`core/config.py`) with `.env` file support.

```python
from core.config import get_settings
s = get_settings()   # cached, singleton
```

### Key settings

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_HOST` | `localhost` | Postgres host |
| `POSTGRES_PORT` | `5433` | Postgres port (remapped to avoid conflict) |
| `POSTGRES_DB` | `agentic_memory` | Database name |
| `POSTGRES_USER` | `agentic` | Database user |
| `POSTGRES_PASSWORD` | `agentic_secret` | Database password |
| `NEO4J_URI` | `bolt://localhost:7687` | Neo4j bolt URI |
| `NEO4J_USER` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | `neo4j_secret` | Neo4j password |
| `OPENSEARCH_HOST` | `localhost` | OpenSearch host |
| `OPENSEARCH_PORT` | `9201` | OpenSearch port (remapped) |
| `GOOGLE_API_KEY` | — | Required for embeddings + LLM extraction |

All infrastructure is defined in `docker-compose.yml`. Run `docker compose up -d` from the project root to start all stores.

---

## Quick Start

```bash
# 1. Start all stores
docker compose up -d

# 2. Install dependencies
uv sync

# 3. Start the API
uv run python main.py --api

# 4. Ingest a chat turn
curl -X POST http://localhost:5454/api/memory/ingest/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_message": "I prefer Python and never want emojis in responses.",
    "assistant_message": "Got it, Python only and no emojis.",
    "session_id": "session-001"
  }'

# 5. Search memory
curl -X POST http://localhost:5454/api/memory/search \
  -H "Content-Type: application/json" \
  -d '{"query": "what language does the user prefer?", "top_k": 5}'

# 6. Get context for a query
curl -X POST http://localhost:5454/api/memory/context \
  -H "Content-Type: application/json" \
  -d '{"query": "help me write a script", "token_budget": 2000}'
```
