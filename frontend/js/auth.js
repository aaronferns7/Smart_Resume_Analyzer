/**
 * TalentCortex — auth.js
 * Handles login, registration, token storage, and logout.
 * Include this script in candidate-login.html and hr-login.html.
 */

const API = "http://localhost:5000";

// ────────────────────────────────────────────
// TOKEN HELPERS
// ────────────────────────────────────────────
function getToken()  { return localStorage.getItem("tc_token") || ""; }
function getUser()   { return JSON.parse(localStorage.getItem("tc_user") || "null"); }
function authHeaders() {
  return {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${getToken()}`
  };
}

function logout() {
  localStorage.removeItem("tc_token");
  localStorage.removeItem("tc_user");
  localStorage.removeItem("resumeAnalysis");
  localStorage.removeItem("selectedJob");
  window.location.href = "../../index.html";
}

/**
 * Call at the top of every protected page.
 * Redirects to login if no token or wrong role.
 */
function requireAuth(role) {
  const user  = getUser();
  const token = getToken();
  if (!user || !token) {
    window.location.href =
      role === "hr"
        ? "../../pages/auth/hr-login.html"
        : "../../pages/auth/candidate-login.html";
    return false;
  }
  if (role && user.role !== role) {
    window.location.href = "../../index.html";
    return false;
  }
  return true;
}

// ────────────────────────────────────────────
// SHOW ERROR in auth card
// ────────────────────────────────────────────
function showAuthError(msg) {
  let el = document.getElementById("authError");
  if (!el) {
    el = document.createElement("p");
    el.id = "authError";
    el.style.cssText = "color:#dc2626; margin-top:12px; font-size:14px; text-align:center;";
    document.querySelector(".auth-card")?.appendChild(el);
  }
  el.textContent = msg;
}

// ────────────────────────────────────────────
// REGISTER
// ────────────────────────────────────────────
async function register(role) {
  const email    = document.querySelector("input[type='email']")?.value?.trim();
  const password = document.querySelector("input[type='password']")?.value?.trim();
  const name     = document.querySelector("input[name='name']")?.value?.trim() || "";

  if (!email || !password) { showAuthError("Email and password are required."); return; }

  try {
    const res  = await fetch(`${API}/api/auth/register`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password, role, name })
    });
    const data = await res.json();

    if (!res.ok) { showAuthError(data.error || "Registration failed."); return; }

    _storeAndRedirect(data, role);
  } catch {
    showAuthError("Server error. Make sure the Flask backend is running on port 5000.");
  }
}

// ────────────────────────────────────────────
// LOGIN
// ────────────────────────────────────────────
async function login(role) {
  const email    = document.querySelector("input[type='email']")?.value?.trim();
  const password = document.querySelector("input[type='password']")?.value?.trim();

  if (!email || !password) { showAuthError("Email and password are required."); return; }

  try {
    const res  = await fetch(`${API}/api/auth/login`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password, role })
    });
    const data = await res.json();

    if (!res.ok) { showAuthError(data.error || "Login failed."); return; }

    _storeAndRedirect(data, role);
  } catch {
    showAuthError("Server error. Make sure the Flask backend is running on port 5000.");
  }
}

function _storeAndRedirect(data, role) {
  localStorage.setItem("tc_token", data.token);
  localStorage.setItem("tc_user",  JSON.stringify({
    role:  data.role,
    name:  data.name,
    email: data.email || ""
  }));

  if (role === "candidate") {
    window.location.href = "../Candidate/jobs.html";
  } else {
    window.location.href = "../hr/dashboard.html";
  }
}

// ────────────────────────────────────────────
// AUTO-WIRE logout buttons + show avatar initial
// ────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Wire every logout button
  document.querySelectorAll("a.logout-btn, a.logout").forEach(btn => {
    if (btn.href?.includes("index")) {
      btn.addEventListener("click", (e) => { e.preventDefault(); logout(); });
    }
  });

  // Show first letter of user name in avatar
  const user   = getUser();
  const avatar = document.querySelector(".avatar");
  if (user && avatar) {
    avatar.textContent = (user.name || user.email || "U")[0].toUpperCase();
  }
});
