document.addEventListener('DOMContentLoaded', () => {
  const raw = localStorage.getItem('uploadedResume');
  const container = document.getElementById('parsedResumeContent');

  if (!container) return;

  if (!raw) {
    // nothing uploaded
    container.innerHTML = `
      <div class="empty-state">
        <p>No uploaded resume found.</p>
        <span>Go back to the dashboard and upload a resume to see parsed details here.</span>
      </div>
    `;
    return;
  }

  try {
    const data = JSON.parse(raw);

    // Populate preview block
    container.innerHTML = `
      <div class="parsed-block">
        <h4>File</h4>
        <p><strong>File name:</strong> ${data.fileName || '-'}<br>
        <strong>Uploaded:</strong> ${new Date(data.uploadedAt).toLocaleString()}</p>
      </div>

      <div class="parsed-block">
        <h4>Basic Information</h4>
        <ul class="parsed-list">
          <li><strong>Name:</strong> ${data.name || '-'}</li>
          <li><strong>Email:</strong> ${data.email || '-'}</li>
          <li><strong>Phone:</strong> ${data.phone || '-'}</li>
        </ul>
      </div>

      <div class="parsed-block">
        <h4>Skills</h4>
        <ul class="parsed-list">
          ${(data.skills && data.skills.length) ? data.skills.map(s => `<li>${s}</li>`).join('') : '<li>No skills detected</li>'}
        </ul>
      </div>
    `;

    // Also update the Technical Skills tags section if present (first .tags)
    const tagsSection = document.querySelector('.tags');
    if (tagsSection) {
      if (data.skills && data.skills.length) {
        tagsSection.innerHTML = data.skills.map(s => `<span class="tag">${s}</span>`).join('');
      } else {
        // leave existing tags as-is
      }
    }

  } catch (err) {
    console.error('Failed to parse uploadedResume', err);
    container.innerHTML = `<div class="empty-state"><p>Unable to read uploaded resume data.</p></div>`;
  }
});
