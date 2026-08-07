// ===== FORCE-DIRECTED LAYOUT =====
// Extracted from brain-tab.tsx — pure function, no React dependencies

import type { GraphNode, GraphEdge, LayoutNode } from './types';

export function runForceLayout(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number): LayoutNode[] {
  const layoutNodes: LayoutNode[] = nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    const r = Math.min(width, height) * 0.35;
    return {
      ...n,
      x: width / 2 + r * Math.cos(angle),
      y: height / 2 + r * Math.sin(angle),
      vx: 0,
      vy: 0,
      connections: 0,
    };
  });

  // Count connections per node
  for (const edge of edges) {
    const src = layoutNodes.find((n) => n.id === edge.source);
    const tgt = layoutNodes.find((n) => n.id === edge.target);
    if (src) src.connections++;
    if (tgt) tgt.connections++;
  }

  const nodeMap = new Map(layoutNodes.map((n) => [n.id, n]));
  const iterations = 120;
  const repulsion = 2000;
  const attraction = 0.008;
  const centerPull = 0.01;
  const damping = 0.85;
  const cx = width / 2;
  const cy = height / 2;

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations;

    // Repulsion between all node pairs
    for (let i = 0; i < layoutNodes.length; i++) {
      for (let j = i + 1; j < layoutNodes.length; j++) {
        const a = layoutNodes[i];
        const b = layoutNodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        dist = Math.max(dist, 1);
        const force = (repulsion * alpha) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (!src || !tgt) continue;
      let dx = tgt.x - src.x;
      let dy = tgt.y - src.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      dist = Math.max(dist, 1);
      const force = dist * attraction * edge.strength * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      src.vx += fx;
      src.vy += fy;
      tgt.vx -= fx;
      tgt.vy -= fy;
    }

    // Center pull
    for (const node of layoutNodes) {
      node.vx += (cx - node.x) * centerPull * alpha;
      node.vy += (cy - node.y) * centerPull * alpha;
    }

    // Apply velocity with damping and bounds
    const pad = 30;
    for (const node of layoutNodes) {
      node.vx *= damping;
      node.vy *= damping;
      node.x += node.vx;
      node.y += node.vy;
      node.x = Math.max(pad, Math.min(width - pad, node.x));
      node.y = Math.max(pad, Math.min(height - pad, node.y));
    }
  }

  return layoutNodes;
}