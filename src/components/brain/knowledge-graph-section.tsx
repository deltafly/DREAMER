'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { Network } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useWorkspaceId, wsUrl } from '@/lib/use-workspace-id';
import type { BrainGraph, LayoutNode } from './types';
import { getTopicColor, EDGE_STYLES } from './constants';
import { runForceLayout } from './force-layout';

export function KnowledgeGraphSection() {
  const wsId = useWorkspaceId();
  const [graph, setGraph] = useState<BrainGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    let cancelled = false;
    async function fetchGraph() {
      try {
        const res = await fetch(wsUrl('/api/brain/graph', wsId));
        if (!res.ok) throw new Error('Failed to fetch graph');
        const data = await res.json();
        if (!cancelled) setGraph(data);
      } catch {
        if (!cancelled) toast.error('Failed to load knowledge graph');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchGraph();
    return () => { cancelled = true; };
  }, [wsId]);
  useEffect(() => {
    if (!graph || !graph.nodes.length) return;
    const w = 500;
    const h = 360;
    const laid = runForceLayout(graph.nodes, graph.edges, w, h);
    const laidWithActivation = laid.map(ln => {
      const gn = graph.nodes.find(n => n.id === ln.id);
      return { ...ln, activationScore: gn?.activationScore ?? 0 };
    });
    setLayoutNodes(laidWithActivation);
  }, [graph]);

  const handleMouseDown = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      if (!svgRef.current) return;
      const svgRect = svgRef.current.getBoundingClientRect();
      const node = layoutNodes.find((n) => n.id === nodeId);
      if (!node) return;
      const scaleX = 500 / svgRect.width;
      const scaleY = 360 / svgRect.height;
      setDragOffset({
        x: e.clientX - node.x / scaleX,
        y: e.clientY - node.y / scaleY,
      });
      setDragging(nodeId);
      setHoveredNode(nodeId);
    },
    [layoutNodes]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging || !svgRef.current) return;
      const svgRect = svgRef.current.getBoundingClientRect();
      const scaleX = 500 / svgRect.width;
      const scaleY = 360 / svgRect.height;
      const nx = (e.clientX - svgRect.left) * scaleX - dragOffset.x * scaleX + dragOffset.x;
      const ny = (e.clientY - svgRect.top) * scaleY - dragOffset.y * scaleY + dragOffset.y;
      setLayoutNodes((prev) =>
        prev.map((n) =>
          n.id === dragging ? { ...n, x: Math.max(25, Math.min(475, (e.clientX - svgRect.left) * scaleX)), y: Math.max(25, Math.min(335, (e.clientY - svgRect.top) * scaleY)) } : n
        )
      );
    },
    [dragging, dragOffset]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  const connectedNodeIds = hoveredNode
    ? new Set([
        hoveredNode,
        ...graph?.edges
          .filter((e) => e.source === hoveredNode || e.target === hoveredNode)
          .flatMap((e) => [e.source, e.target]) ?? [],
      ])
    : null;

  const nodeMap = new Map(layoutNodes.map((n) => [n.id, n]));

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Network className="h-4 w-4 text-amber-600 dark:text-amber-400 animate-pulse" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Knowledge Graph</CardTitle>
              <CardDescription className="text-[11px]">Loading connections...</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[360px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Network className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Knowledge Graph</CardTitle>
              <CardDescription className="text-[11px]">No connections yet</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[360px] flex items-center justify-center">
            <div className="text-center">
              <Network className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground/50">No graph data available</p>
              <p className="text-[10px] text-muted-foreground/40 mt-1">Facts need associations to form a graph</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Network className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Knowledge Graph</CardTitle>
              <CardDescription className="text-[11px]">
                {graph.nodes.length} nodes · {graph.edges.length} connections
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-1 flex-wrap justify-end">
            {graph.clusters?.slice(0, 4).map((c) => (
              <Badge key={c.topic} variant="outline" className="text-[9px] px-1.5 py-0" style={{ borderColor: c.color + '40', color: c.color }}>
                {c.topic} ({c.count})
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Graph Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
          {[
            { label: 'supports', style: EDGE_STYLES.supports },
            { label: 'contradicts', style: EDGE_STYLES.contradicts },
            { label: 'extends', style: EDGE_STYLES.extends },
            { label: 'related', style: EDGE_STYLES.related },
            { label: 'causes', style: EDGE_STYLES.causes },
            { label: 'requires', style: EDGE_STYLES.requires },
          ].map(({ label, style }) => (
            <div key={label} className="flex items-center gap-1.5">
              <svg width="20" height="8" className="shrink-0">
                <line x1="0" y1="4" x2="16" y2="4" stroke={style.stroke} strokeWidth="2" strokeDasharray={style.dasharray === 'none' ? undefined : style.dasharray} />
                {(label === 'causes' || label === 'requires') && (
                  <polygon points="16,1 20,4 16,7" fill={style.stroke} />
                )}
              </svg>
              <span className="text-[9px] text-muted-foreground/70">{label}</span>
            </div>
          ))}
        </div>

        {/* SVG Graph */}
        <div ref={containerRef} className="w-full rounded-lg bg-muted/10 border border-border/30 overflow-hidden" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
          <svg
            ref={svgRef}
            viewBox="0 0 500 360"
            className="w-full h-auto"
            style={{ minHeight: 280 }}
            onMouseMove={handleMouseMove}
          >
            <defs>
              <marker id="arrowOrange" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#f97316" />
              </marker>
              <marker id="arrowTeal" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#14b8a6" />
              </marker>
              {/* SVG Glow Filter */}
              <filter id="neuralGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="synapseGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
              </filter>
            </defs>

            {/* Edges */}
            {graph.edges.map((edge, i) => {
              const src = nodeMap.get(edge.source);
              const tgt = nodeMap.get(edge.target);
              if (!src || !tgt) return null;
              const style = EDGE_STYLES[edge.label] || EDGE_STYLES.related;
              const isHighlighted = hoveredNode
                ? edge.source === hoveredNode || edge.target === hoveredNode
                : true;
              const opacity = hoveredNode ? (isHighlighted ? 0.9 : 0.08) : 0.5;
              // Neural: edge thickness based on dynamic activationWeight, not static strength
              const strokeWidth = Math.max(0.5, (edge.activationWeight ?? edge.strength) * 3);
              // Fired edges glow brighter
              const hasFired = (edge.fireCount ?? 0) > 0;

              return (
                <g key={`edge-${i}`}>
                  {isHighlighted && (edge.label === 'causes' || edge.label === 'requires') && (
                    <line
                      x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                      stroke={style.stroke} strokeWidth={0.5} opacity={0.3 * opacity}
                    />
                  )}
                  {/* Glow for fired synapses — uses SVG filter for real glow */}
                  {hasFired && isHighlighted && (
                    <line
                      x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                      stroke={style.stroke} strokeWidth={strokeWidth + 3} opacity={0.2}
                      filter="url(#synapseGlow)"
                    />
                  )}
                  <line
                    x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                    stroke={style.stroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={style.dasharray === 'none' ? undefined : style.dasharray}
                    strokeOpacity={opacity}
                    markerEnd={style.markerEnd}
                    className={isHighlighted && hoveredNode ? 'edge-flow' : ''}
                  />
                  {/* Fire count badge on hovered edges */}
                  {isHighlighted && hoveredNode && hasFired && (
                    <g>
                      <circle cx={(src.x + tgt.x) / 2} cy={(src.y + tgt.y) / 2} r={7} fill="white" opacity={0.9} />
                      <text x={(src.x + tgt.x) / 2} y={(src.y + tgt.y) / 2 + 3} textAnchor="middle" className="text-[7px] font-bold" fill={style.stroke}>
                        {edge.fireCount}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {layoutNodes.map((node) => {
              const color = getTopicColor(node.topic);
              const baseRadius = Math.max(6, Math.min(18, 6 + node.connections * 2.5));
              // Neural: size boosted by activationScore (active neurons appear bigger)
              const activationBonus = (node.activationScore ?? 0) * 8;
              const radius = Math.max(6, Math.min(22, baseRadius + activationBonus));
              const isHovered = hoveredNode === node.id;
              const isConnected = connectedNodeIds?.has(node.id);
              const dimmed = hoveredNode && !isConnected;
              const stale = node.stale;
              // Neural: activation glow intensity
              const activationGlow = node.activationScore ?? 0;
              const hasActivation = activationGlow > 0.01;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  opacity={dimmed ? 0.15 : 1}
                  onMouseDown={(e) => handleMouseDown(node.id, e)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => { if (!dragging) setHoveredNode(null); }}
                  className="cursor-grab active:cursor-grabbing"
                  style={{ transition: 'opacity 0.2s ease' }}
                >
                  {/* Neural activation glow — uses SVG filter for real glow */}
                  {hasActivation && (
                    <circle
                      r={radius + 4 + activationGlow * 8}
                      fill={color}
                      opacity={activationGlow * 0.35}
                      filter="url(#neuralGlow)"
                    >
                      <animate attributeName="r" values={`${radius + 3 + activationGlow * 6};${radius + 6 + activationGlow * 12};${radius + 3 + activationGlow * 6}`} dur="2.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values={`${activationGlow * 0.35};${activationGlow * 0.15};${activationGlow * 0.35}`} dur="2.5s" repeatCount="indefinite" />
                    </circle>
                  )}

                  {/* Glow effect on hover */}
                  {isHovered && (
                    <circle r={radius + 8} fill={color} opacity={0.12}>
                      <animate attributeName="r" values={`${radius + 6};${radius + 12};${radius + 6}`} dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.12;0.05;0.12" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}

                  {/* Pulse ring for stale nodes */}
                  {stale && (
                    <circle r={radius + 4} fill="none" stroke="#ef4444" strokeWidth="0.8" strokeOpacity="0.4" strokeDasharray="2 2">
                      <animate attributeName="r" values={`${radius + 2};${radius + 7};${radius + 2}`} dur="3s" repeatCount="indefinite" />
                      <animate attributeName="stroke-opacity" values="0.4;0.1;0.4" dur="3s" repeatCount="indefinite" />
                    </circle>
                  )}

                  {/* Node circle */}
                  <circle
                    r={radius}
                    fill={color}
                    opacity={isHovered ? 0.95 : 0.75}
                    stroke={isHovered ? '#fff' : color}
                    strokeWidth={isHovered ? 2 : 1}
                    style={{ transition: 'all 0.2s ease' }}
                  >
                    <animate
                      attributeName="r"
                      values={`${radius};${radius + 0.8};${radius}`}
                      dur={`${3 + (node.connections % 3)}s`}
                      repeatCount="indefinite"
                    />
                  </circle>

                  {/* Inner dot for confidence */}
                  <circle r={Math.max(2, radius * 0.35)} fill="white" opacity={node.confidence >= 0.7 ? 0.7 : 0.3} />

                  {/* Label — enhanced on hover with activation info */}
                  {isHovered && (
                    <g>
                      <rect
                        x={-55}
                        y={radius + 5}
                        width={110}
                        height={32}
                        rx={4}
                        fill={isDark ? 'oklch(0.15 0 0 / 95%)' : 'oklch(1 0 0 / 97%)'}
                        stroke={color}
                        strokeWidth={0.6}
                        strokeOpacity={0.5}
                      />
                      <text y={radius + 14} textAnchor="middle" className="pointer-events-none select-none" fill={isDark ? '#e5e7eb' : '#1f2937'} style={{ fontSize: '8px', fontWeight: 600 }}>
                        {node.label}
                      </text>
                      <text y={radius + 25} textAnchor="middle" className="pointer-events-none select-none font-mono" fill={isDark ? '#9ca3af' : '#6b7280'} style={{ fontSize: '7px' }}>
                        {node.confidence} · {node.connections}conn{node.activationScore > 0.01 ? ` · ${(node.activationScore * 100).toFixed(0)}%act` : ''}{node.stale ? ' · STALE' : ''}
                      </text>
                    </g>
                  )}
                  {/* Compact label for connected (not hovered) nodes */}
                  {!isHovered && isConnected && (
                    <g>
                      <rect
                        x={-node.label.length * 3.2 - 4}
                        y={radius + 4}
                        width={node.label.length * 6.4 + 8}
                        height={14}
                        rx={3}
                        fill={isDark ? 'oklch(0.2 0 0 / 90%)' : 'oklch(1 0 0 / 95%)'}
                        stroke={color}
                        strokeWidth={0.5}
                        strokeOpacity={0.4}
                      />
                      <text
                        y={radius + 13}
                        textAnchor="middle"
                        className="text-[8px] font-medium pointer-events-none select-none"
                        fill={isDark ? 'oklch(0.9 0 0)' : 'oklch(0.2 0 0)'}
                        style={{ fontSize: '8px' }}
                      >
                        {node.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}