"""
TalentCortex — resume_parser.py
Pipeline: LlamaParse → Gemini extraction → ChromaDB vector storage.
ChromaDB collection is auto-created on first run.
"""

import os
import re
import json
import asyncio
import platform
from typing import List

from llama_parse import LlamaParse
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field
import google.generativeai as genai
import chromadb
from dotenv import load_dotenv

# ─────────────────────────────────────────────
# 1. API KEYS
# ─────────────────────────────────────────────

load_dotenv()

# Normalise key names — support both GEMINI_API_KEY and GOOGLE_API_KEY.
# LangChain reads GOOGLE_API_KEY; google-generativeai reads GOOGLE_API_KEY too.
# We set both so nothing falls back to OAuth2.
gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
llama_key  = os.getenv("LLAMA_CLOUD_API_KEY", "")

if gemini_key:
    os.environ["GEMINI_API_KEY"] = gemini_key
    os.environ["GOOGLE_API_KEY"] = gemini_key
if llama_key:
    os.environ["LLAMA_CLOUD_API_KEY"] = llama_key
# Windows asyncio fix
if platform.system() == "Windows":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# ─────────────────────────────────────────────
# 2. CHROMADB — auto-created on first run
# ─────────────────────────────────────────────
CHROMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chroma_db")

_chroma_client     = chromadb.PersistentClient(path=CHROMA_PATH)
resume_collection  = _chroma_client.get_or_create_collection(
    name="resumes",
    metadata={"hnsw:space": "cosine"}   # cosine distance for semantic matching
)

print(f"✅ ChromaDB ready → {CHROMA_PATH}  (candidates stored: {resume_collection.count()})")

# ─────────────────────────────────────────────
# 3. SCHEMA
# ─────────────────────────────────────────────
class ResumeStructure(BaseModel):
    name:       str        = Field(default="Unknown", description="Full name")
    summary:    str        = Field(default="",        description="2-3 sentence summary")
    skills:     List[str]  = Field(default=[],        description="Flat list of skill strings")
    experience: List[str]  = Field(default=[],        description="Flat list of experience strings")

# ─────────────────────────────────────────────
# 4. HELPERS
# ─────────────────────────────────────────────
def extract_metadata_regex(text: str) -> dict:
    """Pull contact info using regex — fast, no API call needed."""
    email    = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
    phone    = re.search(r'(\+\d{1,3}[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}', text)
    linkedin = re.search(r'(https?://)?(www\.)?linkedin\.com/in/[\w-]+', text)
    github   = re.search(r'(https?://)?(www\.)?github\.com/[\w-]+', text)

    return {
        "email":    email.group(0)    if email    else "N/A",
        "phone":    phone.group(0)    if phone    else "N/A",
        "linkedin": linkedin.group(0) if linkedin else "N/A",
        "github":   github.group(0)   if github   else "N/A",
    }


def extract_content_with_gemini(raw_text: str) -> dict:
    """Use Gemini to parse structured resume data from raw text."""
    print(" Calling Gemini for structured extraction...")
    try:
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY", "")
        model  = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            temperature=0,
            google_api_key=api_key,     # ← explicit, no OAuth2 fallback
        )
        parser = JsonOutputParser(pydantic_object=ResumeStructure)

        prompt = PromptTemplate(
            template=(
                "You are a strict resume parser. Extract data into JSON.\n\n"
                "RULES:\n"
                "- 'skills' must be a FLAT array of plain strings. e.g. [\"Python\", \"Docker\", \"SQL\"]\n"
                "- 'experience' must be a FLAT array of plain strings. "
                "e.g. [\"Software Engineer at Google (2021-2023)\"]\n"
                "- Do NOT return nested objects or sub-arrays.\n"
                "- Return [] for any field missing from the resume.\n\n"
                "{format_instructions}\n\nRESUME:\n{text}"
            ),
            input_variables=["text"],
            partial_variables={"format_instructions": parser.get_format_instructions()},
        )

        chain  = prompt | model | parser
        result = chain.invoke({"text": raw_text[:8000]})

        print(f"✅ Gemini done → name='{result.get('name')}', "
              f"{len(result.get('skills', []))} skills, "
              f"{len(result.get('experience', []))} experience entries")
        return result

    except Exception as e:
        print(f"❌ Gemini error: {e}")
        import traceback; traceback.print_exc()
        return {"name": "Unknown", "summary": "", "skills": [], "experience": []}


def save_to_chromadb(content_data: dict, meta_data: dict, user_id: str,
                     preferences: dict = None):
    print("🔢 Generating embedding vector...")
    try:
        genai.configure(api_key=os.environ["GOOGLE_API_KEY"])

        # Build preference summary string
        pref_text = ""
        if preferences:
            pref_parts = []
            if preferences.get("work_mode"):
                pref_parts.append(f"prefers {preferences['work_mode']} work")
            if preferences.get("night_shift") == "yes":
                pref_parts.append("open to night shift")
            if preferences.get("relocate") == "yes":
                pref_parts.append("willing to relocate")
            if preferences.get("working_hours"):
                pref_parts.append(f"{preferences['working_hours']} working hours")
            if preferences.get("work_life_bal"):
                pref_parts.append(f"{preferences['work_life_bal']} work-life balance priority")
            pref_text = " | Preferences: " + ", ".join(pref_parts) if pref_parts else ""

        # Preferences are baked in so cosine similarity rewards
        # candidates whose preferences align with the JD
        text_to_embed = (
            f"Name: {content_data.get('name', '')} | "
            f"Skills: {', '.join(content_data.get('skills', []))} | "
            f"Experience: {' | '.join(content_data.get('experience', []))}"
            f"{pref_text}"
        )

        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=text_to_embed
        )
        vector = result["embedding"]

        resume_collection.upsert(
            ids=[f"candidate_{user_id}"],
            embeddings=[vector],
            documents=[text_to_embed],
            metadatas=[{
                "user_id":       str(user_id),
                "email":         meta_data.get("email",    "N/A"),
                "phone":         meta_data.get("phone",    "N/A"),
                "linkedin":      meta_data.get("linkedin", "N/A"),
                "github":        meta_data.get("github",   "N/A"),
                "name":          content_data.get("name",  "Unknown"),
                "skills":        json.dumps(content_data.get("skills",     [])),
                "experience":    json.dumps(content_data.get("experience", [])),
                "work_mode":     (preferences or {}).get("work_mode",     ""),
                "night_shift":   (preferences or {}).get("night_shift",   ""),
                "relocate":      (preferences or {}).get("relocate",      ""),
                "working_hours": (preferences or {}).get("working_hours", ""),
                "work_life_bal": (preferences or {}).get("work_life_bal", ""),
            }]
        )
        print(f"✅ ChromaDB upsert done for user_id={user_id}")

    except Exception as e:
        print(f"❌ ChromaDB save error: {e}")
        import traceback; traceback.print_exc()
        raise
# ─────────────────────────────────────────────
# 5. MAIN ENTRY POINT
# ─────────────────────────────────────────────
def process_resume(file_path: str, user_id: str = "unknown") -> dict:
    """
    Called by Flask's /api/upload_resume.
    Returns {"status": "success", "contact_info": {...}, "parsed_content": {...}}
    or {"error": "..."} on failure.
    """
    if not os.path.exists(file_path):
        return {"error": "File not found on server."}

    print(f"\n{'='*50}")
    print(f"📄 Processing resume: {file_path}")
    print(f"{'='*50}")

    # ── Step 1: PDF → raw text via LlamaParse ─────────────────────────────
    try:
        parser   = LlamaParse(result_type="text")
        docs     = parser.load_data(file_path)
        full_text = "\n".join([d.text for d in docs])

        if not full_text.strip():
            return {"error": "Could not extract text. File may be scanned or corrupted."}

        print(f"📝 Extracted {len(full_text):,} characters from PDF")

    except Exception as e:
        return {"error": f"LlamaParse failed: {str(e)}"}

    # ── Step 2: Extract structured data ──────────────────────────────────
    meta    = extract_metadata_regex(full_text)
    content = extract_content_with_gemini(full_text)

    # ── Step 3: Embed & store in ChromaDB with preferences ───────────────
    preferences = {}
    try:
        import sqlite3, os as _os
        db_path = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "talentcortex.db")
        if _os.path.exists(db_path):
            conn_pref = sqlite3.connect(db_path)
            conn_pref.row_factory = sqlite3.Row
            row = conn_pref.execute(
                "SELECT * FROM preferences WHERE candidate_id = ?", (user_id,)
            ).fetchone()
            conn_pref.close()
            if row:
                preferences = dict(row)
    except Exception as pe:
        print(f"⚠️  Could not fetch preferences (non-fatal): {pe}")

    try:
        save_to_chromadb(content, meta, user_id, preferences=preferences)
    except Exception as e:
        print(f"⚠️  Vector save failed (non-fatal): {e}")

    # ── Step 4: Return to Flask ───────────────────────────────────────────
    return {
        "status":         "success",
        "contact_info":   meta,
        "parsed_content": content,
    }