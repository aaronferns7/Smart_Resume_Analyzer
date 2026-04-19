/**
 * TalentCortex — candidate.js
 * Dashboard: upload resume, analyze (→ redirect to feedback page), save preferences, show stats.
 * NOTE: API constant comes from auth.js — do NOT redeclare it here.
 */

function authHdr(isJson = true) {
  const h = { "Authorization": `Bearer ${localStorage.getItem("tc_token") || ""}` };
  if (isJson) h["Content-Type"] = "application/json";
  return h;
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function setStatus(id, msg, type = "") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = "status-msg" + (type ? " " + type : "");
}

// ════════════════════════════════════════════════════════
// DASHBOARD INIT
// ════════════════════════════════════════════════════════
async function initDashboard() {
  if (!document.getElementById("matchScore")) return;

  // Show applied job label
  const job = JSON.parse(localStorage.getItem("selectedJob") || "null");
  const titleEl = document.getElementById("appliedJobTitle");
  if (titleEl) {
    titleEl.textContent = job
      ? `Applied for: ${job.title}`
      : "No job selected yet. Browse jobs to apply.";
  }

  // Restore stats from last upload if available
  const lastAnalysis = JSON.parse(localStorage.getItem("resumeAnalysis") || "null");
  const analyzeBtn = document.getElementById("analyzeResumeBtn");
  if (lastAnalysis) {
    if (job) updateStats(lastAnalysis, job);
    if (analyzeBtn) {
      analyzeBtn.disabled = false;
      analyzeBtn.style.display = "block";
    }
  }

  // Also check if the candidate already has ANY resume uploaded to enable Analyze
  if (analyzeBtn) {
    try {
      const res = await fetch(`${API}/api/latest_resume`, { headers: authHdr() });
      const data = await res.json();
      if (res.ok && data.has_resume) {
        analyzeBtn.disabled = false;
        analyzeBtn.style.display = "block";
        setStatus("uploadStatus", `📄 Most recent resume: ${data.filename}`, "success");
      }
    } catch {
      // ignore
    }
  }

  // If there's a job, also check job specific application
  if (job && analyzeBtn) {
    try {
      const res = await fetch(`${API}/api/applications/${job.id}`, { headers: authHdr() });
      const data = await res.json();
      if (res.ok && data.application && data.application.resume_path) {
        setStatus("uploadStatus", "✅ Resume already uploaded for this job.", "success");
      }
    } catch {
      // ignore
    }
  }

  // Load preferences, wire all buttons
  await loadPreferences();
  wireSavePreferences();
  wireResumeUpload();
  wireAnalyzeButton();

  // Logout button
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", e => { e.preventDefault(); logout(); });
  }
}

// ════════════════════════════════════════════════════════
// PREFERENCES
// ════════════════════════════════════════════════════════
async function loadPreferences() {
  const form = document.getElementById("preferenceForm");
  if (!form || !localStorage.getItem("tc_token")) return;
  try {
    const res = await fetch(`${API}/api/preferences`, { headers: authHdr() });
    const data = await res.json();
    if (!data.preferences || !Object.keys(data.preferences).length) return;
    const p = data.preferences;
    const map = {
      workMode: p.work_mode,
      nightShift: p.night_shift,
      relocate: p.relocate,
      workingHours: p.working_hours,
      workLifeBalance: p.work_life_bal,
    };
    Object.entries(map).forEach(([name, val]) => {
      const el = form.querySelector(`[name="${name}"]`);
      if (el && val) el.value = val;
    });
  } catch { /* non-critical */ }
}

function wireSavePreferences() {
  const btn = document.getElementById("savePreferencesBtn");
  const form = document.getElementById("preferenceForm");
  if (!btn || !form) return;

  btn.addEventListener("click", async () => {
    if (!localStorage.getItem("tc_token")) { alert("Please login."); return; }
    btn.disabled = true;
    btn.textContent = "Saving…";
    setStatus("prefStatus", "");

    const fd = new FormData(form);
    const prefs = {
      workMode: fd.get("workMode"),
      nightShift: fd.get("nightShift"),
      relocate: fd.get("relocate"),
      workingHours: fd.get("workingHours"),
      workLifeBalance: fd.get("workLifeBalance"),
    };
    try {
      const res = await fetch(`${API}/api/preferences`, {
        method: "POST", headers: authHdr(), body: JSON.stringify(prefs)
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("prefStatus", "✅ Preferences saved!", "success");
        localStorage.setItem("candidatePrefs", JSON.stringify(prefs));
      } else {
        setStatus("prefStatus", data.error || "Save failed.", "error");
      }
    } catch {
      setStatus("prefStatus", "Server error.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Save Preferences";
    }
  });
}

// ════════════════════════════════════════════════════════
// RESUME UPLOAD
// ════════════════════════════════════════════════════════
async function uploadResumeFile() {
  const fileInput = document.getElementById("resumeFile");
  if (!fileInput || !localStorage.getItem("tc_token")) {
    throw new Error("Please login and select a file first.");
  }

  if (!fileInput.files || fileInput.files.length === 0) {
    throw new Error("No file selected.");
  }

  const file = fileInput.files[0];
  const job = JSON.parse(localStorage.getItem("selectedJob") || "null");
  const formData = new FormData();
  formData.append("file", file);
  if (job?.id) {
    formData.append("job_id", job.id);
  }

  setStatus("uploadStatus",
    "⏳ Uploading and parsing your resume… this may take 15-30 seconds.");

  const res = await fetch(`${API}/api/upload_resume`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${localStorage.getItem("tc_token") || ""}` },
    body: formData
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Upload failed.");
  }

  localStorage.setItem("resumeAnalysis", JSON.stringify(data));
  setStatus("uploadStatus", "✅ Resume uploaded and parsed successfully!", "success");

  const job2 = JSON.parse(localStorage.getItem("selectedJob") || "null");
  if (job2) updateStats(data, job2);

  const analyzeBtn = document.getElementById("analyzeResumeBtn");
  if (analyzeBtn) {
    analyzeBtn.disabled = false;
    analyzeBtn.style.display = "block";
  }

  return data;
}

function wireResumeUpload() {
  const fileInput = document.getElementById("resumeFile");
  const uploadBtn = document.getElementById("uploadResumeBtn");
  if (!fileInput || !uploadBtn) return;

  // Start ENABLED — user can click and will get a clear message
  uploadBtn.disabled = false;

  uploadBtn.addEventListener("click", async () => {
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading…";

    try {
      await uploadResumeFile();
    } catch (err) {
      setStatus("uploadStatus", err.message || "Upload failed.", "error");
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Upload Resume";
    }
  });

  // Enable button when file is selected via picker
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) {
      setStatus("uploadStatus",
        `📄 ${fileInput.files[0].name} selected. Click "Upload Resume" to continue.`);
    }
  });
}

// ════════════════════════════════════════════════════════
// ANALYZE RESUME — redirects directly to feedback page.
// The feedback page calls /api/generate_feedback on load.
// We skip /api/analyze_resume here entirely — it re-runs
// LlamaParse which is slow and redundant after upload.
// ════════════════════════════════════════════════════════
function wireAnalyzeButton() {
  const analyzeBtn = document.getElementById("analyzeResumeBtn");
  if (!analyzeBtn) return;

  analyzeBtn.addEventListener("click", async () => {
    let analysisObj = null;
    try {
      analysisObj = JSON.parse(localStorage.getItem("resumeAnalysis") || "null");
    } catch (e) { /* ignore parse errors */ }

    if (!analysisObj || !analysisObj.parsed_content) {
      const origText = analyzeBtn.textContent;
      analyzeBtn.textContent = "Analyzing...";
      analyzeBtn.disabled = true;
      setStatus("analyzeStatus", "⏳ Retrieving your resume data... please wait.", "info");

      try {
        const job = JSON.parse(localStorage.getItem("selectedJob") || "null");
        const bodyReq = job && job.id ? { job_id: job.id } : {};
        const API_URL = typeof API !== "undefined" ? API : "http://localhost:5000";
        const res = await fetch(`${API_URL}/api/analyze_resume`, {
          method: "POST",
          headers: typeof authHdr === "function" ? authHdr(true) : { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("tc_token")}` },
          body: JSON.stringify(bodyReq)
        });
        const data = await res.json();

        if (res.ok && data.parsed_content) {
          localStorage.setItem("resumeAnalysis", JSON.stringify(data));
          analysisObj = data;
        } else {
          setStatus("analyzeStatus", "❌ " + (data.error || "Please upload your resume again."), "error");
          analyzeBtn.textContent = origText;
          analyzeBtn.disabled = false;
          return;
        }
      } catch (err) {
        setStatus("analyzeStatus", "❌ Failed to retrieve resume data.", "error");
        analyzeBtn.textContent = origText;
        analyzeBtn.disabled = false;
        return;
      }
    }

    // Redirect straight to feedback — it handles the AI call on load
    setStatus("analyzeStatus", "✅ Opening feedback page…", "success");
    window.location.href = "feedback.html";
  });
}

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════
function updateStats(data, job) {
  if (!data || !job) return;

  const resumeSkills = (data?.parsed_content?.skills || []).map(s => s.trim().toLowerCase());
  const jobSkills = Array.isArray(job?.skills)
    ? job.skills.map(s => s.trim().toLowerCase())
    : (job?.skills || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

  const matched = [];
  const missing = [];
  jobSkills.forEach(js => {
    const isMatch = resumeSkills.some(rs => rs.includes(js) || js.includes(rs));
    if (isMatch) matched.push(js);
    else missing.push(js);
  });

  let score = data?.score !== undefined ? data.score : 0;
  if (!score && jobSkills.length) {
    score = Math.round((matched.length / jobSkills.length) * 100);
  }

  const el = id => document.getElementById(id);
  if (el("matchScore")) el("matchScore").textContent = `${score}%`;
  if (el("skillsMatched")) el("skillsMatched").textContent = matched.length.toString();
  if (el("skillsMissing")) el("skillsMissing").textContent = missing.length.toString();
}

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => { initDashboard(); });