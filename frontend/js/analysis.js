/**
 * TalentCortex — analysis.js
 * Populates the analysis.html page from the resume data returned by the backend.
 * Also wires the AI feedback button to /api/generate_feedback.
 */

const API_BASE = "http://localhost:5000";

document.addEventListener("DOMContentLoaded", () => {
  const raw = localStorage.getItem("resumeAnalysis");
  const container = document.getElementById("parsedResumeContent");

  // ── No data yet ──────────────────────────────────────────────────────────
  if (!raw || !container) {
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No uploaded resume found.</p>
          <span>Go back to the dashboard and upload a resume to see parsed details here.</span>
        </div>`;
    }
    return;
  }

  const data   = JSON.parse(raw);
  const parsed = data?.parsed_content || {};
  const meta   = data?.contact_info   || {};
  const job    = JSON.parse(localStorage.getItem("selectedJob") || "null");

  // ── Parsed resume preview ─────────────────────────────────────────────────
  container.innerHTML = `
    <div class="parsed-block">
      <h4>Basic Information</h4>
      <ul class="parsed-list">
        <li><strong>Name:</strong>     ${esc(parsed.name     || "—")}</li>
        <li><strong>Email:</strong>    ${esc(meta.email      || "—")}</li>
        <li><strong>Phone:</strong>    ${esc(meta.phone      || "—")}</li>
        <li><strong>LinkedIn:</strong> ${esc(meta.linkedin   || "—")}</li>
        <li><strong>GitHub:</strong>   ${esc(meta.github     || "—")}</li>
      </ul>
    </div>

    <div class="parsed-block">
      <h4>Skills</h4>
      <ul class="parsed-list">
        ${(parsed.skills || []).map(s => `<li>${esc(s)}</li>`).join("") || "<li>None detected</li>"}
      </ul>
    </div>

    <div class="parsed-block">
      <h4>Experience</h4>
      <ul class="parsed-list">
        ${(parsed.experience || []).map(x => `<li>${esc(x)}</li>`).join("") || "<li>None detected</li>"}
      </ul>
    </div>`;

  // ── Match Score (computed from job vs resume skills) ──────────────────────
  if (job) {
    const resumeSkills = (parsed.skills || []).map(s => s.toLowerCase());
    const rawJobSkills = job.skills || [];
    const jobSkills    = Array.isArray(rawJobSkills)
      ? rawJobSkills.map(s => s.toLowerCase())
      : rawJobSkills.split(",").map(s => s.trim().toLowerCase());

    const matched = jobSkills.filter(s => resumeSkills.includes(s));
    const missing = jobSkills.filter(s => !resumeSkills.includes(s));
    const score   = jobSkills.length
      ? Math.round((matched.length / jobSkills.length) * 100)
      : 0;

    // Score circle
    const circle = document.querySelector(".circle");
    if (circle) {
      circle.style.background = `conic-gradient(#3b82f6 ${score}%, #e2e8f0 0%)`;
      const inner = circle.querySelector("span");
      if (inner) inner.textContent = `${score}%`;
    }

    // Skill match / missing mini-stats
    const miniStats = document.querySelectorAll(".mini-stats div strong");
    if (miniStats.length >= 1) miniStats[0].textContent = `${score}%`;

    // Technical skill tags — replace placeholders with real skills
    const tagsEl = document.querySelector(".tags");
    if (tagsEl && parsed.skills?.length) {
      tagsEl.innerHTML = parsed.skills
        .map(s => `<span class="tag">${esc(s)}</span>`)
        .join("");
    }

    // Missing skills — replace placeholder red tags
    const missingSection = document.querySelector(".card .tag.red")?.closest("section");
    if (missingSection && missing.length) {
      const tagContainer = missingSection.querySelector(".tags");
      if (tagContainer) {
        tagContainer.innerHTML = missing
          .map(s => `<span class="tag red">${esc(s)}</span>`)
          .join("");
      }
    }
  }

});

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
