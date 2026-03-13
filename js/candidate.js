/**
 * Candidate Frontend Script
 * Backend will handle resume processing
 */

document.addEventListener("DOMContentLoaded", () => {
  console.log("Candidate dashboard loaded");

  const fileInput = document.querySelector('input[type="file"]');
  const analyzeBtn = fileInput ? document.querySelector(".upload-controls .primary-btn") : null;
  const parsedContainer = document.getElementById("parsedData");

  // Disable analyze button initially (only on the dashboard where file upload exists)
  if (analyzeBtn) {
    analyzeBtn.style.pointerEvents = "none";
    analyzeBtn.style.opacity = "0.6";
  }

  // ===============================
  // FILE SELECTION HANDLING
  // ===============================
  if (fileInput && analyzeBtn) {
    fileInput.addEventListener("change", () => {

      if (fileInput.files.length > 0) {
        console.log("File selected:", fileInput.files[0].name);

        // Enable Analyze button
        if (analyzeBtn) {
          analyzeBtn.style.pointerEvents = "auto";
          analyzeBtn.style.opacity = "1";
        }
      }
    });
  }

  // ===============================
  // ANALYZE BUTTON CLICK
  // ===============================
  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", (e) => {
      e.preventDefault();

      if (!fileInput || fileInput.files.length === 0) {
        alert("Please upload a resume first.");
        return;
      }
      console.log("Preparing resume for analysis...");

      // disable button and show loading state
      analyzeBtn.style.pointerEvents = "none";
      analyzeBtn.style.opacity = "0.7";
      const originalText = analyzeBtn.textContent;
      analyzeBtn.textContent = "Analyzing...";

      const file = fileInput.files[0];

      // simple helpers
      function deriveName(filename) {
        const base = filename.replace(/\.[^/.]+$/, "");
        return base.replace(/[-_\.]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      }

      function extractSkillsFromName(filename) {
        const lower = filename.toLowerCase();
        const keywords = ['javascript','react','python','node','sql','docker','aws','typescript','java','c++','c#'];
        return keywords.filter(k => lower.includes(k));
      }

      const reader = new FileReader();
      reader.onerror = () => {
        alert('Failed to read file. Try again.');
        analyzeBtn.style.pointerEvents = "auto";
        analyzeBtn.style.opacity = "1";
        analyzeBtn.textContent = originalText;
      };

      reader.onload = () => {
        try {
          // store a minimal parsed object in localStorage for the analysis page
          const parsed = {
            name: deriveName(file.name),
            email: '',
            phone: '',
            skills: extractSkillsFromName(file.name),
            experience: [],
            education: [],
            uploadedAt: new Date().toISOString(),
            fileName: file.name,
            fileDataUrl: reader.result
          };

          localStorage.setItem('uploadedResume', JSON.stringify(parsed));

          const targetHref = analyzeBtn.getAttribute('href') || analyzeBtn.href;
          if (targetHref) {
            window.location.href = targetHref;
          } else {
            // fallback: reset button
            analyzeBtn.style.pointerEvents = "auto";
            analyzeBtn.style.opacity = "1";
            analyzeBtn.textContent = originalText;
          }
        } catch (err) {
          console.error(err);
          alert('Unexpected error preparing resume.');
          analyzeBtn.style.pointerEvents = "auto";
          analyzeBtn.style.opacity = "1";
          analyzeBtn.textContent = originalText;
        }
      };

      // read as DataURL so file can be previewed or sent later
      reader.readAsDataURL(file);
    });
  }

  // ===============================
  // RENDER PARSED DATA FUNCTION
  // ===============================
  function renderParsedData(data) {

    if (!parsedContainer) return;

    parsedContainer.innerHTML = `
      <div class="parsed-block">
        <h4>Basic Information</h4>
        <ul class="parsed-list">
          <li><strong>Name:</strong> ${data.name || "-"}</li>
          <li><strong>Email:</strong> ${data.email || "-"}</li>
          <li><strong>Phone:</strong> ${data.phone || "-"}</li>
        </ul>
      </div>

      <div class="parsed-block">
        <h4>Skills</h4>
        <ul class="parsed-list">
          ${(data.skills || []).map(skill => `<li>${skill}</li>`).join("")}
        </ul>
      </div>

      <div class="parsed-block">
        <h4>Experience</h4>
        <ul class="parsed-list">
          ${(data.experience || []).map(exp => `<li>${exp}</li>`).join("")}
        </ul>
      </div>

      <div class="parsed-block">
        <h4>Education</h4>
        <ul class="parsed-list">
          ${(data.education || []).map(edu => `<li>${edu}</li>`).join("")}
        </ul>
      </div>
    `;
  }

});

  // ===============================
  // CANDIDATE PREFERENCES HANDLING
  // ===============================

  const savePreferencesBtn = document.getElementById("savePreferencesBtn");
  const preferenceForm = document.getElementById("preferenceForm");

  if (savePreferencesBtn && preferenceForm) {

    // Load previously saved preferences (if any)
    const savedPreferences = localStorage.getItem("candidatePreferences");

    if (savedPreferences) {
      const parsedPrefs = JSON.parse(savedPreferences);

      Object.keys(parsedPrefs).forEach(key => {
        const field = preferenceForm.querySelector(`[name="${key}"]`);
        if (field) field.value = parsedPrefs[key];
      });
    }

    // Save Preferences
    savePreferencesBtn.addEventListener("click", () => {

      const formData = new FormData(preferenceForm);

      const preferences = {
        workMode: formData.get("workMode"),
        nightShift: formData.get("nightShift"),
        relocate: formData.get("relocate"),
        workingHours: formData.get("workingHours"),
        workLifeBalance: formData.get("workLifeBalance"),
        savedAt: new Date().toISOString()
      };

      console.log("Saved Preferences:", preferences);

      localStorage.setItem("candidatePreferences", JSON.stringify(preferences));

      alert("Preferences saved successfully!");
    });
  }

  // ===============================
  // JOB APPLICATION + MATCHING LOGIC
  // ===============================
  document.addEventListener("DOMContentLoaded", () => {
    // When clicking "Apply" on jobs page, store chosen job and then navigate to dashboard.
    const applyButtons = document.querySelectorAll(".apply-btn");
    applyButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const title = btn.dataset.title || "";
        const skills = (btn.dataset.skills || "")
          .split(",")
          .map(s => s.trim())
          .filter(Boolean);

        const selection = {
          title,
          skills,
          appliedAt: new Date().toISOString()
        };

        localStorage.setItem("selectedJob", JSON.stringify(selection));
      });
    });

    // Update dashboard stats when arriving from a job application.
    const resume = JSON.parse(localStorage.getItem("uploadedResume") || "null");
    const job = JSON.parse(localStorage.getItem("selectedJob") || "null");

    const matchScoreEl = document.getElementById("matchScore");
    const skillsMatchedEl = document.getElementById("skillsMatched");
    const skillsMissingEl = document.getElementById("skillsMissing");
    const appliedJobTitleEl = document.getElementById("appliedJobTitle");

    // Update applied job label (if present)
    if (job && appliedJobTitleEl) {
      appliedJobTitleEl.textContent = job.title || "Applied Job";
    }

    // If we have both a resume + selected job, calculate a simple skill match score.
    if (resume && job && matchScoreEl && skillsMatchedEl && skillsMissingEl) {
      const resumeSkills = (resume.skills || []).map(s => s.toLowerCase());
      const requiredSkills = (job.skills || []).map(s => s.toLowerCase());

      const matched = requiredSkills.filter(skill => resumeSkills.includes(skill));
      const missing = requiredSkills.filter(skill => !resumeSkills.includes(skill));

      const score = requiredSkills.length
        ? Math.round((matched.length / requiredSkills.length) * 100)
        : 0;

      matchScoreEl.textContent = `${score}%`;
      skillsMatchedEl.textContent = matched.length;
      skillsMissingEl.textContent = missing.length;
    } else if (job && matchScoreEl && skillsMatchedEl && skillsMissingEl) {
      // Show a hint if the user hasn't uploaded a resume yet.
      matchScoreEl.textContent = "--";
      skillsMatchedEl.textContent = "--";
      skillsMissingEl.textContent = "--";
    }
  });

  // ===============================
// JOB DETAILS MODAL LOGIC
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("jobModal");
  if (!modal) return; // Only run on pages with modal

  const closeBtn = modal.querySelector(".close");

  // Handle View Details clicks
  document.querySelectorAll(".secondary-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const jobCard = btn.closest(".job-card");
      if (jobCard) {
        const title = jobCard.querySelector("h3").textContent;
        const company = jobCard.querySelector(".company").textContent;
        const location = jobCard.querySelector(".location").textContent;
        const type = jobCard.querySelector(".job-type").textContent;
        const skills = Array.from(jobCard.querySelectorAll(".skills span")).map(span => span.textContent).join(", ");
        const description = jobCard.dataset.description || "No description available.";

        modal.querySelector("#modalTitle").textContent = title;
        modal.querySelector("#modalCompany").textContent = company;
        modal.querySelector("#modalLocation").textContent = location;
        modal.querySelector("#modalType").textContent = type;
        modal.querySelector("#modalSkills").textContent = skills;
        modal.querySelector("#modalDescription").textContent = description;

        modal.style.display = "block";
      }
    });
  });

  // Close modal when clicking the close button
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  // Close modal when clicking outside the modal content
  window.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.style.display = "none";
    }
  });
});

