import React, { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";

const theme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      color: "#e5e7eb",
    },
    ".cm-scroller": {
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: "13px",
      lineHeight: "1.6",
    },
    ".cm-content": {
      padding: "14px 16px",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      borderRight: "1px solid rgba(255, 255, 255, 0.1)",
      color: "#94a3b8",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(255,255,255,0.04)",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(255,255,255,0.04)",
    },
    ".cm-cursor": {
      borderLeftColor: "#e5e7eb",
    },
    ".cm-selectionBackground": {
      backgroundColor: "rgba(96, 165, 250, 0.25) !important",
    },
    ".cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(96, 165, 250, 0.35) !important",
    },
  },
  { dark: true },
);

export function MarkdownEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastValueRef = useRef<string>(value);

  useEffect(() => {
    if (!hostRef.current) return;
    if (viewRef.current) return;

    const startState = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        markdown(),
        oneDark,
        theme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((v) => {
          if (!v.docChanged) return;
          const next = v.state.doc.toString();
          lastValueRef.current = next;
          onChange(next);
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: hostRef.current,
    });

    viewRef.current = view;
    lastValueRef.current = value;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (value === lastValueRef.current) return;

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
    lastValueRef.current = value;
  }, [value]);

  return <div className="h-full" ref={hostRef} />;
}
