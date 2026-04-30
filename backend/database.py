"""
TalentCortex — database.py
SQLite setup. All tables are created automatically on first run.
No manual DB creation needed — just run app.py.
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "talentcortex.db")


def get_connection():
    """Returns a SQLite connection with Row factory + foreign key enforcement."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """
    Creates all tables if they don't already exist.
    Safe to call on every app startup — uses IF NOT EXISTS throughout.
    """
    conn = get_connection()
    c = conn.cursor()

    # ── Users ────────────────────────────────────────────────────────────────
    # Stores both HR staff and Candidates in one table, distinguished by role.
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            email         TEXT    UNIQUE NOT NULL,
            password_hash TEXT    NOT NULL,
            role          TEXT    NOT NULL CHECK(role IN ('candidate', 'hr')),
            name          TEXT    DEFAULT '',
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ── Jobs ─────────────────────────────────────────────────────────────────
    # Every job is linked back to the HR user who posted it via hr_id.
    c.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            hr_id       INTEGER NOT NULL,
            title       TEXT    NOT NULL,
            company     TEXT    NOT NULL,
            location    TEXT    NOT NULL,
            work_mode   TEXT    DEFAULT 'Onsite',
            skills      TEXT    DEFAULT '',
            description TEXT    DEFAULT '',
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (hr_id) REFERENCES users(id)
        )
    """)

    # ── Applications ─────────────────────────────────────────────────────────
    # Links a candidate to a job. Resume is stored as a file path (not in DB).
    # skills / experience are stored as JSON strings for easy retrieval.
    c.execute("""
        CREATE TABLE IF NOT EXISTS applications (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            candidate_id    INTEGER NOT NULL,
            job_id          INTEGER NOT NULL,
            resume_path     TEXT    DEFAULT '',
            match_score     REAL    DEFAULT 0,
            skills          TEXT    DEFAULT '[]',
            experience      TEXT    DEFAULT '[]',
            phone           TEXT    DEFAULT '',
            linkedin        TEXT    DEFAULT '',
            github          TEXT    DEFAULT '',
            matched_skills  TEXT    DEFAULT '[]',
            missing_skills  TEXT    DEFAULT '[]',
            applied_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(candidate_id, job_id),
            FOREIGN KEY (candidate_id) REFERENCES users(id),
            FOREIGN KEY (job_id)       REFERENCES jobs(id)
        )
    """)

    # ── Candidate Preferences ─────────────────────────────────────────────────
    # One preferences row per candidate, upserted on save.
    c.execute("""
        CREATE TABLE IF NOT EXISTS preferences (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            candidate_id    INTEGER UNIQUE NOT NULL,
            work_mode       TEXT DEFAULT 'remote',
            night_shift     TEXT DEFAULT 'no',
            relocate        TEXT DEFAULT 'no',
            working_hours   TEXT DEFAULT 'flexible',
            work_life_bal   TEXT DEFAULT 'high',
            updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (candidate_id) REFERENCES users(id)
        )
    """)

    # ── Safe Database Migrations ─────────────────────────────────────────────
    # Add new columns to existing DBs without deleting data
    try:
        c.execute("ALTER TABLE applications ADD COLUMN matched_skills TEXT DEFAULT '[]'")
    except sqlite3.OperationalError:
        pass # Column already exists
    try:
        c.execute("ALTER TABLE applications ADD COLUMN missing_skills TEXT DEFAULT '[]'")
    except sqlite3.OperationalError:
        pass # Column already exists

    conn.commit()
    conn.close()
    print(f"✅ SQLite database ready → {DB_PATH}")
