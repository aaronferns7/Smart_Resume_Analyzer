/**
 * TalentCortex — candidate.js
 * Dashboard: upload resume, analyze, save preferences, show stats.
 * NOTE: API constant comes from auth.js — do NOT redeclare it here.
 */

function authHdr(isJson = true) {
  const h = { "Authorization": `Bearer ${localStorage.getItem("tc_token") || ""}` };
  if (isJson) h["Content-Type"] = "application/json";
  return h;
}

function esc(s) {
  return String(s || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function setStatus(id, msg, type = "") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className   = "status-msg" + (type ? " " + type : "");
}

// ════════════════════════════════════════════════════════
// DASHBOARD INIT
// ════════════════════════════════════════════════════════
async function initDashboard() {
  if (!document.getElementById("matchScore")) return;

  // Show applied job label
  const job     = JSON.parse(localStorage.getItem("selectedJob") || "null");
  const titleEl = document.getElementById("appliedJobTitle");
  if (titleEl) {
    titleEl.textContent = job
      ? `Applied for: ${job.title}`
      : "No job selected yet. Browse jobs to apply.";
  }

  // Restore stats and parsed data from last upload
  const lastAnalysis = JSON.parse(localStorage.getItem("resumeAnalysis") || "null");
  const analyzeBtn = document.getElementById("analyzeResumeBtn");
  if (lastAnalysis) {
    if (job) updateStats(lastAnalysis, job);
    renderParsedData(lastAnalysis, "parsedData");
    if (analyzeBtn) {
      analyzeBtn.disabled = false;
      analyzeBtn.style.display = "block";
    }
  }

  // If the candidate already uploaded a resume for this job (from a previous session),
  // enable Analyze and immediately populate parsed resume details.
  if (job && analyzeBtn) {
    try {
      const res = await fetch(`${API}/api/applications/${job.id}`, { headers: authHdr() });
      const data = await res.json();
      if (res.ok && data.application && data.application.resume_path) {
        analyzeBtn.disabled = false;
        analyzeBtn.style.display = "block";
        setStatus("uploadStatus", "✅ Resume already uploaded for this job.", "success");

        // Re-fetch parsed resume + analysis from the backend to show details
        const analysisRes = await fetch(`${API}/api/analyze_resume`, {
          method:  "POST",
          headers: authHdr(),
          body:    JSON.stringify({ job_id: job.id })
        });
        const analysisData = await analysisRes.json();
        if (analysisRes.ok && analysisData.parsed_content) {
          const merged = {
            parsed_content: analysisData.parsed_content,
            contact_info:   analysisData.contact_info,
            analysis: {
              score: analysisData.score,
              timestamp: new Date().toISOString()
            }
          };
          localStorage.setItem("resumeAnalysis", JSON.stringify(merged));
          renderParsedData(merged, "parsedData");
          updateStats(merged, job);
        } else {
          // Show resume filename + guidance instead of 'No resume uploaded'.
          const parsedContainer = document.getElementById("parsedData");
          if (parsedContainer) {
            parsedContainer.innerHTML = `
              <div class="empty-state">
                <p>Resume uploaded: <strong>${(data.application.resume_path || "").split("/").pop()}</strong></p>
                <span>Click "Upload & Analyze" to parse and analyze it.</span>
              </div>`;
          }
        }
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
    const res  = await fetch(`${API}/api/preferences`, { headers: authHdr() });
    const data = await res.json();
    if (!data.preferences || !Object.keys(data.preferences).length) return;
    const p   = data.preferences;
    const map = {
      workMode:        p.work_mode,
      nightShift:      p.night_shift,
      relocate:        p.relocate,
      workingHours:    p.working_hours,
      workLifeBalance: p.work_life_bal,
    };
    Object.entries(map).forEach(([name, val]) => {
      const el = form.querySelector(`[name="${name}"]`);
      if (el && val) el.value = val;
    });
  } catch { /* non-critical */ }
}

function wireSavePreferences() {
  const btn  = document.getElementById("savePreferencesBtn");
  const form = document.getElementById("preferenceForm");
  if (!btn || !form) return;

  btn.addEventListener("click", async () => {
    if (!localStorage.getItem("tc_token")) { alert("Please login."); return; }
    btn.disabled = true;
    btn.textContent = "Saving…";
    setStatus("prefStatus", "");

    const fd    = new FormData(form);
    const prefs = {
      workMode:        fd.get("workMode"),
      nightShift:      fd.get("nightShift"),
      relocate:        fd.get("relocate"),
      workingHours:    fd.get("workingHours"),
      workLifeBalance: fd.get("workLifeBalance"),
    };
    try {
      const res  = await fetch(`${API}/api/preferences`, {
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
      btn.disabled    = false;
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
  const job  = JSON.parse(localStorage.getItem("selectedJob") || "null");
  if (!job?.id) {
    throw new Error("Please apply to a job first before uploading a resume.");
  }
  const formData = new FormData();
  formData.append("file", file);
  formData.append("job_id", job.id);

  setStatus("uploadStatus",
    "⏳ Uploading and parsing your resume… this may take 15-30 seconds.");

  const res  = await fetch(`${API}/api/upload_resume`, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${localStorage.getItem("tc_token") || ""}` },
    body:    formData
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Upload failed.");
  }

  localStorage.setItem("resumeAnalysis", JSON.stringify(data));
  setStatus("uploadStatus", "✅ Resume uploaded and parsed successfully!", "success");
  renderParsedData(data, "parsedData");
  if (job) updateStats(data, job);

  const analyzeBtn = document.getElementById("analyzeResumeBtn");
  if (analyzeBtn) analyzeBtn.style.display = "block";

  return data;
}

function wireResumeUpload() {
  const fileInput = document.getElementById("resumeFile");
  const uploadBtn = document.getElementById("uploadResumeBtn");
  const uploadAnalyzeBtn = document.getElementById("uploadAndAnalyzeBtn");
  if (!fileInput || !uploadBtn) return;

  // ✅ Start ENABLED — user can click and will get a clear message
  uploadBtn.disabled = false;
  if (uploadAnalyzeBtn) uploadAnalyzeBtn.disabled = false;

  uploadBtn.addEventListener("click", async () => {
    uploadBtn.disabled    = true;
    uploadBtn.textContent = "Uploading…";

    try {
      await uploadResumeFile();
    } catch (err) {
      setStatus("uploadStatus", err.message || "Upload failed.", "error");
    } finally {
      uploadBtn.disabled    = false;
      uploadBtn.textContent = "Upload Resume";
    }
  });

  if (uploadAnalyzeBtn) {
    uploadAnalyzeBtn.addEventListener("click", async () => {
      uploadAnalyzeBtn.disabled    = true;
      uploadAnalyzeBtn.textContent = "Uploading…";

      try {
        await uploadResumeFile();
        // After successful upload, immediately run analysis
        const job = JSON.parse(localStorage.getItem("selectedJob") || "null");
        if (job?.id) {
          await performAnalysis(job);
        }
      } catch (err) {
        setStatus("uploadStatus", err.message || "Upload failed.", "error");
      } finally {
        uploadAnalyzeBtn.disabled    = false;
        uploadAnalyzeBtn.textContent = "Upload & Analyze";
      }
    });
  }

  // Also enable button when file is selected via picker
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) {
      setStatus("uploadStatus",
        `📄 ${fileInput.files[0].name} selected. Click "Upload Resume" to continue.`);
    }
  });
}

// ════════════════════════════════════════════════════════
// ANALYZE RESUME
// ════════════════════════════════════════════════════════
async function performAnalysis(job) {
  if (!job?.id) throw new Error("Please apply to a job first.");

  const res  = await fetch(`${API}/api/analyze_resume`, {
    method:  "POST",
    headers: authHdr(),
    body:    JSON.stringify({ job_id: job.id })
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Analysis failed.");
  }

  if (!data.parsed_content) {
    throw new Error("Analysis succeeded, but resume parsing data is missing. Please re-upload your resume.");
  }

  const merged = {
    parsed_content: data.parsed_content,
    contact_info:   data.contact_info,
    analysis: {
      score: data.score,
      timestamp: new Date().toISOString()
    }
  };

  localStorage.setItem("resumeAnalysis", JSON.stringify(merged));
  renderParsedData(merged, "parsedData");
  updateStats(merged, job);
  setStatus("analyzeStatus", `✅ Analysis complete! Match score: ${data.score}%`, "success");
}

function wireAnalyzeButton() {
  const analyzeBtn = document.getElementById("analyzeResumeBtn");
  if (!analyzeBtn) return;

  analyzeBtn.addEventListener("click", async () => {
    analyzeBtn.disabled    = true;
    analyzeBtn.textContent = "Analyzing…";
    setStatus("analyzeStatus",
      "⏳ Running AI analysis… this may take 15-30 seconds.");

    try {
      const job = JSON.parse(localStorage.getItem("selectedJob") || "null");

      // Attempt analysis using any existing uploaded resume on the backend
      try {
        await performAnalysis(job);
      } catch (analysisErr) {
        // If there's no resume uploaded for this job, prompt upload then retry
        if (analysisErr.message.includes("No resume uploaded")) {
          setStatus("analyzeStatus", analysisErr.message, "error");
        } else {
          try {
            await uploadResumeFile();
            await performAnalysis(job);
          } catch (uploadErr) {
            setStatus("analyzeStatus", uploadErr.message || "Analysis failed.", "error");
          }
        }
      }
    } catch(err) {
      setStatus("analyzeStatus", err.message || "Server error.", "error");
    } finally {
      analyzeBtn.disabled    = false;
      analyzeBtn.textContent = "🔍 Analyze Resume";
    }
  });
}

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════
function updateStats(data, job) {
  const resumeSkills = (data?.parsed_content?.skills || [])
    .map(s => s.toLowerCase());
  const jobSkills    = Array.isArray(job?.skills)
    ? job.skills.map(s => s.toLowerCase())
    : (job?.skills || "").split(",")
        .map(s => s.trim().toLowerCase()).filter(Boolean);

  const matched = jobSkills.filter(s => resumeSkills.includes(s));
  const missing = jobSkills.filter(s => !resumeSkills.includes(s));
  const score   = jobSkills.length
    ? Math.round((matched.length / jobSkills.length) * 100) : 0;

  const el = id => document.getElementById(id);
  if (el("matchScore"))    el("matchScore").textContent    = jobSkills.length ? `${score}%` : "—";
  if (el("skillsMatched")) el("skillsMatched").textContent = matched.length || "—";
  if (el("skillsMissing")) el("skillsMissing").textContent = missing.length || "—";
}

function renderParsedData(data, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const parsed = data?.parsed_content || {};
  const meta   = data?.contact_info   || {};

  container.innerHTML = `
    <div class="parsed-block">
      <h4>Basic Information</h4>
      <ul class="parsed-list">
        <li><strong>Name:</strong>     ${esc(parsed.name   || "—")}</li>
        <li><strong>Email:</strong>    ${esc(meta.email    || "—")}</li>
        <li><strong>Phone:</strong>    ${esc(meta.phone    || "—")}</li>
        <li><strong>LinkedIn:</strong> ${esc(meta.linkedin || "—")}</li>
        <li><strong>GitHub:</strong>   ${esc(meta.github   || "—")}</li>
      </ul>
    </div>
    <div class="parsed-block">
      <h4>Skills Detected (${(parsed.skills || []).length})</h4>
      <ul class="parsed-list">
        ${(parsed.skills||[]).map(s=>`<li>${esc(s)}</li>`).join("")
          || "<li>None detected</li>"}
      </ul>
    </div>
    <div class="parsed-block">
      <h4>Experience</h4>
      <ul class="parsed-list">
        ${(parsed.experience||[]).map(x=>`<li>${esc(x)}</li>`).join("")
          || "<li>None detected</li>"}
      </ul>
    </div>`;
}

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => { initDashboard(); });