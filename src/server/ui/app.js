const statusBadge = document.getElementById('status-badge');
const overviewSummary = document.getElementById('overview-summary');
const overviewEvents = document.getElementById('overview-events');
const overviewPreferences = document.getElementById('overview-preferences');
const devicesList = document.getElementById('devices-list');
const devicesStatus = document.getElementById('devices-status');
const discoveryList = document.getElementById('discovery-list');
const suggestionsList = document.getElementById('suggestions-list');
const configStatus = document.getElementById('config-status');
const chatThread = document.getElementById('chat-thread');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const configForm = document.getElementById('config-form');

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

const renderOverview = (data) => {
  overviewSummary.textContent = `Devices: ${data.counts.devices}\nLogs: ${data.counts.logs}\nRequests: ${data.counts.requests}\nPending: ${data.counts.pendingSuggestions}`;
  overviewEvents.textContent = formatJson(data.logs.slice(-8));
  overviewPreferences.textContent = data.preferenceSummary || 'Sem dados.';
};

const renderDevices = (data) => {
  devicesList.innerHTML = '';
  if (data.devices.length === 0) {
    devicesList.innerHTML = '<div class="muted">Nenhum dispositivo registrado.</div>';
    devicesStatus.textContent = '[]';
    return;
  }
  data.devices.forEach((device) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `<strong>${device.name}</strong><div class="muted">${device.id}</div><div>${device.type || 'Sem tipo'} • ${device.room || 'Sem sala'}</div>`;
    devicesList.appendChild(item);
  });
  devicesStatus.textContent = formatJson(data.statusSnapshot);
};

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
    await Promise.all([loadOverview(), loadDevices(), loadDiscovery(), loadSuggestions(), loadConfig()]);
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

refreshAll();
setInterval(refreshAll, 15000);
