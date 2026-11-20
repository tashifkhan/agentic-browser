# Memory

Long-term memory for the agent. Postgres is the record. OpenSearch holds the
vectors and BM25 index for search, and Neo4j holds the entity graph. Both are
written only after the Postgres transaction commits.

## Data model

- **Source**: where something came from (chat turn, document, email, manual).
- **Artifact**: the raw text of a source (a chat turn, a document chunk).
- **Entity**: a person, place, organisation, skill and so on. The person
  talking to the assistant is always the entity named `User`, with their real
  name as an alias.
- **Claim**: one fact, such as "User lives in New York." Each claim has a tier
  (working, short_term, long_term, permanent), a segment (core_identity,
  preferences_and_corrections, people_and_relationships and so on), a status
  (active, provisional, superseded, stale, archived, deleted), confidence,
  importance and usage counters.
- **Evidence**: links a claim to every source that stated it.
- **Claim relations**: SUPERSEDES and CONTRADICTS edges between claims.

## Writing a chat turn

`memory/ingestion/chat.py`, which runs in the background after each answer:

1. Courtesy turns ("thanks!", "ok") are skipped without an LLM call.
2. The extractor reads the **user message only**. The assistant reply is
   passed as context for resolving references, so the assistant's
   explanations and promises never become facts about the user.
3. The turn, its claims and its entities are embedded in one batched request.
4. The gate (`memory_gate.py`) rejects injection attempts and decides active
   versus provisional. A preference or identity fact the user didn't state
   directly starts as provisional.
5. Reconciliation (`reconcile.py`) compares each claim with its nearest stored
   claims:
   - **duplicate**: no new row. The stored claim gets evidence, support and a
     little confidence.
   - **update**: the new claim is inserted and the old one is superseded, with
     `valid_to` set. Examples: moving city, changing a preference.
   - **contradicts**: both rows stay, linked, with `contradiction_count`
     raised.

   Near-identical pairs are settled by similarity alone. Unclear pairs go to
   one LLM call per turn.
6. `writer.py` writes the rows, commits, then indexes in OpenSearch and Neo4j.

`write_memory` (the agent tool) and `POST /api/memory/store` use the same
reconcile step, so a fact the agent saved itself is reinforced, not
duplicated, when the turn is ingested afterwards.

## Reading

`MemoryService.get_context` builds the memory block for each agent turn:

- "About the user": active long-term identity and skills claims.
- "How the user wants you to respond": active preferences.
- "Relevant memories": a hybrid search for the user's question, with the two
  sections above excluded so nothing repeats.
- "Related memories": claims linked in the graph to entities named in the
  question.

Search (`retrieval/hybrid.py`) filters by status inside OpenSearch and scores
claims mostly on relevance (cosine similarity plus BM25; see
`retrieval/scoring.py`). Weak matches are dropped, so a question with no
stored answer returns nothing. The cosine floor and ceiling in `scoring.py`
are calibrated for `gemini-embedding-2`. Re-check them if you change the
embedding model.

The planner uses keyword rules and looks up known entity names. Set
`MEMORY_LLM_PLANNER=1` to add an LLM classification step, at the cost of one
more model call per turn.

## Usage signal

After each answer, `memory/usage.py` checks which injected memories the answer
used (word overlap, no LLM). Those get `retrieval_hit_count + 1` and a fresh
`last_accessed_at`. Retrieval on its own only raises `access_count`.
Promotion, demotion and decay all read these fields, so a memory that keeps
being fetched without being used still fades.

## Maintenance

APScheduler in `main.py` runs these jobs. You can also run one with
`POST /api/memory/maintenance/run {"run_type": ...}`.

| Job | What it does |
| --- | --- |
| micro_reflection | Activates provisional claims that a second source confirmed |
| hourly | Dedup, then promotion |
| nightly | Decay, archiving of long-stale claims, dedup, promotion, LLM review of provisional and stale claims |
| weekly | Entity resolution, per-segment summaries (each replaces the previous one), then the nightly jobs |

Each job pages through the whole store by id. Dedup merges a pair only when
the embeddings are very close and the wording mostly overlaps, so a correction
is never merged into the fact it corrects. Identity, people, preference and
skill claims are never demoted for being idle. Permanent and user-confirmed
claims never go stale.

## Embeddings

`memory/embeddings.py` builds the client on first use. It uses Google
(`gemini-embedding-2`) when `GOOGLE_API_KEY` is set, OpenAI
(`text-embedding-3-small`) when `OPENAI_API_KEY` is set, and otherwise a local
word-hashing embedder. All three return 768-dimensional vectors. Vectors from
different providers aren't comparable, so re-ingest or clear memory after
switching provider.

## Testing against the live stores

With `docker compose up` running and a model key set, ingest a few turns with
`MemoryService().ingest_chat(...)`, then call `tools.memory._recall_memory` and
`MemoryService().get_context`. `MemoryService().clear_all()` wipes all three
stores.
