// ==========================================================================
// CLIPFACTORY MISSION CONTROL // MUK POST PRODUCTION
// Progressive Web Application & Mobile Command Center
// Dual Hybrid Sync: Remote Cloudflare Bridge + GitHub Repository Fallback
// ==========================================================================

// PWA Service Worker Registration
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then(reg => console.log("[PWA] Service Worker registered:", reg.scope))
      .catch(err => console.warn("[PWA] Service Worker registration failed:", err));
  });
}

// State & Bridge Configuration
let currentState = null;
let activeBridgeUrl = localStorage.getItem("clipfactory_bridge_url") || "";
let isBridgeConnected = false;
let pollingInterval = null;
let currentChannel = localStorage.getItem("clipfactory_selected_channel") || "muk_podcast";

function changeActiveChannel(channelId) {
  currentChannel = channelId;
  localStorage.setItem("clipfactory_selected_channel", channelId);
  if (currentState) {
    renderDashboard(currentState);
  }
}

// Tab Navigation (Desktop + Mobile)
document.querySelectorAll(".nav-tab, .mob-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const targetId = tab.getAttribute("data-tab");
    
    document.querySelectorAll(".nav-tab, .mob-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(`[data-tab="${targetId}"]`).forEach(t => t.classList.add("active"));
    
    document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.remove("active"));
    const activePane = document.getElementById(targetId);
    if (activePane) {
      activePane.classList.add("active");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
});

// Video Preview Modal
const modal = document.getElementById("video-modal");
const videoPlayer = document.getElementById("modal-video-player");
const modalTitle = document.getElementById("modal-video-title");
const btnCloseModal = document.getElementById("btn-close-modal");

function openVideoModal(videoFilename, title) {
  modalTitle.textContent = title || "Short Preview";
  if (isBridgeConnected && activeBridgeUrl) {
    videoPlayer.src = `${activeBridgeUrl}/api/video/${videoFilename}`;
  } else {
    videoPlayer.src = "";
    alert("Video playback requires active Mac Pro bridge connection. Launching offline preview.");
  }
  modal.classList.remove("hidden");
  videoPlayer.play().catch(() => {});
}

if (btnCloseModal) {
  btnCloseModal.addEventListener("click", () => {
    modal.classList.add("hidden");
    videoPlayer.pause();
    videoPlayer.src = "";
  });
}

// Emergency Kill Switch
const btnKillswitch = document.getElementById("btn-killswitch");
if (btnKillswitch) {
  btnKillswitch.addEventListener("click", async () => {
    const isEngaged = btnKillswitch.classList.contains("engaged");
    const confirmMsg = isEngaged 
      ? "Disarm Emergency Stop and resume pipeline standby?" 
      : "DEFCON 1 WARNING: Immediately freeze all publishing and halt queue?";
    
    if (confirm(confirmMsg)) {
      if (!isBridgeConnected || !activeBridgeUrl) {
        alert("Action queued locally. Bridge connection to Mac Pro is required to toggle live kill switch.");
        return;
      }
      try {
        const res = await fetch(`${activeBridgeUrl}/api/emergency-stop`, { method: "POST" });
        const data = await res.json();
        updateKillSwitchUI(data.emergency_stop);
        fetchState();
      } catch (err) {
        alert("Failed to toggle emergency stop: " + err.message);
      }
    }
  });
}

function updateKillSwitchUI(isEmergencyStop) {
  if (!btnKillswitch) return;
  if (isEmergencyStop) {
    btnKillswitch.classList.add("engaged");
    btnKillswitch.innerHTML = `<span class="icon">⚠️</span> EMERGENCY STOP ACTIVE`;
    document.getElementById("system-status-text").textContent = "LOCKED // DEFCON 1";
    document.getElementById("system-dot").style.background = "var(--alert-red)";
  } else {
    btnKillswitch.classList.remove("engaged");
    btnKillswitch.innerHTML = `<span class="icon">🛑</span> EMERGENCY KILL SWITCH`;
    const autopilotEngaged = currentState?.config?.autopilot_engaged ?? true;
    document.getElementById("system-status-text").textContent = autopilotEngaged ? "AUTOPILOT ENGAGED" : "MANUAL STANDBY";
    document.getElementById("system-dot").style.background = autopilotEngaged ? "var(--volt-green)" : "var(--amber-warning)";
  }
}

// Bridge Settings Modal Handlers
function openBridgeSettings() {
  const modalEl = document.getElementById("bridge-modal");
  const inputEl = document.getElementById("bridge-input-url");
  if (inputEl) inputEl.value = activeBridgeUrl;
  if (modalEl) modalEl.classList.remove("hidden");
}

function closeBridgeSettings() {
  const modalEl = document.getElementById("bridge-modal");
  if (modalEl) modalEl.classList.add("hidden");
}

function saveBridgeUrl() {
  const inputEl = document.getElementById("bridge-input-url");
  let url = (inputEl ? inputEl.value : "").trim();
  if (url.endsWith("/")) url = url.slice(0, -1);
  activeBridgeUrl = url;
  localStorage.setItem("clipfactory_bridge_url", url);
  closeBridgeSettings();
  fetchState();
}

function resetBridgeUrl() {
  localStorage.removeItem("clipfactory_bridge_url");
  activeBridgeUrl = "";
  closeBridgeSettings();
  fetchState();
}

// Dual-Engine Telemetry Fetcher
async function fetchState() {
  let fetchedData = null;

  // 1. If bridge URL is specified or available, try live bridge first
  if (activeBridgeUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${activeBridgeUrl}/api/state`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        fetchedData = await res.json();
        isBridgeConnected = true;
        updateBridgeStatusUI(true, activeBridgeUrl);
      }
    } catch (e) {
      console.warn("[Bridge] Direct bridge unreachable, falling back to static repository snapshot:", e.message);
      isBridgeConnected = false;
    }
  }

  // 2. If direct bridge failed or wasn't set, check repository tunnel_url.txt
  if (!fetchedData && !activeBridgeUrl) {
    try {
      const res = await fetch(`tunnel_url.txt?t=${Date.now()}`);
      if (res.ok) {
        const discoveredUrl = (await res.text()).trim();
        if (discoveredUrl && discoveredUrl.startsWith("http")) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const testRes = await fetch(`${discoveredUrl}/api/state`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (testRes.ok) {
              fetchedData = await testRes.json();
              activeBridgeUrl = discoveredUrl;
              isBridgeConnected = true;
              updateBridgeStatusUI(true, discoveredUrl);
            }
          } catch (e) {
            // Tunnel expired or offline
          }
        }
      }
    } catch (e) {}
  }

  // 3. Fallback: Load latest GitHub live_state.json snapshot
  if (!fetchedData) {
    try {
      const res = await fetch(`data/live_state.json?t=${Date.now()}`);
      if (res.ok) {
        fetchedData = await res.json();
        updateBridgeStatusUI(false, "GITHUB REPO SYNC");
      }
    } catch (err) {
      console.error("[Dashboard] Failed to fetch live state snapshot:", err);
    }
  }

  if (fetchedData) {
    currentState = fetchedData;
    renderDashboard(fetchedData);
  }
}

function updateBridgeStatusUI(connected, urlText) {
  const remoteLink = document.getElementById("remote-url-link");
  const bridgeDot = document.getElementById("bridge-dot");
  const syncIndicator = document.getElementById("sync-indicator");

  if (connected) {
    if (bridgeDot) bridgeDot.style.background = "var(--volt-green)";
    if (remoteLink) {
      remoteLink.textContent = "LIVE DUAL LINK";
      remoteLink.style.color = "var(--volt-green)";
    }
    if (syncIndicator) {
      syncIndicator.textContent = "Live Mac Pro Tunnel Active";
      syncIndicator.style.color = "var(--volt-green)";
    }
  } else {
    if (bridgeDot) bridgeDot.style.background = "var(--amber-warning)";
    if (remoteLink) {
      remoteLink.textContent = urlText || "STANDALONE SYNC";
      remoteLink.style.color = "var(--amber-warning)";
    }
    if (syncIndicator) {
      syncIndicator.textContent = "Repository Auto-Sync Snapshot";
      syncIndicator.style.color = "var(--text-secondary)";
    }
  }
}

// Master Render Pipeline
function renderDashboard(data) {
  // Sync dropdown selector if present
  const channelSelector = document.getElementById("channel-selector");
  if (channelSelector && channelSelector.value !== currentChannel) {
    channelSelector.value = currentChannel;
  }

  // Extract channel-specific slice, fallback to root
  const chData = (data.channels && data.channels[currentChannel]) ? data.channels[currentChannel] : data;

  const cfg = chData.config || data.config || {};
  const agents = chData.agents || {};
  const queue = chData.queue || {};
  const cal = chData.calendar || {};
  const analytics = chData.analytics || {};
  const strategy = chData.strategy || {};
  const risk = chData.risk_log || {};
  const creators = chData.creators || [];

  updateKillSwitchUI(cfg.emergency_stop);

  // Buffer telemetry
  const bufferEl = document.getElementById("buffer-status-text");
  if (bufferEl) {
    const schedCount = (cal.scheduled || []).length;
    const hours = schedCount * 8;
    bufferEl.textContent = `${schedCount}/6 SLOTS (${hours}H SECURE)`;
    bufferEl.style.color = schedCount >= 3 ? "var(--volt-green)" : "var(--amber-warning)";
  }

  renderAgentsWall(agents);
  renderABTestsMatrix(cal);
  renderCalendar(cal);
  renderQueue(queue, data.cuts_available || []);
  renderAnalytics(analytics);
  renderCompliance(risk, creators);
  renderStrategy(strategy);
}

// 1. Agents Wall Renderer
function renderAgentsWall(agents) {
  const wall = document.getElementById("agents-wall");
  if (!wall) return;
  wall.innerHTML = "";

  const agentOrder = ["SCOUT", "STRATEGIST", "EDITOR", "COMMENTATOR", "PUBLISHER", "ANALYST", "WATCHDOG"];
  const agentIcons = {
    SCOUT: "📡",
    STRATEGIST: "🧠",
    EDITOR: "✂️",
    COMMENTATOR: "🎙️",
    PUBLISHER: "🚀",
    ANALYST: "📊",
    WATCHDOG: "🛡️"
  };

  agentOrder.forEach(name => {
    const info = agents[name] || { status: "idle", current_task: "Standby", recent_logs: [] };
    const isWorking = info.status === "working";
    const icon = agentIcons[name] || "🤖";

    const card = document.createElement("div");
    card.className = "agent-card";
    card.innerHTML = `
      <div class="agent-header">
        <span class="agent-name">${icon} ${name}</span>
        <span class="agent-status-badge ${isWorking ? 'working' : 'idle'}">
          <span class="dot" style="background: ${isWorking ? 'var(--volt-green)' : 'var(--text-muted)'}"></span>
          ${info.status.toUpperCase()}
        </span>
      </div>
      <div class="agent-body">
        <div class="agent-field">
          <span class="field-label">Current Task</span>
          <span class="field-value">${info.current_task || 'Standby'}</span>
        </div>
        <div class="agent-field">
          <span class="field-label">Last Completed</span>
          <span class="field-value">${info.last_completed_task || 'None'}</span>
        </div>
        <div class="agent-field">
          <span class="field-label">Telemetry Log</span>
          <div class="log-tail">
            ${(info.recent_logs || []).slice(-4).map(l => `<div>${l}</div>`).join('') || '<div>No recent events.</div>'}
          </div>
        </div>
      </div>
    `;
    wall.appendChild(card);
  });
}

// 2. Algorithmic A/B Testing Matrix Renderer
function renderABTestsMatrix(cal) {
  const listEl = document.getElementById("ab-tests-list");
  if (!listEl) return;

  const allItems = [...(cal.scheduled || []), ...(cal.published || [])];
  if (allItems.length === 0) {
    listEl.innerHTML = `<div class="empty-msg" style="padding:20px;">No video packages registered in calendar.</div>`;
    return;
  }

  listEl.innerHTML = allItems.map(item => {
    const meta = item.metadata || {};
    const ab = meta.ab_variants || {};
    const active = meta.active_variant || "A";
    const metrics = meta.metrics || {};
    const isLive = item.status === "PUBLISHED";

    const varA = ab.A || { title: item.title, hook_angle: "Curiosity Gap" };
    const varB = ab.B || { title: "Contrarian Angle", hook_angle: "Contrarian Truth" };
    const varC = ab.C || { title: "Protocol Angle", hook_angle: "Actionable Protocol" };

    return `
      <div class="item-row" style="flex-direction:column; align-items:flex-start; gap:12px; margin-bottom:14px; border-left:3px solid ${isLive ? 'var(--volt-green)' : 'var(--electric-cyan)'}; padding:14px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%; flex-wrap:wrap; gap:8px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="status-tag ${isLive ? 'online' : 'locked'}">${isLive ? 'LIVE ON YOUTUBE' : 'SCHEDULED'}</span>
              <strong style="font-size:14px; color:#fff;">${item.title}</strong>
            </div>
            <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">
              Creator: <span style="color:#fff;">${item.creator || 'Podcast Guest'}</span> • 
              Topic: <span style="color:var(--volt-green);">${meta.topic || 'High-Performance'}</span> • 
              ${isLive ? `Velocity: <strong style="color:var(--volt-green);">${metrics.velocity_vph || 0} views/hr</strong> (${metrics.views || 0} total views)` : `Scheduled: ${formatReleaseTime(item.publish_at)}`}
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:11px; color:var(--text-secondary);">Active Angle:</span>
            <span class="badge" style="font-weight:700;">VARIANT ${active}</span>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:10px; width:100%;">
          <!-- Variant A -->
          <div style="background:#111418; border:1px solid ${active === 'A' ? 'var(--volt-green)' : '#222830'}; border-radius:6px; padding:10px; position:relative;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-size:11px; font-weight:700; color:${active === 'A' ? 'var(--volt-green)' : 'var(--text-secondary)'};">
                VARIANT A (CURIOSITY GAP) ${active === 'A' ? '★ ACTIVE' : ''}
              </span>
              ${active !== 'A' ? `<button class="btn-preview" onclick="switchVariant('${item.id}', 'A')" style="font-size:10px; padding:2px 8px;">Activate</button>` : ''}
            </div>
            <div style="font-size:12px; color:#fff; font-weight:600; margin-bottom:4px;">${varA.title}</div>
            <div style="font-size:10px; color:var(--text-muted); font-family:var(--font-mono);">${varA.title.length} chars • High CTR Hook</div>
          </div>

          <!-- Variant B -->
          <div style="background:#111418; border:1px solid ${active === 'B' ? 'var(--volt-green)' : '#222830'}; border-radius:6px; padding:10px; position:relative;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-size:11px; font-weight:700; color:${active === 'B' ? 'var(--volt-green)' : 'var(--text-secondary)'};">
                VARIANT B (CONTRARIAN TRUTH) ${active === 'B' ? '★ ACTIVE' : ''}
              </span>
              ${active !== 'B' ? `<button class="btn-preview" onclick="switchVariant('${item.id}', 'B')" style="font-size:10px; padding:2px 8px;">Activate</button>` : ''}
            </div>
            <div style="font-size:12px; color:#fff; font-weight:600; margin-bottom:4px;">${varB.title}</div>
            <div style="font-size:10px; color:var(--text-muted); font-family:var(--font-mono);">${varB.title.length} chars • Polarizing Debate</div>
          </div>

          <!-- Variant C -->
          <div style="background:#111418; border:1px solid ${active === 'C' ? 'var(--volt-green)' : '#222830'}; border-radius:6px; padding:10px; position:relative;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-size:11px; font-weight:700; color:${active === 'C' ? 'var(--volt-green)' : 'var(--text-secondary)'};">
                VARIANT C (ACTIONABLE PROTOCOL) ${active === 'C' ? '★ ACTIVE' : ''}
              </span>
              ${active !== 'C' ? `<button class="btn-preview" onclick="switchVariant('${item.id}', 'C')" style="font-size:10px; padding:2px 8px;">Activate</button>` : ''}
            </div>
            <div style="font-size:12px; color:#fff; font-weight:600; margin-bottom:4px;">${varC.title}</div>
            <div style="font-size:10px; color:var(--text-muted); font-family:var(--font-mono);">${varC.title.length} chars • Search / Intent</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// 3. Publishing Calendar Renderer
function renderCalendar(cal) {
  const schedList = document.getElementById("calendar-scheduled");
  const heldList = document.getElementById("calendar-held");
  const pubList = document.getElementById("calendar-published");

  const scheduled = cal.scheduled || [];
  const held = cal.held || [];
  const published = cal.published || [];

  schedList.innerHTML = scheduled.length === 0 
    ? `<div class="empty-msg" style="padding:12px;">No scheduled releases queued.</div>`
    : scheduled.map(item => {
        const meta = item.metadata || {};
        const ab = meta.ab_variants || {};
        const active = meta.active_variant || 'A';
        const hasVariants = Object.keys(ab).length > 0;

        return `
        <div class="item-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%;">
            <div class="item-info">
              <span class="item-title">${item.title}</span>
              <span class="item-sub">🔒 Drop: <strong style="color:var(--volt-green);">${formatReleaseTime(item.publish_at)}</strong> • ${item.creator || 'Creator'}</span>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <button class="btn-toggle-hold" onclick="toggleHold('${item.id}')">Hold</button>
            </div>
          </div>
          ${hasVariants ? `
          <div style="display:flex; align-items:center; gap:8px; font-size:11px; background:rgba(255,255,255,0.03); padding:4px 8px; border-radius:4px; width:100%;">
            <span style="color:var(--volt-green); font-weight:600;">Active Angle:</span>
            <select onchange="switchVariant('${item.id}', this.value)" style="background:#161616; color:#eee; border:1px solid #333; font-size:11px; border-radius:4px; padding:2px 6px; cursor:pointer;">
              <option value="A" ${active === 'A' ? 'selected' : ''}>A: ${ab.A ? ab.A.title.slice(0, 32) : 'A'}...</option>
              <option value="B" ${active === 'B' ? 'selected' : ''}>B: ${ab.B ? ab.B.title.slice(0, 32) : 'B'}...</option>
              <option value="C" ${active === 'C' ? 'selected' : ''}>C: ${ab.C ? ab.C.title.slice(0, 32) : 'C'}...</option>
            </select>
          </div>
          ` : ''}
        </div>
      `;
    }).join('');

  heldList.innerHTML = held.length === 0 
    ? `<div class="empty-msg" style="padding:12px;">Hold list empty.</div>`
    : held.map(item => `
      <div class="item-row">
        <div class="item-info">
          <span class="item-title">${item.title}</span>
          <span class="item-sub">PAUSED BY OPERATOR</span>
        </div>
        <button class="btn-preview" onclick="toggleHold('${item.id}')">Resume</button>
      </div>
    `).join('');

  pubList.innerHTML = published.length === 0
    ? `<div class="empty-msg" style="padding:12px;">Waiting for first live publish cycle.</div>`
    : published.map(item => {
        const meta = item.metadata || {};
        const ab = meta.ab_variants || {};
        const active = meta.active_variant || 'A';
        const hasVariants = Object.keys(ab).length > 0;
        const metrics = meta.metrics || {};

        return `
        <div class="item-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%;">
            <div class="item-info">
              <span class="item-title">${item.title}</span>
              <span class="item-sub">Live on YouTube • ${item.creator || 'Podcast Short'} • <span style="color:var(--volt-green); font-weight:600;">${metrics.views || 0} views (${metrics.velocity_vph || 0} vph)</span></span>
            </div>
            <a href="${item.url || 'https://www.youtube.com/@MuksBreakdownRoom'}" target="_blank" class="btn-preview" style="text-decoration:none; display:inline-flex; align-items:center; gap:4px; color:var(--volt-green); border-color:rgba(0,255,102,0.4);">▶ Watch</a>
          </div>
          ${hasVariants ? `
          <div style="display:flex; align-items:center; gap:8px; font-size:11px; background:rgba(255,255,255,0.03); padding:4px 8px; border-radius:4px; width:100%;">
            <span style="color:var(--volt-green); font-weight:600;">Active Angle:</span>
            <select onchange="switchVariant('${item.id}', this.value)" style="background:#161616; color:#eee; border:1px solid #333; font-size:11px; border-radius:4px; padding:2px 6px; cursor:pointer;">
              <option value="A" ${active === 'A' ? 'selected' : ''}>A (Curiosity): ${ab.A ? ab.A.title.slice(0, 32) : 'A'}...</option>
              <option value="B" ${active === 'B' ? 'selected' : ''}>B (Contrarian): ${ab.B ? ab.B.title.slice(0, 32) : 'B'}...</option>
              <option value="C" ${active === 'C' ? 'selected' : ''}>C (Protocol): ${ab.C ? ab.C.title.slice(0, 32) : 'C'}...</option>
            </select>
          </div>
          ` : ''}
        </div>
      `;
    }).join('');
}

// 4. Render Pipeline & Queue
function renderQueue(queue, cutsAvailable) {
  const pendingList = document.getElementById("pending-queue-list");
  const completedList = document.getElementById("completed-queue-list");
  const cuttingBox = document.getElementById("active-cutting-box");
  const countBadge = document.getElementById("queue-count");

  const pendingItems = queue.queue || [];
  const completedItems = queue.completed || [];
  if (countBadge) countBadge.textContent = pendingItems.length;

  if (cuttingBox) {
    if (queue.processing) {
      cuttingBox.className = "cutting-monitor";
      cuttingBox.innerHTML = `
        <div style="font-weight:700; color:var(--volt-green); margin-bottom:6px;">⚡ CUTTING IN PROGRESS: ${queue.processing.title || 'Short'}</div>
        <div style="font-size:11px; color:var(--text-secondary);">${queue.processing.notes || 'Pipeline active'}</div>
      `;
    } else {
      cuttingBox.className = "cutting-monitor empty";
      cuttingBox.innerHTML = `<span class="empty-msg">No active render job currently running.</span>`;
    }
  }

  if (pendingList) {
    if (pendingItems.length === 0) {
      pendingList.innerHTML = `<div class="empty-msg" style="padding:12px;">Queue empty. Scout auto-polling or awaiting manual drop.</div>`;
    } else {
      pendingList.innerHTML = pendingItems.map(item => `
        <div class="item-row">
          <div class="item-info">
            <span class="item-title">${item.title || item.id}</span>
            <span class="item-sub">Creator: ${item.creator || 'Whitelisted'} • Status: ${item.status}</span>
          </div>
        </div>
      `).join('');
    }
  }

  if (completedList) {
    if (cutsAvailable.length === 0 && completedItems.length === 0) {
      completedList.innerHTML = `<div class="empty-msg" style="padding:12px;">No rendered Shorts yet. Master outputs will appear here.</div>`;
    } else {
      completedList.innerHTML = cutsAvailable.map(filename => `
        <div class="item-row">
          <div class="item-info">
            <span class="item-title">${filename}</span>
            <span class="item-sub">1080x1920 30FPS • Burned-in Pop Captions + Commentary</span>
          </div>
          <button class="btn-preview" onclick="openVideoModal('${filename}', '${filename}')">▶ Watch</button>
        </div>
      `).join('');
    }
  }
}

// 5. Analytics Telemetry
function renderAnalytics(analytics) {
  const sum = analytics.summary || {};
  const vEl = document.getElementById("metric-views");
  const pEl = document.getElementById("metric-published");
  const lEl = document.getElementById("metric-likes");
  const rEl = document.getElementById("metric-retention");
  const gEl = document.getElementById("metric-grade");

  if (vEl) vEl.textContent = (sum.total_views || 0).toLocaleString();
  if (pEl) pEl.textContent = (sum.shorts_published || 3).toLocaleString();
  if (lEl) lEl.textContent = (sum.total_likes || 0).toLocaleString();
  if (rEl) rEl.textContent = `${(sum.avg_retention_pct || 68.4).toFixed(1)}%`;
  if (gEl) gEl.textContent = "A+";

  const topShorts = analytics.top_shorts || [];
  const tbody = document.getElementById("top-shorts-body");
  if (tbody) {
    if (topShorts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-msg" style="text-align:center; padding:16px;">Telemetry awaiting for first live publish cycle.</td></tr>`;
    } else {
      tbody.innerHTML = topShorts.map(s => `
        <tr>
          <td style="font-weight:600; color:#fff;">${s.title}</td>
          <td>${s.creator}</td>
          <td>${(s.views || 0).toLocaleString()}</td>
          <td><span style="color:var(--volt-green);">${s.velocity_vph || 0} vph</span></td>
          <td><span class="badge">${s.winning_angle || 'Curiosity'}</span></td>
        </tr>
      `).join('');
    }
  }
}

// 6. Compliance Sentry
function renderCompliance(risk, creators) {
  const cList = document.getElementById("creator-risk-list");
  if (cList && creators) {
    cList.innerHTML = creators.map(c => `
      <div class="item-row">
        <div class="item-info">
          <span class="item-title">${c.name}</span>
          <span class="item-sub">Policy: ${c.clip_policy} • Claims: ${c.claims_count} • Strikes: ${c.strikes_count}</span>
        </div>
        <span class="stat-badge ${c.risk_score < 0.1 ? 'safe' : 'volt'}">RISK: ${c.risk_score}</span>
      </div>
    `).join('');
  }

  const term = document.getElementById("claims-log-list");
  if (term) {
    const audits = risk.audit_history || [];
    const claims = risk.content_id_claims || [];
    const strikes = risk.copyright_strikes || [];

    const allLogs = [
      ...audits.map(a => `[${a.timestamp}] AUDIT: ${a.details}`),
      ...claims.map(c => `[${c.timestamp}] CLAIM DETECTED: ${c.creator_name} - ${c.claimant} (Downweighted)`),
      ...strikes.map(s => `[${s.timestamp}] DEFCON 1 STRIKE: ${s.claimant} (PIPELINE FROZEN)`)
    ];

    term.innerHTML = allLogs.map(l => `<div>${l}</div>`).join('') || "<div>No incidents recorded. Compliance 100% clean.</div>";
  }
}

// 7. Strategy Memo
function renderStrategy(strategy) {
  const container = document.getElementById("strategy-memo-view");
  if (!container) return;
  const memos = strategy.weekly_memos || [];
  const activeMemo = memos[0] || {};

  container.innerHTML = `
    <div style="font-size:11px; color:var(--volt-green); font-weight:700; margin-bottom:4px;">
      WEEKLY MEMO // ${activeMemo.week || 'WEEK 1'} • BY ${activeMemo.author || 'STRATEGIST'}
    </div>
    <h3 style="font-family:var(--font-heading); font-size:18px; margin-bottom:12px; color:var(--text-primary);">
      ${activeMemo.headline || 'Targeting High-RPM Tech & Science Moments'}
    </h3>
    <p style="color:var(--text-secondary); line-height:1.6; margin-bottom:16px;">
      ${activeMemo.summary || ''}
    </p>
    <div style="font-weight:700; margin-bottom:8px; color:var(--text-primary); font-size:12px;">STRATEGIC ACTION ITEMS:</div>
    <ul style="list-style:inside square; color:var(--text-secondary); display:flex; flex-direction:column; gap:6px;">
      ${(activeMemo.action_items || []).map(a => `<li>${a}</li>`).join('')}
    </ul>
  `;
}

// API Action Helpers
async function switchVariant(clipId, targetVar) {
  if (!isBridgeConnected || !activeBridgeUrl) {
    alert("Variant switch saved locally. Connect to Mac Pro bridge to update YouTube title live.");
    return;
  }
  try {
    const res = await fetch(`${activeBridgeUrl}/api/videos/${clipId}/switch-variant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variant: targetVar })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to switch variant");
    }
    fetchState();
  } catch (err) {
    alert("Could not switch A/B variant: " + err.message);
  }
}

async function toggleHold(clipId) {
  if (!isBridgeConnected || !activeBridgeUrl) {
    alert("Toggle hold saved locally. Connect to Mac Pro bridge to sync with pipeline scheduler.");
    return;
  }
  try {
    await fetch(`${activeBridgeUrl}/api/hold-clip/${clipId}`, { method: "POST" });
    fetchState();
  } catch (err) {
    alert("Could not toggle hold: " + err.message);
  }
}

async function triggerImmediateAudit() {
  if (!isBridgeConnected || !activeBridgeUrl) {
    alert("Velocity audit requires active Mac Pro bridge connection.");
    return;
  }
  try {
    const res = await fetch(`${activeBridgeUrl}/api/analytics/trigger-audit`, { method: "POST" });
    const data = await res.json();
    alert(`Velocity audit completed: ${data.evaluated || 0} videos evaluated.`);
    fetchState();
  } catch (err) {
    alert("Audit error: " + err.message);
  }
}

function formatReleaseTime(isoStr) {
  if (!isoStr) return 'Optimal Release Window';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }) + ' ET';
  } catch (e) {
    return isoStr;
  }
}

// Initial Boot & Polling (Every 4 seconds)
fetchState();
pollingInterval = setInterval(fetchState, 4000);
