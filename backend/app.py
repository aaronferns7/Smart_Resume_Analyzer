"""
TalentCortex — app.py
Flask backend: Auth, Jobs, Resume Upload, AI Matching, Feedback.
SQLite + ChromaDB are both auto-created on first run.
"""

import os
import json
import logging
from datetime import datetime, timedelta
from functools import wraps

# ── Load .env FIRST — before any other imports that may read env vars ──────────
from dotenv import load_dotenv
load_dotenv()

# Normalise key names: support both GEMINI_API_KEY and GOOGLE_API_KEY
_api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY", "")
if _api_key:
    os.environ["GEMINI_API_KEY"]  = _api_key
    os.environ["GOOGLE_API_KEY"]  = _api_key   # LangChain reads this name

import bcrypt
import jwt
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename

# ─────────────────────────────────────────────
# APP SETUP
# ─────────────────────────────────────────────
app = Flask(__name__)
# Allow CORS for both API routes AND the uploads folder
CORS(app, resources={
    r"/api/*": {"origins": "*"},
    r"/uploads/*": {"origins": "*"}  # <--- ADD THIS LINE
}, supports_credentials=True)
SECRET_KEY        = "talentcortex_jwt_secret_2024"   # change in production
UPLOAD_FOLDER     = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
ALLOWED_EXTENSIONS = {"pdf"}
MAX_CONTENT_LENGTH = 10 * 1024 * 1024   # 10 MB

app.config["UPLOAD_FOLDER"]      = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH
app.config["SECRET_KEY"]         = SECRET_KEY

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# DATABASE — auto-creates on startup
# ─────────────────────────────────────────────
from database import init_db, get_connection
init_db()

# ─────────────────────────────────────────────
# AI MODULES
# ─────────────────────────────────────────────
try:
    from resume_parser import process_resume
    logger.info("✅ resume_parser loaded")
except ImportError as e:
    logger.error(f"❌ resume_parser: {e}")
    process_resume = None

try:
    from matcher import match_job
    logger.info("✅ matcher loaded")
except ImportError as e:
    logger.error(f"❌ matcher: {e}")
    match_job = None

# ─────────────────────────────────────────────
# AUTH HELPERS
# ─────────────────────────────────────────────
def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def make_token(user_id: int, role: str, email: str) -> str:
    payload = {
        "user_id": user_id,
        "role":    role,
        "email":   email,
        "exp":     datetime.utcnow() + timedelta(hours=24)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])


def _get_payload():
    """Extract and validate JWT from request header."""
    raw = request.headers.get("Authorization", "")
    token = raw.replace("Bearer ", "").strip()
    if not token:
        return None, "Authentication required."
    try:
        return decode_token(token), None
    except jwt.ExpiredSignatureError:
        return None, "Session expired. Please login again."
    except jwt.InvalidTokenError:
        return None, "Invalid token."


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        payload, err = _get_payload()
        if err:
            return jsonify({"error": err}), 401
        request.user = payload
        return f(*args, **kwargs)
    return decorated


def hr_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        payload, err = _get_payload()
        if err:
            return jsonify({"error": err}), 401
        if payload.get("role") != "hr":
            return jsonify({"error": "HR access only."}), 403
        request.user = payload
        return f(*args, **kwargs)
    return decorated


def candidate_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        payload, err = _get_payload()
        if err:
            return jsonify({"error": err}), 401
        if payload.get("role") != "candidate":
            return jsonify({"error": "Candidate access only."}), 403
        request.user = payload
        return f(*args, **kwargs)
    return decorated


# ─── HEALTH CHECK ────────────────────────────────────────────────────────────
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "TalentCortex backend is running"}), 200

# ─────────────────────────────────────────────
# AUTH ROUTES
# ─────────────────────────────────────────────

@app.route("/api/auth/register", methods=["POST"])
def register():
    data     = request.get_json(silent=True) or {}
    email    = data.get("email",    "").strip().lower()
    password = data.get("password", "").strip()
    role     = data.get("role",     "candidate")
    name     = data.get("name",     "").strip()

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400
    if role not in ("candidate", "hr"):
        return jsonify({"error": "Role must be 'candidate' or 'hr'."}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400

    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)",
            (email, pw_hash, role, name)
        )
        conn.commit()
        user  = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        token = make_token(user["id"], user["role"], user["email"])
        return jsonify({"status": "success", "token": token, "role": role,
                        "name": name or email.split("@")[0]}), 201
    except Exception as e:
        if "UNIQUE" in str(e):
            return jsonify({"error": "Email already registered."}), 409
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/auth/login", methods=["POST"])
def login():
    data     = request.get_json(silent=True) or {}
    email    = data.get("email",    "").strip().lower()
    password = data.get("password", "").strip()
    role     = data.get("role",     "")

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    conn = get_connection()
    try:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not user:
            return jsonify({"error": "Invalid email or password."}), 401
        if role and user["role"] != role:
            return jsonify({"error": f"This account is not registered as {role}."}), 403
        if not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
            return jsonify({"error": "Invalid email or password."}), 401

        token = make_token(user["id"], user["role"], user["email"])
        return jsonify({"status": "success", "token": token,
                        "role": user["role"],
                        "name": user["name"] or email.split("@")[0]}), 200
    finally:
        conn.close()

# ─────────────────────────────────────────────
# JOB ROUTES
# ─────────────────────────────────────────────

@app.route("/api/jobs", methods=["GET"])
def get_jobs():
    """Public — candidates and visitors can see all jobs."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT j.*, u.name AS hr_name
               FROM jobs j JOIN users u ON j.hr_id = u.id
               ORDER BY j.created_at DESC"""
        ).fetchall()
        return jsonify({"status": "success", "jobs": [dict(r) for r in rows]}), 200
    finally:
        conn.close()


@app.route("/api/jobs", methods=["POST"])
@hr_required
def post_job():
    data = request.get_json(silent=True) or {}
    title       = data.get("title",       "").strip()
    company     = data.get("company",     "").strip()
    location    = data.get("location",    "").strip()
    work_mode   = data.get("work_mode",   "Onsite")
    skills      = data.get("skills",      "")
    description = data.get("description", "")

    if not title or not company or not location:
        return jsonify({"error": "Title, company, and location are required."}), 400

    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO jobs (hr_id, title, company, location, work_mode, skills, description)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (request.user["user_id"], title, company, location, work_mode, skills, description)
        )
        conn.commit()
        job_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return jsonify({"status": "success", "message": "Job posted successfully.",
                        "job_id": job_id}), 201
    finally:
        conn.close()


@app.route("/api/jobs/mine", methods=["GET"])
@hr_required
def get_my_jobs():
    """Returns only the jobs posted by the logged-in HR user."""
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM jobs WHERE hr_id = ? ORDER BY created_at DESC",
            (request.user["user_id"],)
        ).fetchall()
        return jsonify({"status": "success", "jobs": [dict(r) for r in rows]}), 200
    finally:
        conn.close()


@app.route("/api/jobs/<int:job_id>", methods=["GET"])
def get_job(job_id):
    conn = get_connection()
    try:
        job = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not job:
            return jsonify({"error": "Job not found."}), 404
        return jsonify({"status": "success", "job": dict(job)}), 200
    finally:
        conn.close()


@app.route("/api/jobs/<int:job_id>/preferences", methods=["GET"])
def get_job_preferences(job_id):
    """Returns the work-mode preference for a job -- used on job-details page."""
    conn = get_connection()
    try:
        job = conn.execute("SELECT work_mode FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not job:
            return jsonify({"error": "Job not found."}), 404
        return jsonify({"status": "success", "preferences": dict(job)}), 200
    finally:
        conn.close()

# ─────────────────────────────────────────────
# RESUME UPLOAD  (Candidate)
# ─────────────────────────────────────────────

@app.route("/api/upload_resume", methods=["POST"])
@candidate_required
def upload_resume():
    if process_resume is None:
        return jsonify({"error": "Resume parser unavailable. Check server logs."}), 500

    if "file" not in request.files:
        return jsonify({"error": "No file included in the request."}), 400

    file   = request.files["file"]
    job_id = request.form.get("job_id")   # optional — links resume to a job

    if file.filename == "":
        return jsonify({"error": "No file selected."}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "Only PDF files are accepted."}), 400

    # Namespace filename by candidate so HR can open it later
    filename  = f"candidate_{request.user['user_id']}_{secure_filename(file.filename)}"
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)

    try:
        file.save(save_path)
        logger.info(f"📎 Saved resume → {save_path}")
    except Exception as e:
        return jsonify({"error": f"File save failed: {str(e)}"}), 500

    try:
        result = process_resume(save_path, user_id=str(request.user["user_id"]))
    except Exception as e:
        logger.error(f"process_resume error: {e}")
        return jsonify({"error": f"Parsing failed: {str(e)}"}), 500

    if "error" in result:
        return jsonify(result), 422

    # ── Save application record to SQL if job_id provided ──────────────────
    if job_id:
        conn = get_connection()
        try:
            parsed = result.get("parsed_content", {})
            meta   = result.get("contact_info",   {})
            
            # This handles BOTH new applications and updating existing ones cleanly!
            # Create a web-friendly URL path for the database
            # Force the frontend to look at port 5000
            db_resume_path = f"http://localhost:5000/uploads/{filename}"

            conn.execute(
                """INSERT INTO applications
                       (candidate_id, job_id, resume_path, skills, experience, phone, linkedin, github)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(candidate_id, job_id) DO UPDATE SET
                       resume_path = excluded.resume_path,
                       skills      = excluded.skills,
                       experience  = excluded.experience,
                       phone       = excluded.phone,
                       linkedin    = excluded.linkedin,
                       github      = excluded.github""",
                (
                    request.user["user_id"], job_id, db_resume_path, # <--- FIXED HERE
                    json.dumps(parsed.get("skills",     [])),
                    json.dumps(parsed.get("experience", [])),
                    meta.get("phone",    ""),
                    meta.get("linkedin", ""),
                    meta.get("github",   ""),
                )
            )
            conn.commit()
        finally:
            conn.close()

    return jsonify(result), 200# ─────────────────────────────────────────────
# APPLY TO JOB  (Candidate, no resume required)
# ─────────────────────────────────────────────

@app.route("/api/apply", methods=["POST"])
@candidate_required
def apply_to_job():
    data   = request.get_json(silent=True) or {}
    job_id = data.get("job_id")

    if not job_id:
        return jsonify({"error": "job_id is required."}), 400

    conn = get_connection()
    try:
        job = conn.execute("SELECT id FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not job:
            return jsonify({"error": "Job not found."}), 404

        conn.execute(
            "INSERT OR IGNORE INTO applications (candidate_id, job_id) VALUES (?, ?)",
            (request.user["user_id"], job_id)
        )
        conn.commit()
        return jsonify({"status": "success", "message": "Applied successfully."}), 200
    finally:
        conn.close()

# ─────────────────────────────────────────────
# ANALYZE RESUME (Candidate) — optionally compare to a job description
# ─────────────────────────────────────────────

@app.route("/api/latest_resume", methods=["GET"])
@candidate_required
def get_latest_resume():
    import glob
    user_id = request.user["user_id"]
    pattern = os.path.join(app.config["UPLOAD_FOLDER"], f"candidate_{user_id}_*.pdf")
    files = glob.glob(pattern)
    if files:
        latest = max(files, key=os.path.getmtime)
        return jsonify({"has_resume": True, "filename": os.path.basename(latest)}), 200
    return jsonify({"has_resume": False}), 200

@app.route("/api/analyze_resume", methods=["POST"])
@candidate_required
def analyze_resume():
    """Analyze the logged-in candidate's resume vs the given job description.

    Expects JSON { job_id: <int> } optionally.
    Returns a score percentage or an error.
    """
    if match_job is None:
        return jsonify({"error": "Matching engine unavailable."}), 500

    data = request.get_json(silent=True) or {}
    job_id = data.get("job_id")

    user_id = request.user["user_id"]
    
    import glob
    pattern = os.path.join(app.config["UPLOAD_FOLDER"], f"candidate_{user_id}_*.pdf")
    files = glob.glob(pattern)
    
    if not files:
        return jsonify({"error": "No resume uploaded. Please click 'Upload Resume' first."}), 400
        
    resume_path = max(files, key=os.path.getmtime)

    conn = get_connection()
    try:
        jd_text = None
        if job_id:
            job = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
            if not job:
                return jsonify({"error": "Job not found."}), 404

            job_dict = dict(job)
            jd_text  = (
                f"{job_dict['title']} {job_dict['description']} "
                f"Required skills: {job_dict['skills']}"
            )

    finally:
        conn.close()

    # First, try to fetch the ALREADY PARSED data from ChromaDB
    parsed_result = None
    try:
        from resume_parser import resume_collection
        res = resume_collection.get(ids=[f"candidate_{user_id}"])
        if res and res["metadatas"] and len(res["metadatas"]) > 0:
            meta = res["metadatas"][0]
            parsed_result = {
                "parsed_content": {
                    "name": meta.get("name", "Unknown"),
                    "skills": json.loads(meta.get("skills", "[]")),
                    "experience": json.loads(meta.get("experience", "[]"))
                },
                "contact_info": {
                    "email": meta.get("email", ""),
                    "phone": meta.get("phone", ""),
                    "linkedin": meta.get("linkedin", ""),
                    "github": meta.get("github", "")
                }
            }
            logger.info("✅ Fetched parsed resume data from ChromaDB.")
    except Exception as e:
        logger.warning(f"Failed to fetch from ChromaDB: {e}")

    # Fallback to re-parsing if missing
    if not parsed_result and process_resume is not None:
        try:
            parsed_result = process_resume(resume_path, user_id=str(user_id))
        except Exception as e:
            logger.warning(f"Failed to re-parse resume for analysis: {e}")

    score = 0
    if jd_text:
        match_result = match_job(jd_text, candidate_ids=[str(user_id)])
        if match_result.get("error"):
            logger.warning(f"Match error: {match_result.get('error')}")
        else:
            matches = match_result.get("matches", [])
            score = matches[0].get("score", 0) if matches else 0

    response = {"status": "success", "score": score}
    if parsed_result and "parsed_content" in parsed_result:
        response["parsed_content"] = parsed_result.get("parsed_content")
        response["contact_info"]  = parsed_result.get("contact_info")
    elif parsed_result and "error" in parsed_result:
        return jsonify({"error": parsed_result["error"]}), 400
    else:
        return jsonify({"error": "Could not extract resume content. Please re-upload your resume."}), 400

    return jsonify(response), 200


@app.route("/api/applications/<int:job_id>", methods=["GET"])
@candidate_required
def get_application(job_id):
    """Return the candidate's application record for a given job."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM applications WHERE job_id = ? AND candidate_id = ?",
            (job_id, request.user["user_id"])
        ).fetchone()
        if not row:
            return jsonify({"status": "success", "application": None}), 200
        return jsonify({"status": "success", "application": dict(row)}), 200
    finally:
        conn.close()


# ─────────────────────────────────────────────
# APPLICANTS — ranked by AI  (HR)
# ─────────────────────────────────────────────

@app.route("/api/applicants/<int:job_id>", methods=["GET"])
@hr_required
def get_applicants(job_id):
    if match_job is None:
        return jsonify({"error": "Matching engine unavailable."}), 500

    conn = get_connection()
    try:
        # Verify job belongs to this HR user
        job = conn.execute(
            "SELECT * FROM jobs WHERE id = ? AND hr_id = ?",
            (job_id, request.user["user_id"])
        ).fetchone()
        if not job:
            return jsonify({"error": "Job not found or access denied."}), 404

        job_dict = dict(job)
        if not job_dict.get("skills") and job_dict.get("description"):
            try:
                import os
                from langchain_google_genai import ChatGoogleGenerativeAI
                api_key = os.environ.get("GOOGLE_API_KEY")
                model = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.1, google_api_key=api_key)
                prompt = f"Extract a brief comma-separated list of ONLY the core required technical skills from this job description. No extra text, no bullet points, just a single comma-separated string. Job Description: {job_dict['description']}"
                skills_str = model.invoke(prompt).content.replace('"', '').strip()
                if skills_str:
                    logger.info(f"Auto-extracted skills for job {job_id}: {skills_str}")
                    job_dict["skills"] = skills_str
                    conn.execute("UPDATE jobs SET skills = ? WHERE id = ?", (skills_str, job_id))
                    conn.commit()
            except Exception as e:
                logger.warning(f"Failed to auto-extract job skills: {e}")

        jd_text  = (
            f"{job_dict['title']} {job_dict['description']} "
            f"Required skills: {job_dict.get('skills', '')}"
        )

        # Get candidate IDs + preferences who applied to this job from SQL
        applicant_rows = conn.execute(
            """SELECT a.candidate_id, u.name, u.email,
                      a.resume_path, a.skills, a.experience,
                      a.phone, a.linkedin, a.github,
                      p.work_mode, p.night_shift, p.relocate,
                      p.working_hours, p.work_life_bal
               FROM applications a
               JOIN users u ON a.candidate_id = u.id
               LEFT JOIN preferences p ON p.candidate_id = a.candidate_id
               WHERE a.job_id = ?""",
            (job_id,)
        ).fetchall()

        if not applicant_rows:
            return jsonify({"status": "success", "matches": [], "job": job_dict}), 200

        candidate_ids = [str(r["candidate_id"]) for r in applicant_rows]
        sql_info      = {str(r["candidate_id"]): dict(r) for r in applicant_rows}

        # Try ChromaDB ranking — but don't fail if vectors are missing
        chroma_scores = {}   # candidate_id → score
        try:
            match_result = match_job(jd_text, candidate_ids=candidate_ids)
            for m in match_result.get("matches", []):
                cid = str(m.get("candidate_id", ""))
                chroma_scores[cid] = m.get("score", 0)
        except Exception as e:
            logger.warning(f"ChromaDB matching failed (showing all applicants): {e}")

        # Build enriched list from SQL — every applicant shows up
        # Score comes from ChromaDB if available, otherwise 0
        enriched = []
        for cid, info in sql_info.items():
            enriched.append({
                "candidate_id": cid,
                "score":        chroma_scores.get(cid, 0),
                "name":         info.get("name",  "Unknown"),
                "email":        info.get("email", "N/A"),
                "resume_path":  info.get("resume_path", ""),
                "phone":        info.get("phone",    ""),
                "linkedin":     info.get("linkedin",  ""),
                "github":       info.get("github",    ""),
                "skills":       json.loads(info.get("skills",     "[]") or "[]"),
                "experience":   json.loads(info.get("experience", "[]") or "[]"),
                "preferences": {
                    "work_mode":     info.get("work_mode",     "N/A"),
                    "night_shift":   info.get("night_shift",   "N/A"),
                    "relocate":      info.get("relocate",      "N/A"),
                    "working_hours": info.get("working_hours", "N/A"),
                    "work_life_bal": info.get("work_life_bal", "N/A"),
                },
            })

        # Sort by score descending
        enriched.sort(key=lambda x: x["score"], reverse=True)

        return jsonify({"status": "success", "matches": enriched, "job": job_dict}), 200
    finally:
        conn.close()

# ─────────────────────────────────────────────
# AI FEEDBACK
# ─────────────────────────────────────────────

@app.route("/api/generate_feedback", methods=["POST"])
@token_required
def generate_feedback():
    try:
        import google.generativeai as genai
        from langchain_google_genai import ChatGoogleGenerativeAI
        from langchain_core.prompts import PromptTemplate

        # ── Resolve API key robustly ───────────────────────────────────────
        google_api_key = (
            os.environ.get("GEMINI_API_KEY") or
            os.environ.get("GOOGLE_API_KEY") or
            os.environ.get("GOOGLE_GENERATIVEAI_API_KEY", "")
        )
        if not google_api_key:
            logger.error("❌ No Google API key found in environment.")
            return jsonify({
                "error": (
                    "Server configuration error: Google API key is not set. "
                    "Add GEMINI_API_KEY=your_key to your .env file and restart the server."
                )
            }), 500

        # Configure the underlying google-generativeai SDK as well
        genai.configure(api_key=google_api_key)
        logger.info(f"✅ Gemini API key loaded (starts with: {google_api_key[:8]}...)")

        data            = request.get_json(silent=True) or {}
        resume_data     = data.get("resume_data")
        job_description = data.get("job_description", "").strip()

        if not resume_data:
            return jsonify({"error": "resume_data is required."}), 400

        parsed     = resume_data.get("parsed_content", {})
        name       = parsed.get("name",       "Candidate")
        skills     = parsed.get("skills",     [])
        experience = parsed.get("experience", [])

        if job_description:
            template = (
                "You are an expert career coach and technical recruiter. "
                "Your task is to give {name} detailed, honest, and highly actionable feedback "
                "on their resume, comparing it against the provided job description and doing a general market analysis.\n\n"
                "CANDIDATE:\n"
                "  Name:       {name}\n"
                "  Skills:     {skills}\n"
                "  Experience: {experience}\n\n"
                "JOB DESCRIPTION:\n{job_description}\n\n"
                "INSTRUCTIONS — You MUST structure your entire response using exactly these three "
                "sections, in this order. Keep your points SHORT, DIRECT, and use BULLET POINTS.\n\n"
                "## Skills Gap\n"
                "Bullet points comparing the candidate's skills against the job requirements. "
                "Point out any missing skills and what they should learn.\n\n"
                "## Experience & Courses Recommended\n"
                "Bullet points evaluating the candidate's experience for the role. "
                "Suggest concrete courses or projects.\n\n"
                "## General & Market Analysis\n"
                "Bullet points providing a short, point-to-point market analysis of how competitive "
                "they are right now, along with any other concise advice.\n"
            )
            input_vars = ["name", "skills", "experience", "job_description"]
        else:
            template = (
                "You are an expert career coach and technical recruiter. "
                "Your task is to give {name} detailed, honest, and highly actionable feedback "
                "on their resume based on current market standards.\n\n"
                "CANDIDATE:\n"
                "  Name:       {name}\n"
                "  Skills:     {skills}\n"
                "  Experience: {experience}\n\n"
                "INSTRUCTIONS — You MUST structure your entire response using exactly these three "
                "sections, in this order. Keep your points SHORT, DIRECT, and use BULLET POINTS.\n\n"
                "## Skills Gap\n"
                "Bullet points evaluating the candidate's skills against current market demand. "
                "Point out any missing skills and what they should learn.\n\n"
                "## Experience & Courses Recommended\n"
                "Bullet points evaluating the candidate's experience. "
                "Suggest concrete courses, projects, or ways to enhance their background.\n\n"
                "## General & Market Analysis\n"
                "Bullet points providing a short, point-to-point market analysis of how competitive "
                "they are, along with any other concise advice.\n"
            )
            input_vars = ["name", "skills", "experience"]

        # ── Instantiate model — pass key explicitly so LangChain never ────
        # ── falls back to OAuth2 / Application Default Credentials       ────
        model = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",          # stable GA model — change to gemini-2.5-flash if your key has access
            temperature=0.7,
            google_api_key=google_api_key,     # ← explicit key, no env-var guessing
        )
        prompt = PromptTemplate(template=template, input_variables=input_vars)
        chain  = prompt | model

        invoke_data = {
            "name":       name,
            "skills":     ", ".join(skills)      if skills      else "Not specified",
            "experience": " | ".join(experience) if experience else "Not specified",
        }
        if job_description:
            invoke_data["job_description"] = job_description

        result = chain.invoke(invoke_data)
        logger.info(f"✅ Feedback generated for {name}")

        return jsonify({"status": "success", "feedback": result.content,
                        "has_jd": bool(job_description)}), 200

    except Exception as e:
        logger.error(f"Feedback error: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"error": f"Feedback generation failed: {str(e)}"}), 500

# ─────────────────────────────────────────────
# PREFERENCES  (Candidate)
# ─────────────────────────────────────────────

@app.route("/api/preferences", methods=["POST"])
@candidate_required
def save_preferences():
    data = request.get_json(silent=True) or {}
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO preferences
                   (candidate_id, work_mode, night_shift, relocate, working_hours, work_life_bal)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(candidate_id) DO UPDATE SET
                   work_mode     = excluded.work_mode,
                   night_shift   = excluded.night_shift,
                   relocate      = excluded.relocate,
                   working_hours = excluded.working_hours,
                   work_life_bal = excluded.work_life_bal,
                   updated_at    = CURRENT_TIMESTAMP""",
            (
                request.user["user_id"],
                data.get("workMode",       "remote"),
                data.get("nightShift",     "no"),
                data.get("relocate",       "no"),
                data.get("workingHours",   "flexible"),
                data.get("workLifeBalance","high"),
            )
        )
        conn.commit()
        return jsonify({"status": "success", "message": "Preferences saved."}), 200
    finally:
        conn.close()


@app.route("/api/preferences", methods=["GET"])
@candidate_required
def get_preferences():
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM preferences WHERE candidate_id = ?",
            (request.user["user_id"],)
        ).fetchone()
        return jsonify({"status": "success",
                        "preferences": dict(row) if row else {}}), 200
    finally:
        conn.close()


# ─── SERVE UPLOADED RESUMES ──────────────────────────────────────────────────
@app.route("/uploads/<path:filename>", methods=["GET"])
def serve_upload(filename):
    from flask import send_from_directory
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

# ─────────────────────────────────────────────
# ERROR HANDLERS
# ─────────────────────────────────────────────

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Route not found."}), 404

@app.errorhandler(413)
def file_too_large(e):
    return jsonify({"error": "File too large. Max size is 10 MB."}), 413

@app.errorhandler(500)
def internal_error(e):
    return jsonify({"error": "Internal server error. Check logs."}), 500

# ─────────────────────────────────────────────
# RUN
# ─────────────────────────────────────────────
if __name__ == "__main__":
    logger.info("🚀 Starting TalentCortex...")
    logger.info(f"📁 Uploads folder → {UPLOAD_FOLDER}")
    app.run(debug=True, host="0.0.0.0", port=5000)