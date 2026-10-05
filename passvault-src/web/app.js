/* PassVault - 飞牛 fnOS 密码管家前端 */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    initialized: false,
    unlocked: false,
    platforms: [],
    accounts: [],
    memos: [],
    activePlatform: "all",
    activeMemo: null,
    memoEditing: false,
    view: "passwords",
    search: "",
  };

  let memoSaveTimer = null;

  const TOKEN_KEY = "pv_token";
  const tokenStore = {
    get() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } },
    set(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch {} },
  };

  const ICONS = {
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"></circle><path d="m10.5 12.5 8-8M16 5l3 3M14 7l3 3"></path></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><path d="M1 1l22 22"></path></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01z"/></svg>',
    starOutline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" width="16" height="16"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6"></path></svg>',
    vault: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2.5"></rect><circle cx="12" cy="12" r="4"></circle><path d="M12 8v1M12 15v1M8 12h1M15 12h1"></path></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 9 5-9 5-9-5 9-5z"></path><path d="m3 12 9 5 9-5"></path><path d="m3 17 9 5 9-5"></path></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><path d="M14 3v6h6M8 13h8M8 17h5"></path></svg>',
    thumbtack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6z"></path><path d="M12 15v5"></path></svg>',
  };

  const PALETTE = ["#4f6ef7", "#12b76a", "#f5a524", "#e5484d", "#9a5cf5", "#0ea5e9", "#ec4899", "#14b8a6", "#f97316", "#64748b"];
  const FIELD_TYPES = [
    ["text", "文本"], ["password", "密码"], ["email", "邮箱"], ["url", "网址"],
    ["tel", "电话"], ["number", "数字"], ["date", "日期"], ["note", "备注"],
  ];

  // ---------------- api ----------------
  async function api(path, options = {}) {
    const opts = { credentials: "same-origin", ...options };
    if (opts.body && typeof opts.body !== "string") {
      opts.body = JSON.stringify(opts.body);
      opts.headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    }
    const tok = tokenStore.get();
    if (tok) opts.headers = { Authorization: `Bearer ${tok}`, ...(opts.headers || {}) };
    const res = await fetch(path, opts);
    if (res.status === 401) {
      tokenStore.set("");
      state.unlocked = false;
      renderAuth();
      throw new Error("会话已锁定，请重新解锁");
    }
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = null; } }
    if (!res.ok) throw new Error((data && data.error) || `请求失败 (${res.status})`);
    return data;
  }

  // ---------------- utilities ----------------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

  function uid() {
    return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  }

  function toast(msg, type = "") {
    const root = $("#toast-root");
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .25s"; }, 1800);
    setTimeout(() => el.remove(), 2100);
  }

  async function copy(text, label = "已复制") {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast(label, "success");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast(label, "success"); } catch { toast("复制失败", "error"); }
      ta.remove();
    }
  }

  function colorFor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  function platformById(id) { return state.platforms.find((p) => p.id === id) || null; }

  function accountCount(pid) { return state.accounts.filter((a) => a.platformId === pid).length; }

  function fmtDate(ts) {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    }
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function fmtDateTime(ts) {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function generatePassword(len = 20, opts = {}) {
    const lower = "abcdefghijkmnopqrstuvwxyz";
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const digits = "23456789";
    const symbols = "!@#$%^&*()-_=+[]{};:,.?";
    let pool = lower + upper + digits;
    if (opts.symbols !== false) pool += symbols;
    const rnd = (n) => {
      const a = new Uint32Array(n);
      crypto.getRandomValues(a);
      return a;
    };
    const out = [];
    for (let i = 0; i < len; i++) out.push(pool[rnd(1)[0] % pool.length]);
    return out.join("");
  }

  function passwordStrength(pw) {
    if (!pw) return { score: 0, label: "" };
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (pw.length >= 16) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    score = Math.min(score, 5);
    const map = {
      0: ["", "#e5484d", "很弱"], 1: ["#e5484d", "#e5484d", "很弱"],
      2: ["#f5a524", "#f5a524", "较弱"], 3: ["#f5a524", "#f5a524", "一般"],
      4: ["#12b76a", "#12b76a", "较强"], 5: ["#12b76a", "#12b76a", "很强"],
    };
    return { score, color: map[score][1], label: map[score][2] };
  }

  // ---------------- auth screen ----------------
  function renderAuth() {
    $("#app-screen").classList.add("hidden");
    $("#auth-screen").classList.remove("hidden");
    const isSetup = !state.initialized;
    $("#auth-title").textContent = isSetup ? "创建密码库" : "解锁密码库";
    $("#auth-sub").textContent = isSetup ? "设置一个主密码用于加密所有数据" : "输入主密码以访问你的账号数据";
    $("#auth-confirm-wrap").classList.toggle("hidden", !isSetup);
    $("#auth-submit").textContent = isSetup ? "创建并进入" : "解锁";
    $("#auth-hint").textContent = isSetup
      ? "主密码用于本地加密，一旦遗忘无法找回，请务必牢记。"
      : "数据以 AES-256 加密存储在本机。";
    $("#auth-error").textContent = "";
    $("#auth-password").value = "";
    $("#auth-confirm").value = "";
    setTimeout(() => $("#auth-password").focus(), 60);
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    const pw = $("#auth-password").value;
    const errEl = $("#auth-error");
    errEl.textContent = "";
    if (!pw) { errEl.textContent = "请输入主密码"; return; }
    const btn = $("#auth-submit");
    btn.disabled = true;
    try {
      if (!state.initialized) {
        const confirm = $("#auth-confirm").value;
        if (pw.length < 6) { errEl.textContent = "主密码至少需要 6 个字符"; return; }
        if (pw !== confirm) { errEl.textContent = "两次输入的密码不一致"; return; }
        const res = await api("/api/setup", { method: "POST", body: { master: pw } });
        if (res && res.token) tokenStore.set(res.token);
        state.initialized = true;
      } else {
        const res = await api("/api/unlock", { method: "POST", body: { master: pw } });
        if (res && res.token) tokenStore.set(res.token);
      }
      state.unlocked = true;
      await enterApp();
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  }

  async function enterApp() {
    $("#auth-screen").classList.add("hidden");
    $("#app-screen").classList.remove("hidden");
    await loadData();
  }

  async function loadData() {
    const data = await api("/api/data");
    state.platforms = data.platforms || [];
    state.accounts = data.accounts || [];
    state.memos = data.memos || [];
    if (state.activePlatform !== "all" && !platformById(state.activePlatform)) {
      state.activePlatform = "all";
    }
    if (state.activeMemo && !state.memos.some((m) => m.id === state.activeMemo)) {
      state.activeMemo = null;
      state.memoEditing = false;
    }
    renderNav();
    renderAccounts();
    renderMemoNav();
    renderMemoView();
  }

  // ---------------- navigation ----------------
  function renderNav() {
    const nav = $("#platform-nav");
    const allActive = state.activePlatform === "all";
    let html = `
      <div class="nav-item ${allActive ? "active" : ""}" data-platform="all">
        <span class="dot" style="background:linear-gradient(150deg,#5b7bff,#3d5be0)"></span>
        <span class="name">全部账号</span>
        <span class="count">${state.accounts.length}</span>
      </div>`;
    if (state.platforms.length === 0) {
      html += `<div class="empty">还没有平台，点击右上角 + 添加</div>`;
    }
    for (const p of state.platforms) {
      const active = state.activePlatform === p.id;
      const color = p.color || colorFor(p.id);
      html += `
        <div class="nav-item ${active ? "active" : ""}" data-platform="${p.id}">
          <span class="dot" style="background:${esc(color)}"></span>
          <span class="name">${esc(p.name)}</span>
          <span class="count">${accountCount(p.id)}</span>
        </div>`;
    }
    nav.innerHTML = html;
    $$(".nav-item", nav).forEach((item) => {
      item.addEventListener("click", () => {
        state.activePlatform = item.dataset.platform;
        closeSidebar();
        renderNav();
        renderAccounts();
      });
    });
  }

  function matchesSearch(acc) {
    if (!state.search) return true;
    const platform = platformById(acc.platformId);
    const hay = [
      acc.title, acc.username, acc.url, acc.notes,
      platform ? platform.name : "",
      ...(acc.fields || []).flatMap((f) => [f.key, f.value]),
    ].join(" ").toLowerCase();
    return hay.includes(state.search);
  }

  function visibleAccounts() {
    return state.accounts
      .filter((a) => state.activePlatform === "all" || a.platformId === state.activePlatform)
      .filter(matchesSearch)
      .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  function renderAccounts() {
    const list = $("#account-list");
    const accounts = visibleAccounts();
    const title = state.activePlatform === "all" ? "全部账号" : (platformById(state.activePlatform)?.name || "平台");
    $("#content-title").textContent = title;
    $("#content-meta").textContent = `${accounts.length} 个账号`;

    if (accounts.length === 0) {
      const noPlatform = state.platforms.length === 0;
      list.innerHTML = `
        <div class="empty-state">
          ${ICONS.vault}
          <div class="title">${state.search ? "没有匹配的结果" : (noPlatform ? "先创建一个平台" : "这里还没有账号")}</div>
          <div>${state.search ? "试试其它关键词" : "平台可以自定义，例如 GitHub、邮箱、银行等"}</div>
        </div>`;
      return;
    }

    list.innerHTML = `<div class="cards">${accounts.map(renderCard).join("")}</div>`;
    $$(".card", list).forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("[data-copy]")) return;
        openAccountModal(card.dataset.id);
      });
    });
    $$("[data-copy]", list).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const acc = state.accounts.find((a) => a.id === btn.dataset.copy);
        if (!acc) return;
        copy(btn.dataset.what === "user" ? acc.username : acc.password, btn.dataset.what === "user" ? "账号已复制" : "密码已复制");
      });
    });
  }

  function renderCard(acc) {
    const p = platformById(acc.platformId);
    const color = p ? (p.color || colorFor(p.id)) : "#64748b";
    const initial = (acc.title || p?.name || "?").trim().charAt(0).toUpperCase();
    const extra = (acc.fields || []).slice(0, 2).map((f) => `
      <div class="card-line">
        <span class="k">${esc(f.key || "字段")}</span>
        <span class="v">${f.type === "password" ? "••••••••" : esc(f.value)}</span>
      </div>`).join("");
    const userLine = acc.username ? `
      <div class="card-line">
        <span class="k">账号</span>
        <span class="v">${esc(acc.username)}</span>
        <button class="copy-mini" data-copy="${acc.id}" data-what="user" title="复制账号">${ICONS.copy}</button>
      </div>` : "";
    const pwLine = acc.password ? `
      <div class="card-line">
        <span class="k">密码</span>
        <span class="v"><code>••••••••••</code></span>
        <button class="copy-mini" data-copy="${acc.id}" data-what="pass" title="复制密码">${ICONS.copy}</button>
      </div>` : "";
    return `
      <div class="card" data-id="${acc.id}">
        <div class="card-top">
          <div class="avatar" style="background:${esc(color)}">${esc(initial)}</div>
          <div class="titles">
            <div class="title">${esc(acc.title || "未命名账号")}</div>
            <div class="platform">${esc(p ? p.name : "未分类")}</div>
          </div>
          ${acc.favorite ? `<span class="fav">${ICONS.star}</span>` : ""}
        </div>
        ${userLine}
        ${pwLine}
        ${extra}
      </div>`;
  }

  // ---------------- modal helper ----------------
  function openModal({ title, body, footer, onMount, width }) {
    const root = $("#modal-root");
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" ${width ? `style="max-width:${width}px"` : ""}>
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button class="btn icon ghost" data-close title="关闭">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>
          </button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ""}
      </div>`;
    root.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    $$("[data-close]", overlay).forEach((b) => b.addEventListener("click", close));
    if (onMount) onMount(overlay, close);
    return { overlay, close };
  }

  function confirmDialog(title, message, confirmText = "删除") {
    return new Promise((resolve) => {
      openModal({
        title,
        body: `<p style="margin:0;color:#4a5163">${esc(message)}</p>`,
        footer: `<button class="btn" data-cancel>取消</button><button class="btn danger" data-confirm>${esc(confirmText)}</button>`,
        width: 420,
        onMount(overlay, close) {
          $("[data-cancel]", overlay).addEventListener("click", () => { close(); resolve(false); });
          $("[data-confirm]", overlay).addEventListener("click", () => { close(); resolve(true); });
        },
      });
    });
  }

  // ---------------- account editor ----------------
  function fieldRowHtml(f = {}) {
    const typeOptions = FIELD_TYPES.map(([v, l]) =>
      `<option value="${v}" ${f.type === v ? "selected" : ""}>${l}</option>`).join("");
    return `
      <div class="field-row" data-field-id="${esc(f.id || "")}">
        <input class="input f-key" placeholder="字段名，如 邮箱" value="${esc(f.key || "")}" />
        <select class="select f-type">${typeOptions}</select>
        <input class="input f-val" placeholder="值" value="${esc(f.value || "")}" />
        <button type="button" class="btn icon danger rm" title="移除">${ICONS.trash}</button>
      </div>`;
  }

  function openAccountModal(id) {
    const editing = id ? state.accounts.find((a) => a.id === id) : null;
    const acc = editing || {
      title: "", platformId: state.activePlatform !== "all" ? state.activePlatform : (state.platforms[0]?.id || ""),
      username: "", password: "", url: "", notes: "", fields: [], favorite: false,
    };
    // when creating under a platform with a field template, prefill
    if (!editing) {
      const p = platformById(acc.platformId);
      if (p && p.fieldTemplate?.length) {
        acc.fields = p.fieldTemplate.map((t) => ({ id: uid(), key: t.key, type: t.type || "text", value: "" }));
      }
    }
    const platformOptions = state.platforms.map((p) =>
      `<option value="${p.id}" ${p.id === acc.platformId ? "selected" : ""}>${esc(p.name)}</option>`).join("");

    const body = `
      <label class="field"><span>名称 *</span>
        <input class="input" id="acc-title" placeholder="例如：个人邮箱" value="${esc(acc.title)}" />
      </label>
      <div class="row">
        <label class="field"><span>平台 *</span>
          <select class="select" id="acc-platform">${platformOptions || '<option value="">请先创建平台</option>'}</select>
        </label>
        <label class="field"><span>登录账号</span>
          <input class="input" id="acc-username" placeholder="用户名 / 手机号 / 邮箱" value="${esc(acc.username)}" />
        </label>
      </div>
      <label class="field"><span>密码</span>
        <div class="pw-field">
          <input class="input" id="acc-password" type="text" placeholder="密码" value="${esc(acc.password)}" />
          <div class="pw-actions">
            <button type="button" id="pw-eye" title="显示/隐藏">${ICONS.eyeOff}</button>
            <button type="button" id="pw-gen" title="生成密码">${ICONS.refresh}</button>
            <button type="button" id="pw-copy" title="复制">${ICONS.copy}</button>
          </div>
        </div>
        <div class="strength"><i id="pw-bar"></i></div>
        <div class="strength-label" id="pw-label"></div>
      </label>
      <div class="row">
        <label class="field"><span>网址</span>
          <input class="input" id="acc-url" placeholder="https://" value="${esc(acc.url)}" />
        </label>
        <label class="field" style="max-width:150px;flex:none">
          <span>标记</span>
          <label style="display:flex;align-items:center;gap:8px;padding:10px 0"><input type="checkbox" id="acc-fav" ${acc.favorite ? "checked" : ""} /> 收藏</label>
        </label>
      </div>
      <label class="field"><span>备注</span>
        <textarea class="textarea" id="acc-notes" placeholder="安全提示、二次验证、恢复码等">${esc(acc.notes)}</textarea>
      </label>
      <div class="fields-head">
        <h4>自定义字段</h4>
        <button type="button" class="btn" id="add-field">+ 添加字段</button>
      </div>
      <div class="hint">可补充邮箱、手机号、密保问题、API Key 等任意信息。</div>
      <div id="fields-list">${(acc.fields || []).map(fieldRowHtml).join("")}</div>
    `;

    const footer = `
      ${editing ? `<button class="btn danger" id="acc-delete">${ICONS.trash} 删除</button>` : ""}
      <span style="flex:1"></span>
      <button class="btn" data-close>取消</button>
      <button class="btn primary" id="acc-save">保存</button>`;

    openModal({
      title: editing ? "编辑账号" : "新增账号",
      body, footer, width: 640,
      onMount(overlay, close) {
        const pwInput = $("#acc-password", overlay);
        const bar = $("#pw-bar", overlay);
        const label = $("#pw-label", overlay);

        const updateStrength = () => {
          const s = passwordStrength(pwInput.value);
          bar.style.width = (s.score / 5 * 100) + "%";
          bar.style.background = s.color || "transparent";
          label.textContent = s.label ? `强度：${s.label}` : "";
        };
        updateStrength();

        pwInput.addEventListener("input", updateStrength);
        $("#pw-eye", overlay).addEventListener("click", (e) => {
          const isPw = pwInput.type === "password";
          pwInput.type = isPw ? "text" : "password";
          e.currentTarget.innerHTML = isPw ? ICONS.eye : ICONS.eyeOff;
        });
        $("#pw-gen", overlay).addEventListener("click", () => {
          pwInput.value = generatePassword(20);
          updateStrength();
        });
        $("#pw-copy", overlay).addEventListener("click", () => copy(pwInput.value, "密码已复制"));
        $("#add-field", overlay).addEventListener("click", () => {
          $("#fields-list", overlay).insertAdjacentHTML("beforeend", fieldRowHtml());
          bindFieldRows(overlay);
        });
        bindFieldRows(overlay);

        $("#acc-save", overlay).addEventListener("click", async () => {
          const title = $("#acc-title", overlay).value.trim();
          const platformId = $("#acc-platform", overlay).value;
          if (!title) { toast("请填写名称", "error"); return; }
          if (!platformId) { toast("请先创建平台", "error"); return; }
          const payload = {
            platformId,
            title,
            username: $("#acc-username", overlay).value.trim(),
            password: pwInput.value,
            url: $("#acc-url", overlay).value.trim(),
            notes: $("#acc-notes", overlay).value,
            favorite: $("#acc-fav", overlay).checked,
            fields: collectFields(overlay),
          };
          try {
            if (editing) {
              await api(`/api/accounts/${editing.id}`, { method: "PUT", body: payload });
            } else {
              await api("/api/accounts", { method: "POST", body: payload });
            }
            close();
            await loadData();
            toast("已保存", "success");
          } catch (err) { toast(err.message, "error"); }
        });

        if (editing) {
          $("#acc-delete", overlay).addEventListener("click", async () => {
            const ok = await confirmDialog("删除账号", `确定删除「${editing.title || "未命名账号"}」吗？此操作不可恢复。`);
            if (!ok) return;
            try {
              await api(`/api/accounts/${editing.id}`, { method: "DELETE" });
              close();
              await loadData();
              toast("已删除", "success");
            } catch (err) { toast(err.message, "error"); }
          });
        }
      },
    });
  }

  function bindFieldRows(overlay) {
    $$(".field-row .rm", overlay).forEach((btn) => {
      btn.onclick = () => btn.closest(".field-row").remove();
    });
  }

  function collectFields(overlay) {
    const out = [];
    $$(".field-row", overlay).forEach((row) => {
      const key = $(".f-key", row).value.trim();
      const value = $(".f-val", row).value;
      const type = $(".f-type", row).value;
      if (!key && !value) return;
      out.push({ id: row.dataset.fieldId || uid(), key, value, type });
    });
    return out;
  }

  // ---------------- platform management ----------------
  function platformTemplateRows(template = []) {
    return (template || []).map((t) => `
      <div class="field-row" data-field-id="${esc(t.id || "")}">
        <input class="input f-key" placeholder="字段名，如 邮箱" value="${esc(t.key || "")}" />
        <select class="select f-type">${FIELD_TYPES.map(([v, l]) => `<option value="${v}" ${t.type === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        <input class="input f-val hidden" />
        <button type="button" class="btn icon danger rm" title="移除">${ICONS.trash}</button>
      </div>`).join("");
  }

  function openPlatformModal(id) {
    const editing = id ? platformById(id) : null;
    const p = editing || { name: "", color: PALETTE[state.platforms.length % PALETTE.length], fieldTemplate: [] };
    const body = `
      <label class="field"><span>平台名称 *</span>
        <input class="input" id="pf-name" placeholder="例如：GitHub、网易邮箱、招商银行" value="${esc(p.name)}" />
      </label>
      <label class="field"><span>标识颜色</span>
        <div id="color-picker" style="display:flex;gap:8px;flex-wrap:wrap">
          ${PALETTE.map((c) => `<button type="button" class="color-dot" data-color="${c}" style="width:28px;height:28px;border-radius:8px;border:2px solid ${c === p.color ? "#1f2430" : "transparent"};background:${c}"></button>`).join("")}
        </div>
      </label>
      <div class="fields-head">
        <h4>默认字段模板（可选）</h4>
        <button type="button" class="btn" id="pf-add-field">+ 添加</button>
      </div>
      <div class="hint">为该平台新增账号时，会自动带入这些字段，例如邮箱、密保问题。</div>
      <div id="pf-fields">${platformTemplateRows(p.fieldTemplate)}</div>
    `;
    const footer = `
      ${editing ? `<button class="btn danger" id="pf-delete">${ICONS.trash} 删除平台</button>` : ""}
      <span style="flex:1"></span>
      <button class="btn" data-close>取消</button>
      <button class="btn primary" id="pf-save">保存</button>`;

    openModal({
      title: editing ? "编辑平台" : "新增平台",
      body, footer, width: 520,
      onMount(overlay, close) {
        let color = p.color;
        $$(".color-dot", overlay).forEach((dot) => {
          dot.addEventListener("click", () => {
            color = dot.dataset.color;
            $$(".color-dot", overlay).forEach((d) => (d.style.borderColor = "transparent"));
            dot.style.borderColor = "#1f2430";
          });
        });
        $("#pf-add-field", overlay).addEventListener("click", () => {
          $("#pf-fields", overlay).insertAdjacentHTML("beforeend", platformTemplateRows([{ key: "", type: "text", value: "" }]));
          bindFieldRows(overlay);
        });
        bindFieldRows(overlay);

        $("#pf-save", overlay).addEventListener("click", async () => {
          const name = $("#pf-name", overlay).value.trim();
          if (!name) { toast("请填写平台名称", "error"); return; }
          const fieldTemplate = [];
          $$(".field-row", $("#pf-fields", overlay)).forEach((row) => {
            const key = $(".f-key", row).value.trim();
            if (!key) return;
            fieldTemplate.push({ id: row.dataset.fieldId || uid(), key, type: $(".f-type", row).value, value: "" });
          });
          const payload = { name, color, fieldTemplate };
          try {
            if (editing) {
              await api(`/api/platforms/${editing.id}`, { method: "PUT", body: payload });
            } else {
              await api("/api/platforms", { method: "POST", body: payload });
            }
            close();
            await loadData();
            toast("已保存", "success");
          } catch (err) { toast(err.message, "error"); }
        });

        if (editing) {
          $("#pf-delete", overlay).addEventListener("click", async () => {
            const n = accountCount(editing.id);
            const msg = n > 0
              ? `删除平台「${editing.name}」将同时删除该平台下的 ${n} 个账号，且不可恢复。确定继续吗？`
              : `确定删除平台「${editing.name}」吗？`;
            const ok = await confirmDialog("删除平台", msg);
            if (!ok) return;
            try {
              await api(`/api/platforms/${editing.id}`, { method: "DELETE" });
              if (state.activePlatform === editing.id) state.activePlatform = "all";
              close();
              await loadData();
              toast("已删除", "success");
            } catch (err) { toast(err.message, "error"); }
          });
        }
      },
    });
  }

  // ---------------- view switch ----------------
  function updateFab() {
    const fab = $("#fab-add");
    if (!fab) return;
    if (state.view === "memos") {
      if (state.memoEditing) {
        fab.classList.add("fab-save");
        fab.innerHTML = `${ICONS.check}<span>完成并保存</span>`;
      } else {
        fab.classList.remove("fab-save");
        fab.innerHTML = `${ICONS.plus}<span>新建备忘录</span>`;
      }
    } else {
      fab.classList.remove("fab-save");
      fab.innerHTML = `${ICONS.plus}<span>新增账号</span>`;
    }
  }

  function setView(view) {
    state.view = view;
    const isMemos = view === "memos";
    $("#sidebar-passwords").classList.toggle("hidden", isMemos);
    $("#sidebar-memos").classList.toggle("hidden", !isMemos);
    $("#content-passwords").classList.toggle("hidden", isMemos);
    $("#content-memos").classList.toggle("hidden", !isMemos);
    $$(".view-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    $("#search").placeholder = isMemos ? "搜索备忘录…" : "搜索平台、账号、邮箱、备注…";
    closeSidebar();
    if (isMemos) {
      state.memoEditing = false;
      state.activeMemo = null;
      renderMemoNav();
      renderMemoView();
    } else {
      renderNav();
      renderAccounts();
    }
    updateFab();
  }

  // ---------------- memos ----------------
  function visibleMemos() {
    const q = state.search;
    return state.memos
      .filter((m) => !q || ((m.title || "") + " " + (m.content || "")).toLowerCase().includes(q))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  function openMemo(id) {
    state.activeMemo = id;
    state.memoEditing = true;
    closeSidebar();
    renderMemoNav();
    renderMemoView();
    updateFab();
  }

  function closeMemoEditor() {
    state.memoEditing = false;
    state.activeMemo = null;
    renderMemoNav();
    renderMemoView();
    updateFab();
  }

  function renderMemoNav() {
    const nav = $("#memo-nav");
    if (!nav) return;
    const memos = visibleMemos();
    if (memos.length === 0) {
      nav.innerHTML = `<div class="empty">${state.search ? "没有匹配的备忘录" : "还没有备忘录，点击 + 新建"}</div>`;
    } else {
      nav.innerHTML = memos.map((m) => `
        <div class="nav-item memo-item ${state.activeMemo === m.id && state.memoEditing ? "active" : ""}" data-memo="${m.id}">
          <span class="memo-ico">${ICONS.note}</span>
          <span class="memo-item-body">
            <span class="name">${esc(m.title || "无标题")}</span>
            <span class="memo-date">${fmtDate(m.updatedAt)}</span>
          </span>
          ${m.pinned ? `<span class="pin">${ICONS.thumbtack}</span>` : ""}
        </div>`).join("");
    }
    $$(".memo-item", nav).forEach((el) => {
      el.addEventListener("click", () => openMemo(el.dataset.memo));
    });
  }

  async function persistMemo(id, data, opts = {}) {
    try {
      const updated = await api(`/api/memos/${id}`, { method: "PUT", body: data });
      const i = state.memos.findIndex((m) => m.id === id);
      if (i >= 0) state.memos[i] = updated;
      if (!opts.silent && state.activeMemo === id) {
        const statusEl = $("#memo-status");
        if (statusEl) statusEl.textContent = "已保存 · " + fmtDateTime(updated.updatedAt);
      }
      renderMemoNav();
      return updated;
    } catch (err) {
      toast(err.message, "error");
      return null;
    }
  }

  async function flushMemoSave() {
    clearTimeout(memoSaveTimer);
    memoSaveTimer = null;
    const memo = state.memos.find((m) => m.id === state.activeMemo);
    if (!memo) return null;
    const titleEl = $("#memo-title");
    const contentEl = $("#memo-content");
    if (!titleEl && !contentEl) return null;
    return persistMemo(memo.id, {
      title: titleEl ? titleEl.value : memo.title,
      content: contentEl ? contentEl.value : memo.content,
      pinned: memo.pinned,
    }, { silent: true });
  }

  function renderMemoView() {
    const memo = state.memos.find((m) => m.id === state.activeMemo);
    if (state.memoEditing && memo) renderMemoEditor(memo);
    else renderMemoCards();
  }

  function renderMemoCards() {
    const host = $("#content-memos");
    if (!host) return;
    const memos = visibleMemos();
    const head = `
      <div class="content-head">
        <h2>备忘录</h2>
        <span class="meta">${memos.length} 条</span>
      </div>`;
    if (memos.length === 0) {
      host.innerHTML = head + `
        <div class="empty-state">
          ${ICONS.note}
          <div class="title">${state.search ? "没有匹配的备忘录" : "还没有备忘录"}</div>
          <div>${state.search ? "试试其它关键词" : "点击右下角「新建备忘录」开始记录"}</div>
        </div>`;
      return;
    }
    host.innerHTML = head + `<div class="memo-cards">${memos.map((m) => {
      const preview = (m.content || "").replace(/\s+/g, " ").trim();
      return `
        <div class="memo-card ${m.pinned ? "pinned" : ""}" data-memo="${m.id}">
          <div class="memo-card-head">
            <span class="memo-card-ico">${ICONS.note}</span>
            <span class="memo-card-title">${esc(m.title || "无标题")}</span>
            ${m.pinned ? `<span class="memo-card-pin">${ICONS.thumbtack}</span>` : ""}
          </div>
          <div class="memo-card-preview">${preview ? esc(preview) : '<span class="muted">暂无内容</span>'}</div>
          <div class="memo-card-date">${m.updatedAt ? "更新于 " + fmtDate(m.updatedAt) : "尚未编辑"}</div>
        </div>`;
    }).join("")}</div>`;
    $$(".memo-card", host).forEach((card) => {
      card.addEventListener("click", () => openMemo(card.dataset.memo));
    });
  }

  function renderMemoEditor(memo) {
    const host = $("#content-memos");
    if (!host) return;
    if (!memo) { renderMemoCards(); return; }
    host.innerHTML = `
      <div class="memo-editor">
        <div class="memo-toolbar">
          <input class="memo-title" id="memo-title" placeholder="标题" value="${esc(memo.title)}" />
          <button class="btn icon ghost ${memo.pinned ? "active" : ""}" id="memo-pin" title="${memo.pinned ? "取消置顶" : "置顶"}">${ICONS.thumbtack}</button>
          <button class="btn danger" id="memo-delete">${ICONS.trash} 删除</button>
        </div>
        <textarea class="memo-content" id="memo-content" placeholder="开始输入…">${esc(memo.content)}</textarea>
        <div class="memo-status" id="memo-status">${memo.updatedAt ? "更新于 " + fmtDateTime(memo.updatedAt) : ""}</div>
      </div>`;

    const titleEl = $("#memo-title");
    const contentEl = $("#memo-content");
    const statusEl = $("#memo-status");

    const scheduleSave = () => {
      statusEl.textContent = "正在保存…";
      clearTimeout(memoSaveTimer);
      memoSaveTimer = setTimeout(() => {
        persistMemo(memo.id, { title: titleEl.value, content: contentEl.value, pinned: memo.pinned });
      }, 700);
    };
    titleEl.addEventListener("input", scheduleSave);
    contentEl.addEventListener("input", scheduleSave);

    $("#memo-pin").addEventListener("click", async () => {
      clearTimeout(memoSaveTimer);
      memoSaveTimer = null;
      const updated = await persistMemo(memo.id, { title: titleEl.value, content: contentEl.value, pinned: !memo.pinned }, { silent: true });
      if (updated) renderMemoEditor(updated);
    });

    $("#memo-delete").addEventListener("click", async () => {
      const ok = await confirmDialog("删除备忘录", `确定删除「${memo.title || "无标题"}」吗？此操作不可恢复。`);
      if (!ok) return;
      clearTimeout(memoSaveTimer);
      memoSaveTimer = null;
      try {
        await api(`/api/memos/${memo.id}`, { method: "DELETE" });
        state.activeMemo = null;
        state.memoEditing = false;
        await loadData();
        updateFab();
        toast("已删除", "success");
      } catch (err) { toast(err.message, "error"); }
    });
  }

  async function createMemo() {
    try {
      const memo = await api("/api/memos", { method: "POST", body: { title: "", content: "", pinned: false } });
      state.memos.push(memo);
      state.activeMemo = memo.id;
      state.memoEditing = true;
      state.search = "";
      $("#search").value = "";
      renderMemoNav();
      renderMemoView();
      updateFab();
      setTimeout(() => $("#memo-title")?.focus(), 40);
    } catch (err) { toast(err.message, "error"); }
  }

  // ---------------- settings ----------------
  function openSettings() {
    const body = `
      <div class="tabs">
        <button class="active" data-tab="security">安全</button>
        <button data-tab="data">数据</button>
      </div>
      <div data-panel="security">
        <label class="field"><span>当前主密码</span>
          <input class="input" id="set-old" type="password" autocomplete="current-password" placeholder="当前主密码" />
        </label>
        <div class="row">
          <label class="field"><span>新主密码</span>
            <input class="input" id="set-new" type="password" autocomplete="new-password" placeholder="至少 6 位" />
          </label>
          <label class="field"><span>确认新主密码</span>
            <input class="input" id="set-new2" type="password" autocomplete="new-password" placeholder="再次输入" />
          </label>
        </div>
        <button class="btn primary" id="set-change">修改主密码</button>
      </div>
      <div data-panel="data" class="hidden">
        <p style="color:#4a5163;margin-top:0">导出为明文 JSON 备份文件，请妥善保管。导入将覆盖当前全部数据。</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <a class="btn" href="/api/export" download>导出备份</a>
          <button class="btn" id="set-import">导入备份</button>
          <input type="file" id="import-file" accept="application/json,.json" class="hidden" />
        </div>
      </div>
    `;
    openModal({
      title: "设置", body, width: 480,
      onMount(overlay, close) {
        $$(".tabs button", overlay).forEach((tab) => {
          tab.addEventListener("click", () => {
            $$(".tabs button", overlay).forEach((t) => t.classList.toggle("active", t === tab));
            $$("[data-panel]", overlay).forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== tab.dataset.tab));
          });
        });
        $("#set-change", overlay).addEventListener("click", async () => {
          const oldPw = $("#set-old", overlay).value;
          const n1 = $("#set-new", overlay).value;
          const n2 = $("#set-new2", overlay).value;
          if (n1.length < 6) { toast("新密码至少 6 位", "error"); return; }
          if (n1 !== n2) { toast("两次输入不一致", "error"); return; }
          try {
            const res = await api("/api/master", { method: "POST", body: { old: oldPw, new: n1 } });
            if (res && res.token) tokenStore.set(res.token);
            close();
            toast("主密码已更新", "success");
          } catch (err) { toast(err.message, "error"); }
        });
        $("#set-import", overlay).addEventListener("click", () => $("#import-file", overlay).click());
        $("#import-file", overlay).addEventListener("change", async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const ok = await confirmDialog("导入备份", "导入将覆盖当前所有平台与账号，确定继续吗？", "导入");
          if (!ok) return;
          try {
            const text = await file.text();
            const data = JSON.parse(text);
            await api("/api/import", { method: "POST", body: data });
            close();
            await loadData();
            toast("导入成功", "success");
          } catch (err) { toast("导入失败：" + err.message, "error"); }
        });
      },
    });
  }

  // ---------------- sidebar (mobile) ----------------
  function openSidebar() {
    $("#sidebar").classList.add("open");
    if (window.innerWidth <= 760) {
      const bd = document.createElement("div");
      bd.className = "sidebar-backdrop";
      bd.id = "sidebar-backdrop";
      bd.addEventListener("click", closeSidebar);
      document.body.appendChild(bd);
    }
  }
  function closeSidebar() {
    $("#sidebar").classList.remove("open");
    $("#sidebar-backdrop")?.remove();
  }

  function updateResponsive() {
    $("#menu-toggle").style.display = window.innerWidth <= 760 ? "" : "none";
    if (window.innerWidth > 760) closeSidebar();
  }

  // ---------------- init ----------------
  async function init() {
    $("#auth-form").addEventListener("submit", handleAuthSubmit);
    $("#btn-add-account").addEventListener("click", () => openAccountModal(null));
    $("#fab-add").addEventListener("click", async () => {
      if (state.view === "memos") {
        if (state.memoEditing) {
          await flushMemoSave();
          closeMemoEditor();
          toast("已保存", "success");
        } else {
          createMemo();
        }
      } else {
        openAccountModal(null);
      }
    });
    $("#btn-add-platform").addEventListener("click", () => openPlatformModal(null));
    $("#btn-add-memo").addEventListener("click", createMemo);
    $$(".view-btn").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));
    $("#btn-settings").addEventListener("click", openSettings);
    $("#btn-lock").addEventListener("click", async () => {
      try { await api("/api/lock", { method: "POST" }); } catch {}
      tokenStore.set("");
      state.unlocked = false;
      state.accounts = [];
      state.platforms = [];
      state.memos = [];
      state.activeMemo = null;
      state.memoEditing = false;
      renderAuth();
    });
    $("#search").addEventListener("input", (e) => {
      state.search = e.target.value.trim().toLowerCase();
      if (state.view === "memos") {
        renderMemoNav();
        if (!state.memoEditing) renderMemoCards();
      } else {
        renderAccounts();
      }
    });
    $("#menu-toggle").addEventListener("click", openSidebar);
    window.addEventListener("resize", updateResponsive);
    updateResponsive();

    try {
      const status = await api("/api/status");
      state.initialized = status.initialized;
      state.unlocked = status.unlocked;
      if (status.unlocked) {
        await enterApp();
      } else {
        renderAuth();
      }
    } catch (err) {
      renderAuth();
      $("#auth-error").textContent = "无法连接服务：" + err.message;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
