/**
 * Candidate Frontend Script
 * Backend will handle resume processing
 */

document.addEventListener("DOMContentLoaded", () => {
  console.log("Candidate dashboard loaded");

  const fileInput = document.querySelector('input[type="file"]');
  const analyzeBtn = document.querySelector(".primary-btn");
  const parsedContainer = document.getElementById("parsedData");

  // Disable analyze button initially
  if (analyzeBtn) {
    analyzeBtn.style.pointerEvents = "none";
    analyzeBtn.style.opacity = "0.6";
  }

  // ===============================
  // FILE SELECTION HANDLING
  // ===============================
  if (fileInput) {
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
