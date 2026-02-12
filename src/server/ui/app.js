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

  const notes = device.notes ? JSON.stringify(device.notes, null, 2) : (device.customNotes || '');
  document.getElementById('edit-device-notes').value = notes;
  
  const hintEl = document.getElementById('edit-device-hint');
  
  const isTV = type.toLowerCase().includes('tv') || type.toLowerCase().includes('television');

  // Set Hint
  if (isTV) {
    hintEl.textContent = 'Dica ELO: Para TVs, informe se há algum PIN ou se a porta 8001 está aberta.';
  } else if (type === 'Camera') {
    hintEl.textContent = 'Dica ELO: Informe o usuário/senha (ex: admin/admin) para eu tentar capturar o stream.';
  } else if (type === 'Air Conditioner') {
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
  } else if (type === 'Camera') {
    deviceControlsContainer.innerHTML = `
      <div class="camera-preview">
        <div class="muted">Aguardando snapshot...</div>
        <!-- Em um cenário real, o ELO poderia servir o snapshot via proxy -->
      </div>
      <div class="remote-control" style="grid-template-columns: repeat(3, 1fr);">
        <div></div><button class="remote-btn" onclick="triggerDeviceAction('${id}', 'moveUp')">▲</button><div></div>
        <button class="remote-btn" onclick="triggerDeviceAction('${id}', 'moveLeft')">◀</button>
        <button class="remote-btn" onclick="triggerDeviceAction('${id}', 'getStatus')">↻</button>
        <button class="remote-btn" onclick="triggerDeviceAction('${id}', 'moveRight')">▶</button>
        <div></div><button class="remote-btn" onclick="triggerDeviceAction('${id}', 'moveDown')">▼</button><div></div>
      </div>
    `;
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

  // Reset to first tab
  modalTabs[0].click();
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
    integrationStatus: document.getElementById('edit-device-status').value
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
    await fetchJson(`/api/devices/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    closeDeviceModal();
    loadDevices();
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
    const res = await fetchJson(`/api/devices/${id}/pair`, { method: 'POST' });
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
