// canvas.js - pan/zoom
// Only pans when clicking canvas background, not nodes

let isPanning = false;
let panStartX = 0, panStartY = 0;
let startViewportX = 0, startViewportY = 0;

function setupCanvas() {
  const canvas = document.getElementById('canvas');
  const canvasBg = document.getElementById('canvas-bg');

  // Zoom from cursor
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();

    const oldScale = appState.canvas.zoom;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    appState.canvas.zoom *= delta;
    appState.canvas.zoom = Math.max(0.1, Math.min(5, appState.canvas.zoom));

    // Zoom toward cursor position
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Adjust viewport to keep point under cursor stationary
    const scaleDiff = appState.canvas.zoom - oldScale;
    appState.canvas.pan.x -= (mouseX - appState.canvas.pan.x) * (scaleDiff / oldScale);
    appState.canvas.pan.y -= (mouseY - appState.canvas.pan.y) * (scaleDiff / oldScale);

    updateViewport();
  }, { passive: false });

  // Pan - only on background rect
  canvasBg.addEventListener('mousedown', (e) => {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    startViewportX = appState.canvas.pan.x;
    startViewportY = appState.canvas.pan.y;
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('mousemove', (e) => {
    if (isPanning) {
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      appState.canvas.pan.x = startViewportX + dx;
      appState.canvas.pan.y = startViewportY + dy;
      updateViewport();
    }
  });

  canvas.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
      canvas.style.cursor = 'default';
      saveUIState(); // Save after panning
    }
  });

  canvas.addEventListener('mouseleave', () => {
    if (isPanning) {
      isPanning = false;
      canvas.style.cursor = 'default';
      saveUIState(); // Save after panning
    }
  });
}

function updateViewport() {
  const viewport = document.getElementById('viewport');
  const canvas = document.getElementById('canvas');
  const canvasBg = document.getElementById('canvas-bg');

  viewport.setAttribute('transform', `translate(${appState.canvas.pan.x},${appState.canvas.pan.y}) scale(${appState.canvas.zoom})`);

  // Update background to cover visible area (creates infinite canvas effect)
  // Convert screen bounds to world coordinates
  const screenW = canvas.clientWidth || window.innerWidth;
  const screenH = canvas.clientHeight || window.innerHeight;

  // World coordinates of top-left corner of screen
  const worldX = -appState.canvas.pan.x / appState.canvas.zoom;
  const worldY = -appState.canvas.pan.y / appState.canvas.zoom;

  // Size in world coordinates (add padding to prevent edge flickering)
  const padding = 500;
  const worldW = screenW / appState.canvas.zoom + padding * 2;
  const worldH = screenH / appState.canvas.zoom + padding * 2;

  canvasBg.setAttribute('x', worldX - padding);
  canvasBg.setAttribute('y', worldY - padding);
  canvasBg.setAttribute('width', worldW);
  canvasBg.setAttribute('height', worldH);

  // Update grid pattern based on zoom level
  updateGridPattern();
}

function updateGridPattern() {
  const zoom = appState.canvas.zoom;
  const isDarkMode = document.body.classList.contains('dark-mode');

  // Base grid size and dot size
  const baseSize = 20;
  const baseDotRadius = 1.2;

  // Determine grid scale - subdivide or multiply based on zoom
  let gridSize = baseSize;
  let opacity = isDarkMode ? 0.8 : 0.5;
  let dotRadius = baseDotRadius / zoom; // Scale dot size inversely with zoom to keep visual size

  if (zoom < 0.25) {
    gridSize = baseSize * 4; // Larger grid when zoomed way out
    opacity = (isDarkMode ? 0.8 : 0.5) * 0.7;
  } else if (zoom < 0.5) {
    gridSize = baseSize * 2; // Double grid when zoomed out
    opacity = (isDarkMode ? 0.8 : 0.5) * 0.85;
  } else if (zoom > 2.5) {
    gridSize = baseSize / 2; // Subdivide when zoomed way in
    opacity = (isDarkMode ? 0.8 : 0.5) * 0.8;
  } else if (zoom > 1.5) {
    gridSize = baseSize * 0.75; // Slight subdivision when zoomed in
    opacity = (isDarkMode ? 0.8 : 0.5) * 0.9;
  }

  // Update the pattern
  const patternId = isDarkMode ? 'dot-grid-dark' : 'dot-grid';
  const pattern = document.getElementById(patternId);
  const circle = pattern.querySelector('circle');

  pattern.setAttribute('width', gridSize);
  pattern.setAttribute('height', gridSize);
  circle.setAttribute('r', dotRadius);
  circle.setAttribute('opacity', opacity);
}

