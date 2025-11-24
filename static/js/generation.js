// generation.js - generation workflow

function getCurrentSettings() {
  const modelInput = document.getElementById('model-input').value;
  const detection = detectProviderFromInput(modelInput);
  
  // Note: token comes from backend config, not from the password field
  // The password field is only for updating the token
  return {
    model: detection.model,
    endpoint: detection.endpoint,
    provider: detection.provider,
    temperature: parseFloat(document.getElementById('temp-slider').value),
    min_p: parseFloat(document.getElementById('minp-slider').value),
    max_tokens: parseInt(document.getElementById('max-tokens').value),
    n_siblings: parseInt(document.getElementById('siblings-input').value),
    untitled_trick: document.getElementById('untitled-toggle').checked
  };
}

async function handleGenerateClick(parentNodeId) {
  const settings = getCurrentSettings();
  const n = settings.n_siblings;
  
  // placeholder nodes immediately with better initial spacing
  const placeholderIds = [];
  const parent = appState.tree.nodes[parentNodeId];
  
  // Estimate height for loading state
  const HORIZONTAL_OFFSET = 380; // 80px further right
  const ESTIMATED_HEIGHT = 50; // Height of "⟳ generating..." node
  const VERTICAL_GAP = 40; // Increased gap to prevent overlaps
  
  // Calculate parent height to find its center
  const LINE_HEIGHT = 18;
  const PADDING = 12;
  const MIN_HEIGHT = 50;
  const CHARS_PER_LINE = 36;
  const parentText = parent.text || '';
  const parentLines = wrapText(parentText, CHARS_PER_LINE);
  const parentHeight = Math.max(MIN_HEIGHT, parentLines.length * LINE_HEIGHT + PADDING * 2);
  const parentCenterY = parent.position.y + (parentHeight / 2);
  
  const totalHeight = n * ESTIMATED_HEIGHT + (n - 1) * VERTICAL_GAP;
  let currentY = parentCenterY - (totalHeight / 2);
  
  for (let i = 0; i < n; i++) {
    const id = generateUUID();
    placeholderIds.push(id);
    
    appState.tree.nodes[id] = {
      id: id,
      parent_id: parentNodeId,
      type: 'ai',
      text: '',
      loading: true,
      position: {
        x: parent.position.x + HORIZONTAL_OFFSET,
        y: currentY
      },
      model: settings.model,
      temperature: settings.temperature,
      min_p: settings.min_p,
      max_tokens: settings.max_tokens
    };
    
    currentY += ESTIMATED_HEIGHT + VERTICAL_GAP;
  }
  
  renderTree();
  
  // Save tree state with placeholders to server before generating
  await fetch('/tree/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(appState.tree)
  });
  
  // request generation from server
  try {
    const response = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent_node_id: parentNodeId,
        settings: settings,
        n_siblings: n,
        placeholder_ids: placeholderIds
      })
    });
    
    const result = await response.json();
    
    // Wait for all to complete, then update all at once
    // This prevents repositioning on incomplete data
    
    // Show loading state periodically
    const loadingInterval = setInterval(() => {
      renderTree();
    }, 100);
    
    const allCompleted = new Promise((resolve) => {
      let completedCount = 0;
      result.nodes.forEach((node, index) => {
        setTimeout(() => {
          appState.tree.nodes[node.id].text = node.text;
          appState.tree.nodes[node.id].loading = false;
          appState.tree.nodes[node.id].error = node.error;
          
          completedCount++;
          
          if (completedCount === result.nodes.length) {
            resolve();
          }
        }, index * 50); // Stagger updates slightly
      });
    });
    
    await allCompleted;
    clearInterval(loadingInterval);
    
    // Check if any nodes had errors and show toast
    const errorNodes = result.nodes.filter(node => node.error);
    if (errorNodes.length > 0) {
      // Show toast with the first error (most relevant)
      showError(errorNodes[0].error);
    }
    
    // Now remove invalid leaves and reposition with final heights
    removeInvalidLeaves(parentNodeId);
    repositionSiblingsWithHeights(parentNodeId, true); // true = recursive
    
    // Save final tree state
    saveTree();
    renderTree();
    
  } catch (error) {
    // Show error toast with detailed message
    showError(error.message || error.toString());
    
    // mark all placeholders as error
    placeholderIds.forEach(id => {
      appState.tree.nodes[id].loading = false;
      appState.tree.nodes[id].error = 'Generation failed';
    });
    removeInvalidLeaves(parentNodeId);
    repositionSiblingsWithHeights(parentNodeId, true); // true = recursive
    saveTree();
    renderTree();
  }
}

function removeInvalidLeaves(parentNodeId) {
  // Find all children of this parent
  const children = Object.values(appState.tree.nodes).filter(n => n.parent_id === parentNodeId);
  
  // Remove empty or errored leaves (nodes with no children)
  children.forEach(child => {
    const hasChildren = Object.values(appState.tree.nodes).some(n => n.parent_id === child.id);
    if (!hasChildren && (!child.text || child.text.trim() === '' || child.error)) {
      delete appState.tree.nodes[child.id];
    }
  });
}

function calculateNodeHeight(node) {
  // Mirror the calculation from renderNode
  const LINE_HEIGHT = 18;
  const PADDING = 12;
  const MIN_HEIGHT = 50;
  const CHARS_PER_LINE = 36;
  
  let displayText = node.text || '';
  const lines = wrapText(displayText, CHARS_PER_LINE);
  
  return Math.max(MIN_HEIGHT, lines.length * LINE_HEIGHT + PADDING * 2);
}

function repositionSiblingsWithHeights(parentNodeId, recursive = true) {
  // Find all children of this parent
  const children = Object.values(appState.tree.nodes).filter(n => n.parent_id === parentNodeId);
  if (children.length === 0) return;
  
  // Check if any siblings have been manually positioned
  const hasManuallyPositioned = children.some(child => child.manually_positioned);
  
  // If any child has been manually positioned, don't auto-reposition
  if (hasManuallyPositioned) {
    return;
  }
  
  const HORIZONTAL_OFFSET = 380;
  const VERTICAL_GAP = 40;
  
  const parent = appState.tree.nodes[parentNodeId];
  
  // Sort children by current Y position to maintain order
  children.sort((a, b) => a.position.y - b.position.y);
  
  // Calculate parent height to find its center
  const parentHeight = calculateNodeHeight(parent);
  const parentCenterY = parent.position.y + (parentHeight / 2);
  
  // Calculate heights for each child
  const heights = children.map(child => calculateNodeHeight(child));
  
  // Calculate total height needed (sum of heights + gaps)
  const totalHeight = heights.reduce((sum, h) => sum + h, 0) + (children.length - 1) * VERTICAL_GAP;
  
  // Start from top, centered around parent's center
  let currentY = parentCenterY - (totalHeight / 2);
  
  children.forEach((child, i) => {
    const oldX = child.position.x;
    const oldY = child.position.y;
    
    child.position.x = parent.position.x + HORIZONTAL_OFFSET;
    // position.y is the TOP of the node
    child.position.y = currentY;
    
    // If recursive, reposition this child's descendants
    if (recursive) {
      repositionSiblingsWithHeights(child.id, true);
    } else {
      // If not recursive but child moved, shift descendants
      const dx = child.position.x - oldX;
      const dy = child.position.y - oldY;
      if (dx !== 0 || dy !== 0) {
        shiftDescendants(child.id, dx, dy);
      }
    }
    
    // Move to next position
    currentY += heights[i] + VERTICAL_GAP;
  });
}

function shiftDescendants(nodeId, dx, dy) {
  // Find all children of this node
  const children = Object.values(appState.tree.nodes).filter(n => n.parent_id === nodeId);
  
  children.forEach(child => {
    // Skip if manually positioned
    if (!child.manually_positioned) {
      child.position.x += dx;
      child.position.y += dy;
      
      // Recursively shift their children too
      shiftDescendants(child.id, dx, dy);
    }
  });
}

