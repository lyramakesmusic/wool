// rendering.js - node/edge rendering

// lines = ["text line 1", "text line 2", ...], maxChars per line
function wrapText(text, maxChars) {
  if (!text) return [''];
  
  const lines = [];
  // First split by actual newlines
  const paragraphs = text.split(/\n/);
  
  paragraphs.forEach(para => {
    if (!para) {
      lines.push('');
      return;
    }
    
    const words = para.split(' ');
    let currentLine = '';
    
    words.forEach(word => {
      // Force break long words
      if (word.length > maxChars) {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = '';
        }
        // Break the word into chunks
        for (let i = 0; i < word.length; i += maxChars) {
          lines.push(word.substring(i, i + maxChars));
        }
        return;
      }
      
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (testLine.length <= maxChars) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    });
    
    if (currentLine) lines.push(currentLine);
  });
  
  return lines.length > 0 ? lines : [''];
}

// SVG <g> element, dynamically sized
function renderNode(node, isFocused, isOnFocusedPath) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  let classes = 'node';
  if (isFocused) classes += ' focused';
  if (isOnFocusedPath) classes += ' focused-path';
  if (node.isGhost) classes += ' ghost';
  g.setAttribute('class', classes);
  g.setAttribute('data-node-id', node.id);
  g.setAttribute('transform', `translate(${node.position.x},${node.position.y})`);
  
  if (node.loading) {
    g.classList.add('loading');
  }
  if (node.error) {
    g.classList.add('error');
  }
  
  const LINE_HEIGHT = 18;
  const PADDING = 12; // Same padding all around
  const FIXED_WIDTH = node.isGhost ? 50 : 280; // Ghost nodes are very thin
  const MIN_HEIGHT = node.isGhost ? 30 : 50;
  const CHARS_PER_LINE = node.isGhost ? 4 : 42; // Fits in width with padding
  
  // wrap text and calculate dimensions
  let displayText = node.text || (node.loading ? '⟳ generating...' : '');
  const lines = wrapText(displayText, CHARS_PER_LINE);
  
  const nodeWidth = FIXED_WIDTH;
  const nodeHeight = Math.max(MIN_HEIGHT, lines.length * LINE_HEIGHT + PADDING * 2);
  
  // background
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('class', 'node-bg');
  rect.setAttribute('width', nodeWidth);
  rect.setAttribute('height', nodeHeight);
  rect.setAttribute('rx', '8');
  g.appendChild(rect);
  
  // text lines with clipping
  const clipId = `clip-${node.id}`;
  const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
  clipPath.setAttribute('id', clipId);
  const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  clipRect.setAttribute('x', 0);
  clipRect.setAttribute('y', 0);
  clipRect.setAttribute('width', nodeWidth);
  clipRect.setAttribute('height', nodeHeight);
  clipPath.appendChild(clipRect);
  g.appendChild(clipPath);
  
  const textGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  textGroup.setAttribute('clip-path', `url(#${clipId})`);
  
  lines.forEach((line, i) => {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('class', 'node-text');
    text.setAttribute('x', PADDING);
    text.setAttribute('y', PADDING + 12 + (i * LINE_HEIGHT)); // 12px for baseline offset
    text.textContent = line;
    textGroup.appendChild(text);
  });
  
  g.appendChild(textGroup);
  
  // Add children indicator if node has children (but not for ghost nodes)
  if (!node.isGhost) {
    const hasChildren = Object.values(appState.tree.nodes).some(n => n.parent_id === node.id);
    if (hasChildren) {
      const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      indicator.setAttribute('class', 'children-indicator');
      indicator.setAttribute('x1', nodeWidth);
      indicator.setAttribute('y1', nodeHeight / 2 - 6);
      indicator.setAttribute('x2', nodeWidth + 8);
      indicator.setAttribute('y2', nodeHeight / 2 - 6);
      g.appendChild(indicator);
      
      const indicator2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      indicator2.setAttribute('class', 'children-indicator');
      indicator2.setAttribute('x1', nodeWidth);
      indicator2.setAttribute('y1', nodeHeight / 2);
      indicator2.setAttribute('x2', nodeWidth + 8);
      indicator2.setAttribute('y2', nodeHeight / 2);
      g.appendChild(indicator2);
      
      const indicator3 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      indicator3.setAttribute('class', 'children-indicator');
      indicator3.setAttribute('x1', nodeWidth);
      indicator3.setAttribute('y1', nodeHeight / 2 + 6);
      indicator3.setAttribute('x2', nodeWidth + 8);
      indicator3.setAttribute('y2', nodeHeight / 2 + 6);
      g.appendChild(indicator3);
    }
    
    // Add hover buttons group
    const hoverButtons = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    hoverButtons.setAttribute('class', 'hover-buttons');
    hoverButtons.setAttribute('opacity', '0');
    
    // View-as button
    const viewAsBtn = createHoverButton(-8, -8, 'bi-eye', 'view-as');
    viewAsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showViewAsPopup(node);
    });
    hoverButtons.appendChild(viewAsBtn);
    
    // Edit button
    const editBtn = createHoverButton(nodeWidth - 16, -8, 'bi-pencil', 'edit');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      editNode(node);
    });
    hoverButtons.appendChild(editBtn);
    
    // Delete button
    const deleteBtn = createHoverButton(nodeWidth + 8, -8, 'bi-trash', 'delete');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteNode(node);
    });
    hoverButtons.appendChild(deleteBtn);
    
    g.appendChild(hoverButtons);
    
    // Show/hide hover buttons on node hover
    g.addEventListener('mouseenter', () => {
      hoverButtons.setAttribute('opacity', '1');
    });
    g.addEventListener('mouseleave', () => {
      hoverButtons.setAttribute('opacity', '0');
    });
  }
  
  // plus button (grouped so hover animation works correctly) - not for ghost nodes
  if (!node.isGhost) {
    const plusGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    plusGroup.setAttribute('class', 'plus-group');
    plusGroup.setAttribute('transform', `translate(${nodeWidth + 17}, ${nodeHeight / 2})`);
    
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('class', 'plus-button');
    circle.setAttribute('cx', 0);
    circle.setAttribute('cy', 0);
    circle.setAttribute('r', '12');
    circle.style.transition = 'r 0.15s ease, fill 0.15s ease, stroke 0.15s ease';
    plusGroup.appendChild(circle);
    
    const plus = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    plus.setAttribute('class', 'plus-symbol');
    plus.setAttribute('x', 0);
    plus.setAttribute('y', 5);
    plus.setAttribute('text-anchor', 'middle');
    plus.textContent = '+';
    plusGroup.appendChild(plus);
    
    g.appendChild(plusGroup);
  }
  
  // dragging and interactions (skip for ghost nodes)
  if (node.isGhost) {
    return g;
  }
  
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let nodeStartX = 0, nodeStartY = 0;
  
  rect.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    if (e.button === 0) { // left click only
      isDragging = true;
      const svg = document.getElementById('canvas');
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
      const viewport = document.getElementById('viewport');
      const transform = viewport.transform.baseVal.getItem(0);
      const viewportTransform = viewport.getCTM();
      
      dragStartX = svgP.x;
      dragStartY = svgP.y;
      nodeStartX = node.position.x;
      nodeStartY = node.position.y;
      
      e.preventDefault();
    }
  });
  
  // Global handlers for dragging (attached to SVG)
  const svg = document.getElementById('canvas');
  const mousemove = (e) => {
    if (isDragging) {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
      const viewport = document.getElementById('viewport');
      const viewportTransform = viewport.getCTM();
      
      // Calculate delta in viewport space
      const dx = (svgP.x - dragStartX) / appState.canvas.zoom;
      const dy = (svgP.y - dragStartY) / appState.canvas.zoom;
      
      node.position.x = nodeStartX + dx;
      node.position.y = nodeStartY + dy;
      
      renderTree();
    }
  };
  
  const mouseup = (e) => {
    if (isDragging) {
      isDragging = false;
      // Consider it a click if barely moved
      const dx = Math.abs(node.position.x - nodeStartX);
      const dy = Math.abs(node.position.y - nodeStartY);
      if (dx < 3 && dy < 3 && !node.loading) {
        handleNodeClick(node.id);
      } else {
        // Mark this node as manually positioned
        node.manually_positioned = true;
        
        // Save tree after dragging
        saveTree();
      }
    }
  };
  
  svg.addEventListener('mousemove', mousemove);
  svg.addEventListener('mouseup', mouseup);
  
  const plusGroup = g.querySelector('.plus-group');
  if (plusGroup) {
    plusGroup.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!node.loading && !isDragging) {
        handleNodeClick(node.id); // Focus the node first
        handleGenerateClick(node.id);
      }
    });
  }
  
  return g;
}

// SVG <path> element
function renderEdge(parentNode, childNode, isFocusedPath) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('class', isFocusedPath ? 'edge focused-path' : 'edge');
  path.setAttribute('d', generateSpline(parentNode, childNode));
  path.setAttribute('fill', 'none');
  return path;
}

function renderTree() {
  const nodesContainer = document.getElementById('nodes');
  const edgesContainer = document.getElementById('edges');
  
  nodesContainer.innerHTML = '';
  edgesContainer.innerHTML = '';
  
  const visibleIds = calculateVisibleNodes(
    appState.tree.focused_node_id,
    appState.tree
  );
  
  // focused path (for edge styling)
  const focusedPath = new Set();
  if (appState.tree.focused_node_id) {
    let current = appState.tree.nodes[appState.tree.focused_node_id];
    while (current) {
      focusedPath.add(current.id);
      if (current.parent_id) {
        focusedPath.add(`${current.parent_id}-${current.id}`);
      }
      current = appState.tree.nodes[current.parent_id];
    }
  }
  
  // edges first (behind nodes)
  Object.values(appState.tree.nodes).forEach(node => {
    if (node.parent_id && visibleIds.has(node.id)) {
      const parent = appState.tree.nodes[node.parent_id];
      const edgeKey = `${parent.id}-${node.id}`;
      const isFocusedPath = focusedPath.has(edgeKey);
      
      const edge = renderEdge(parent, node, isFocusedPath);
      edgesContainer.appendChild(edge);
    }
  });
  
  // nodes
  Object.values(appState.tree.nodes).forEach(node => {
    if (visibleIds.has(node.id)) {
      const isFocused = node.id === appState.tree.focused_node_id;
      const isOnFocusedPath = focusedPath.has(node.id);
      const nodeElement = renderNode(node, isFocused, isOnFocusedPath);
      nodesContainer.appendChild(nodeElement);
      
      // Add ghost nodes for collapsed children
      const children = Object.values(appState.tree.nodes).filter(n => n.parent_id === node.id);
      const visibleChildren = children.filter(child => visibleIds.has(child.id));
      
      if (children.length > 0 && visibleChildren.length === 0) {
        // Has children but none are visible - show thin ghost indicator
        // Center it vertically with the parent node
        const PARENT_WIDTH = 280;
        const PARENT_PADDING = 12;
        const PARENT_LINE_HEIGHT = 18;
        const PARENT_MIN_HEIGHT = 50;
        const PARENT_CHARS_PER_LINE = 42;
        
        // Calculate parent height
        const parentText = node.text || '';
        const parentLines = wrapText(parentText, PARENT_CHARS_PER_LINE);
        const parentHeight = Math.max(PARENT_MIN_HEIGHT, parentLines.length * PARENT_LINE_HEIGHT + PARENT_PADDING * 2);
        
        const GHOST_HEIGHT = 30;
        const HORIZONTAL_OFFSET = 310; // Closer to parent
        
        const ghostNode = {
          id: `ghost-${node.id}`,
          text: '...',
          position: {
            x: node.position.x + HORIZONTAL_OFFSET,
            y: node.position.y + (parentHeight / 2) - (GHOST_HEIGHT / 2) // Center vertically
          },
          isGhost: true
        };
        const ghostElement = renderNode(ghostNode, false, false);
        nodesContainer.appendChild(ghostElement);
        
        // Add ghost edge
        const ghostEdge = renderEdge(node, ghostNode, false);
        edgesContainer.appendChild(ghostEdge);
      }
    }
  });
}

function handleNodeClick(nodeId) {
  appState.tree.focused_node_id = nodeId;
  renderTree();
  
  // save UI state to persist focused node
  saveUIState();
  
  // async save focus - don't await
  fetch('/tree/focus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_id: nodeId })
  }).catch(err => console.error('Failed to save focus:', err));
}

async function saveTree() {
  // async save tree state
  try {
    await fetch('/tree/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appState.tree)
    });
  } catch (err) {
    console.error('Failed to save tree:', err);
  }
}

function createHoverButton(x, y, iconClass, className) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', `hover-btn ${className}`);
  g.setAttribute('transform', `translate(${x}, ${y})`);
  
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', 8);
  circle.setAttribute('cy', 8);
  circle.setAttribute('r', 8);
  circle.setAttribute('class', 'hover-btn-bg');
  g.appendChild(circle);
  
  const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
  foreignObject.setAttribute('x', 4);
  foreignObject.setAttribute('y', 4);
  foreignObject.setAttribute('width', 8);
  foreignObject.setAttribute('height', 8);
  
  const icon = document.createElement('i');
  icon.className = `bi ${iconClass} hover-btn-icon`;
  icon.style.fontSize = '8px';
  icon.style.display = 'flex';
  icon.style.alignItems = 'center';
  icon.style.justifyContent = 'center';
  
  foreignObject.appendChild(icon);
  g.appendChild(foreignObject);
  
  return g;
}

function showViewAsPopup(node) {
  // Remove existing popup if any
  let popup = document.getElementById('view-as-popup');
  if (popup) popup.remove();
  
  // Build the full context from root to this node
  const path = [];
  let current = node;
  while (current) {
    path.unshift(current);
    current = appState.tree.nodes[current.parent_id];
  }
  
  // Combine all text with preserved formatting (concatenate directly, no spaces)
  const fullText = path.map(n => n.text).join('');
  const escapedText = fullText.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  
  // Create popup
  popup = document.createElement('div');
  popup.id = 'view-as-popup';
  popup.className = 'view-as-popup';
  
  popup.innerHTML = `
    <div class="popup-container view-as-large">
      <div class="popup-header">
        <h3>Tree Content</h3>
        <div class="popup-actions-header">
          <button class="btn-icon" id="copy-content-btn" title="Copy to clipboard">
            <i class="bi bi-copy"></i>
          </button>
          <button class="btn-icon" id="download-content-btn" title="Download as .txt">
            <i class="bi bi-download"></i>
          </button>
          <button class="popup-close">×</button>
        </div>
      </div>
      <div class="popup-content">
        <div class="tree-content-display">${escapedText}</div>
      </div>
    </div>
  `;
  
  document.body.appendChild(popup);
  
  // Event listeners
  popup.querySelector('.popup-close').addEventListener('click', () => popup.remove());
  
  // Copy button
  popup.querySelector('#copy-content-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      const btn = popup.querySelector('#copy-content-btn');
      const originalHTML = btn.innerHTML;
      btn.innerHTML = '<i class="bi bi-check"></i>';
      setTimeout(() => {
        btn.innerHTML = originalHTML;
      }, 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  });
  
  // Download button
  popup.querySelector('#download-content-btn').addEventListener('click', () => {
    const blob = new Blob([fullText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tree-${node.id.substring(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  
  // Close on escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      popup.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
  
  // Close on backdrop click
  popup.addEventListener('click', (e) => {
    if (e.target === popup) popup.remove();
  });
}

function editNode(node) {
  // Remove existing editor if any
  let editor = document.getElementById('node-editor');
  if (editor) editor.remove();
  
  // Create editor popup
  editor = document.createElement('div');
  editor.id = 'node-editor';
  editor.className = 'view-as-popup';
  
  const escapedText = node.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  editor.innerHTML = `
    <div class="popup-container">
      <div class="popup-header">
        <h3>Edit Node</h3>
        <button class="popup-close">×</button>
      </div>
      <div class="popup-content">
        <textarea class="node-edit-textarea" rows="8">${escapedText}</textarea>
        <div class="popup-actions">
          <button class="btn-secondary popup-cancel">Cancel</button>
          <button class="btn-primary popup-save">Save</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(editor);
  
  const textarea = editor.querySelector('.node-edit-textarea');
  textarea.focus();
  textarea.select();
  
  const save = async () => {
    node.text = textarea.value;
    await saveTree();
    renderTree();
    editor.remove();
  };
  
  // Event listeners
  editor.querySelector('.popup-close').addEventListener('click', () => editor.remove());
  editor.querySelector('.popup-cancel').addEventListener('click', () => editor.remove());
  editor.querySelector('.popup-save').addEventListener('click', save);
  
  // Save on Ctrl+Enter
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    }
  });
  
  // Close on escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      editor.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

async function deleteNode(node) {
  // Check if node has children
  const hasChildren = Object.values(appState.tree.nodes).some(n => n.parent_id === node.id);
  
  // Only confirm if has children
  if (hasChildren && !confirm(`Delete this node and all its children?`)) {
    return;
  }
  
  // Recursively delete this node and all descendants
  const toDelete = [node.id];
  const findDescendants = (nodeId) => {
    Object.values(appState.tree.nodes).forEach(n => {
      if (n.parent_id === nodeId) {
        toDelete.push(n.id);
        findDescendants(n.id);
      }
    });
  };
  findDescendants(node.id);
  
  // Delete all collected nodes
  toDelete.forEach(id => delete appState.tree.nodes[id]);
  
  // If we deleted the focused node, focus parent or root
  if (toDelete.includes(appState.tree.focused_node_id)) {
    if (node.parent_id) {
      appState.tree.focused_node_id = node.parent_id;
    } else {
      const remaining = Object.keys(appState.tree.nodes);
      appState.tree.focused_node_id = remaining.length > 0 ? remaining[0] : null;
    }
  }
  
  await saveTree();
  renderTree();
}

