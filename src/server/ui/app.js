/* ═══════════════════════════════════════════════════════════════
   ELO — Autonomous Home Intelligence · Frontend SPA
   ═══════════════════════════════════════════════════════════════ */
var ELO = (function () {
  'use strict';

  /* ── helpers ────────────────────────────────────────────────── */
  var API = '';
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function html(el, h) { el.innerHTML = h; }
  function show(el) { el.style.display = ''; }
  function hide(el) { el.style.display = 'none'; }
  function json(url) {
    return fetch(API + url).then(function (r) { return r.json(); }).then(function (d) {
      // auto-unwrap {success, data} envelope
      if (d && d.success && d.data !== undefined) return d.data;
      return d;
    });
  }
  function post(url, body) {
    return fetch(API + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.success === false) {
        var err = new Error(d.error || d.message || 'Request failed');
        err.data = d;
        throw err;
      }
      if (d && d.success && d.data !== undefined) {
        d.data._message = d.message;
        return d.data;
      }
      return d;
    });
  }
  function del(url) { return fetch(API + url, { method: 'DELETE' }).then(function (r) { return r.json(); }).then(function (d) {
    if (d && d.success && d.data !== undefined) return d.data;
    return d;
  }); }
  function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function ago(ts) {
    if (!ts) return '';
    var diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60) return Math.floor(diff) + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }
  function deviceIcon(type) {
    var map = { tv: '📺', camera: '📷', light: '💡', speaker: '🔊', ac: '❄️', sensor: '📡', lock: '🔒', plug: '🔌' };
    var t = (type || '').toLowerCase();
    for (var k in map) { if (t.indexOf(k) !== -1) return map[k]; }
    return '📟';
  }

  /* ── toast ──────────────────────────────────────────────────── */
  function toast(msg, type) {
    type = type || 'info';
    var icons = { success: '✓', error: '✗', info: 'ℹ' };
    var c = document.getElementById('toast-container');
    var t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = '<span class="toast-icon">' + (icons[type] || 'ℹ') + '</span>' + esc(msg);
    c.appendChild(t);
    setTimeout(function () {
      t.classList.add('exiting');
      setTimeout(function () { t.remove(); }, 300);
    }, 3500);
  }

  /* ── routing ────────────────────────────────────────────────── */
  var currentPage = 'dashboard';

  function navigate(page) {
    currentPage = page;
    $$('.page').forEach(function (p) { p.classList.remove('active'); });
    $$('.nav-item').forEach(function (n) { n.classList.remove('active'); });
    var target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');
    var link = $('[data-page="' + page + '"]');
    if (link) link.classList.add('active');
    // close mobile
    var sb = $('.sidebar');
    if (sb) sb.classList.remove('open');
    var ov = $('.sidebar-overlay');
    if (ov) ov.classList.remove('open');
    // load data
    var loaders = {
      dashboard: loadDashboard,
      devices: loadDevices,
      people: loadPeople,
      automations: loadAutomations,
      correlations: loadCorrelations,
      voice: loadVoice,
      discovery: loadDiscovery,
      briefing: loadBriefing,
      settings: loadSettings
    };
    if (loaders[page]) loaders[page]();
  }

  function initRouter() {
    var h = location.hash.replace('#', '') || 'dashboard';
    navigate(h);
    window.addEventListener('hashchange', function () {
      navigate(location.hash.replace('#', '') || 'dashboard');
    });
    $$('.nav-item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        var page = this.getAttribute('data-page');
        if (page) { location.hash = page; }
      });
    });
  }

  /* ── Dashboard ──────────────────────────────────────────────── */
  function loadDashboard() {
    Promise.all([
      json('/api/status').catch(function () { return {}; }),
      json('/api/devices').catch(function () { return []; }),
      json('/api/correlations').catch(function () { return []; }),
      json('/api/suggestions').catch(function () { return []; }),
      json('/api/requests').catch(function () { return []; })
    ]).then(function (res) {
      var status = res[0], devices = res[1], corrs = res[2], suggs = res[3], reqs = res[4];
      var devArr = Array.isArray(devices) ? devices : (devices.devices || []);
      var corrArr = Array.isArray(corrs) ? corrs : (corrs.patterns || corrs.correlations || []);
      var suggArr = Array.isArray(suggs) ? suggs : (suggs.suggestions || []);
      var reqArr = Array.isArray(reqs) ? reqs : (reqs.requests || []);
      var counts = status.counts || {};

      $('#kpi-devices').textContent = devArr.length || counts.devices || 0;
      $('#kpi-correlations').textContent = corrArr.length;
      $('#kpi-suggestions').textContent = counts.pendingSuggestions || suggArr.filter(function (s) { return s.status === 'pending'; }).length;
      var el = $('#kpi-uptime');
      if (el) el.textContent = status.timestamp ? 'Online' : '—';

      // recent events
      var evHtml = '';
      var recent = reqArr.slice(-8).reverse();
      if (recent.length === 0) {
        evHtml = '<div class="empty-state small"><p>No recent events</p></div>';
      } else {
        recent.forEach(function (r) {
          var dot = 'green';
          evHtml += '<div class="event-item"><div class="event-dot ' + dot + '"></div><div class="event-info"><div class="event-text">' + esc(r.request || r.message || JSON.stringify(r).substring(0, 80)) + '</div><div class="event-time">' + ago(r.timestamp || r.created_at) + '</div></div></div>';
        });
      }
      html($('#dashboard-events'), evHtml);

      // suggestions
      var sgHtml = '';
      var pendSugg = suggArr.filter(function (s) { return s.status === 'pending'; }).slice(0, 5);
      if (pendSugg.length === 0) {
        sgHtml = '<div class="empty-state small"><p>No pending suggestions</p></div>';
      } else {
        pendSugg.forEach(function (s) {
          sgHtml += '<div class="event-item"><div class="event-dot purple"></div><div class="event-info"><div class="event-text">' + esc(s.description || s.suggestion || s.title || '') + '</div></div></div>';
        });
      }
      html($('#dashboard-suggestions'), sgHtml);

      // status
      var sb = document.getElementById('status-badge');
      if (sb) {
        sb.className = 'status-dot' + (status.timestamp ? ' online' : '');
      }
    });
  }

  /* ── Devices ────────────────────────────────────────────────── */
  var allDevices = [];

  function loadDevices() {
    json('/api/devices').then(function (data) {
      allDevices = Array.isArray(data) ? data : (data.devices || []);
      renderDevices(allDevices);
    }).catch(function () { html($('#devices-grid'), '<div class="empty-state"><p>Could not load devices</p></div>'); });
  }

  function renderDevices(list) {
    if (list.length === 0) {
      html($('#devices-grid'), '<div class="empty-state"><svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M9 17h6M12 3v1m6.36 1.64l-.71.71M21 12h-1M4 12H3m1.64-6.36l.71.71M12 21v-1"/></svg><p>No devices registered yet</p></div>');
      return;
    }
    var h = '';
    list.forEach(function (d) {
      var st = d.driver_status || d.status || 'unknown';
      var stClass = st === 'ready' ? 'ready' : (st === 'pending' ? 'pending' : 'unknown');
      h += '<div class="device-card" onclick="ELO.openDevice(\'' + esc(d.id) + '\')">' +
        '<div class="device-card-head">' +
          '<div class="device-icon">' + deviceIcon(d.type) + '</div>' +
          '<div><div class="device-name">' + esc(d.name) + '</div><div class="device-type">' + esc(d.type || 'Unknown') + '</div></div>' +
        '</div>' +
        '<div class="device-meta">' +
          '<span class="device-meta-item"><span class="device-status-dot ' + stClass + '"></span>' + esc(st) + '</span>' +
          (d.ip ? '<span class="device-meta-item">' + esc(d.ip) + '</span>' : '') +
        '</div>' +
        '<div class="device-actions-bar">' +
          '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();ELO.openDevice(\'' + esc(d.id) + '\')">Details</button>' +
        '</div>' +
      '</div>';
    });
    html($('#devices-grid'), h);
  }

  function filterDevices(q) {
    q = q.toLowerCase();
    var filtered = allDevices.filter(function (d) {
      return (d.name || '').toLowerCase().indexOf(q) !== -1 || (d.type || '').toLowerCase().indexOf(q) !== -1 || (d.ip || '').indexOf(q) !== -1;
    });
    renderDevices(filtered);
  }

  /* ── Device Modal ───────────────────────────────────────────── */
  var currentDevice = null;

  function openDevice(id) {
    currentDevice = allDevices.find(function (d) { return d.id === id; });
    if (!currentDevice) return;
    $('#device-modal-title').textContent = currentDevice.name || id;
    var modal = document.getElementById('device-modal');
    modal.classList.add('open');

    // populate settings form
    var d = currentDevice;
    var setVal = function (sel, val) { var el = $(sel); if (el) el.value = val || ''; };
    setVal('#edit-device-id', d.id);
    setVal('#edit-device-name', d.name);
    setVal('#edit-device-room', d.room || d.location || '');
    setVal('#edit-device-type', d.type);
    setVal('#edit-device-ip', d.ip);
    setVal('#edit-device-brand', d.brand || d.manufacturer || '');
    setVal('#edit-device-model', d.model || '');
    setVal('#edit-device-username', d.username || '');
    setVal('#edit-device-password', d.password || '');
    setVal('#edit-device-endpoint', d.endpoint || '');
    setVal('#edit-device-protocol', d.protocol || '');
    var statusSel = $('#edit-device-status');
    if (statusSel) statusSel.value = d.driver_status || d.status || 'unknown';
    setVal('#edit-device-notes', d.notes || '');

    // hint
    var hint = $('#edit-device-hint');
    if (hint) {
      var st = d.driver_status || d.status || 'unknown';
      hint.classList.add('visible');
      if (st === 'ready') {
        hint.innerHTML = '<span style="color:var(--green)">✓ Driver pronto</span>';
      } else if (st === 'pending') {
        hint.innerHTML = '<span style="color:var(--amber)">⏳ Driver pendente — clique em "Recriar Driver" para gerar</span>';
      } else {
        hint.innerHTML = '<span style="color:var(--text-muted)">Status: ' + esc(st) + '</span>';
      }
    }

    // controls tab
    renderDeviceControls(currentDevice);

    // activate first tab; for cameras, open Controls tab directly
    var devType = (currentDevice.type || '').toLowerCase();
    if (devType.indexOf('camera') !== -1 || devType.indexOf('cam') !== -1) {
      switchDeviceTab('controls');
    } else {
      switchDeviceTab('settings');
    }
  }

  function switchDeviceTab(tab) {
    $$('#device-modal .mtab').forEach(function (t) { t.classList.remove('active'); });
    $$('#device-modal .mtab-content').forEach(function (c) { c.classList.remove('active'); });
    var btn = $('#device-modal .mtab[data-mtab="' + tab + '"]');
    var content = document.getElementById('device-tab-' + tab);
    if (btn) btn.classList.add('active');
    if (content) content.classList.add('active');
  }

  function renderDeviceControls(dev) {
    var type = (dev.type || '').toLowerCase();
    var ctrl = '';

    if (type.indexOf('tv') !== -1 || type.indexOf('samsung') !== -1) {
      ctrl = '<div class="controls-section"><h4>TV Remote</h4><div class="tv-remote">' +
        '<div></div><button class="btn btn-ghost btn-sm" onclick="ELO.deviceAction(\'' + dev.id + '\',\'volume_up\')">🔊 Vol+</button><div></div>' +
        '<button class="btn btn-ghost btn-sm" onclick="ELO.deviceAction(\'' + dev.id + '\',\'channel_prev\')">◀ Ch</button>' +
        '<button class="btn btn-primary btn-sm" onclick="ELO.deviceAction(\'' + dev.id + '\',\'power\')">⏻</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="ELO.deviceAction(\'' + dev.id + '\',\'channel_next\')">Ch ▶</button>' +
        '<div></div><button class="btn btn-ghost btn-sm" onclick="ELO.deviceAction(\'' + dev.id + '\',\'volume_down\')">🔈 Vol-</button><div></div>' +
        '</div></div>' +
        '<div class="controls-section"><h4>Quick Actions</h4><div style="display:flex;gap:.35rem;flex-wrap:wrap">' +
        '<button class="btn btn-ghost btn-sm" onclick="ELO.deviceAction(\'' + dev.id + '\',\'mute\')">🔇 Mute</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="ELO.deviceAction(\'' + dev.id + '\',\'home\')">🏠 Home</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="ELO.deviceAction(\'' + dev.id + '\',\'back\')">← Back</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="ELO.deviceAction(\'' + dev.id + '\',\'source\')">📥 Source</button>' +
        '</div></div>';
    } else if (type.indexOf('camera') !== -1 || type.indexOf('cam') !== -1) {
      ctrl = '<div class="controls-section"><h4>Camera Preview</h4>' +
        '<div id="camera-stream-' + dev.id + '" class="camera-stream" style="min-height:200px;background:#111;border-radius:8px;display:flex;align-items:center;justify-content:center;"><div class="empty-state small"><p>Carregando stream...</p></div></div>' +
        '<div class="camera-controls" style="display:flex;gap:.35rem;margin-top:.5rem;flex-wrap:wrap">' +
        '<button class="btn btn-ghost btn-sm" onclick="ELO.loadCameraStream(\'' + dev.id + '\')">↻ Recarregar</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="ELO.getCameraSnapshot(\'' + dev.id + '\')">📷 Snapshot</button>' +
        '</div></div>' +
        '<div class="controls-section"><h4>PTZ Controls</h4>' +
        '<div class="remote-control" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-width:200px;margin:0 auto">' +
        '<div></div><button class="btn btn-ghost btn-sm" onmousedown="ELO.ptzStart(\'' + dev.id + '\',\'moveUp\')" onmouseup="ELO.ptzStop(\'' + dev.id + '\')" onmouseleave="ELO.ptzStop(\'' + dev.id + '\')" ontouchstart="ELO.ptzStart(\'' + dev.id + '\',\'moveUp\')" ontouchend="ELO.ptzStop(\'' + dev.id + '\')">▲</button><div></div>' +
        '<button class="btn btn-ghost btn-sm" onmousedown="ELO.ptzStart(\'' + dev.id + '\',\'moveLeft\')" onmouseup="ELO.ptzStop(\'' + dev.id + '\')" onmouseleave="ELO.ptzStop(\'' + dev.id + '\')" ontouchstart="ELO.ptzStart(\'' + dev.id + '\',\'moveLeft\')" ontouchend="ELO.ptzStop(\'' + dev.id + '\')">◀</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="ELO.deviceAction(\'' + dev.id + '\',\'getStatus\')">↻</button>' +
        '<button class="btn btn-ghost btn-sm" onmousedown="ELO.ptzStart(\'' + dev.id + '\',\'moveRight\')" onmouseup="ELO.ptzStop(\'' + dev.id + '\')" onmouseleave="ELO.ptzStop(\'' + dev.id + '\')" ontouchstart="ELO.ptzStart(\'' + dev.id + '\',\'moveRight\')" ontouchend="ELO.ptzStop(\'' + dev.id + '\')">▶</button>' +
        '<div></div><button class="btn btn-ghost btn-sm" onmousedown="ELO.ptzStart(\'' + dev.id + '\',\'moveDown\')" onmouseup="ELO.ptzStop(\'' + dev.id + '\')" onmouseleave="ELO.ptzStop(\'' + dev.id + '\')" ontouchstart="ELO.ptzStart(\'' + dev.id + '\',\'moveDown\')" ontouchend="ELO.ptzStop(\'' + dev.id + '\')">▼</button><div></div>' +
        '</div></div>';
    } else if (type.indexOf('ac') !== -1 || type.indexOf('air') !== -1 || type.indexOf('hvac') !== -1) {
      ctrl = '<div class="controls-section"><h4>Temperature</h4>' +
        '<div class="ac-controls">' +
        '<button class="ac-btn" onclick="ELO.deviceAction(\'' + dev.id + '\',\'temp_down\')">−</button>' +
        '<div class="ac-temp" id="ac-temp-display">24°</div>' +
        '<button class="ac-btn" onclick="ELO.deviceAction(\'' + dev.id + '\',\'temp_up\')">+</button>' +
        '</div></div>' +
        '<div class="controls-section"><h4>Mode</h4><div style="display:flex;gap:.35rem;flex-wrap:wrap">' +
        '<button class="btn btn-ghost btn-sm" onclick="ELO.deviceAction(\'' + dev.id + '\',\'power\')">⏻ Power</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="ELO.deviceAction(\'' + dev.id + '\',\'mode_cool\')">❄️ Cool</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="ELO.deviceAction(\'' + dev.id + '\',\'mode_heat\')">🔥 Heat</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="ELO.deviceAction(\'' + dev.id + '\',\'mode_auto\')">�� Auto</button>' +
        '</div></div>';
    } else {
      ctrl = '<div class="controls-section"><h4>Actions</h4><div style="display:flex;gap:.35rem;flex-wrap:wrap">' +
        '<button class="btn btn-ghost btn-sm" onclick="ELO.deviceAction(\'' + dev.id + '\',\'power\')">⏻ Power</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="ELO.deviceAction(\'' + dev.id + '\',\'status\')">�� Status</button>' +
        '</div></div>';
    }
    html($('#device-controls-container'), ctrl);

    // Auto-load camera stream when controls render
    if (type.indexOf('camera') !== -1 || type.indexOf('cam') !== -1) {
      loadCameraStream(dev.id);
    }
  }

  /* ── Camera Stream Functions ────────────────────────────────── */
  function loadCameraStream(deviceId) {
    var container = document.getElementById('camera-stream-' + deviceId);
    if (!container) return;
    container.innerHTML = '<div class="empty-state small"><p>Carregando stream...</p></div>';
    json('/api/devices/' + deviceId + '/stream').then(function (data) {
      if (!data) { container.innerHTML = '<div class="empty-state small"><p>Stream nao disponivel</p></div>'; return; }
      var g2r = data.go2rtc;
      var streamUrl = data.streamUrl;
      if (g2r && g2r.available) {
        container.innerHTML =
          '<div class="go2rtc-player">' +
            '<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">' +
              '<button class="btn btn-ghost btn-sm stream-mode-btn" onclick="ELO.switchStreamMode(\'' + deviceId + '\',\'webrtc\',this)">WebRTC</button>' +
              '<button class="btn btn-ghost btn-sm stream-mode-btn" onclick="ELO.switchStreamMode(\'' + deviceId + '\',\'mse\',this)">MSE</button>' +
              '<button class="btn btn-ghost btn-sm stream-mode-btn active" onclick="ELO.switchStreamMode(\'' + deviceId + '\',\'iframe\',this)">Player go2rtc</button>' +
              '<button class="btn btn-ghost btn-sm stream-mode-btn" onclick="ELO.loadCameraFrame(\'' + deviceId + '\')">📷 Snapshot</button>' +
            '</div>' +
            '<div id="stream-player-' + deviceId + '" class="stream-player-container">' +
              '<iframe src="' + g2r.viewerUrl + '" style="width:100%;height:400px;border:none;border-radius:6px;background:#000;" allow="autoplay; fullscreen"></iframe>' +
            '</div>' +
            '<div style="margin-top:6px;font-size:11px;display:flex;justify-content:space-between;align-items:center;color:var(--text-muted)">' +
              '<span>🟢 go2rtc · <span id="stream-mode-label-' + deviceId + '">Player go2rtc</span></span>' +
              (streamUrl ? '<button class="btn btn-ghost btn-sm" onclick="ELO.copyToClipboard(\'' + streamUrl.replace(/'/g, "\\'") + '\')" style="font-size:10px;padding:2px 8px">📋 RTSP URL</button>' : '') +
            '</div>' +
          '</div>';
      } else if (streamUrl) {
        if (streamUrl.indexOf('http') === 0) {
          container.innerHTML = '<video controls autoplay muted style="width:100%;max-height:300px;border-radius:8px" preload="none"><source src="' + streamUrl + '" type="video/mp4"></video>';
        } else {
          container.innerHTML = '<div style="padding:12px"><div style="color:var(--text-muted);margin-bottom:8px">⚠️ go2rtc nao disponivel</div>' +
            '<code style="word-break:break-all;font-size:12px;background:var(--bg-secondary);padding:8px;border-radius:4px;display:block;margin-bottom:8px">' + esc(streamUrl) + '</code>' +
            '<button class="btn btn-ghost btn-sm" onclick="ELO.copyToClipboard(\'' + streamUrl.replace(/'/g, "\\'") + '\')">📋 Copiar URL</button>' +
            '<div style="font-size:11px;margin-top:8px;color:var(--text-muted)">Inicie o container go2rtc para visualizar o stream direto no navegador.</div></div>';
        }
      } else {
        container.innerHTML = '<div class="empty-state small"><p>Stream nao disponivel</p></div>';
      }
    }).catch(function (err) {
      container.innerHTML = '<div class="empty-state small" style="color:var(--red)"><p>Erro: ' + esc(err.message) + '</p></div>';
    });
  }

  function getCameraSnapshot(deviceId) {
    var container = document.getElementById('camera-stream-' + deviceId);
    if (!container) return;
    container.innerHTML = '<div class="empty-state small"><p>Capturando snapshot...</p></div>';
    var img = document.createElement('img');
    img.style.cssText = 'width:100%;max-height:400px;border-radius:8px;object-fit:contain;background:#000';
    img.onload = function () { container.innerHTML = ''; container.appendChild(img); };
    img.onerror = function () {
      img.onerror = function () { container.innerHTML = '<div class="empty-state small" style="color:var(--red)"><p>Erro ao carregar snapshot</p></div>'; };
      img.src = '/api/devices/' + deviceId + '/snapshot?t=' + Date.now();
    };
    img.src = '/api/devices/' + deviceId + '/frame?t=' + Date.now();
  }

  function loadCameraFrame(deviceId) {
    var playerContainer = document.getElementById('stream-player-' + deviceId);
    if (!playerContainer) return;
    var video = document.getElementById('stream-video-' + deviceId);
    if (video && video._pc) { video._pc.close(); }
    playerContainer.innerHTML = '<div class="empty-state small"><p>Capturando frame...</p></div>';
    var img = document.createElement('img');
    img.style.cssText = 'width:100%;max-height:400px;border-radius:6px;object-fit:contain;background:#000';
    img.onload = function () {
      playerContainer.innerHTML = '';
      playerContainer.appendChild(img);
      var label = document.getElementById('stream-mode-label-' + deviceId);
      if (label) label.textContent = 'Snapshot';
    };
    img.onerror = function () { playerContainer.innerHTML = '<div class="empty-state small" style="color:var(--red)"><p>Erro ao capturar frame</p></div>'; };
    img.src = '/api/devices/' + deviceId + '/frame?t=' + Date.now();
  }

  function switchStreamMode(deviceId, mode, btn) {
    var btns = btn && btn.parentElement ? btn.parentElement.querySelectorAll('.stream-mode-btn') : [];
    Array.prototype.forEach.call(btns, function (b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    var playerContainer = document.getElementById('stream-player-' + deviceId);
    var label = document.getElementById('stream-mode-label-' + deviceId);
    json('/api/devices/' + deviceId + '/stream').then(function (data) {
      if (!data || !data.go2rtc) return;
      var g2r = data.go2rtc;
      if (mode === 'webrtc') {
        if (playerContainer) {
          playerContainer.innerHTML = '<video id="stream-video-' + deviceId + '" autoplay muted playsinline style="width:100%;max-height:400px;background:#000;border-radius:6px"></video>';
        }
        if (label) label.textContent = 'WebRTC · Conectando...';
        startWebRTCStream(deviceId, g2r.webrtcUrl, g2r.streamName);
      } else if (mode === 'mse') {
        if (playerContainer) {
          playerContainer.innerHTML = '<video id="stream-video-' + deviceId + '" autoplay muted playsinline style="width:100%;max-height:400px;background:#000;border-radius:6px"></video>';
        }
        if (label) label.textContent = 'MSE · Conectando...';
        startMSEStream(deviceId, g2r.mseUrl);
      } else if (mode === 'iframe') {
        var video = document.getElementById('stream-video-' + deviceId);
        if (video && video._pc) { video._pc.close(); }
        if (playerContainer) {
          playerContainer.innerHTML = '<iframe src="' + g2r.viewerUrl + '" style="width:100%;height:400px;border:none;border-radius:6px;background:#000" allow="autoplay; fullscreen"></iframe>';
        }
        if (label) label.textContent = 'Player go2rtc';
      }
    });
  }

  function startWebRTCStream(deviceId, webrtcUrl, streamName) {
    var video = document.getElementById('stream-video-' + deviceId);
    if (!video) return;
    if (video._pc) { video._pc.close(); video._pc = null; }
    try {
      var pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      video._pc = pc;
      pc.ontrack = function (event) { if (video.srcObject !== event.streams[0]) video.srcObject = event.streams[0]; };
      pc.oniceconnectionstatechange = function () {
        var label = document.getElementById('stream-mode-label-' + deviceId);
        if (pc.iceConnectionState === 'connected' && label) label.textContent = 'WebRTC · Conectado';
        else if ((pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') && label) label.textContent = 'WebRTC · Desconectado';
      };
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.createOffer().then(function (offer) {
        return pc.setLocalDescription(offer);
      }).then(function () {
        return new Promise(function (resolve) {
          if (pc.iceGatheringState === 'complete') { resolve(); return; }
          pc.onicegatheringstatechange = function () { if (pc.iceGatheringState === 'complete') resolve(); };
          setTimeout(resolve, 3000);
        });
      }).then(function () {
        return fetch(webrtcUrl, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: pc.localDescription.sdp });
      }).then(function (resp) {
        if (!resp.ok) throw new Error('WebRTC signaling failed: ' + resp.status);
        return resp.text();
      }).then(function (answerSdp) {
        return pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }));
      }).catch(function (err) {
        console.error('[WebRTC] Error for ' + deviceId + ':', err);
        var label = document.getElementById('stream-mode-label-' + deviceId);
        if (label) label.textContent = 'Tentando MSE...';
        json('/api/devices/' + deviceId + '/stream').then(function (data) {
          if (data && data.go2rtc) startMSEStream(deviceId, data.go2rtc.mseUrl);
        });
      });
    } catch (e) { console.error('[WebRTC] Init error:', e); }
  }

  function startMSEStream(deviceId, mseUrl) {
    var video = document.getElementById('stream-video-' + deviceId);
    if (!video) return;
    if (video._pc) { video._pc.close(); video._pc = null; }
    video.srcObject = null;
    try {
      if (!MediaSource.isTypeSupported('video/mp4; codecs="avc1.640029"')) throw new Error('MSE not supported');
      var ms = new MediaSource();
      video.src = URL.createObjectURL(ms);
      ms.addEventListener('sourceopen', function () {
        var sb = ms.addSourceBuffer('video/mp4; codecs="avc1.640029"');
        fetch(mseUrl).then(function (resp) {
          var reader = resp.body.getReader();
          function pump() {
            reader.read().then(function (result) {
              if (result.done) { if (ms.readyState === 'open') ms.endOfStream(); return; }
              if (sb.updating) {
                sb.addEventListener('updateend', function onEnd() { sb.removeEventListener('updateend', onEnd); doAppend(); }, { once: true });
              } else { doAppend(); }
              function doAppend() { sb.appendBuffer(result.value); sb.addEventListener('updateend', function () { pump(); }, { once: true }); }
            });
          }
          pump();
        });
      });
      var label = document.getElementById('stream-mode-label-' + deviceId);
      if (label) label.textContent = 'MSE';
    } catch (e) {
      console.error('[MSE] Error for ' + deviceId + ':', e);
      var label = document.getElementById('stream-mode-label-' + deviceId);
      if (label) label.textContent = 'Erro MSE';
    }
  }

  /* ── PTZ Functions ──────────────────────────────────────────── */
  function ptzStart(deviceId, direction) {
    post('/api/devices/' + deviceId + '/actions/' + direction, {}).catch(function () {});
  }

  function ptzStop(deviceId) {
    post('/api/devices/' + deviceId + '/actions/ptzStop', {}).catch(function () {});
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('URL copiada!', 'success'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      toast('URL copiada!', 'success');
    }
  }

  function deviceAction(devId, action) {
    post('/api/devices/' + devId + '/actions/' + action, {}).then(function (r) {
      toast((r.message || action + ' sent'), 'success');
    }).catch(function () { toast('Action failed', 'error'); });
  }

  function saveDevice(e) {
    if (e) e.preventDefault();
    var id = ($('#edit-device-id') || {}).value;
    if (!id) return;

    // collect form values
    var fields = {
      name: ($('#edit-device-name') || {}).value,
      type: ($('#edit-device-type') || {}).value,
      ip: ($('#edit-device-ip') || {}).value,
      brand: ($('#edit-device-brand') || {}).value,
      model: ($('#edit-device-model') || {}).value,
      username: ($('#edit-device-username') || {}).value,
      password: ($('#edit-device-password') || {}).value,
      endpoint: ($('#edit-device-endpoint') || {}).value,
      protocol: ($('#edit-device-protocol') || {}).value,
      notes: ($('#edit-device-notes') || {}).value
    };

    // build body — include all fields, even empty ones, so backend can clear them
    var body = {};
    for (var k in fields) {
      if (fields[k] !== undefined && fields[k] !== null) {
        body[k] = fields[k];
      }
    }

    post('/api/devices/' + id, body).then(function (r) {
      toast(r._message || 'Dispositivo salvo!', 'success');
      closeModal('device-modal');
      loadDevices();
    }).catch(function (err) {
      // try to extract error message
      if (err && err.message) {
        toast('Erro: ' + err.message, 'error');
      } else {
        toast('Erro ao salvar dispositivo', 'error');
      }
    });
  }

  function regenerateDriver() {
    if (!currentDevice) return;
    var id = currentDevice.id;
    toast('Gerando driver...', 'info');
    post('/api/devices/' + id + '/regenerate', {}).then(function (r) {
      toast(r.message || 'Driver gerado!', 'success');
      loadDevices();
    }).catch(function () { toast('Falha ao gerar driver', 'error'); });
  }

  function closeModal(id) {
    var m = document.getElementById(id);
    if (m) m.classList.remove('open');
  }

  /* ── Chat ───────────────────────────────────────────────────── */
  var chatHistory = [];

  function sendChat() {
    var input = document.getElementById('chat-input');
    var msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    appendChat('user', msg);
    chatHistory.push({ role: 'user', content: msg });

    var welcome = $('#chat-welcome-block');
    if (welcome) welcome.style.display = 'none';

    post('/api/chat', { message: msg }).then(function (r) {
      var reply = r.reply || r.response || r.message || JSON.stringify(r);
      appendChat('assistant', reply);
      chatHistory.push({ role: 'assistant', content: reply });
    }).catch(function () { appendChat('assistant', 'Error communicating with ELO.'); });
  }

  function appendChat(role, text) {
    var container = document.getElementById('chat-messages');
    var bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + role;
    if (role === 'assistant') {
      bubble.innerHTML = formatMarkdown(text);
    } else {
      bubble.textContent = text;
    }
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  }

  function formatMarkdown(text) {
    if (!text) return '';
    return esc(text)
      .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  function quickChat(msg) {
    document.getElementById('chat-input').value = msg;
    sendChat();
  }

  /* ── People ─────────────────────────────────────────────────── */
  var allPeople = [];

  function loadPeople() {
    json('/api/people').then(function (data) {
      allPeople = Array.isArray(data) ? data : (data.people || []);
      renderPeople(allPeople);
    }).catch(function () { html($('#people-grid'), '<div class="empty-state"><p>Could not load people</p></div>'); });
  }

  function renderPeople(list) {
    if (list.length === 0) {
      html($('#people-grid'), '<div class="empty-state"><svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.118a7.5 7.5 0 0114.998 0"/></svg><p>No people registered</p></div>');
      return;
    }
    var h = '';
    list.forEach(function (p) {
      var initials = (p.name || '?').split(' ').map(function (w) { return w[0]; }).join('').toUpperCase().substring(0, 2);
      h += '<div class="person-card" onclick="ELO.openPerson(\'' + esc(p.id) + '\')">' +
        '<div class="person-card-head">' +
          '<div class="person-avatar">' + initials + '</div>' +
          '<div><div class="person-name">' + esc(p.name) + '</div><div class="person-role">' + esc(p.role || 'resident') + '</div></div>' +
        '</div>' +
        '<div class="person-meta"><span class="person-detections">👁 ' + (p.detection_count || 0) + ' detections</span></div>' +
      '</div>';
    });
    html($('#people-grid'), h);
  }

  /* ── Person Modal ───────────────────────────────────────────── */
  var currentPerson = null;

  function openAddPersonModal() {
    currentPerson = null;
    document.getElementById('person-modal').classList.add('open');
    $('#person-modal-title').textContent = 'Nova Pessoa';
    var setVal = function (sel, val) { var el = $(sel); if (el) el.value = val || ''; };
    setVal('#person-edit-id', '');
    setVal('#person-name', '');
    setVal('#person-role', '');
    setVal('#person-restrictions', '');
    // reset face upload
    var preview = $('#face-preview');
    if (preview) { preview.classList.remove('has-img'); html(preview, ''); }
    var prompt = $('#face-upload-prompt');
    if (prompt) prompt.style.display = '';
  }

  function openPerson(id) {
    currentPerson = allPeople.find(function (p) { return String(p.id) === String(id); });
    if (!currentPerson) return;
    document.getElementById('person-modal').classList.add('open');
    $('#person-modal-title').textContent = currentPerson.name || 'Pessoa';

    // populate form fields
    var setVal = function (sel, val) { var el = $(sel); if (el) el.value = val || ''; };
    setVal('#person-edit-id', currentPerson.id);
    setVal('#person-name', currentPerson.name);
    setVal('#person-role', currentPerson.role);
    setVal('#person-restrictions', currentPerson.restrictions || currentPerson.notes || '');

    // reset face upload
    var preview = $('#face-preview');
    if (preview) { preview.classList.remove('has-img'); html(preview, ''); }
    var prompt = $('#face-upload-prompt');
    if (prompt) prompt.style.display = '';
  }

  function setupFaceUpload() {
    var zone = document.getElementById('face-upload-zone');
    var fileInput = document.getElementById('face-file');
    if (!zone || !fileInput) return;

    zone.addEventListener('click', function () { fileInput.click(); });
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) uploadFace(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', function () {
      if (fileInput.files.length) uploadFace(fileInput.files[0]);
    });
  }

  function uploadFace(file) {
    if (!currentPerson) return;
    var preview = $('#face-preview');
    var prompt = $('#face-upload-prompt');

    // show preview
    var reader = new FileReader();
    reader.onload = function (e) {
      if (preview) {
        preview.classList.add('has-img');
        html(preview, '<img src="' + e.target.result + '" alt="face"/>');
      }
      if (prompt) prompt.style.display = 'none';
    };
    reader.readAsDataURL(file);

    // upload
    fetch(API + '/api/people/' + currentPerson.id + '/register-face', {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'image/jpeg' },
      body: file
    }).then(function (r) { return r.json(); }).then(function (r) {
      toast(r.message || 'Face registered!', 'success');
    }).catch(function () { toast('Face upload failed', 'error'); });
  }

  /* ── Automations & Rules ────────────────────────────────────── */
  function loadAutomations() {
    Promise.all([
      json('/api/suggestions').catch(function () { return []; }),
      json('/api/rules/proposed').catch(function () { return []; })
    ]).then(function (res) {
      var suggs = Array.isArray(res[0]) ? res[0] : (res[0].suggestions || []);
      var rules = Array.isArray(res[1]) ? res[1] : (res[1].rules || res[1].proposed || []);
      renderSuggestions(suggs);
      renderRules(rules);
    });
  }

  function renderSuggestions(list) {
    var pending = list.filter(function (s) { return s.status === 'pending'; });
    var badge = document.getElementById('sugg-count');
    if (badge) badge.textContent = pending.length;

    // show all suggestions if no pending
    var display = pending.length > 0 ? pending : list.slice(-10);
    if (display.length === 0) {
      html($('#suggestions-list'), '<div class="empty-state small"><p>No suggestions yet</p></div>');
      return;
    }
    var h = '';
    display.forEach(function (s) {
      var statusBadge = s.status === 'pending' ? '' : '<span class="badge badge-green" style="margin-left:.5rem">' + esc(s.status || '') + '</span>';
      h += '<div class="sugg-card"><div class="sugg-title">' + esc(s.automationName || s.title || s.suggestion || 'Suggestion') + statusBadge + '</div>' +
        '<div class="sugg-body">' + esc(s.message || s.description || s.reasoning || '') + '</div>' +
        (s.status === 'pending' ? '<div class="sugg-actions">' +
          '<button class="btn btn-success btn-sm" onclick="ELO.approveSugg(\'' + s.id + '\')">✓ Approve</button>' +
          '<button class="btn btn-danger btn-sm" onclick="ELO.rejectSugg(\'' + s.id + '\')">✗ Reject</button>' +
        '</div>' : '') +
      '</div>';
    });
    html($('#suggestions-list'), h);
  }

  function renderRules(list) {
    if (list.length === 0) {
      html($('#rules-list'), '<div class="empty-state small"><p>No proposed rules</p></div>');
      return;
    }
    var h = '';
    list.forEach(function (r) {
      var conf = r.confidence ? Math.round(r.confidence * 100) : 0;
      var confClass = conf >= 70 ? 'badge-green' : (conf >= 40 ? 'badge-amber' : 'badge-red');
      h += '<div class="rule-card"><div class="rule-card-head"><span class="rule-name">' + esc(r.name || r.description || 'Rule') + '</span><span class="rule-conf badge ' + confClass + '">' + conf + '%</span></div>';

      // flow diagram
      if (r.trigger || r.action) {
        h += '<div class="rule-flow">';
        if (r.trigger) h += '<span class="rule-node trigger">' + esc(typeof r.trigger === 'string' ? r.trigger : JSON.stringify(r.trigger)) + '</span><span class="rule-arrow">→</span>';
        if (r.action) h += '<span class="rule-node action">' + esc(typeof r.action === 'string' ? r.action : JSON.stringify(r.action)) + '</span>';
        h += '</div>';
      }

      h += '<div class="rule-actions">' +
        '<button class="btn btn-success btn-sm" onclick="ELO.approveRule(\'' + r.id + '\')">✓ Approve</button>' +
        '<button class="btn btn-danger btn-sm" onclick="ELO.rejectRule(\'' + r.id + '\')">✗ Reject</button>' +
      '</div></div>';
    });
    html($('#rules-list'), h);
  }

  function approveSugg(id) { post('/api/suggestions/' + id + '/approve', {}).then(function () { toast('Suggestion approved', 'success'); loadAutomations(); }).catch(function () { toast('Failed', 'error'); }); }
  function rejectSugg(id) { post('/api/suggestions/' + id + '/reject', {}).then(function () { toast('Suggestion rejected', 'info'); loadAutomations(); }).catch(function () { toast('Failed', 'error'); }); }
  function approveRule(id) { post('/api/rules/proposed/' + id + '/approve', {}).then(function () { toast('Rule approved', 'success'); loadAutomations(); }).catch(function () { toast('Failed', 'error'); }); }
  function rejectRule(id) { post('/api/rules/proposed/' + id + '/reject', {}).then(function () { toast('Rule rejected', 'info'); loadAutomations(); }).catch(function () { toast('Failed', 'error'); }); }

  function switchAutoTab(tab) {
    $$('.auto-tab').forEach(function (t) { t.classList.remove('active'); });
    $$('.auto-panel').forEach(function (p) { p.classList.remove('active'); });
    var btn = $('.auto-tab[data-auto-tab="' + tab + '"]');
    var panel = document.getElementById('auto-panel-' + tab);
    if (btn) btn.classList.add('active');
    if (panel) panel.classList.add('active');
  }

  /* ── Correlations ───────────────────────────────────────────── */
  function loadCorrelations() {
    json('/api/correlations').then(function (data) {
      var list = Array.isArray(data) ? data : (data.patterns || data.correlations || []);
      if (list.length === 0) {
        html($('#correlations-list'), '<div class="empty-state"><svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg><p>No correlations discovered yet</p></div>');
        return;
      }
      var h = '';
      list.slice(0, 30).forEach(function (c) {
        var conf = c.confidence ? Math.round(c.confidence * 100) : 0;
        var confClass = conf >= 70 ? 'badge-green' : (conf >= 40 ? 'badge-amber' : 'badge-red');
        // extract trigger/effect labels
        var trigger = c.triggerEvent || c.trigger || {};
        var effect = c.effectEvent || c.effect || {};
        var srcLabel = (typeof trigger === 'string') ? trigger : ((trigger.deviceId || '') + ':' + (trigger.action || ''));
        var tgtLabel = (typeof effect === 'string') ? effect : ((effect.deviceId || '') + ':' + (effect.action || ''));
        var delay = c.timeDelay ? (c.timeDelay < 1000 ? c.timeDelay + 'ms' : (c.timeDelay / 1000).toFixed(1) + 's') : '';

        h += '<div class="corr-card">';
        h += '<div class="corr-header"><span class="corr-type">' + esc(c.correlation_type || c.type || 'Temporal') + ' <span class="text-muted">×' + (c.frequency || c.totalOccurrences || '') + '</span></span><span class="corr-conf badge ' + confClass + '">' + conf + '%</span></div>';
        h += '<div class="corr-flow">';
        h += '<span class="corr-node src">' + esc(srcLabel) + '</span>';
        h += '<span class="rule-arrow">→' + (delay ? ' <span class="text-muted">(' + delay + ')</span> ' : '') + '</span>';
        h += '<span class="corr-node tgt">' + esc(tgtLabel) + '</span>';
        h += '</div>';
        if (c.description) h += '<div class="corr-desc">' + esc(c.description) + '</div>';
        h += '</div>';
      });
      html($('#correlations-list'), h);
    }).catch(function () { html($('#correlations-list'), '<div class="empty-state"><p>Could not load correlations</p></div>'); });
  }

  /* ── Voice ──────────────────────────────────────────────────── */
  function loadVoice() {
    json('/api/voice/status').then(function (data) {
      var services = data.services || data;
      var grid = document.getElementById('voice-services');
      if (!grid) return;
      var h = '';
      var svcNames = ['stt', 'tts', 'wakeword'];
      svcNames.forEach(function (name) {
        var available = services[name] || services[name + '_available'];
        h += '<div class="voice-svc"><span class="voice-svc-name">' + name.toUpperCase() + '</span><span class="voice-svc-badge badge ' + (available ? 'badge-green' : 'badge-red') + '">' + (available ? 'OK' : 'N/A') + '</span></div>';
      });
      html(grid, h);
    }).catch(function () {
      var grid = document.getElementById('voice-services');
      if (grid) html(grid, '<div class="empty-state small"><p>Voice gateway offline</p></div>');
    });
  }

  function setupVoiceUpload() {
    setupUploadZone('stt-upload-zone', 'stt-file-input', function (file) {
      var fd = new FormData();
      fd.append('audio', file);
      fetch(API + '/api/voice/stt-only', { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (r) {
          html($('#stt-result'), '<div class="code-block">' + esc(r.text || r.transcript || JSON.stringify(r)) + '</div>');
          toast('STT complete', 'success');
        }).catch(function () { toast('STT failed', 'error'); });
    });

    // TTS
    var ttsBtn = document.getElementById('tts-send-btn');
    if (ttsBtn) {
      ttsBtn.addEventListener('click', function () {
        var text = document.getElementById('tts-text-input').value.trim();
        if (!text) return;
        fetch(API + '/api/voice/tts-only', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text })
        }).then(function (r) { return r.blob(); }).then(function (blob) {
          var url = URL.createObjectURL(blob);
          var player = document.getElementById('tts-player');
          if (player) { player.src = url; player.style.display = 'block'; }
          toast('TTS generated', 'success');
        }).catch(function () { toast('TTS failed', 'error'); });
      });
    }

    // Pipeline
    setupUploadZone('pipeline-upload-zone', 'pipeline-file-input', function (file) {
      var fd = new FormData();
      fd.append('audio', file);
      fetch(API + '/api/voice/process', { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (r) {
          var steps = document.getElementById('pipeline-steps');
          if (!steps) return;
          var h = '';
          var n = 1;
          if (r.transcript || r.text) { h += pipelineStep(n++, 'Transcript', r.transcript || r.text); }
          if (r.intent) { h += pipelineStep(n++, 'Intent', typeof r.intent === 'string' ? r.intent : JSON.stringify(r.intent)); }
          if (r.response || r.reply) { h += pipelineStep(n++, 'Response', r.response || r.reply); }
          if (r.action) { h += pipelineStep(n++, 'Action', typeof r.action === 'string' ? r.action : JSON.stringify(r.action)); }
          if (h === '') h = '<div class="code-block">' + esc(JSON.stringify(r, null, 2)) + '</div>';
          html(steps, h);
          toast('Pipeline complete', 'success');
        }).catch(function () { toast('Pipeline failed', 'error'); });
    });
  }

  function pipelineStep(n, label, value) {
    return '<div class="step"><span class="step-num">' + n + '</span><div><div class="step-label">' + esc(label) + '</div><div class="step-value">' + esc(value) + '</div></div></div>';
  }

  function setupUploadZone(zoneId, inputId, handler) {
    var zone = document.getElementById(zoneId);
    var input = document.getElementById(inputId);
    if (!zone || !input) return;
    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) handler(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', function () {
      if (input.files.length) handler(input.files[0]);
    });
  }

  /* ── Discovery ──────────────────────────────────────────────── */
  function loadDiscovery() {
    json('/api/discovery').then(function (data) {
      var raw = Array.isArray(data) ? data : (data.devices || data.discovered || []);
      // deduplicate by IP from payload
      var seen = {};
      var list = [];
      raw.forEach(function (d) {
        var p = d.payload || d;
        var ip = p.ip || '';
        if (ip && !seen[ip]) { seen[ip] = true; list.push(p); }
        else if (!ip) list.push(p);
      });
      if (list.length === 0) {
        html($('#discovery-list'), '<div class="empty-state"><p>No devices discovered on network</p></div>');
        return;
      }
      var h = '';
      list.forEach(function (d) {
        h += '<div class="discovery-card">' +
          '<div class="discovery-icon">' + deviceIcon(d.type || d.deviceType || d.signature || '') + '</div>' +
          '<div class="discovery-info">' +
            '<div class="discovery-name">' + esc(d.name || d.hostname || d.ip || 'Unknown') + '</div>' +
            '<div class="discovery-detail">' + esc([d.ip, d.port ? ':' + d.port : '', d.source, d.manufacturer].filter(Boolean).join(' · ')) + '</div>' +
          '</div>' +
          '<button class="btn btn-primary btn-sm" onclick="ELO.adoptDevice(\'' + esc(d.ip || '') + '\')">+ Add</button>' +
        '</div>';
      });
      html($('#discovery-list'), h);
    }).catch(function () { html($('#discovery-list'), '<div class="empty-state"><p>Discovery unavailable</p></div>'); });
  }

  function adoptDevice(ip) {
    post('/api/devices', { ip: ip, name: 'New Device (' + ip + ')' }).then(function () {
      toast('Device added', 'success');
      loadDiscovery();
    }).catch(function () { toast('Failed to add device', 'error'); });
  }

  /* ── Briefing ───────────────────────────────────────────────── */
  function loadBriefing() {
    fetch(API + '/api/briefing/html').then(function (r) { return r.text(); }).then(function (htmlContent) {
      var el = document.getElementById('briefing-body');
      if (el) el.innerHTML = htmlContent;
    }).catch(function () {
      json('/api/briefing').then(function (data) {
        var el = document.getElementById('briefing-body');
        if (el) el.innerHTML = '<div class="code-block">' + esc(data.text || data.briefing || JSON.stringify(data, null, 2)) + '</div>';
      }).catch(function () {
        var el = document.getElementById('briefing-body');
        if (el) html(el, '<div class="empty-state"><p>Could not load briefing</p></div>');
      });
    });
  }

  /* ── Settings ───────────────────────────────────────────────── */
  function loadSettings() {
    json('/api/config').then(function (cfg) {
      // cfg may be {filePath, values} or flat object
      var values = cfg.values || cfg;
      var list = document.getElementById('current-config');
      if (!list) return;
      var h = '';
      var keys = Object.keys(values).sort();
      keys.forEach(function (k) {
        var v = values[k];
        // handle {value, configured} shape
        var display = (v && typeof v === 'object' && v.value !== undefined) ? v.value : v;
        if (typeof display === 'object') display = JSON.stringify(display);
        h += '<div class="config-item"><span class="config-key">' + esc(k) + '</span><span class="config-val" title="' + esc(String(display)) + '">' + esc(String(display)) + '</span></div>';
      });
      html(list, h);

      // fill form with known keys
      var formMap = {
        'cfg-ai-model': 'GEMINI_API_MODEL',
        'cfg-ai-key': 'GEMINI_API_KEY'
      };
      for (var fid in formMap) {
        var el = document.getElementById(fid);
        var entry = values[formMap[fid]];
        if (el && entry) el.value = (entry.value !== undefined ? entry.value : entry) || '';
      }
    }).catch(function () {});
  }

  function saveSettings() {
    var body = {};
    var fields = { 'cfg-ai-provider': 'ai_provider', 'cfg-ai-model': 'ai_model', 'cfg-ai-key': 'ai_api_key', 'cfg-location': 'location', 'cfg-user-name': 'user_name' };
    for (var fid in fields) {
      var el = document.getElementById(fid);
      if (el && el.value.trim()) body[fields[fid]] = el.value.trim();
    }
    post('/api/config', body).then(function () {
      toast('Settings saved', 'success');
      loadSettings();
    }).catch(function () { toast('Failed to save', 'error'); });
  }

  /* ── System ─────────────────────────────────────────────────── */
  function resetSystem() {
    if (!confirm('Are you sure? This will reset the system.')) return;
    post('/api/system/reset', {}).then(function () {
      toast('System reset', 'success');
    }).catch(function () { toast('Reset failed', 'error'); });
  }

  function sendCorrection() {
    var input = document.getElementById('correction-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    post('/api/corrections', { correction: text }).then(function () {
      toast('Correction sent', 'success');
      input.value = '';
    }).catch(function () { toast('Failed', 'error'); });
  }

  /* ── Mobile ─────────────────────────────────────────────────── */
  function toggleSidebar() {
    var sb = $('.sidebar');
    var ov = $('.sidebar-overlay');
    if (sb) sb.classList.toggle('open');
    if (ov) ov.classList.toggle('open');
  }

  /* ── Init ───────────────────────────────────────────────────── */
  function init() {
    initRouter();
    setupFaceUpload();
    setupVoiceUpload();

    // chat enter
    var chatForm = document.getElementById('chat-form');
    if (chatForm) {
      chatForm.addEventListener('submit', function (e) { e.preventDefault(); sendChat(); });
    }
    var chatInput = document.getElementById('chat-input');
    if (chatInput) {
      chatInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
      });
    }

    // device search
    var deviceSearch = document.getElementById('device-search');
    if (deviceSearch) {
      deviceSearch.addEventListener('input', function () { filterDevices(this.value); });
    }

    // auto tabs
    $$('.auto-tab').forEach(function (t) {
      t.addEventListener('click', function () { switchAutoTab(this.getAttribute('data-auto-tab')); });
    });

    // device modal tabs
    $$('#device-modal .mtab').forEach(function (t) {
      t.addEventListener('click', function () { switchDeviceTab(this.getAttribute('data-mtab')); });
    });

    // device edit form
    var devForm = document.getElementById('device-edit-form');
    if (devForm) devForm.addEventListener('submit', saveDevice);
    var regenBtn = document.getElementById('btn-regenerate');
    if (regenBtn) regenBtn.addEventListener('click', regenerateDriver);

    // person form
    var personForm = document.getElementById('person-form');
    if (personForm) personForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = ($('#person-name') || {}).value;
      var role = ($('#person-role') || {}).value;
      var restrictions = ($('#person-restrictions') || {}).value;
      var editId = ($('#person-edit-id') || {}).value;
      var body = { name: name, role: role, restrictions: restrictions };
      var url = editId ? '/api/people/' + editId : '/api/people';
      post(url, body).then(function (r) {
        toast(r.message || 'Pessoa salva!', 'success');
        closeModal('person-modal');
        loadPeople();
      }).catch(function () { toast('Erro ao salvar', 'error'); });
    });

    // config form
    var configForm = document.getElementById('config-form');
    if (configForm) configForm.addEventListener('submit', function (e) {
      e.preventDefault();
      saveSettings();
    });

    // reset system
    var resetBtn = document.getElementById('reset-system-btn');
    if (resetBtn) resetBtn.addEventListener('click', resetSystem);

    // modal close on overlay
    $$('.modal-overlay').forEach(function (m) {
      m.addEventListener('click', function (e) {
        if (e.target === m) m.classList.remove('open');
      });
    });

    // mobile
    var menuBtn = document.getElementById('menu-toggle');
    if (menuBtn) menuBtn.addEventListener('click', toggleSidebar);
    var overlay = document.querySelector('.sidebar-overlay');
    if (overlay) overlay.addEventListener('click', toggleSidebar);

    // periodic refresh (30s)
    setInterval(function () {
      if (currentPage === 'dashboard') loadDashboard();
    }, 30000);
  }

  document.addEventListener('DOMContentLoaded', init);

  /* ── Public API ─────────────────────────────────────────────── */
  return {
    navigate: navigate,
    openDevice: openDevice,
    deviceAction: deviceAction,
    saveDevice: saveDevice,
    regenerateDriver: regenerateDriver,
    closeModal: closeModal,
    sendChat: sendChat,
    quickChat: quickChat,
    openPerson: openPerson,
    openAddPersonModal: openAddPersonModal,
    approveSugg: approveSugg,
    rejectSugg: rejectSugg,
    approveRule: approveRule,
    rejectRule: rejectRule,
    switchAutoTab: switchAutoTab,
    adoptDevice: adoptDevice,
    saveSettings: saveSettings,
    resetSystem: resetSystem,
    sendCorrection: sendCorrection,
    toggleSidebar: toggleSidebar,
    filterDevices: filterDevices,
    loadCameraStream: loadCameraStream,
    getCameraSnapshot: getCameraSnapshot,
    loadCameraFrame: loadCameraFrame,
    switchStreamMode: switchStreamMode,
    ptzStart: ptzStart,
    ptzStop: ptzStop,
    copyToClipboard: copyToClipboard,
    refreshAll: function () { navigate(currentPage); },
    loadBriefing: loadBriefing
  };
})();
