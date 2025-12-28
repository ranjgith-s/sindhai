import cytoscape, { Core, ElementDefinition } from "cytoscape";
import React, { useEffect, useRef } from "react";
import type { LocalGraph } from "./api";

export function GraphPanel({
  graph,
  onOpenNote,
}: {
  graph: LocalGraph | null;
  onOpenNote: (id: string) => void;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!elRef.current) return;
    cyRef.current = cytoscape({
      container: elRef.current,
      elements: [],
      style: [
        { selector: "node", style: { label: "data(label)", "background-color": "#2563eb", color: "#111827" } },
        { selector: "edge", style: { width: 2, "line-color": "#9ca3af", "target-arrow-shape": "triangle" } },
      ],
      layout: { name: "cose", animate: false },
    });

    cyRef.current.on("tap", "node", (evt) => {
      const id = evt.target.id();
      if (id) onOpenNote(id);
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

  return <div className="graph" ref={elRef} />;
}

