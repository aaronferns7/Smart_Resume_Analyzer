/**
 * HR Frontend Script
 * UI only – backend will integrate logic
 */

document.addEventListener("DOMContentLoaded", () => {
  console.log("HR UI loaded");

  const applyFilterBtn = document.getElementById("applyFilterBtn");

  if (applyFilterBtn) {
    applyFilterBtn.addEventListener("click", () => {
      const type = document.getElementById("filterType").value;
      const count = document.getElementById("candidateCount").value;

      console.log(`Requested ${type} ${count} candidates`);
      // Backend will filter and inject data
    });
  }
});
