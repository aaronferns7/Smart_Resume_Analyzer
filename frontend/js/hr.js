/**
 * TalentCortex — hr.js
 * Handles: HR Dashboard (post job, list jobs) + Results page (ranked applicants).
 * All data comes from / goes to the Flask backend.
 */

const API_BASE = "http://localhost:5000";

function authHeaders() {
  return {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${localStorage.getItem("tc_token") || ""}`
  };
}

// ════════════════════════════════════════════════
// HR DASHBOARD  (dashboard.html)
// ════════════════════════════════════════════════
async function initHRDashboard() {
  const jobForm = document.getElementById("jobForm");
  const jobList = document.getElementById("jobList");

  if (!jobList) return;   // not on the dashboard page

  // Load existing jobs for this HR user
  await loadMyJobs(jobList);

  // Wire the Post Job form
  if (jobForm) {
    jobForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const submitBtn  = jobForm.querySelector("[type='submit'], .primary-btn");
      const origText   = submitBtn?.textContent || "Post Job";
      if (submitBtn) { submitBtn.textContent = "Posting…"; submitBtn.disabled = true; }

      const payload = {
        title:       document.getElementById("jobTitle")?.value   || "",
        company:     document.getElementById("company")?.value    || "",
        location:    document.getElementById("location")?.value   || "",
        work_mode:   document.getElementById("workMode")?.value   || "Onsite",
        skills:      document.getElementById("skills")?.value     || "",
        description: document.getElementById("description")?.value || "",
      };

      try {
        const res  = await fetch(`${API_BASE}/api/jobs`, {
          method:  "POST",
          headers: authHeaders(),
          body:    JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok) {
          alert("Job posted successfully!");
          jobForm.reset();
          await loadMyJobs(jobList);
        } else {
          alert(data.error || "Failed to post job. Please try again.");
        }
      } catch {
        alert("Server error. Make sure the Flask backend is running on port 5000.");
      } finally {
        if (submitBtn) { submitBtn.textContent = origText; submitBtn.disabled = false; }
      }
    });
  }
}

async function loadMyJobs(container) {
  if (!container) return;
  container.innerHTML = `<p style="color:#64748b;">Loading your job listings…</p>`;

  try {
    const res  = await fetch(`${API_BASE}/api/jobs/mine`, { headers: authHeaders() });
    const data = await res.json();

    if (!res.ok) {
      container.innerHTML = `<p style="color:#dc2626;">${data.error || "Failed to load jobs."}</p>`;
      return;
    }

    if (!data.jobs || data.jobs.length === 0) {
      container.innerHTML = `<p>No jobs posted yet. Use the form above to add your first job.</p>`;
      return;
    }

    container.innerHTML = "";

    data.jobs.forEach(job => {
      const div = document.createElement("div");
      div.className = "job-card";
      div.innerHTML = `
        <h3>${escHtml(job.title)}</h3>
        <p><strong>Company:</strong> ${escHtml(job.company)}</p>
        <p><strong>Location:</strong> ${escHtml(job.location)} · ${escHtml(job.work_mode || "Onsite")}</p>
        ${job.skills ? `<p><strong>Skills:</strong> ${escHtml(job.skills)}</p>` : ""}
        <div class="job-actions" style="margin-top:12px;">
          <a href="results.html?job_id=${job.id}" class="secondary-btn">View Applicants</a>
        </div>`;
      container.appendChild(div);
    });

  } catch {
    container.innerHTML = `<p>Failed to load jobs. Is the backend running?</p>`;
  }
}

// ════════════════════════════════════════════════
// RESULTS PAGE  (results.html)
// Displays AI-ranked applicants for a specific job
// ════════════════════════════════════════════════
async function loadApplicants() {
  const list = document.querySelector(".applicant-list");
  if (!list) return;

  const params = new URLSearchParams(window.location.search);
  const jobId  = params.get("job_id");

  if (!jobId) {
    list.innerHTML = `
      <div class="empty-state">
        <p>No job selected.</p>
        <span>Go to the dashboard and click "View Applicants" for a specific job.</span>
      </div>`;
    return;
  }

  list.innerHTML = `<p style="color:#64748b;">Loading applicants and computing AI match scores…</p>`;

  try {
    const res  = await fetch(`${API_BASE}/api/applicants/${jobId}`, { headers: authHeaders() });
    const data = await res.json();

    if (!res.ok) {
      list.innerHTML = `<p style="color:#dc2626;">${data.error || "Failed to load applicants."}</p>`;
      return;
    }

    // Update header with job title
    const pageTitle = document.querySelector(".page-header h1");
    const pageSubtitle = document.querySelector(".page-header p");
    if (data.job) {
      if (pageTitle) pageTitle.textContent = `Applicants — ${data.job.title}`;
      if (pageSubtitle) pageSubtitle.textContent = `${data.job.company} · ${data.job.location}`;
    }

    // Also update the section heading if present
    const sectionHeading = document.querySelector(".card h2");
    if (sectionHeading && data.job) {
      sectionHeading.textContent = `${data.job.title} Applicants`;
    }

    if (!data.matches || data.matches.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <p>No applicants yet for this job.</p>
          <span>Candidates who apply and upload their resume will appear here, ranked by AI match score.</span>
        </div>`;
      return;
    }

    list.innerHTML = "";

    data.matches.forEach((candidate, index) => {
      const scoreColor =
        candidate.score >= 75 ? "#16a34a" :
        candidate.score >= 50 ? "#f59e0b" : "#dc2626";

      const topSkills = (candidate.skills || []).slice(0, 4).join(", ") || "N/A";

      const div = document.createElement("div");
      div.className = "applicant-card";
      div.innerHTML = `
        <div class="applicant-info">
          <h3>#${index + 1} · ${escHtml(candidate.name || "Unknown")}</h3>
          <p>Email: ${escHtml(candidate.email || "N/A")}</p>
          <p>Skills: ${escHtml(topSkills)}</p>
        </div>

        <div class="applicant-score">
          <span class="score" style="color:${scoreColor};">${candidate.score}%</span>
          <p>Match Score</p>
        </div>

        <div class="applicant-actions">
          ${candidate.resume_path
            ? `<button class="secondary-btn"
                 onclick="window.open('${API_BASE}/uploads/${encodeURIComponent(candidate.resume_path.split('/').pop())}', '_blank')">
                 View Resume
               </button>`
            : `<button class="secondary-btn" disabled style="opacity:0.5;">No Resume</button>`
          }
        </div>`;

      list.appendChild(div);
    });

  } catch {
    list.innerHTML = `<p>Failed to load applicants. Is the backend running on port 5000?</p>`;
  }
}

// ────────────────────────────────────────────
// UTILITY
// ────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  initHRDashboard();
  loadApplicants();
});
