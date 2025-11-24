// tree.js - visibility, layout = calculateVisibleNodes(focusedNodeId, tree) {nodes: {node_id: node_obj}, focused_node_id: uuid}

function calculateVisibleNodes(focusedNodeId, tree) {
  const visible = new Set();
  
  if (!focusedNodeId || !tree.nodes[focusedNodeId]) {
    return visible;
  }
  
  visible.add(focusedNodeId);
  
  const focused = tree.nodes[focusedNodeId];
  
  // focused node's siblings
  if (focused.parent_id) {
    Object.values(tree.nodes).forEach(node => {
      if (node.parent_id === focused.parent_id) {
        visible.add(node.id);
      }
    });
  }
  
  // add descendants with smart branching logic (recursive)
  function addDescendants(nodeId) {
    const children = Object.values(tree.nodes).filter(n => n.parent_id === nodeId);
    
    if (children.length === 0) return; // leaf node
    
    // Add all children
    children.forEach(child => visible.add(child.id));
    
    // If only one child, continue down the chain
    if (children.length === 1) {
      addDescendants(children[0].id);
    } else {
      // Multiple children - check which ones have children
      const childrenWithDescendants = children.filter(child => {
        return Object.values(tree.nodes).some(n => n.parent_id === child.id);
      });
      
      // If only ONE sibling has descendants, expand down that path
      if (childrenWithDescendants.length === 1) {
        addDescendants(childrenWithDescendants[0].id);
      }
      // If multiple children have descendants, stop here (branching point)
    }
  }
  
  addDescendants(focusedNodeId);
  
  // walk up ancestors
  let current = focused;
  while (current.parent_id) {
    const parent = tree.nodes[current.parent_id];
    visible.add(parent.id);
    
    // parent's siblings
    if (parent.parent_id) {
      Object.values(tree.nodes).forEach(node => {
        if (node.parent_id === parent.parent_id) {
          visible.add(node.id);
        }
      });
    }
    
    current = parent;
  }
  
  return visible;
}

// positions = [{x, y}, ...] for siblingCount children of parentNode
function calculateSiblingPositions(parentNode, siblingCount) {
  const HORIZONTAL_OFFSET = 380; // 80px further right
  const VERTICAL_SPACING = 30;
  
  const totalHeight = (siblingCount - 1) * VERTICAL_SPACING;
  const startY = parentNode.position.y - (totalHeight / 2);
  
  const positions = [];
  for (let i = 0; i < siblingCount; i++) {
    positions.push({
      x: parentNode.position.x + HORIZONTAL_OFFSET,
      y: startY + (i * VERTICAL_SPACING)
    });
  }
  
  return positions;
}

// path string for SVG bezier curve (calculate node dimensions dynamically)
function generateSpline(parentNode, childNode) {
  const CHARS_PER_LINE = 36;
  const LINE_HEIGHT = 18;
  const PADDING = 12;
  const FIXED_WIDTH = 280;
  const MIN_HEIGHT = 50;
  
  function calcNodeDimensions(node) {
    const text = node.text || '';
    const lines = wrapText(text, CHARS_PER_LINE);
    const width = FIXED_WIDTH;
    const height = Math.max(MIN_HEIGHT, lines.length * LINE_HEIGHT + PADDING * 2);
    return { width, height };
  }
  
  const parentDims = calcNodeDimensions(parentNode);
  const childDims = calcNodeDimensions(childNode);
  
  const start = {
    x: parentNode.position.x + parentDims.width,
    y: parentNode.position.y + (parentDims.height / 2)
  };
  
  const end = {
    x: childNode.position.x,
    y: childNode.position.y + (childDims.height / 2)
  };
  
  const midX = start.x + (end.x - start.x) * 0.5;
  
  const cp1 = { x: midX, y: start.y };
  const cp2 = { x: midX, y: end.y };
  
  return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

