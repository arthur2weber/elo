const statusBadge = document.getElementById('status-badge');
const overviewSummary = document.getElementById('overview-summary');
const overviewEvents = document.getElementById('overview-events');
const overviewPreferences = document.getElementById('overview-preferences');
const overviewAiSummary = document.getElementById('overview-ai-summary');
const overviewAiTags = document.getElementById('overview-ai-tags');
const overviewAiRecent = document.getElementById('overview-ai-recent');
const devicesList = document.getElementById('devices-list');
const devicesStatus = document.getElementById('devices-status');
const discoveryList = document.getElementById('discovery-list');
const suggestionsList = document.getElementById('suggestions-list');
const configStatus = document.getElementById('config-status');
const chatThread = document.getElementById('chat-thread');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const configForm = document.getElementById('config-form');
const resetSystemBtn = document.getElementById('reset-system-btn');

if (resetSystemBtn) {
  resetSystemBtn.addEventListener('click', async () => {
    const confirmed = confirm('ATENÇÃO: Isso irá apagar TODOS os dispositivos, logs e drivers do sistema. Deseja continuar?');
    if (!confirmed) return;
    
    const secondConfirm = confirm('Tem certeza ABSOLUTA? Esta ação não pode ser desfeita.');
    if (!secondConfirm) return;

    try {
      setStatus('Limpando sistema...');
      const response = await fetch('/api/system/reset', { method: 'POST' });
      const result = await response.json();
      
      if (result.success) {
        alert('Sistema resetado com sucesso. Recarregando...');
        window.location.reload();
      } else {
        alert(`Erro ao resetar: ${result.error}`);
      }
    } catch (error) {
      alert(`Erro na comunicação: ${error.message}`);
    }
  });
}

const getSessionId = () => {
  const key = 'elo-session-id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const generated = (crypto.randomUUID && crypto.randomUUID()) || `elo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(key, generated);
  return generated;
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Erro inesperado');
  }
  return data.data;
};

const setStatus = (text, ok = true) => {
  statusBadge.textContent = text;
  statusBadge.style.borderColor = ok ? 'rgba(42, 195, 255, 0.45)' : '#ef4444';
};

const formatJson = (value) => JSON.stringify(value, null, 2);
const formatNumber = (value) => Number(value || 0).toLocaleString('pt-BR');
const formatDateTime = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

const renderOverview = (data) => {
  overviewSummary.textContent = `Devices: ${data.counts.devices}\nLogs: ${data.counts.logs}\nRequests: ${data.counts.requests}\nPending: ${data.counts.pendingSuggestions}`;
  overviewEvents.textContent = formatJson(data.logs.slice(-8));
  overviewPreferences.textContent = data.preferenceSummary || 'Sem dados.';
};

const renderAiUsage = (data) => {
  if (!overviewAiSummary || !overviewAiTags || !overviewAiRecent) {
    return;
  }

  const summary = data?.summary;
  if (!summary || summary.totalRequests === 0) {
    overviewAiSummary.textContent = 'Sem chamadas registradas.';
    overviewAiTags.innerHTML = '<div class="muted">Sem tags recentes.</div>';
    overviewAiRecent.textContent = '[]';
    return;
  }

  const summaryLines = [
    `Janela: ${formatDateTime(summary.windowStart)} → ${formatDateTime(summary.windowEnd)}`,
    `Chamadas: ${formatNumber(summary.totalRequests)}`,
    `Prompt chars: ${formatNumber(summary.totalPromptChars)}`,
    `Resposta chars: ${formatNumber(summary.totalResponseChars)}`,
    `Latência média: ${formatNumber(summary.avgLatencyMs)} ms`
  ];
  overviewAiSummary.textContent = summaryLines.join('\n');

  const topTags = Array.isArray(data.byTag) ? data.byTag.slice(0, 5) : [];
  if (topTags.length === 0) {
    overviewAiTags.innerHTML = '<div class="muted">Sem tags recentes.</div>';
  } else {
    overviewAiTags.innerHTML = topTags
      .map((entry) => `<div><strong>${entry.tag}</strong> • ${formatNumber(entry.requests)} req · ${formatNumber(entry.promptChars)} chars</div>`)
      .join('');
  }

  const recentSample = Array.isArray(data.recent)
    ? data.recent.slice(0, 5).map((entry) => ({
        timestamp: entry.timestamp,
        source: entry.source,
        tags: entry.tags,
        promptChars: entry.promptChars,
        responseChars: entry.responseChars,
        latencyMs: entry.latencyMs
      }))
    : [];
  overviewAiRecent.textContent = recentSample.length ? formatJson(recentSample) : '[]';
};

let allDevices = {};

const renderDevices = (data) => {
  devicesList.innerHTML = '';
  allDevices = {};
  if (data.devices.length === 0) {
    devicesList.innerHTML = '<div class="muted">Nenhum dispositivo registrado.</div>';
    devicesStatus.textContent = '[]';
    return;
  }
  data.devices.forEach((device) => {
    allDevices[device.id] = device;
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="list-item-content">
        <strong>${device.name}</strong>
        <div class="muted">${device.id}</div>
        <div>${device.type || 'Sem tipo'} • ${device.room || 'Sem sala'} ${device.integrationStatus === 'pending' ? '<span style="color: #facc15">● PENDENTE</span>' : ''}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn-small" onclick="openDeviceModal('${device.id}')">Editar</button>
        <button class="btn-small" style="color: #ef4444" onclick="deleteDevice('${device.id}')">Remover</button>
      </div>
    `;
    devicesList.appendChild(item);
  });
  devicesStatus.textContent = formatJson(data.statusSnapshot);
};

const deviceModal = document.getElementById('device-modal');
const deviceEditForm = document.getElementById('device-edit-form');
const deviceControlsContainer = document.getElementById('device-controls-container');
const tabControlsBtn = document.getElementById('tab-controls-btn');

window.triggerDeviceAction = async (deviceId, action, params = {}) => {
  try {
    setStatus(`Executando ${action}...`);
    const result = await fetchJson(`/api/devices/${deviceId}/actions/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    
    // Check for Samsung unauthorized
    if (result && typeof result.data === 'string' && result.data.includes('unauthorized')) {
      alert('Atenção: Autorize o ELO na tela da sua TV Samsung!');
      setStatus('Aguardando autorização na TV', false);
    } else if (result && result.success === false) {
      alert(`Erro: ${result.error}`);
      setStatus('Erro na ação', false);
    } else {
      setStatus('Ação concluída');
    }
  } catch (error) {
    alert(`Erro na ação: ${error.message}`);
    setStatus('Erro na ação', false);
  }
};

/**
 * Timed PTZ move: starts movement, waits durationMs, then sends ptzStop.
 * Useful for automations that need precise movement amounts.
 */
window.timedPtzMove = async (deviceId, direction, durationMs = 500) => {
  try {
    setStatus(`PTZ ${direction} (${durationMs}ms)...`);
    await fetchJson(`/api/devices/${deviceId}/actions/${direction}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    await new Promise(r => setTimeout(r, durationMs));
    await fetchJson(`/api/devices/${deviceId}/actions/ptzStop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    setStatus('PTZ concluído');
  } catch (e) { /* ignore */ }
};

/**
 * PTZ hold-to-move: starts movement on press, stops on release.
 * Attach to mousedown/touchstart (start) and mouseup/touchend/mouseleave (stop).
 */
window.ptzStart = async (deviceId, direction) => {
  try {
    setStatus(`PTZ ${direction}...`);
    await fetchJson(`/api/devices/${deviceId}/actions/${direction}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
  } catch (e) { /* ignore */ }
};

window.ptzStop = async (deviceId) => {
  try {
    await fetchJson(`/api/devices/${deviceId}/actions/ptzStop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    setStatus('PTZ parado');
  } catch (e) { /* ignore */ }
};

window.openDeviceModal = (id) => {
  const device = allDevices[id];
  if (!device) return;

  const type = device.type || '';

  document.getElementById('edit-device-id').value = device.id;
  document.getElementById('edit-device-name').value = device.name;
  document.getElementById('edit-device-room').value = device.room || '';
  document.getElementById('edit-device-type').value = type;
  document.getElementById('edit-device-ip').value = device.ip || '';
  document.getElementById('edit-device-endpoint').value = device.endpoint || '';
  document.getElementById('edit-device-protocol').value = device.protocol || '';
  document.getElementById('edit-device-status').value = device.integrationStatus || 'unknown';
  document.getElementById('edit-device-brand').value = device.brand || '';
  document.getElementById('edit-device-model').value = device.model || '';
  document.getElementById('edit-device-username').value = device.username || '';
  document.getElementById('edit-device-password').value = device.password || '';

  const notes = device.notes ? JSON.stringify(device.notes, null, 2) : (device.customNotes || '');
  document.getElementById('edit-device-notes').value = notes;
  
  const hintEl = document.getElementById('edit-device-hint');
  
  const isTV = type.toLowerCase().includes('tv') || type.toLowerCase().includes('television');

  // Set Hint
  if (isTV) {
    hintEl.textContent = 'Dica ELO: Para TVs, informe se há algum PIN ou se a porta 8001 está aberta.';
  } else if (type.toLowerCase() === 'camera') {
    hintEl.textContent = 'Dica ELO: Informe o usuário/senha (ex: admin/admin) para eu tentar capturar o stream.';
  } else if (type.toLowerCase() === 'air conditioner') {
    hintEl.textContent = 'Dica ELO: Informe se é um modelo específico (ex: LG Thinq, Samsung Windfree).';
  } else {
    hintEl.textContent = '';
  }

  // Render Type Specific Controls
  deviceControlsContainer.innerHTML = '';
  if (isTV) {
    deviceControlsContainer.innerHTML = `
      <div class="remote-grid">
        <button class="remote-key danger pill" style="grid-column: span 3; width: 100%" onclick="triggerDeviceAction('${id}', 'off')">POWER OFF</button>
        
        <div style="grid-column: span 3; display: flex; justify-content: space-between; margin: 16px 0;">
            <div class="remote-col">
                <button class="remote-key" onclick="triggerDeviceAction('${id}', 'volume_up')">+</button>
                <div style="font-size: 10px; text-align: center; color: var(--text-muted)">VOL</div>
                <button class="remote-key" onclick="triggerDeviceAction('${id}', 'volume_down')">-</button>
            </div>

            <div class="dpad">
                <div style="grid-column: 2">
                    <button class="dpad-btn" onclick="triggerDeviceAction('${id}', 'up')">▲</button>
                </div>
                <div style="grid-row: 2; grid-column: 1">
                    <button class="dpad-btn" onclick="triggerDeviceAction('${id}', 'left')">◀</button>
                </div>
                <div style="grid-row: 2; grid-column: 2">
                    <button class="dpad-btn enter" onclick="triggerDeviceAction('${id}', 'enter')">OK</button>
                </div>
                <div style="grid-row: 2; grid-column: 3">
                    <button class="dpad-btn" onclick="triggerDeviceAction('${id}', 'right')">▶</button>
                </div>
                <div style="grid-row: 3; grid-column: 2">
                    <button class="dpad-btn" onclick="triggerDeviceAction('${id}', 'down')">▼</button>
                </div>
            </div>

            <div class="remote-col">
                <button class="remote-key" onclick="triggerDeviceAction('${id}', 'channelUp')">+</button>
                <div style="font-size: 10px; text-align: center; color: var(--text-muted)">CH</div>
                <button class="remote-key" onclick="triggerDeviceAction('${id}', 'channelDown')">-</button>
            </div>
        </div>

        <div style="grid-column: span 3; display: flex; gap: 8px; margin-bottom: 12px;">
            <button class="remote-key pill nav" style="flex: 1" onclick="triggerDeviceAction('${id}', 'mute')">MUTE</button>
            <button class="remote-key pill nav" style="flex: 1" onclick="triggerDeviceAction('${id}', 'home')">HOME</button>
            <button class="remote-key pill nav" style="flex: 1" onclick="triggerDeviceAction('${id}', 'back')">BACK</button>
        </div>
        
        <div style="grid-column: span 3; margin-top: 20px; text-align: center;">
            <button class="btn-small" onclick="triggerDeviceAction('${id}', 'status')">Verificar Conexão</button>
            <button class="btn-small auth-btn" onclick="triggerDevicePairing('${id}')">Solicitar Pareamento</button>
        </div>
      </div>
    `;
  } else if (type.toLowerCase() === 'camera') {
    deviceControlsContainer.innerHTML = `
      <div class="camera-preview">
        <h4>Preview da Câmera</h4>
        <div id="camera-stream-${id}" class="camera-stream">
          <div class="muted">Carregando stream...</div>
        </div>
        <div class="camera-controls">
          <button class="btn-small" onclick="loadCameraStream('${id}')">Recarregar Stream</button>
          <button class="btn-small" onclick="getCameraSnapshot('${id}')">Capturar Foto</button>
        </div>
      </div>
      <div class="remote-control" style="grid-template-columns: repeat(3, 1fr);">
        <div></div><button class="remote-btn" onmousedown="ptzStart('${id}', 'moveUp')" onmouseup="ptzStop('${id}')" onmouseleave="ptzStop('${id}')" ontouchstart="ptzStart('${id}', 'moveUp')" ontouchend="ptzStop('${id}')">▲</button><div></div>
        <button class="remote-btn" onmousedown="ptzStart('${id}', 'moveLeft')" onmouseup="ptzStop('${id}')" onmouseleave="ptzStop('${id}')" ontouchstart="ptzStart('${id}', 'moveLeft')" ontouchend="ptzStop('${id}')">◀</button>
        <button class="remote-btn" onclick="triggerDeviceAction('${id}', 'getStatus')">↻</button>
        <button class="remote-btn" onmousedown="ptzStart('${id}', 'moveRight')" onmouseup="ptzStop('${id}')" onmouseleave="ptzStop('${id}')" ontouchstart="ptzStart('${id}', 'moveRight')" ontouchend="ptzStop('${id}')">▶</button>
        <div></div><button class="remote-btn" onmousedown="ptzStart('${id}', 'moveDown')" onmouseup="ptzStop('${id}')" onmouseleave="ptzStop('${id}')" ontouchstart="ptzStart('${id}', 'moveDown')" ontouchend="ptzStop('${id}')">▼</button><div></div>
      </div>
    `;
    
    // Auto-load camera stream when modal opens
    loadCameraStream(id);
  } else if (type === 'Air Conditioner') {
    deviceControlsContainer.innerHTML = `
      <div class="ac-control">
        <div class="temp-display" id="ac-temp-val">--°</div>
        <div style="display: flex; gap: 20px;">
          <button class="remote-btn" onclick="triggerDeviceAction('${id}', 'tempDown')">-</button>
          <button class="remote-btn" onclick="triggerDeviceAction('${id}', 'tempUp')">+</button>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; margin-top: 20px;">
          <button class="remote-btn large" onclick="triggerDeviceAction('${id}', 'setMode', {mode: 'cool'})">Frio</button>
          <button class="remote-btn large" onclick="triggerDeviceAction('${id}', 'setMode', {mode: 'heat'})">Calor</button>
          <button class="remote-btn large" onclick="triggerDeviceAction('${id}', 'powerOn')">Ligar</button>
          <button class="remote-btn large" onclick="triggerDeviceAction('${id}', 'powerOff')">Desligar</button>
        </div>
      </div>
    `;
  } else {
    deviceControlsContainer.innerHTML = `
      <div class="card">
        <h4>Ações Genéricas</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <button class="remote-btn large" onclick="triggerDeviceAction('${id}', 'powerOn')">Ligar</button>
          <button class="remote-btn large" onclick="triggerDeviceAction('${id}', 'powerOff')">Desligar</button>
          <button class="remote-btn large" onclick="triggerDeviceAction('${id}', 'getStatus')">Atualizar Status</button>
        </div>
      </div>
    `;
  }

  // Handle Tab Navigation in Modal
  const modalTabs = document.querySelectorAll('.modal-tab');
  const modalPanels = document.querySelectorAll('.modal-panel');
  
  modalTabs.forEach(t => {
    t.onclick = () => {
      modalTabs.forEach(x => x.classList.remove('active'));
      modalPanels.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const panel = document.getElementById(`modal-panel-${t.dataset.tab}`);
      if (panel) panel.classList.add('active');
    };
  });

  // Reset to first tab, or Controls tab for cameras
  if (type === 'Camera') {
    const controlsTab = document.querySelector('.modal-tab[data-tab="controls"]');
    if (controlsTab) controlsTab.click();
  } else {
    modalTabs[0].click();
  }
  deviceModal.classList.add('active');
};

const btnRegenerate = document.getElementById('btn-regenerate');
btnRegenerate.addEventListener('click', async () => {
  const id = document.getElementById('edit-device-id').value;
  btnRegenerate.textContent = 'Enviando...';
  btnRegenerate.disabled = true;
  
  try {
    // First save all current fields so the regeneration uses them
    const updates = {
      name: document.getElementById('edit-device-name').value,
      room: document.getElementById('edit-device-room').value,
      type: document.getElementById('edit-device-type').value,
      ip: document.getElementById('edit-device-ip').value,
      endpoint: document.getElementById('edit-device-endpoint').value,
      protocol: document.getElementById('edit-device-protocol').value,
      integrationStatus: document.getElementById('edit-device-status').value
    };

    const notesStr = document.getElementById('edit-device-notes').value;
    if (notesStr.trim()) {
      try { updates.notes = JSON.parse(notesStr); updates.customNotes = ''; } 
      catch { updates.customNotes = notesStr; updates.notes = null; }
    } else {
      updates.notes = null;
      updates.customNotes = '';
    }
    
    await fetchJson(`/api/devices/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    
    await fetchJson(`/api/devices/${id}/regenerate`, { method: 'POST' });
    alert('Regeneração iniciada! Verifique o console ou as sugestões em breve.');
    closeDeviceModal();
  } catch (error) {
    alert('Erro ao solicitar regeneração: ' + error.message);
  } finally {
    btnRegenerate.textContent = 'Recriar Driver (IA)';
    btnRegenerate.disabled = false;
  }
});

window.closeDeviceModal = () => {
  deviceModal.classList.remove('active');
};

window.deleteDevice = async (id) => {
  if (!confirm('Tem certeza que deseja remover este dispositivo?')) return;
  try {
    await fetchJson(`/api/devices/${id}`, { method: 'DELETE' });
    loadDevices();
  } catch (error) {
    alert(error.message);
  }
};

deviceEditForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-device-id').value;
  
  const updates = {
    name: document.getElementById('edit-device-name').value,
    room: document.getElementById('edit-device-room').value,
    type: document.getElementById('edit-device-type').value,
    ip: document.getElementById('edit-device-ip').value,
    endpoint: document.getElementById('edit-device-endpoint').value,
    protocol: document.getElementById('edit-device-protocol').value,
    integrationStatus: document.getElementById('edit-device-status').value,
    brand: document.getElementById('edit-device-brand').value,
    model: document.getElementById('edit-device-model').value,
    username: document.getElementById('edit-device-username').value,
    password: document.getElementById('edit-device-password').value
  };

  const notesStr = document.getElementById('edit-device-notes').value;
  if (notesStr.trim()) {
    try {
      updates.notes = JSON.parse(notesStr);
      updates.customNotes = ''; 
    } catch {
      updates.customNotes = notesStr;
      updates.notes = null;
    }
  } else {
    updates.notes = null;
    updates.customNotes = '';
  }

  try {
    const response = await fetch(`/api/devices/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Show success message with validation status
      if (updates.type === 'camera' || updates.type === 'Camera') {
        alert('✅ Dispositivo salvo com sucesso! Credenciais validadas.');
      } else {
        alert('✅ Dispositivo salvo com sucesso!');
      }
      closeDeviceModal();
      loadDevices();
    } else {
      // Show validation error
      if (result.validationError) {
        alert(`❌ ${result.error}`);
      } else {
        alert(`Erro: ${result.error}`);
      }
    }
  } catch (error) {
    alert(error.message);
  }
});

const renderDiscovery = (entries) => {
  discoveryList.textContent = entries.length ? formatJson(entries.slice(-12)) : 'Sem descobertas recentes.';
};

const renderSuggestions = (entries) => {
  suggestionsList.textContent = entries.length ? formatJson(entries.slice(-12)) : 'Sem sugestões.';
};

const renderConfig = (data) => {
  configStatus.innerHTML = '';
  Object.entries(data.values).forEach(([key, entry]) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `<strong>${key}</strong><div class="muted">${entry.configured ? entry.value : 'não configurado'}</div>`;
    configStatus.appendChild(item);
  });
};

const addChatBubble = (message, role) => {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role === 'user' ? 'chat-user' : 'chat-elo'}`;
  bubble.textContent = message;
  chatThread.appendChild(bubble);
  chatThread.scrollTop = chatThread.scrollHeight;
};

const loadOverview = async () => {
  const data = await fetchJson('/api/status');
  renderOverview(data);
};

const loadAiUsage = async () => {
  const data = await fetchJson('/api/ai-usage?limit=250');
  renderAiUsage(data);
};

const loadDevices = async () => {
  const data = await fetchJson('/api/devices');
  renderDevices(data);
};

const loadDiscovery = async () => {
  const data = await fetchJson('/api/discovery');
  renderDiscovery(data);
};

const loadSuggestions = async () => {
  const data = await fetchJson('/api/suggestions');
  renderSuggestions(data);
};

const loadConfig = async () => {
  const data = await fetchJson('/api/config');
  renderConfig(data);
};

const refreshAll = async () => {
  try {
    setStatus('Conectado');
    await Promise.all([
      loadOverview(),
      loadAiUsage(),
      loadDevices(),
      loadDiscovery(),
      loadSuggestions(),
      loadConfig()
    ]);
  } catch (error) {
    setStatus('Erro ao conectar', false);
  }
};

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  addChatBubble(message, 'user');
  chatInput.value = '';
  try {
    const sessionId = getSessionId();
    const data = await fetchJson('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId })
    });
    addChatBubble(data.reply, 'elo');
  } catch (error) {
    addChatBubble(`Erro: ${error.message}`, 'elo');
  }
});

configForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(configForm);
  const updates = {};
  formData.forEach((value, key) => {
    if (value && String(value).trim()) {
      updates[key] = String(value).trim();
    }
  });

  if (Object.keys(updates).length === 0) {
    return;
  }

  try {
    await fetchJson('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    });
    await loadConfig();
  } catch (error) {
    alert(error.message);
  }
});

const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((item) => item.classList.remove('active'));
    panels.forEach((panel) => panel.classList.remove('active'));
    tab.classList.add('active');
    const panel = document.getElementById(`panel-${tab.dataset.tab}`);
    if (panel) panel.classList.add('active');
  });
});

// Load initial data
refreshAll();
setInterval(refreshAll, 15000);

window.triggerDevicePairing = async (id) => {
  const btn = event.target;
  const originalText = btn.textContent;
  btn.textContent = 'Solicitando...';
  btn.disabled = true;

  try {
    const rawRes = await fetch(`/api/devices/${id}/pair`, { method: 'POST' });
    const res = await rawRes.json();
    
    if (res.success) {
      alert('Solicitação enviada! Verifique se apareceu uma mensagem na tela da TV e autorize o ELO.');
    } else {
      const errMsg = typeof res.error === 'string' ? res.error : JSON.stringify(res.error || 'Erro desconhecido');
      alert('Falha ao solicitar pareamento: ' + errMsg);
    }
  } catch (error) {
    alert('Erro de rede: ' + error.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
};

window.loadCameraStream = async (deviceId) => {
  const streamContainer = document.getElementById(`camera-stream-${deviceId}`);
  if (!streamContainer) {
    console.log(`[UI] Stream container not found for ${deviceId}`);
    return;
  }
  
  console.log(`[UI] Loading camera stream for ${deviceId}`);
  streamContainer.innerHTML = '<div class="muted">Carregando stream...</div>';
  
  try {
    console.log(`[UI] Fetching stream URL for ${deviceId}`);
    const response = await fetch(`/api/devices/${deviceId}/stream`);
    const result = await response.json();
    console.log(`[UI] Stream API response:`, result);
    
    if (result.success && result.data) {
      const { go2rtc: g2r, streamUrl } = result.data;
      
      if (g2r && g2r.available) {
        // ── go2rtc available: embed the stream player ──
        streamContainer.innerHTML = `
          <div class="go2rtc-player">
            <div class="stream-modes" style="display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap;">
              <button class="btn-small stream-mode-btn" onclick="switchStreamMode('${deviceId}', 'webrtc', this)">WebRTC</button>
              <button class="btn-small stream-mode-btn" onclick="switchStreamMode('${deviceId}', 'mse', this)">MSE</button>
              <button class="btn-small stream-mode-btn active" onclick="switchStreamMode('${deviceId}', 'iframe', this)">Player go2rtc</button>
              <button class="btn-small stream-mode-btn" onclick="loadCameraFrame('${deviceId}')">📷 Snapshot</button>
            </div>
            <div id="stream-player-${deviceId}" class="stream-player-container">
              <iframe src="${g2r.viewerUrl}" 
                style="width: 100%; height: 400px; border: none; border-radius: 6px; background: #000;"
                allow="autoplay; fullscreen">
              </iframe>
            </div>
            <div class="muted" style="margin-top: 6px; font-size: 11px; display: flex; justify-content: space-between; align-items: center;">
              <span>🟢 go2rtc · <span id="stream-mode-label-${deviceId}">Player go2rtc</span></span>
              <button class="btn-small" onclick="copyToClipboard('${streamUrl}')" style="font-size: 10px; padding: 2px 8px;">📋 RTSP URL</button>
            </div>
          </div>
        `;
        
      } else if (streamUrl) {
        // ── go2rtc not available: fallback ──
        if (streamUrl.startsWith('http://') || streamUrl.startsWith('https://')) {
          streamContainer.innerHTML = `
            <video controls autoplay muted style="width: 100%; max-height: 300px; border-radius: 8px;" preload="none">
              <source src="${streamUrl}" type="video/mp4">
              Seu navegador não suporta reprodução de vídeo.
            </video>
          `;
        } else {
          streamContainer.innerHTML = `
            <div class="rtsp-fallback">
              <div class="muted" style="margin-bottom: 8px;">⚠️ go2rtc não disponível</div>
              <code style="word-break: break-all; font-size: 12px; background: var(--bg-secondary); padding: 8px; border-radius: 4px; display: block; margin-bottom: 8px;">${streamUrl}</code>
              <div style="display: flex; gap: 8px;">
                <button class="btn-small" onclick="copyToClipboard('${streamUrl}')">📋 Copiar URL</button>
              </div>
              <div class="muted" style="font-size: 11px; margin-top: 8px;">
                Inicie o container go2rtc para visualizar o stream direto no navegador.
              </div>
            </div>
          `;
        }
      } else {
        streamContainer.innerHTML = '<div class="muted">Stream não disponível</div>';
      }
    } else {
      streamContainer.innerHTML = '<div class="muted">Stream não disponível</div>';
    }
  } catch (error) {
    streamContainer.innerHTML = `<div class="muted" style="color: #ef4444">Erro: ${error.message}</div>`;
  }
};

// ── WebRTC streaming via go2rtc ──────────────────────────────

window.startWebRTCStream = async (deviceId, webrtcUrl, streamNameParam) => {
  const video = document.getElementById(`stream-video-${deviceId}`);
  if (!video) return;

  // Clean up previous connection
  if (video._pc) {
    video._pc.close();
    video._pc = null;
  }

  try {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    video._pc = pc;

    pc.ontrack = (event) => {
      if (video.srcObject !== event.streams[0]) {
        video.srcObject = event.streams[0];
        console.log(`[WebRTC] Received track for ${deviceId}`);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state for ${deviceId}: ${pc.iceConnectionState}`);
      const label = document.getElementById(`stream-mode-label-${deviceId}`);
      if (pc.iceConnectionState === 'connected') {
        if (label) label.textContent = 'WebRTC · Conectado';
      } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        if (label) label.textContent = 'WebRTC · Desconectado';
      }
    };

    // Add transceivers for receiving video and audio
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for ICE gathering
    await new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
      } else {
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') resolve();
        };
        // Timeout after 3 seconds
        setTimeout(resolve, 3000);
      }
    });

    // Send SDP offer to go2rtc via HTTP POST (through proxy)
    const resp = await fetch(webrtcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: pc.localDescription.sdp
    });

    if (resp.ok) {
      const answerSdp = await resp.text();
      await pc.setRemoteDescription(new RTCSessionDescription({
        type: 'answer',
        sdp: answerSdp
      }));
      console.log(`[WebRTC] Connected for ${deviceId}`);
    } else {
      throw new Error(`WebRTC signaling failed: ${resp.status}`);
    }
  } catch (error) {
    console.error(`[WebRTC] Error for ${deviceId}:`, error);
    // Fallback to MSE
    const label = document.getElementById(`stream-mode-label-${deviceId}`);
    if (label) label.textContent = 'Tentando MSE...';
    
    // Get MSE URL from stream API
    try {
      const response = await fetch(`/api/devices/${deviceId}/stream`);
      const result = await response.json();
      if (result.success && result.data.go2rtc) {
        startMSEStream(deviceId, result.data.go2rtc.mseUrl);
      }
    } catch (e) {
      console.error('[WebRTC] MSE fallback also failed:', e);
    }
  }
};

// ── MSE streaming (fallback) ─────────────────────────────────

window.startMSEStream = async (deviceId, mseUrl) => {
  const video = document.getElementById(`stream-video-${deviceId}`);
  if (!video) return;

  // Clean up previous connection
  if (video._pc) {
    video._pc.close();
    video._pc = null;
  }
  video.srcObject = null;

  try {
    if (!MediaSource.isTypeSupported('video/mp4; codecs="avc1.640029"')) {
      throw new Error('MSE not supported');
    }

    const ms = new MediaSource();
    video.src = URL.createObjectURL(ms);

    ms.addEventListener('sourceopen', async () => {
      const sb = ms.addSourceBuffer('video/mp4; codecs="avc1.640029"');
      
      const resp = await fetch(mseUrl);
      const reader = resp.body.getReader();

      const pump = async () => {
        const { done, value } = await reader.read();
        if (done) {
          if (ms.readyState === 'open') ms.endOfStream();
          return;
        }

        // Wait for buffer to be ready
        if (sb.updating) {
          await new Promise(resolve => sb.addEventListener('updateend', resolve, { once: true }));
        }
        
        sb.appendBuffer(value);
        await new Promise(resolve => sb.addEventListener('updateend', resolve, { once: true }));
        pump();
      };

      pump();
    });

    const label = document.getElementById(`stream-mode-label-${deviceId}`);
    if (label) label.textContent = 'MSE';
  } catch (error) {
    console.error(`[MSE] Error for ${deviceId}:`, error);
    const label = document.getElementById(`stream-mode-label-${deviceId}`);
    if (label) label.textContent = 'Erro MSE';
  }
};

// ── Switch stream mode ───────────────────────────────────────

window.switchStreamMode = async (deviceId, mode, btn) => {
  // Update active button
  const btns = btn?.parentElement?.querySelectorAll('.stream-mode-btn');
  btns?.forEach(b => b.classList.remove('active'));
  btn?.classList.add('active');

  const playerContainer = document.getElementById(`stream-player-${deviceId}`);
  const video = document.getElementById(`stream-video-${deviceId}`);
  const label = document.getElementById(`stream-mode-label-${deviceId}`);

  // Get stream info
  const response = await fetch(`/api/devices/${deviceId}/stream`);
  const result = await response.json();
  if (!result.success || !result.data.go2rtc) return;

  const g2r = result.data.go2rtc;

  if (mode === 'webrtc') {
    // Reset to video element
    if (playerContainer && !video) {
      playerContainer.innerHTML = `
        <video id="stream-video-${deviceId}" autoplay muted playsinline 
          style="width: 100%; max-height: 400px; background: #000; border-radius: 6px;">
        </video>
      `;
    }
    if (label) label.textContent = 'WebRTC · Conectando...';
    startWebRTCStream(deviceId, g2r.webrtcUrl, g2r.streamName);
  } else if (mode === 'mse') {
    if (playerContainer && !video) {
      playerContainer.innerHTML = `
        <video id="stream-video-${deviceId}" autoplay muted playsinline 
          style="width: 100%; max-height: 400px; background: #000; border-radius: 6px;">
        </video>
      `;
    }
    if (label) label.textContent = 'MSE · Conectando...';
    startMSEStream(deviceId, g2r.mseUrl);
  } else if (mode === 'iframe') {
    // Clean up video
    if (video && video._pc) {
      video._pc.close();
    }
    if (playerContainer) {
      playerContainer.innerHTML = `
        <iframe src="${g2r.viewerUrl}" 
          style="width: 100%; height: 400px; border: none; border-radius: 6px; background: #000;"
          allow="autoplay; fullscreen">
        </iframe>
      `;
    }
    if (label) label.textContent = 'Player go2rtc';
  }
};

// ── Camera snapshot via go2rtc ────────────────────────────────

window.loadCameraFrame = async (deviceId) => {
  const playerContainer = document.getElementById(`stream-player-${deviceId}`);
  if (!playerContainer) return;

  const video = document.getElementById(`stream-video-${deviceId}`);
  if (video && video._pc) {
    video._pc.close();
  }

  playerContainer.innerHTML = '<div class="muted">Capturando frame...</div>';

  try {
    const timestamp = Date.now();
    const img = new Image();
    img.style.width = '100%';
    img.style.maxHeight = '400px';
    img.style.borderRadius = '6px';
    img.style.objectFit = 'contain';
    img.style.background = '#000';
    
    img.onload = () => {
      playerContainer.innerHTML = '';
      playerContainer.appendChild(img);
      const label = document.getElementById(`stream-mode-label-${deviceId}`);
      if (label) label.textContent = 'Snapshot';
    };
    
    img.onerror = () => {
      playerContainer.innerHTML = '<div class="muted" style="color: #ef4444">Erro ao capturar frame</div>';
    };
    
    img.src = `/api/devices/${deviceId}/frame?t=${timestamp}`;
  } catch (error) {
    playerContainer.innerHTML = `<div class="muted" style="color: #ef4444">Erro: ${error.message}</div>`;
  }
};

window.getCameraSnapshot = async (deviceId) => {
  const streamContainer = document.getElementById(`camera-stream-${deviceId}`);
  if (!streamContainer) return;
  
  try {
    streamContainer.innerHTML = '<div class="muted">Capturando snapshot...</div>';
    
    const img = document.createElement('img');
    img.style.width = '100%';
    img.style.maxHeight = '300px';
    img.style.borderRadius = '8px';
    img.style.objectFit = 'contain';
    img.style.background = '#000';
    img.style.display = 'none';
    
    img.onload = () => {
      streamContainer.innerHTML = '';
      streamContainer.appendChild(img);
      img.style.display = 'block';
    };
    
    img.onerror = () => {
      // Fallback to old snapshot endpoint
      img.onerror = () => {
        streamContainer.innerHTML = '<div class="muted" style="color: #ef4444">Erro ao carregar snapshot</div>';
      };
      img.src = `/api/devices/${deviceId}/snapshot?t=${Date.now()}`;
    };
    
    // Try go2rtc frame first
    const timestamp = Date.now();
    img.src = `/api/devices/${deviceId}/frame?t=${timestamp}`;
    
    setTimeout(() => {
      if (img.style.display === 'none') {
        streamContainer.innerHTML = '<div class="muted">Timeout ao carregar snapshot</div>';
      }
    }, 10000);
    
  } catch (error) {
    streamContainer.innerHTML = `<div class="muted" style="color: #ef4444">Erro: ${error.message}</div>`;
  }
};

window.copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    alert('URL copiada para a área de transferência!');
  } catch (error) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    alert('URL copiada para a área de transferência!');
  }
};
