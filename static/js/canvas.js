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
  viewport.setAttribute('transform', `translate(${appState.canvas.pan.x},${appState.canvas.pan.y}) scale(${appState.canvas.zoom})`);
}

