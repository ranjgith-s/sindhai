import cytoscape, { Core, ElementDefinition } from "cytoscape";
import React, { useEffect, useRef } from "react";
import type { LocalGraph } from "../../../domain/models";

export function GraphPanel({
  graph,
  onOpenNote,
  className,
  heightClassName = "h-64",
}: {
  graph: LocalGraph | null;
  onOpenNote: (id: string) => void;
  className?: string;
  heightClassName?: string;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!elRef.current) return;
    cyRef.current = cytoscape({
      container: elRef.current,
      elements: [],
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "background-color": "#60a5fa",
            color: "#0b1020",
            "text-outline-color": "#0b1020",
            "text-outline-width": 2,
            "font-size": 10,
            "text-valign": "center",
            "text-halign": "center",
          },
        },
        {
          selector: "node.highlight",
          style: { "background-color": "#fbbf24" },
        },
        {
          selector: "edge.highlight",
          style: { "line-color": "#fbbf24", "target-arrow-color": "#fbbf24", width: 3 },
        },
        { selector: "edge", style: { width: 2, "line-color": "#94a3b8", "target-arrow-shape": "triangle" } },
      ],
      layout: { name: "cose", animate: false },
    });

    cyRef.current.on("tap", "node", (evt) => {
      const id = evt.target.id();
      if (id) onOpenNote(id);
    });

    cyRef.current.on("mouseover", "node", (evt) => {
      const node = evt.target;
      cyRef.current?.elements().removeClass("highlight");
      node.addClass("highlight");
      node.connectedEdges().addClass("highlight");
      node.connectedNodes().addClass("highlight");
    });
    cyRef.current.on("mouseout", "node", () => {
      cyRef.current?.elements().removeClass("highlight");
    });

    return () => {
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [onOpenNote]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const elements: ElementDefinition[] = [];
    for (const n of graph?.nodes ?? []) {
      elements.push({ data: { id: n.id, label: n.title ?? n.id } });
    }
    for (const e of graph?.edges ?? []) {
      elements.push({ data: { id: `${e.source}->${e.target}`, source: e.source, target: e.target } });
    }

    cy.elements().remove();
    cy.add(elements);
    cy.layout({ name: "cose", animate: false }).run();
  }, [graph]);

  return (
    <div
      className={[heightClassName, "w-full rounded-xl border border-white/10 bg-white/5", className ?? ""].join(" ")}
      ref={elRef}
    />
  );
}
