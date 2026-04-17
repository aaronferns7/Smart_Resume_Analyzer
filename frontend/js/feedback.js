/**
 * TalentCortex — feedback.js
 * Generates and displays the AI Candidate Feedback.
 */

const API_BASE = "http://localhost:5000";

document.addEventListener("DOMContentLoaded", () => {
  const feedbackBtn = document.getElementById("generateFeedbackBtn");
  const feedbackBody = document.getElementById("feedbackBody");
  const feedbackIntro = document.getElementById("feedbackIntro");

  const rawData = localStorage.getItem("resumeAnalysis");
  const job = JSON.parse(localStorage.getItem("selectedJob") || "null");

  // Load existing feedback if present
  const existingFeedback = localStorage.getItem("aiCandidateFeedback");
  if (existingFeedback) {
    feedbackBtn.textContent = "Regenerate Feedback";
    renderFeedback(existingFeedback);
  }

  if (feedbackBtn) {
    feedbackBtn.addEventListener("click", async () => {
      if (!rawData) {
        alert("No resume data found. Please upload a resume first from your dashboard.");
        return;
      }

      const data = JSON.parse(rawData);

      const originalText = feedbackBtn.textContent;
      feedbackBtn.textContent = "Analyzing...";
      feedbackBtn.disabled = true;
      feedbackBtn.style.opacity = "0.7";
      feedbackBody.innerHTML = "<p class='loader'>Generating your personalized feedback. This might take 15-30 seconds...</p>";
      feedbackIntro.textContent = "We are currently processing your details.";

      try {
        const reqBody = { resume_data: data };
        if (job && job.description) {
          reqBody.job_description = `${job.title} - ${job.description}. Required skills: ${job.skills}`;
        }

        const res = await fetch(`${API_BASE}/api/generate_feedback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem("tc_token") || ""}`
          },
          body: JSON.stringify(reqBody)
        });

        const result = await res.json();

        if (res.ok && result.feedback) {
          localStorage.setItem("aiCandidateFeedback", result.feedback);
          renderFeedback(result.feedback);
          feedbackBtn.textContent = "Regenerate Feedback";
        } else {
          alert(result.error || "Feedback generation failed.");
          feedbackBody.innerHTML = "";
          feedbackBtn.textContent = originalText;
        }
      } catch (err) {
        alert("Server error generating feedback.");
        feedbackBody.innerHTML = "";
        feedbackBtn.textContent = originalText;
      } finally {
        feedbackBtn.disabled = false;
        feedbackBtn.style.opacity = "1";
      }
    });
  }

  const lb = document.getElementById("logoutBtn");
  if (lb) lb.addEventListener("click", e => { e.preventDefault(); logout(); });

  function renderFeedback(feedbackStr) {
    feedbackIntro.textContent = "Here is your AI-generated career feedback:";

    // Formatting markdown to basic HTML
    let formattedHTML = feedbackStr
      .replace(/## \s*(.+)/g, "<h4 style='font-size:18px;color:#0b2540;margin:24px 0 8px;'>$1</h4>")
      .replace(/# \s*(.+)/g, "<h3 style='font-size:20px;color:#0b2540;margin:26px 0 10px;'>$1</h3>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\* \s*(.+)/g, "• $1<br>")
      .replace(/- \s*(.+)/g, "• $1<br>")
      .replace(/\n\n/g, "<br><br>")
      .replace(/\n/g, "<br>");

    feedbackBody.innerHTML = formattedHTML;
  }
});
