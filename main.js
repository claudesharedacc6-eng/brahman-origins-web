/* ==========================================================================
   BRAHMAN ORIGINS: Player Portal, Game Launcher & Admin Console (main.js)
   University of Batangas · Capstone Companion Site

   One script for every page. Each page says what it is with
   <body data-page="home | guidelines | login | student | play | admin">.

   Database tables used (the shared Supabase project):
     profiles      id (= login id), role ('student' | 'admin'), display_name
     portal_students()  admin-only list of everyone who signed in (from the logins themselves)
     tickets       bug reports, feedback and inquiries (tag = 'Inquiry')
     Campus progress + leaderboards: one entry per campus in config.js (CAMPUSES).
       UB Lipa: lipa_progress (written by the game) and lipa_leaderboard(max_rows).
       Other campuses show "Coming soon" until their group adds a leaderboard / progress.

   No passwords or secret keys belong in this file: it is public on GitHub.
   ========================================================================== */
(function () {
  "use strict";

  const cfg = window.BO_CONFIG || {};
  const GUEST_KEY = "brahman_guest";

  const sb = (window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_KEY)
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  /* ------------------------------------------------------------------------
     SMALL HELPERS
     ------------------------------------------------------------------------ */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Escape text before it goes into innerHTML. Ticket titles, names and messages
  // are typed by players, so they must never be treated as HTML.
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function isUbMail(email) {
    const domain = String(cfg.ALLOWED_DOMAIN || "ub.edu.ph").toLowerCase();
    return !!email && email.toLowerCase().endsWith("@" + domain);
  }

  function displayName(user) {
    const m = (user && user.user_metadata) || {};
    return m.full_name || m.name || (user && user.email ? user.email.split("@")[0] : "UBian");
  }

  function initialsOf(name) {
    return String(name || "UB").trim().split(/\s+/).map((p) => p[0] || "").join("").toUpperCase().slice(0, 2) || "UB";
  }

  function timeSince(dateValue) {
    if (!dateValue) return "Recently";
    const secs = Math.floor((Date.now() - new Date(dateValue).getTime()) / 1000);
    if (secs < 60) return "just now";
    if (secs < 3600) return Math.floor(secs / 60) + " min ago";
    if (secs < 86400) return Math.floor(secs / 3600) + " hr ago";
    const days = Math.floor(secs / 86400);
    return days === 1 ? "yesterday" : days + " days ago";
  }

  function pageUrl(file) {
    return window.location.origin + window.location.pathname.replace(/[^/]*$/, "") + file;
  }

  function nextParam(fallback) {
    const next = new URLSearchParams(window.location.search).get("next") || "";
    // Only allow pages of this site, e.g. "play.html".
    return /^[a-z]+\.html$/.test(next) ? next : fallback;
  }

  let toastTimer = null;
  function showToast(message, type) {
    let toast = $(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      toast.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="toast-msg"></span>';
      document.body.appendChild(toast);
    }
    $(".toast-msg", toast).textContent = message;
    toast.classList.toggle("is-error", type === "error");
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("show")));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3800);
  }

  function setLoading(btn, loading, label) {
    if (!btn) return;
    btn.disabled = loading;
    if (label) btn.textContent = label;
  }

  function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
  }
  function closeModal(m) {
    if (!m) return;
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
  }
  function initModals() {
    $$(".modal").forEach((m) => {
      m.addEventListener("click", (e) => { if (e.target === m || e.target.closest("[data-close]")) closeModal(m); });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") $$(".modal.open").forEach(closeModal);
    });
  }

  // UB Lipa chapters: 1 = Grade 7 ... 10 = 4th Year, 11 = graduated (same as the game).
  const LIPA_LEVELS = ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12",
                       "1st Year College", "2nd Year College", "3rd Year College", "4th Year College"];
  function lipaLevel(chapter) {
    const c = Number(chapter) || 1;
    if (c >= 11) return "Graduated";
    return LIPA_LEVELS[Math.max(1, c) - 1];
  }
  function lipaStage(chapter) {
    const c = Number(chapter) || 1;
    if (c >= 11) return "Graduated";
    if (c >= 7) return "College";
    if (c >= 5) return "Senior High";
    return "Junior High";
  }

  /* ------------------------------------------------------------------------
     CAMPUSES: the four UB campuses, from config.js
     ------------------------------------------------------------------------ */
  const CAMPUSES = (cfg.CAMPUSES && cfg.CAMPUSES.length) ? cfg.CAMPUSES : [
    { key: "elementary", name: "UB Elementary", leaderboard: "", progress: "" },
    { key: "main", name: "UB Main", leaderboard: "", progress: "" },
    { key: "millennium", name: "UB Millennium", leaderboard: "", progress: "" },
    { key: "lipa", name: "UB Lipa", leaderboard: "lipa_leaderboard", progress: "lipa" }
  ];

  // How the website reads each campus's game progress. Add one entry per campus as groups connect theirs.
  const PROGRESS_SOURCES = {
    lipa: {
      async loadMine(userId) {
        const { data } = await sb.from("lipa_progress").select("*").eq("user_id", userId).maybeSingle();
        return data;
      },
      async loadAll() {
        return sb.from("lipa_progress").select("user_id,player_name,current_chapter,xp_total,updated_at");
      },
      level: (row) => lipaLevel(row.current_chapter),
      stage: (row) => lipaStage(row.current_chapter),
      graduated: (row) => (Number(row.current_chapter) || 1) >= 11,
      renderMine: renderLipaProgress
    }
  };
  const sourceFor = (campus) => (campus && campus.progress && PROGRESS_SOURCES[campus.progress]) || null;

  // A row of campus tabs. onSelect(campus) runs on click and once for the first tab shown.
  function campusTabs(container, onSelect, startKey) {
    if (!container) return;
    container.innerHTML = CAMPUSES.map((c) =>
      `<button type="button" class="campus-tab" role="tab" data-campus="${esc(c.key)}">${esc(c.name)}</button>`).join("");
    const select = (key) => {
      const campus = CAMPUSES.find((c) => c.key === key) || CAMPUSES[0];
      $$(".campus-tab", container).forEach((b) => {
        const on = b.getAttribute("data-campus") === campus.key;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", String(on));
      });
      onSelect(campus);
    };
    container.addEventListener("click", (e) => {
      const b = e.target.closest(".campus-tab");
      if (b) select(b.getAttribute("data-campus"));
    });
    select(startKey || (CAMPUSES.find((c) => c.leaderboard || c.progress) || CAMPUSES[0]).key);
  }

  function comingSoon(campus, what) {
    return `<div class="coming-soon"><strong>${esc(campus.name)}</strong><span>${esc(what)} coming soon.</span></div>`;
  }

  /* ------------------------------------------------------------------------
     WHO IS HERE?  (student, admin, guest or nobody)
     ------------------------------------------------------------------------ */
  let statePromise = null;
  function getState() {
    if (!statePromise) statePromise = loadState();
    return statePromise;
  }

  async function loadState() {
    let session = null;
    if (sb) {
      try { session = (await sb.auth.getSession()).data.session; } catch (e) { /* offline */ }
    }

    let role = null;
    if (session) {
      try {
        const { data } = await sb.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
        role = data ? data.role : null;
      } catch (e) { /* no profile row yet */ }
    }

    // Tester accounts (listed in portal_testers by the project owner): play like a student,
    // but the game gets no login token, so nothing is saved online.
    let isTester = false;
    if (session && role !== "admin") {
      try {
        const { data } = await sb.from("portal_testers").select("user_id").eq("user_id", session.user.id).maybeSingle();
        isTester = !!data;
      } catch (e) { /* table not created yet: nobody is a tester */ }
    }

    const email = session ? (session.user.email || "") : "";
    const isAdmin = role === "admin";
    const isStudent = !!session && !isAdmin && (isUbMail(email) || isTester);
    const isGuest = !session && sessionStorage.getItem(GUEST_KEY) === "1";

    return {
      session,
      user: session ? session.user : null,
      email,
      isAdmin,
      isStudent,
      isTester,
      isGuest,
      canPlay: isStudent || isGuest || isAdmin,
      name: session ? displayName(session.user) : (isGuest ? "Guest" : "")
    };
  }

  async function signOutEverywhere(target) {
    sessionStorage.removeItem(GUEST_KEY);
    if (sb) { try { await sb.auth.signOut(); } catch (e) { /* best effort */ } }
    window.location.href = target || "login.html";
  }

  /* ------------------------------------------------------------------------
     HEADER NAV (every page with the public header)
     ------------------------------------------------------------------------ */
  function renderNav(state) {
    $$("[data-show]").forEach((el) => {
      const need = el.getAttribute("data-show");
      const show =
        (need === "play" && state.canPlay) ||
        (need === "student" && state.isStudent) ||
        (need === "admin" && state.isAdmin) ||
        (need === "anon" && !state.session && !state.isGuest) ||
        (need === "user" && (state.session || state.isGuest));
      el.classList.toggle("is-visible", !!show);
    });

    const avatar = $("#nav-avatar");
    const uname = $("#nav-username");
    if (avatar) avatar.textContent = state.isGuest ? "G" : initialsOf(state.name);
    if (uname) uname.textContent = state.isGuest ? "Guest" : (state.name || "").split(" ")[0] + (state.isTester ? " · Tester" : "");

    $$("[data-logout]").forEach((btn) => btn.addEventListener("click", () => signOutEverywhere("login.html")));
  }

  function initMobileNav() {
    const toggle = $(".nav-toggle");
    if (!toggle) return;
    const setOpen = (open) => {
      document.body.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };
    toggle.addEventListener("click", () => setOpen(!document.body.classList.contains("nav-open")));
    $$(".nav-links a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
  }

  /* ------------------------------------------------------------------------
     LEADERBOARD (home + student pages): read-only, names and points only
     ------------------------------------------------------------------------ */
  async function renderLeaderboard(listEl, campus, maxRows, highlightName) {
    if (!listEl) return;
    if (!campus.leaderboard) { listEl.innerHTML = `<li class="lb-empty">The ${esc(campus.name)} leaderboard is coming soon.</li>`; return; }
    if (!sb) { listEl.innerHTML = '<li class="lb-empty">Leaderboard unavailable.</li>'; return; }
    listEl.innerHTML = '<li class="lb-empty">Loading…</li>';
    const { data, error } = await sb.rpc(campus.leaderboard, { max_rows: maxRows });
    if (error) { listEl.innerHTML = '<li class="lb-empty">Leaderboard unavailable right now.</li>'; return; }
    if (!data || !data.length) {
      listEl.innerHTML = `<li class="lb-empty">No scores at ${esc(campus.name)} yet. Be the first Brahman on the board!</li>`;
      return;
    }
    listEl.innerHTML = data.map((r) => {
      const me = highlightName && r.player_name === highlightName;
      return `<li class="lb-row${r.rank <= 3 ? " top" + r.rank : ""}${me ? " is-me" : ""}">
          <span class="lb-rank">${esc(r.rank)}</span>
          <span class="lb-name">${esc(r.player_name)}${me ? ' <em>(you)</em>' : ""}</span>
          <span class="lb-level">${esc(r.level)}</span>
          <span class="lb-points">${Number(r.points || 0).toLocaleString()} XP</span>
        </li>`;
    }).join("");
  }

  /* ------------------------------------------------------------------------
     PAGE: HOME
     ------------------------------------------------------------------------ */
  function initHome(state) {
    const actions = $("#hero-actions");
    const welcome = $("#hero-welcome");
    if (actions) {
      if (state.isStudent) {
        actions.innerHTML = `
          <a href="play.html" class="btn btn-primary">Play the Game</a>
          <a href="student.html" class="btn btn-outline">My Progress</a>`;
      } else if (state.isAdmin) {
        actions.innerHTML = `
          <a href="admin.html" class="btn btn-primary">Open Admin Console</a>
          <a href="play.html" class="btn btn-outline">Test the Game</a>`;
      } else if (state.isGuest) {
        actions.innerHTML = `
          <a href="play.html" class="btn btn-primary">Tour as Guest</a>
          <a href="login.html" class="btn btn-outline">Sign in with UB Mail</a>
          <p class="hero-note">Guests can explore the campuses. Sign in with your UB Mail to play the minigames and save progress.</p>`;
      } else {
        actions.innerHTML = `
          <a href="login.html" class="btn btn-primary">Login to Play</a>
          <button type="button" class="btn btn-outline" id="hero-guest">Continue as Guest</button>
          <p class="hero-note">Students sign in with their official @ub.edu.ph account.</p>`;
        const g = $("#hero-guest");
        if (g) g.addEventListener("click", () => { sessionStorage.setItem(GUEST_KEY, "1"); window.location.href = "play.html"; });
      }
    }
    if (welcome && (state.session || state.isGuest)) {
      welcome.textContent = state.isGuest
        ? "Welcome, Guest! 👋"
        : `Welcome back, ${state.isAdmin || state.isTester ? "" : "UBian "}${(state.name || "").split(" ")[0]}! 👋`;
      welcome.hidden = false;
    }
    campusTabs($("#home-board-tabs"), (campus) => renderLeaderboard($("#home-leaderboard"), campus, 5));
  }

  /* ------------------------------------------------------------------------
     PAGE: LOGIN
     ------------------------------------------------------------------------ */
  async function routeSignedIn(state) {
    if (state.isAdmin) { window.location.replace(nextParam("admin.html")); return true; }
    if (state.isStudent) {
      window.location.replace(nextParam("student.html"));
      return true;
    }
    return false;
  }

  async function initLogin(state) {
    const googleErr = $("#google-login-error");
    const showGoogleError = (msg) => { if (googleErr) { googleErr.textContent = msg; googleErr.classList.add("show"); } };

    // Coming back from Google with an error (for example: cancelled).
    const params = new URLSearchParams(window.location.search + "&" + window.location.hash.replace(/^#/, ""));
    if (params.get("error_description")) showGoogleError(params.get("error_description").replace(/\+/g, " "));

    if (!sb) showGoogleError("The website isn't connected to Supabase. Check config.js.");

    if (state.session) {
      if (await routeSignedIn(state)) return;
      // Signed in, but neither a UB Mail student nor an admin.
      const email = state.email;
      sessionStorage.removeItem(GUEST_KEY);
      try { await sb.auth.signOut(); } catch (e) { /* ignore */ }
      showGoogleError(`${email} can't play as a student. Use your @${cfg.ALLOWED_DOMAIN} account, or continue as a guest.`);
    }

    const googleBtn = $("#google-btn");
    if (googleBtn) {
      googleBtn.addEventListener("click", async () => {
        if (!sb) return;
        googleBtn.disabled = true;
        const next = nextParam("");
        const { error } = await sb.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: pageUrl("login.html") + (next ? "?next=" + encodeURIComponent(next) : ""),
            queryParams: { hd: cfg.ALLOWED_DOMAIN, prompt: "select_account" }
          }
        });
        if (error) { googleBtn.disabled = false; showGoogleError(error.message); }
      });
    }

    // Staff / admin accounts (email + password).
    const form = $("#login-form");
    if (form) {
      const emailInput = $("#email", form);
      const passInput = $("#password", form);
      const err = $("#email-error", form);
      const submit = $("[type=submit]", form);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (err) err.classList.remove("show");
        const email = emailInput.value.trim().toLowerCase();
        const password = passInput.value;
        if (!email || !password) {
          err.textContent = "Enter your email and password.";
          err.classList.add("show");
          return;
        }
        if (!sb) return;
        setLoading(submit, true, "Signing in…");
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) {
          setLoading(submit, false, "Sign in");
          err.textContent = "Incorrect email or password.";
          err.classList.add("show");
          return;
        }
        statePromise = null;
        const fresh = await getState();
        if (await routeSignedIn(fresh)) return;
        setLoading(submit, false, "Sign in");
        await sb.auth.signOut();
        err.textContent = "This account isn't an admin or tester account. Students: use the UB Mail button above.";
        err.classList.add("show");
      });
    }

    const guestBtn = $("#guest-btn");
    if (guestBtn) {
      guestBtn.addEventListener("click", () => {
        sessionStorage.setItem(GUEST_KEY, "1");
        window.location.href = nextParam("index.html");
      });
    }
  }

  // UB Lipa: Grade 7 to 4th Year College, 10 minigames.
  function renderLipaProgress(lipa, campus) {
    if (!lipa) {
      return `<p class="muted">You haven't started ${esc(campus.name)} yet. Press <strong>Play the Game</strong>, choose ${esc(campus.name)} in Campus Selection, and talk to Brahmmy at the main gate.</p>`;
    }
    const chapter = Number(lipa.current_chapter) || 1;
    const done = Math.min(10, Math.max(0, chapter - 1));
    const pct = Math.round((done / 10) * 100);
    const character = lipa.character_number === 1 ? "Boy" : lipa.character_number === 2 ? "Girl" : "Not chosen yet";
    const order = ["Junior High", "Senior High", "College", "Graduated"];
    const cur = order.indexOf(lipaStage(chapter));
    return `
      <div class="progress-head">
        <div>
          <span class="metric-label">Current level</span>
          <strong class="progress-level">${esc(lipaLevel(chapter))}</strong>
          <span class="stage-pill">${esc(lipaStage(chapter))}</span>
        </div>
        <div class="text-right">
          <span class="metric-label">XP</span>
          <strong class="progress-level">${Number(lipa.xp_total || 0).toLocaleString()}</strong>
        </div>
      </div>
      <div class="xp-labels"><span class="xp-title">Minigames completed</span><span class="xp-value">${done} / 10</span></div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      <ul class="stage-track">
        ${order.map((st, idx) => `<li class="${idx < cur ? "done" : idx === cur ? "current" : ""}">${st}</li>`).join("")}
      </ul>
      <p class="muted small">Character: ${esc(character)} · Last played ${esc(timeSince(lipa.updated_at))}</p>
      ${chapter >= 11 ? '<div class="award-banner">🏅 Loyalty Award earned. Congratulations, Brahman!</div>' : ""}`;
  }

  /* ------------------------------------------------------------------------
     PAGE: STUDENT (My Progress)
     ------------------------------------------------------------------------ */
  async function initStudent(state) {
    if (state.isAdmin) { window.location.replace("admin.html"); return; }
    if (!state.isStudent) { window.location.replace("login.html?next=student.html"); return; }

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const user = state.user;
    const fullName = state.name;
    set("student-first-name", fullName.split(" ")[0]);
    set("student-full-name", fullName);
    set("student-email", state.email);
    set("student-course", state.isTester ? "Tester account" : "UB Student");
    if (state.isTester) {
      const pill = $(".status-pill-online");
      if (pill) pill.innerHTML = '<span class="dot-live"></span> Signed in as a tester';
      const main = $("#main");
      if (main) main.insertAdjacentHTML("afterbegin",
        `<div class="tester-banner"><strong>Tester account.</strong> You can play every minigame and skip them, but nothing is saved online, so your progress here stays empty and you're never on a leaderboard.</div>`);
    }
    $$(".js-initials").forEach((el) => { el.textContent = initialsOf(fullName); });

    // Game progress for every campus that's connected (UB Lipa today).
    const mine = {};
    for (const campus of CAMPUSES) {
      const src = sourceFor(campus);
      if (!src) continue;
      try { mine[campus.key] = await src.loadMine(user.id); } catch (e) { mine[campus.key] = null; }
    }

    // Start on a campus where this student has progress, otherwise the first connected one.
    const started = CAMPUSES.find((c) => mine[c.key]);
    const startKey = started ? started.key : null;

    campusTabs($("#progress-tabs"), (campus) => {
      const box = $("#campus-progress");
      if (!box) return;
      const src = sourceFor(campus);
      if (!src) { box.innerHTML = comingSoon(campus, "Progress for this campus is"); return; }
      box.innerHTML = src.renderMine(mine[campus.key], campus);
    }, startKey);

    campusTabs($("#student-board-tabs"), (campus) => {
      const row = mine[campus.key];
      renderLeaderboard($("#student-leaderboard"), campus, 10, row ? row.player_name : null);
    }, startKey);

    loadMyTickets(user.id);
    initReportForms(state);
  }

  // Reports are linked to the login (tickets.user_id, filled in by Supabase).
  async function loadMyTickets(userId) {
    const list = $("#my-tickets");
    if (!list || !sb || !userId) { if (list) list.innerHTML = '<li class="muted small">No reports yet.</li>'; return; }
    const { data, error } = await sb.from("tickets").select("id,title,tag,status,created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(6);
    if (error || !data || !data.length) { list.innerHTML = '<li class="muted small">No reports yet.</li>'; return; }
    list.innerHTML = data.map((t) => `
      <li class="quest-item">
        <div class="quest-info">
          <span class="quest-title">${esc(t.title)}</span>
          <span class="quest-desc">${esc(t.tag)} · ${esc(timeSince(t.created_at))}</span>
        </div>
        <span class="status-pill ${t.status === "open" ? "status-open" : "status-active"}">${t.status === "open" ? "Open" : "Resolved"}</span>
      </li>`).join("");
  }

  function initReportForms(state) {
    const base = { user_name: state.name, status: "open" }; // user_id is filled in by Supabase

    const report = $("#form-report");
    if (report) {
      report.addEventListener("submit", async (e) => {
        e.preventDefault();
        const title = $("#rep-title", report).value.trim();
        const description = $("#rep-desc", report).value.trim();
        const tag = $("#rep-tag", report).value;
        if (!title) { showToast("Give your report a short title.", "error"); return; }
        const btn = $("[type=submit]", report);
        setLoading(btn, true, "Sending…");
        const { error } = await sb.from("tickets").insert(Object.assign({}, base, { title, description, tag }));
        setLoading(btn, false, "Send report");
        if (error) { console.error(error); showToast("Couldn't send the report. Please try again.", "error"); return; }
        report.reset();
        closeModal($("#modal-report"));
        showToast("Report sent! The team will review it.");
        loadMyTickets(state.user.id);
      });
    }

    const inquiry = $("#form-inquiry");
    if (inquiry) {
      inquiry.addEventListener("submit", async (e) => {
        e.preventDefault();
        const message = $("#inq-message", inquiry).value.trim();
        if (!message) { showToast("Type your question first.", "error"); return; }
        const btn = $("[type=submit]", inquiry);
        setLoading(btn, true, "Sending…");
        const { error } = await sb.from("tickets").insert(Object.assign({}, base, {
          title: "Inquiry from " + state.email,
          description: message,
          tag: "Inquiry"
        }));
        setLoading(btn, false, "Send inquiry");
        if (error) { console.error(error); showToast("Couldn't send your inquiry. Please try again.", "error"); return; }
        inquiry.reset();
        closeModal($("#modal-inquiry"));
        showToast("Inquiry sent! We'll get back to you soon.");
        loadMyTickets(state.user.id);
      });
    }

    $$("[data-open]").forEach((btn) => btn.addEventListener("click", () => openModal(btn.getAttribute("data-open"))));
  }

  /* ------------------------------------------------------------------------
     PAGE: PLAY (loads the Unity game and hands it the login)
     ------------------------------------------------------------------------ */
  async function initPlay(state) {
    const loaderText = $("#loader-text");
    const fail = (msg) => { if (loaderText) loaderText.textContent = msg; $("#loader").classList.add("has-error"); };

    if (!state.canPlay) { window.location.replace("login.html?next=play.html"); return; }

    // Students play with their account. Guests, and admins testing, play as guests
    // (the game only saves progress for UB Mail accounts).
    let payload = { mode: "guest", access_token: "", refresh_token: "", user_id: "", name: "Guest", email: "" };
    if (state.isTester) {
      // No tokens on purpose: without them the game can't save anything to Supabase.
      payload = { mode: "tester", access_token: "", refresh_token: "", user_id: state.user.id, name: state.name, email: state.email };
    } else if (state.isStudent) {
      payload = {
        mode: "student",
        access_token: state.session.access_token,
        refresh_token: state.session.refresh_token,
        user_id: state.user.id,
        name: state.name,
        email: state.email
      };
    }
    const who = $("#who-small");
    if (who) who.textContent = payload.mode === "student" ? `${payload.name} · Student`
      : payload.mode === "tester" ? `${payload.name} · Tester (not saved)`
      : (state.isAdmin ? "Admin · testing as guest" : "Guest · Campus tour");

    // The game's Exit and Sign out buttons call these (Plugins/WebGL/BrahmanWeb.jslib).
    window.boExitToHome = function () { window.location.href = state.isStudent ? "student.html" : "index.html"; };
    window.boSignOut = function () { signOutEverywhere("login.html"); };

    if (!cfg.BUILD_FOLDER || cfg.BUILD_FOLDER.indexOf("PASTE-YOUR-CODE") !== -1) {
      fail("The game address isn't set yet. Put your R2 address in config.js (BUILD_FOLDER and STREAMING_ASSETS).");
      return;
    }

    let unity = null;
    const base = cfg.BUILD_FOLDER.replace(/\/+$/, "") + "/" + (cfg.BUILD_NAME || "Web");
    const ext = cfg.BUILD_EXT || "";
    // Version stamp on every game file (e.g. Web.wasm.unityweb?v=1.2.2). A new PRODUCT_VERSION
    // is a new address, so Cloudflare and the browser can't mix an old file with a new one.
    // (A new Web.data with an old Web.wasm = keys that don't work and garbled text.)
    const v = "?v=" + encodeURIComponent(cfg.PRODUCT_VERSION || "1");
    const script = document.createElement("script");
    script.src = base + ".loader.js" + v;
    script.crossOrigin = "anonymous"; // so real errors show instead of "Script error."
    script.onerror = () => fail("Couldn't reach the game server. Your network may be blocking it. Try another Wi-Fi or mobile data, then reload.");
    script.onload = () => {
      createUnityInstance($("#unity-canvas"), {
        dataUrl: base + ".data" + ext + v,
        frameworkUrl: base + ".framework.js" + ext + v,
        codeUrl: base + ".wasm" + ext + v,
        streamingAssetsUrl: cfg.STREAMING_ASSETS,
        companyName: cfg.COMPANY_NAME,
        productName: cfg.PRODUCT_NAME,
        productVersion: cfg.PRODUCT_VERSION,
        // The browser sometimes refuses to lock the mouse (no click yet, or right after Esc).
        // That's harmless (the next click locks it), so don't show Unity's error pop-up for it.
        errorHandler: (message) => {
          if (/pointer ?lock|NotAllowedError/i.test(String(message))) {
            console.warn("Mouse lock refused by the browser (harmless):", message);
            return true; // handled: no pop-up
          }
          return false; // any other error: Unity shows it as usual
        }
      }, (progress) => {
        const pct = Math.round(progress * 100);
        $("#bar-fill").style.width = pct + "%";
        if (loaderText && pct < 100) loaderText.textContent = `Loading the University of Batangas… ${pct}%`;
        if (loaderText && pct >= 90) loaderText.textContent = "Almost there… preparing the campus.";
      }).then((instance) => {
        unity = instance;
        $("#loader").classList.add("hidden");
        unity.SendMessage("WebSessionBridge", "ReceiveSession", JSON.stringify(payload));
      }).catch((err) => fail("The game couldn't start: " + err));
    };
    document.body.appendChild(script);

    // Supabase renews the login about every hour: pass the new tokens to the game.
    if (sb && payload.mode === "student") {
      sb.auth.onAuthStateChange((event, session) => {
        if (event === "TOKEN_REFRESHED" && session && unity) {
          unity.SendMessage("WebSessionBridge", "ReceiveTokens", JSON.stringify({
            mode: "student", access_token: session.access_token, refresh_token: session.refresh_token
          }));
        }
        if (event === "SIGNED_OUT") window.location.href = "login.html";
      });
    }

    const fs = $("#btn-fullscreen");
    if (fs) fs.addEventListener("click", () => { if (unity) unity.SetFullscreen(1); });

    // Full screen: a quick Esc tap would throw the player out of full screen.
    // Chrome and Edge let the page keep Esc; the player holds Esc to leave
    // (the browser shows "Press and hold Esc to exit full screen"). Other browsers: nothing changes.
    document.addEventListener("fullscreenchange", () => {
      const kb = navigator.keyboard;
      if (!kb || !kb.lock) return;
      if (document.fullscreenElement) kb.lock(["Escape"]).catch(() => {});
      else kb.unlock();
    });
  }

  /* ------------------------------------------------------------------------
     PAGE: ADMIN CONSOLE
     ------------------------------------------------------------------------ */
  // progress[campusKey] = { rows, byUser, error } for every campus that's connected.
  const admin = { players: [], page: 1, perPage: 10, progress: {} };

  async function initAdmin(state) {
    if (!state.isAdmin) { window.location.replace(state.session ? "index.html" : "login.html?next=admin.html"); return; }
    document.body.classList.remove("is-guarded");

    const av = $(".admin-avatar");
    if (av) av.textContent = initialsOf(state.name);
    const em = $("#admin-email-display");
    if (em) em.textContent = state.email;

    // Sidebar views
    $$(".sidebar-nav .nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".sidebar-nav .nav-item").forEach((b) => { b.classList.remove("active"); b.removeAttribute("aria-current"); });
        btn.classList.add("active");
        btn.setAttribute("aria-current", "page");
        $$(".admin-view-panel").forEach((p) => p.classList.add("hidden"));
        const target = document.getElementById(btn.getAttribute("data-target"));
        if (target) target.classList.remove("hidden");
        document.body.classList.remove("sidebar-open");
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
    const sideToggle = $("#sidebar-toggle");
    if (sideToggle) sideToggle.addEventListener("click", () => document.body.classList.toggle("sidebar-open"));

    if (av) av.addEventListener("click", () => openModal("modal-admin-settings"));
    initPasswordForm(state);

    // Directory filters
    let t = null;
    const reload = () => { clearTimeout(t); t = setTimeout(() => { admin.page = 1; renderStudents(); }, 200); };
    const search = $("#student-search-input");
    const nonUb = $("#filter-non-ub-checkbox");
    if (search) search.addEventListener("input", reload);
    if (nonUb) nonUb.addEventListener("change", reload);
    $("#btn-prev-page").addEventListener("click", () => { admin.page--; renderStudents(); });
    $("#btn-next-page").addEventListener("click", () => { admin.page++; renderStudents(); });

    $("#student-table-body").addEventListener("click", (e) => {
      const row = e.target.closest("[data-player]");
      if (!row) return;
      e.preventDefault();
      const p = admin.players.find((x) => String(x.id) === row.getAttribute("data-player"));
      if (p) showStudentModal(p);
    });

    $("#reports-feed").addEventListener("click", onTicketAction);
    $("#inquiries-feed").addEventListener("click", onTicketAction);

    await Promise.all([loadPlayers(), loadCampusProgress(), loadTickets()]);
    renderStudents(); // again, now that campus progress is loaded
    renderOverview();
    campusTabs($("#admin-progress-tabs"), renderCampusHealth);
  }

  // Everyone who has signed in (except admins), read from the logins by an admin-only function.
  async function loadPlayers() {
    const { data, error } = await sb.rpc("portal_students");
    if (error) {
      $("#student-table-body").innerHTML = `<tr><td colspan="5" class="table-msg error">Couldn't load students. Run <code>sql/portal_security_fixes.sql</code> in Supabase. (${esc(error.message)})</td></tr>`;
      return;
    }
    admin.players = (data || []).map((r) => ({
      id: r.user_id, user_id: r.user_id, name: r.name, email: r.email,
      signed_up: r.signed_up, last_sign_in: r.last_sign_in
    }));
    renderStudents();
  }

  async function loadCampusProgress() {
    for (const campus of CAMPUSES) {
      const src = sourceFor(campus);
      if (!src) continue;
      let rows = [], error = null;
      try { const res = await src.loadAll(); rows = res.data || []; error = res.error; } catch (e) { error = e; }
      const byUser = {};
      rows.forEach((r) => { byUser[r.user_id] = r; });
      admin.progress[campus.key] = { rows, byUser, error };
    }
  }

  // This student's row for a campus, or null.
  function progressOf(campus, userId) {
    const p = admin.progress[campus.key];
    return p && p.byUser[userId] ? p.byUser[userId] : null;
  }

  function filteredPlayers() {
    const q = ($("#student-search-input").value || "").trim().toLowerCase();
    const nonUbOnly = $("#filter-non-ub-checkbox").checked;
    return admin.players.filter((p) => {
      if (nonUbOnly && isUbMail(p.email)) return false;
      if (!q) return true;
      return String(p.name || "").toLowerCase().includes(q) || String(p.email || "").toLowerCase().includes(q);
    });
  }

  function renderStudents() {
    const body = $("#student-table-body");
    const list = filteredPlayers();
    const pages = Math.max(1, Math.ceil(list.length / admin.perPage));
    admin.page = Math.min(Math.max(1, admin.page), pages);
    const start = (admin.page - 1) * admin.perPage;
    const rows = list.slice(start, start + admin.perPage);

    $("#pagination-info").innerHTML = list.length
      ? `Showing <strong>${start + 1}–${start + rows.length}</strong> of <strong>${list.length}</strong> students`
      : "No students";
    $("#page-indicator").textContent = `Page ${admin.page} of ${pages}`;
    $("#btn-prev-page").disabled = admin.page <= 1;
    $("#btn-next-page").disabled = admin.page >= pages;

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="5" class="table-msg">${admin.players.length ? "No students match your search." : "No students yet. They appear after their first UB Mail sign-in."}</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((p) => {
      const ub = isUbMail(p.email);
      const badges = CAMPUSES.map((c) => {
        const row = progressOf(c, p.user_id);
        return row ? `<span class="badge-course">${esc(c.name)} · ${esc(sourceFor(c).level(row))}</span>` : "";
      }).join(" ");
      return `
        <tr data-player="${esc(p.id)}" class="row-click">
          <td><div class="player-col"><div class="avatar-sm-gold${ub ? "" : " avatar-dark-accent"}">${esc(initialsOf(p.name))}</div>
            <span class="player-name">${esc(p.name || "—")}</span></div></td>
          <td><div class="email-col"><span class="email-text">${esc(p.email || "—")}</span>
            ${ub ? '<span class="badge-verified-ub">UB Mail</span>' : '<span class="badge-warning-ext">External</span>'}</div></td>
          <td><div class="badge-stack">${badges || '<span class="muted small">Not started</span>'}</div></td>
          <td><span class="muted small">${p.last_sign_in ? esc(timeSince(p.last_sign_in)) : "Never"}</span></td>
          <td class="text-right"><a href="#" class="link-action">View details →</a></td>
        </tr>`;
    }).join("");
  }

  function showStudentModal(p) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("detail-avatar", initialsOf(p.name));
    set("detail-name", p.name || "Unknown");
    set("detail-email", p.email || "—");
    const ub = isUbMail(p.email);
    set("detail-course", ub ? "UB Mail" : "External email");
    $("#detail-course").className = ub ? "badge-verified-ub" : "badge-warning-ext";
    const list = $("#detail-campus-progress");
    if (list) {
      list.innerHTML = CAMPUSES.map((c) => {
        const src = sourceFor(c);
        const row = src ? progressOf(c, p.user_id) : null;
        const value = !src ? '<span class="muted">Coming soon</span>'
          : !row ? '<span class="muted">Not started</span>'
          : `<strong>${esc(src.level(row))}</strong> · ${Number(row.xp_total || 0).toLocaleString()} XP · ${esc(timeSince(row.updated_at))}`;
        return `<li><span>${esc(c.name)}</span><span>${value}</span></li>`;
      }).join("");
    }
    set("detail-signed-up", p.signed_up ? new Date(p.signed_up).toLocaleDateString() : "—");
    set("detail-last-seen", p.last_sign_in ? timeSince(p.last_sign_in) : "Never");
    openModal("modal-student-details");
  }

  async function loadTickets() {
    const { data, error } = await sb.from("tickets").select("*").order("created_at", { ascending: false });
    admin.tickets = error ? [] : (data || []);
    if (error) console.error("tickets:", error.message);
    renderTickets();
  }

  function ticketCard(t, isInquiry) {
    const amber = String(t.tag || "").toLowerCase().includes("feedback");
    const color = isInquiry ? "gold" : amber ? "amber" : "red";
    return `
      <article class="admin-card-surface report-ticket tone-${color}" data-ticket="${esc(t.id)}">
        <div class="ticket-header">
          <span class="badge-ticket tone-${color}">${esc(isInquiry ? "School Inquiry" : t.tag || "Technical Issue")}</span>
          <span class="ticket-time">${esc(timeSince(t.created_at))}</span>
        </div>
        <h3 class="ticket-title">${esc(t.title || "Untitled")}</h3>
        ${t.description ? `<p class="ticket-desc">${esc(t.description)}</p>` : ""}
        <div class="ticket-footer">
          <p class="ticket-reporter">From <strong>${esc(t.user_name || "Unknown player")}</strong></p>
          <div class="ticket-actions">
            ${t.status === "open"
              ? `<button type="button" class="btn-gold-sm" data-resolve="${esc(t.id)}">Mark resolved</button>`
              : '<span class="status-pill status-active">Resolved</span>'}
          </div>
        </div>
      </article>`;
  }

  function emptyState(title, desc) {
    return `<div class="admin-card-surface empty-state">
        <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></div>
        <p class="empty-state-title">${esc(title)}</p><p class="empty-state-desc">${esc(desc)}</p></div>`;
  }

  function renderTickets() {
    const all = admin.tickets || [];
    const reports = all.filter((t) => t.tag !== "Inquiry" && t.status === "open");
    const inquiries = all.filter((t) => t.tag === "Inquiry");
    $("#reports-feed").innerHTML = reports.length
      ? reports.map((t) => ticketCard(t, false)).join("")
      : emptyState("All reports resolved", "There are no open game reports right now. Great work!");
    $("#inquiries-feed").innerHTML = inquiries.length
      ? inquiries.map((t) => ticketCard(t, true)).join("")
      : emptyState("No inquiries yet", "When students send questions from My Progress, they appear here.");
    const openInq = inquiries.filter((t) => t.status === "open").length;
    $("#count-reports").textContent = reports.length || "";
    $("#count-inquiries").textContent = openInq || "";
  }

  async function onTicketAction(e) {
    const btn = e.target.closest("[data-resolve]");
    if (!btn) return;
    const id = btn.getAttribute("data-resolve");
    btn.disabled = true;
    const { error } = await sb.from("tickets").update({ status: "resolved" }).eq("id", id);
    if (error) { btn.disabled = false; showToast("Couldn't update. Please try again.", "error"); return; }
    const t = (admin.tickets || []).find((x) => String(x.id) === id);
    if (t) t.status = "resolved";
    renderTickets();
    renderOverview();
    showToast("Marked as resolved.");
  }

  function renderOverview() {
    const players = admin.players || [];
    const ubCount = players.filter((p) => isUbMail(p.email)).length;
    const openReports = (admin.tickets || []).filter((t) => t.tag !== "Inquiry" && t.status === "open").length;
    const openInq = (admin.tickets || []).filter((t) => t.tag === "Inquiry" && t.status === "open").length;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("stat-players", players.length.toLocaleString());
    set("stat-ub", ubCount.toLocaleString());
    set("stat-external", (players.length - ubCount).toLocaleString());
    set("stat-reports", openReports.toLocaleString());
    set("stat-inquiries", openInq.toLocaleString());

    // Players with progress on at least one connected campus.
    const withProgress = new Set();
    const parts = [];
    CAMPUSES.forEach((c) => {
      const prog = admin.progress[c.key];
      if (!prog) return;
      prog.rows.forEach((r) => withProgress.add(r.user_id));
      parts.push(`${c.name} ${prog.rows.length}`);
    });
    set("stat-campus", withProgress.size.toLocaleString());
    set("stat-campus-sub", parts.length ? parts.join(" · ") : "No campus connected yet");
  }

  // The "Campus progress" card: one tab per campus.
  function renderCampusHealth(campus) {
    const box = $("#campus-health");
    if (!box) return;
    const src = sourceFor(campus);
    const prog = admin.progress[campus.key];
    if (!src || !prog) { box.innerHTML = comingSoon(campus, "Progress for this campus is"); return; }
    if (prog.error) {
      box.innerHTML = `<p class="muted">Couldn't read ${esc(campus.name)} progress. Run <code>sql/portal_security_fixes.sql</code> in Supabase so admins can see it.</p>`;
      return;
    }
    const rows = prog.rows;
    const total = rows.length;
    const by = {};
    rows.forEach((r) => { const k = src.stage(r); by[k] = (by[k] || 0) + 1; });
    const graduates = rows.filter((r) => src.graduated(r)).length;
    const avgXp = total ? Math.round(rows.reduce((sum, r) => sum + (Number(r.xp_total) || 0), 0) / total) : 0;
    const stages = campus.progress === "lipa" ? ["Junior High", "Senior High", "College", "Graduated"] : Object.keys(by);
    box.innerHTML = `
      <div class="health-summary">
        <div><strong>${total.toLocaleString()}</strong><span>players started</span></div>
        <div><strong>${graduates.toLocaleString()}</strong><span>Loyalty Awards</span></div>
        <div><strong>${avgXp.toLocaleString()}</strong><span>average XP</span></div>
      </div>
      ${stages.map((k) => {
        const n = by[k] || 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        return `<div class="health-item">
          <div class="health-meta"><span>${esc(k)}</span><span class="font-display">${n} · ${pct}%</span></div>
          <div class="bar-track-dark"><div class="bar-fill-gold" style="width:${pct}%"></div></div>
        </div>`;
      }).join("")}`;
  }

  function initPasswordForm(state) {
    const form = $("#form-change-password");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const cur = $("#admin-current-password").value;
      const next = $("#admin-new-password").value;
      const confirm = $("#admin-confirm-password").value;
      if (!cur || !next || !confirm) { showToast("Fill in all three password fields.", "error"); return; }
      if (next !== confirm) { showToast("The new passwords don't match.", "error"); return; }
      if (next.length < 10) { showToast("Use at least 10 characters for the new password.", "error"); return; }
      if (next === cur) { showToast("The new password must be different.", "error"); return; }
      const btn = $("[type=submit]", form);
      setLoading(btn, true, "Updating…");
      const { error: verifyError } = await sb.auth.signInWithPassword({ email: state.email, password: cur });
      if (verifyError) { setLoading(btn, false, "Update password"); showToast("Current password is incorrect.", "error"); return; }
      const { error } = await sb.auth.updateUser({ password: next });
      setLoading(btn, false, "Update password");
      if (error) { showToast("Couldn't update: " + error.message, "error"); return; }
      form.reset();
      closeModal($("#modal-admin-settings"));
      showToast("Password updated.");
    });
  }

  /* ------------------------------------------------------------------------
     START
     ------------------------------------------------------------------------ */
  document.addEventListener("DOMContentLoaded", async () => {
    initMobileNav();
    initModals();
    const year = $("#year");
    if (year) year.textContent = new Date().getFullYear();

    const state = await getState();
    renderNav(state);

    const page = document.body.getAttribute("data-page");
    try {
      if (page === "home") initHome(state);
      else if (page === "login") await initLogin(state);
      else if (page === "student") await initStudent(state);
      else if (page === "play") await initPlay(state);
      else if (page === "admin") await initAdmin(state);
    } catch (err) {
      console.error(err);
      showToast("Something went wrong. Please reload the page.", "error");
    }
    document.body.classList.add("is-ready");
  });
})();
