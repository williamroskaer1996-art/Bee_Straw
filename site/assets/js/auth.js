// Accounts: Google or email sign-in through Supabase.
// Without supabaseUrl/supabaseAnonKey in config.js the site runs in preview mode:
// sign-in shows a notice and nothing is saved.
(function () {
  "use strict";
  const CFG = window.BEESTRAW_CONFIG || {};
  const listeners = [];
  const auth = {
    enabled: !!(CFG.supabaseUrl && CFG.supabaseAnonKey),
    client: null,
    user: null,
    onChange: function (cb) { listeners.push(cb); cb(auth.user); },
    signInGoogle: function () {
      if (!auth.client) return Promise.reject(new Error("preview"));
      return auth.client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: returnUrl() } });
    },
    signInEmail: function (email) {
      if (!auth.client) return Promise.reject(new Error("preview"));
      return auth.client.auth.signInWithOtp({ email: email, options: { emailRedirectTo: returnUrl() } }).then(function (r) { if (r.error) throw r.error; return r; });
    },
    signOut: function () { return auth.client ? auth.client.auth.signOut() : Promise.resolve(); },
    // Run `action` now if signed in; otherwise ask the visitor to sign in first and run it afterwards.
    require: function (why, action) {
      if (auth.user) { action(auth.user); return; }
      pending = action;
      openDialog(why);
    }
  };
  window.BeeAuth = auth;

  let pending = null;
  function returnUrl() { return location.origin + location.pathname + (location.hash || ""); }
  function emit() { listeners.forEach(function (cb) { cb(auth.user); }); }

  // ---------- Dialog
  const dlg = document.getElementById("signin");
  const status = dlg.querySelector("#signin-status");
  function openDialog(why) {
    dlg.querySelector("#signin-why").textContent = why || "Sign in to download your straw and post in Community.";
    status.textContent = auth.enabled ? "Free. We only use your email to sign you in." : "Preview: accounts are not switched on yet, so nothing is saved.";
    dlg.showModal();
  }
  auth.openDialog = openDialog;
  dlg.querySelector("[data-close]").addEventListener("click", function () { pending = null; dlg.close(); });
  dlg.querySelector("#google").addEventListener("click", function () {
    if (!auth.enabled) { status.textContent = "Google sign-in isn't switched on yet. This is a preview."; return; }
    try { sessionStorage.setItem("beestraw-return", location.hash); } catch (e) { /* storage blocked */ }
    auth.signInGoogle().catch(function (e) { status.textContent = "Couldn't start Google sign-in: " + e.message; });
  });
  dlg.querySelector("form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!auth.enabled) { status.textContent = "Email sign-in isn't switched on yet. This is a preview."; return; }
    const email = dlg.querySelector("#email").value.trim();
    status.textContent = "Sending…";
    auth.signInEmail(email)
      .then(function () { status.textContent = "Check your inbox: we sent a sign-in link to " + email + "."; })
      .catch(function (err) { status.textContent = "Couldn't send the link: " + err.message; });
  });

  // ---------- Header button
  const headerBtn = document.querySelector(".signin-btn");
  function paintHeader(user) {
    if (!headerBtn) return;
    headerBtn.textContent = user ? "Sign out" : "Sign in";
    headerBtn.setAttribute("aria-label", user ? "Sign out " + (user.email || "") : "Sign in");
  }
  if (headerBtn) headerBtn.addEventListener("click", function () {
    if (auth.user) auth.signOut(); else openDialog("");
  });

  // Buttons that need an account: data-signin="reason" data-action="name" (actions registered by other scripts).
  auth.actions = {};
  document.addEventListener("click", function (e) {
    const b = e.target.closest("[data-signin]");
    if (!b || b === headerBtn) return;
    const act = auth.actions[b.getAttribute("data-action")] || function () {};
    auth.require(b.getAttribute("data-signin"), act);
  });

  // ---------- Start
  auth.onChange(paintHeader);
  if (!auth.enabled) return;
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
  s.onload = function () {
    auth.client = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
    auth.client.auth.getSession().then(function (r) { auth.user = r.data.session ? r.data.session.user : null; emit(); });
    auth.client.auth.onAuthStateChange(function (_event, session) {
      auth.user = session ? session.user : null;
      emit();
      if (auth.user && dlg.open) dlg.close();
      if (auth.user && pending) { const a = pending; pending = null; a(auth.user); }
    });
  };
  s.onerror = function () { auth.enabled = false; };
  document.head.appendChild(s);
})();
