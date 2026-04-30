"""
TalentCortex — matcher.py
Ranks candidates against a job description using cosine similarity in ChromaDB.

The key improvement over the old vectors.json approach:
  - candidate_ids filter → only rank actual applicants for this job (not everyone)
  - ChromaDB handles vector math natively (no numpy needed)
  - Results come pre-sorted by similarity descending
"""

import os
import json
import google.generativeai as genai
import chromadb

# ─────────────────────────────────────────────
# CHROMADB CLIENT
# Shared with resume_parser — opens the same persistent directory.
# ─────────────────────────────────────────────
CHROMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chroma_db")

_chroma_client    = chromadb.PersistentClient(path=CHROMA_PATH)
resume_collection = _chroma_client.get_or_create_collection(
    name="resumes",
    metadata={"hnsw:space": "cosine"}
)


def _vectorize_text(text: str):
    """Embed any text string using Gemini embedding model."""
    try:
        genai.configure(api_key=os.environ["GOOGLE_API_KEY"])
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=text
        )
        return result["embedding"]
    except Exception as e:
        print(f"Embedding error: {e}")
        import traceback; traceback.print_exc()
        return None


def match_job(jd_text: str, candidate_ids: list = None) -> dict:
    """
    Compute cosine similarity between a job description and candidate resume vectors.

    Args:
        jd_text:       Raw job description text to vectorize.
        candidate_ids: Optional list of user_id strings (from SQL applications table).
                       When provided, only those candidates are ranked — not the whole DB.

    Returns:
        {"status": "success", "matches": [...sorted by score desc...]}
        or {"error": "..."}
    """
    total = resume_collection.count()
    if total == 0:
        return {"error": "No candidates in the vector database. Upload resumes first."}

    # ── Vectorize the JD ─────────────────────────────────────────────────
    jd_vector = _vectorize_text(jd_text)
    if not jd_vector:
        return {"error": "Failed to vectorize the job description."}

    # ── Build ChromaDB where-filter if candidate_ids supplied ─────────────
    # This ensures HR only sees applicants for *this* job, not everyone in the DB.
    where_filter = None
    if candidate_ids:
        chroma_ids = [f"candidate_{cid}" for cid in candidate_ids]
        # ChromaDB "get" by IDs first to confirm they exist, then query
        try:
            existing = resume_collection.get(ids=chroma_ids, include=[])
            found_ids = existing.get("ids", [])
        except Exception:
            found_ids = chroma_ids   # fall back to querying all provided IDs

        if not found_ids:
            # No applicants have uploaded resumes yet
            return {"status": "success", "matches": []}

        n_results = len(found_ids)
    else:
        n_results = min(total, 50)

    # ── Query ChromaDB ────────────────────────────────────────────────────
    try:
        query_kwargs = dict(
            query_embeddings=[jd_vector],
            n_results=n_results,
            include=["metadatas", "distances"]
        )
        if candidate_ids and found_ids:
            # Filter to only these document IDs
            query_kwargs["ids"] = found_ids   # ChromaDB supports id pre-filter

        results = resume_collection.query(**query_kwargs)

    except TypeError:
        # Older ChromaDB versions don't accept 'ids' in query — fall back
        results = resume_collection.query(
            query_embeddings=[jd_vector],
            n_results=min(total, 50),
            include=["metadatas", "distances"]
        )

    # ── Build ranked list ─────────────────────────────────────────────────
    matches = []
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances",  [[]])[0]

    for meta, dist in zip(metadatas, distances):
        cid = meta.get("user_id", "")

        # If filtering by candidate_ids, skip anyone not in the list
        if candidate_ids and cid not in candidate_ids:
            continue

        # ChromaDB cosine distance ∈ [0, 2].  Similarity = 1 - distance.
        # We multiply by 100 and round for a clean percentage.
        score = round((1 - dist) * 100, 2)

        matches.append({
            "candidate_id": cid,
            "email":        meta.get("email",  "N/A"),
            "name":         meta.get("name",   "Unknown"),
            "score":        score,
            "skills":       json.loads(meta.get("skills",     "[]")),
            "experience":   json.loads(meta.get("experience", "[]")),
        })

    # Sort best match first
    matches.sort(key=lambda x: x["score"], reverse=True)

    print(f"Matching complete - {len(matches)} candidates ranked")
    return {"status": "success", "matches": matches}
