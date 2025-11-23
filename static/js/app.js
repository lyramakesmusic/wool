// app.js - main initialization

let appState = {
  tree: { nodes: {}, focused_node_id: null },
  settings: {
    model: 'moonshotai/kimi-k2',
    token: '',
    temperature: 1.0,
    min_p: 0.01,
    max_tokens: 32,
    n_siblings: 3,
    untitled_trick: false,
    dark_mode: false
  },
  canvas: { zoom: 1, pan: { x: 0, y: 0 } },
  ui: { panel_positions: {} }
};

async function init() {
  // load tree from server
  const treeResponse = await fetch('/tree');
  const tree = await treeResponse.json();
  appState.tree = tree;
  
  // load settings from backend
  const settingsResponse = await fetch('/settings');
  const backendSettings = await settingsResponse.json();
  appState.settings = { ...appState.settings, ...backendSettings };
  
  // Apply settings to UI
  applySettingsToUI();
  
  // load UI state from localStorage
  loadUIState();
  
  // setup canvas interactions
  setupCanvas();
  
  // setup draggable panels
  makeDraggable(document.getElementById('settings-panel'));
  makeDraggable(document.getElementById('seed-box'), true);
  
  // setup settings listeners
  setupSettingsListeners();
  
  // setup seed input
  setupSeedInput();
  
  // initial render
  if (Object.keys(tree.nodes).length > 0) {
    renderTree();
    
    // If we have a focused node, ensure its tree is visible
    if (appState.tree.focused_node_id) {
      const focusedNode = appState.tree.nodes[appState.tree.focused_node_id];
      if (focusedNode) {
        // Center view on focused node if we don't have saved pan position
        const savedState = localStorage.getItem('loom-ui-state');
        if (!savedState || !JSON.parse(savedState).canvas) {
          const svg = document.getElementById('canvas');
          const rect = svg.getBoundingClientRect();
          appState.canvas.pan.x = rect.width / 2 - focusedNode.position.x;
          appState.canvas.pan.y = rect.height / 2 - focusedNode.position.y;
          updateViewport();
        }
      }
    }
  }
}

function detectProviderFromInput(value) {
  if (!value || !value.trim()) {
    return { provider: 'openrouter', model: '', endpoint: '' };
  }
  
  const trimmed = value.trim();
  
  // URL = OpenAI-compatible
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return { provider: 'openai', model: '', endpoint: trimmed };
  }
  
  // Otherwise OpenRouter model
  return { provider: 'openrouter', model: trimmed, endpoint: '' };
}

function updateProviderDetection() {
  const modelInput = document.getElementById('model-input');
  const detectedSpan = document.getElementById('provider-detected');
  
  const detection = detectProviderFromInput(modelInput.value);
  detectedSpan.textContent = detection.provider === 'openrouter' ? 'OpenRouter' : 'OpenAI-Compatible';
  
  return detection;
}

function setupSettingsListeners() {
  // sync sliders with value inputs (bidirectional)
  const sliderPairs = [
    { slider: 'temp-slider', value: 'temp-value' },
    { slider: 'minp-slider', value: 'minp-value' }
  ];
  
  sliderPairs.forEach(({ slider, value }) => {
    const sliderElem = document.getElementById(slider);
    const valueElem = document.getElementById(value);
    
    // slider updates value input
    sliderElem.addEventListener('input', () => {
      valueElem.value = sliderElem.value;
      saveSettings();
    });
    
    // value input updates slider
    valueElem.addEventListener('input', () => {
      sliderElem.value = valueElem.value;
      saveSettings();
    });
  });
  
  // model input - detect provider on change
  document.getElementById('model-input').addEventListener('input', () => {
    updateProviderDetection();
    saveSettings();
  });
  
  // dark mode toggle
  document.getElementById('dark-mode-toggle').addEventListener('change', (e) => {
    document.body.classList.toggle('dark-mode', e.target.checked);
    const canvasBg = document.getElementById('canvas-bg');
    canvasBg.setAttribute('fill', e.target.checked ? 'url(#dot-grid-dark)' : 'url(#dot-grid)');
    saveSettings();
  });
  
  // save on change for all inputs
  ['api-key-input', 'max-tokens', 'siblings-input', 'untitled-toggle'].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) elem.addEventListener('change', saveSettings);
  });
  
  // initial detection
  updateProviderDetection();
  
  // autoformat button
  document.getElementById('autoformat-btn').addEventListener('click', () => {
    autoformatTree();
  });
}

function setupSeedInput() {
  const seedInput = document.getElementById('seed-input');
  
  // Enter to submit, Shift+Enter for newline
  seedInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      
      const seedText = seedInput.value.trim();
      if (!seedText) return;
      
      const response = await fetch('/tree/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: seedText })
      });
      
      const tree = await response.json();
      loadTree(tree);
      seedInput.value = '';
      seedInput.rows = 1;
    }
  });
  
  // Auto-grow textarea
  seedInput.addEventListener('input', () => {
    seedInput.rows = 1;
    const lines = seedInput.value.split('\n').length;
    seedInput.rows = Math.min(lines, 5);
  });
}

function loadTree(tree) {
  appState.tree = tree;
  
  // Pan to root node
  const rootNode = Object.values(tree.nodes).find(n => !n.parent_id);
  if (rootNode) {
    const svg = document.getElementById('canvas');
    const rect = svg.getBoundingClientRect();
    appState.canvas.pan.x = rect.width / 2 - rootNode.position.x;
    appState.canvas.pan.y = rect.height / 2 - rootNode.position.y;
    updateViewport();
  }
  
  renderTree();
}

function autoformatTree() {
  // Find root node
  const rootNode = Object.values(appState.tree.nodes).find(n => !n.parent_id);
  if (!rootNode) return;
  
  // Reset all manual positioning flags
  Object.values(appState.tree.nodes).forEach(node => {
    delete node.manually_positioned;
  });
  
  // Start from root with default position
  rootNode.position = { x: 400, y: 300 };
  
  // Recursively format all descendants
  formatNodeAndChildren(rootNode.id);
  
  // Save and render
  saveTree();
  renderTree();
}

function formatNodeAndChildren(nodeId) {
  const parent = appState.tree.nodes[nodeId];
  const children = Object.values(appState.tree.nodes).filter(n => n.parent_id === nodeId);
  
  if (children.length === 0) return;
  
  const HORIZONTAL_OFFSET = 380; // 80px further right
  const VERTICAL_GAP = 40; // Increased gap to prevent overlaps
  
  // Sort by Y position to maintain order
  children.sort((a, b) => a.position.y - b.position.y);
  
  // Calculate heights
  const heights = children.map(child => {
    const LINE_HEIGHT = 18;
    const PADDING = 12;
    const MIN_HEIGHT = 50;
    const CHARS_PER_LINE = 42;
    
    let displayText = child.text || '';
    const lines = wrapText(displayText, CHARS_PER_LINE);
    
    return Math.max(MIN_HEIGHT, lines.length * LINE_HEIGHT + PADDING * 2);
  });
  
  const totalHeight = heights.reduce((sum, h) => sum + h, 0) + (children.length - 1) * VERTICAL_GAP;
  let currentY = parent.position.y - (totalHeight / 2);
  
  children.forEach((child, i) => {
    child.position.x = parent.position.x + HORIZONTAL_OFFSET;
    child.position.y = currentY + heights[i] / 2;
    currentY += heights[i] + VERTICAL_GAP;
    
    // Recursively format children's children
    formatNodeAndChildren(child.id);
  });
}

function makeDraggable(element, keepBottom = false) {
  let isDragging = false;
  let startX, startY, startElemX, startElemY;
  
  // For panels with header, use header. For seed box, use the element itself but exclude input/textarea
  const dragHandle = element.querySelector('.panel-header');
  
  const startDrag = (e) => {
    // Don't drag if clicking on input/textarea/button
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') {
      return;
    }
    
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    
    // Remove transform if present (for seed box centering)
    if (keepBottom && element.style.transform) {
      element.style.transform = 'none';
    }
    
    if (keepBottom) {
      startElemX = element.offsetLeft;
      const computedBottom = window.innerHeight - element.offsetTop - element.offsetHeight;
      startElemY = computedBottom;
    } else {
      startElemX = element.offsetLeft;
      startElemY = element.offsetTop;
    }
    
    element.style.cursor = 'grabbing';
  };
  
  const onMouseMove = (e) => {
    if (!isDragging) return;
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    // Get element dimensions for boundary checking
    const rect = element.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    if (keepBottom) {
      // Constrain to screen boundaries
      let newLeft = startElemX + dx;
      let newBottom = startElemY - dy;
      
      newLeft = Math.max(0, Math.min(windowWidth - width, newLeft));
      newBottom = Math.max(0, Math.min(windowHeight - height, newBottom));
      
      element.style.left = newLeft + 'px';
      element.style.bottom = newBottom + 'px';
      element.style.top = 'auto';
    } else {
      // Constrain to screen boundaries
      let newLeft = startElemX + dx;
      let newTop = startElemY + dy;
      
      newLeft = Math.max(0, Math.min(windowWidth - width, newLeft));
      newTop = Math.max(0, Math.min(windowHeight - height, newTop));
      
      element.style.left = newLeft + 'px';
      element.style.top = newTop + 'px';
    }
  };
  
  const onMouseUp = () => {
    if (isDragging) {
      isDragging = false;
      element.style.cursor = dragHandle ? 'default' : 'grab';
      saveUIState();
    }
  };
  
  // Attach drag to header if present, otherwise to element itself
  if (dragHandle) {
    dragHandle.addEventListener('mousedown', startDrag);
    dragHandle.style.cursor = 'grab';
  } else {
    element.addEventListener('mousedown', startDrag);
    element.style.cursor = 'grab';
  }
  
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

function saveUIState() {
  const settingsPanel = document.getElementById('settings-panel');
  const seedBox = document.getElementById('seed-box');
  
  const seedBoxPos = { x: seedBox.offsetLeft };
  if (seedBox.style.bottom && seedBox.style.bottom !== 'auto') {
    seedBoxPos.bottom = parseInt(seedBox.style.bottom);
  } else {
    seedBoxPos.y = seedBox.offsetTop;
  }
  
  appState.ui.panel_positions = {
    settings: { x: settingsPanel.offsetLeft, y: settingsPanel.offsetTop },
    seed_box: seedBoxPos
  };
  
  appState.ui.canvas = {
    zoom: appState.canvas.zoom,
    pan: appState.canvas.pan
  };
  
  appState.ui.focused_node_id = appState.tree.focused_node_id;
  
  localStorage.setItem('loom-ui-state', JSON.stringify(appState.ui));
}

function loadUIState() {
  const saved = localStorage.getItem('loom-ui-state');
  if (saved) {
    appState.ui = JSON.parse(saved);
    applyUIState();
  }
}

function applyUIState() {
  const positions = appState.ui.panel_positions;
  if (!positions) return;
  
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  
  if (positions.settings) {
    const panel = document.getElementById('settings-panel');
    const rect = panel.getBoundingClientRect();
    
    // Constrain to screen
    let x = Math.max(0, Math.min(windowWidth - rect.width, positions.settings.x));
    let y = Math.max(0, Math.min(windowHeight - rect.height, positions.settings.y));
    
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
  }
  
  if (positions.seed_box) {
    const box = document.getElementById('seed-box');
    box.style.transform = 'none'; // Remove default centering transform
    
    const rect = box.getBoundingClientRect();
    
    // Constrain to screen
    let x = Math.max(0, Math.min(windowWidth - rect.width, positions.seed_box.x));
    
    if (positions.seed_box.bottom !== undefined) {
      let bottom = Math.max(0, Math.min(windowHeight - rect.height, positions.seed_box.bottom));
      box.style.bottom = bottom + 'px';
      box.style.top = 'auto';
    } else if (positions.seed_box.y !== undefined) {
      let y = Math.max(0, Math.min(windowHeight - rect.height, positions.seed_box.y));
      box.style.top = y + 'px';
    }
    
    box.style.left = x + 'px';
  }
  
  // Restore canvas state
  if (appState.ui.canvas) {
    appState.canvas.zoom = appState.ui.canvas.zoom || 1;
    appState.canvas.pan = appState.ui.canvas.pan || { x: 0, y: 0 };
    updateViewport();
  }
  
  // Restore focused node
  if (appState.ui.focused_node_id && appState.tree.nodes[appState.ui.focused_node_id]) {
    appState.tree.focused_node_id = appState.ui.focused_node_id;
  }
}

let saveSettingsTimeout = null;
function saveSettings() {
  const apiKeyInput = document.getElementById('api-key-input');
  const apiKeyValue = apiKeyInput.value.trim();
  
  // Build settings object
  appState.settings = {
    model: document.getElementById('model-input').value,
    temperature: parseFloat(document.getElementById('temp-slider').value),
    min_p: parseFloat(document.getElementById('minp-slider').value),
    max_tokens: parseInt(document.getElementById('max-tokens').value),
    n_siblings: parseInt(document.getElementById('siblings-input').value),
    untitled_trick: document.getElementById('untitled-toggle').checked,
    dark_mode: document.getElementById('dark-mode-toggle').checked
  };
  
  // Only include token if the field has a value (to update it)
  if (apiKeyValue) {
    appState.settings.token = apiKeyValue;
  }
  
  // Debounce: save to backend after 500ms of no changes
  clearTimeout(saveSettingsTimeout);
  saveSettingsTimeout = setTimeout(async () => {
    try {
      await fetch('/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appState.settings)
      });
      
      // Clear API key field after successful save
      if (apiKeyValue) {
        apiKeyInput.value = '';
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }, 500);
}

function applySettingsToUI() {
  // Apply settings to UI controls
  document.getElementById('model-input').value = appState.settings.model || 'moonshotai/kimi-k2';
  // API key field always starts empty (password field behavior)
  document.getElementById('api-key-input').value = '';
  document.getElementById('temp-slider').value = appState.settings.temperature || 1.0;
  document.getElementById('minp-slider').value = appState.settings.min_p || 0.01;
  document.getElementById('max-tokens').value = appState.settings.max_tokens || 32;
  document.getElementById('siblings-input').value = appState.settings.n_siblings || 3;
  document.getElementById('untitled-toggle').checked = appState.settings.untitled_trick || false;
  document.getElementById('dark-mode-toggle').checked = appState.settings.dark_mode || false;
  
  // Update value inputs
  document.getElementById('temp-value').value = appState.settings.temperature || 1.0;
  document.getElementById('minp-value').value = appState.settings.min_p || 0.01;
  
  // Apply dark mode
  if (appState.settings.dark_mode) {
    document.body.classList.add('dark-mode');
    const canvasBg = document.getElementById('canvas-bg');
    canvasBg.setAttribute('fill', 'url(#dot-grid-dark)');
  }
  
  // Trigger provider detection
  updateProviderDetection();
}

// Error Toast Functions
function getErrorDescription(statusCode) {
  const errorDescriptions = {
    400: "Bad Request - Invalid parameters were sent to the API. Please check your model settings and try again.",
    401: "Invalid Credentials - Your API key is invalid, expired, or disabled. Please check your token in settings.",
    402: "Insufficient Credits - Your account or API key has run out of credits. Add more credits to your OpenRouter account and try again.",
    403: "Content Moderation - Your input was flagged by content moderation. Please modify your prompt and try again.",
    408: "Request Timeout - Your request took too long to process. Try with a shorter prompt or different model.",
    429: "Rate Limited - You're making requests too quickly. Please wait a moment and try again.",
    502: "Model Unavailable - The selected model is currently down or returned an invalid response. Try a different model.",
    503: "No Available Provider - No model provider meets your routing requirements. Try a different model or check your settings."
  };
  
  return errorDescriptions[statusCode] || `Unknown error (Status: ${statusCode})`;
}

function parseStatusCode(message) {
  // Look for patterns like "API error: 401" or "Status code: 429"
  const statusMatch = message.match(/(?:API error|Status(?:\s+code)?|error):\s*(\d{3})/i);
  if (statusMatch) {
    return parseInt(statusMatch[1]);
  }
  
  // Look for standalone status codes in message
  const codeMatch = message.match(/\b(4\d{2}|5\d{2})\b/);
  if (codeMatch) {
    return parseInt(codeMatch[1]);
  }
  
  return null;
}

function showError(message) {
  const errorToast = document.getElementById('error-toast');
  const errorToastBody = document.getElementById('error-toast-body');
  
  // Parse status code from message
  const statusCode = parseStatusCode(message);
  
  let displayMessage = message;
  
  if (statusCode) {
    const description = getErrorDescription(statusCode);
    displayMessage = `Error ${statusCode}: ${description}`;
  } else if (message.toLowerCase().includes('openai-compatible api connection error')) {
    displayMessage = "Server Connection Error - Cannot connect to the API server. Make sure it's running and the URL is correct.";
  } else if (message.toLowerCase().includes('openai-compatible api timeout')) {
    displayMessage = "Server Timeout - The API server took too long to respond. The model might be too large or the server is overloaded.";
  } else if (message.toLowerCase().includes('openai-compatible api error')) {
    displayMessage = "API Server Error - The server returned an error. Check the server logs for more details.";
  } else if (message.toLowerCase().includes('connection error')) {
    displayMessage = "Connection Error - Unable to connect to the API. Check your internet connection and try again.";
  } else if (message.toLowerCase().includes('all models failed')) {
    displayMessage = "All Models Failed - All available models returned errors. This may be a temporary issue with the API service.";
  }
  
  errorToastBody.textContent = displayMessage;
  
  // Show toast
  errorToast.classList.add('show');
  
  // Auto-hide after 8 seconds
  setTimeout(() => {
    errorToast.classList.remove('show');
  }, 8000);
  
  // Close button
  const closeBtn = errorToast.querySelector('.toast-close');
  closeBtn.onclick = () => {
    errorToast.classList.remove('show');
  };
}

// start app
document.addEventListener('DOMContentLoaded', init);

