import { autocompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Transaction } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";

const documentTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      color: "#e5e7eb",
    },
    ".cm-scroller": {
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
      fontSize: "15px",
      lineHeight: "1.65",
    },
    ".cm-content": {
      padding: "18px 18px",
    },
    ".cm-gutters": {
      display: "none",
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

function MarkdownEditorInner({
  value,
  onChange,
  wikiLinkCandidates,
}: {
  value: string;
  onChange: (next: string) => void;
  wikiLinkCandidates: Array<{ label: string; target: string; detail?: string }>;
}, ref: React.Ref<MarkdownEditorHandle>) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastValueRef = useRef<string>(value);
  const candidatesRef = useRef(wikiLinkCandidates);

  useEffect(() => {
    candidatesRef.current = wikiLinkCandidates;
  }, [wikiLinkCandidates]);

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        viewRef.current?.focus();
      },
      insertText(text: string) {
        const view = viewRef.current;
        if (!view) return;
        const sel = view.state.selection.main;
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: text },
          selection: { anchor: sel.from + text.length },
          annotations: Transaction.userEvent.of("input"),
        });
        view.focus();
      },
      getSelection() {
        const view = viewRef.current;
        if (!view) return { from: 0, to: 0, text: "" };
        const sel = view.state.selection.main;
        const text = view.state.doc.sliceString(sel.from, sel.to);
        return { from: sel.from, to: sel.to, text };
      },
      replaceSelection(text: string) {
        const view = viewRef.current;
        if (!view) return;
        const sel = view.state.selection.main;
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: text },
          selection: { anchor: sel.from + text.length },
          annotations: Transaction.userEvent.of("input"),
        });
        view.focus();
      },
    }),
    [],
  );

  const completionSource = useMemo(() => {
    return (context: CompletionContext) => {
      const before = context.matchBefore(/\[\[[^\]\n]*$/);
      if (!before) return null;
      if (before.from === before.to && !context.explicit) return null;

      const typed = before.text.slice(2);
      const typedNorm = typed.trim().toLowerCase();
      const options: Completion[] = [];
      const seen = new Set<string>();

      for (const c of candidatesRef.current) {
        const key = c.target;
        if (seen.has(key)) continue;
        if (typedNorm) {
          const hay = `${c.label} ${c.target}`.toLowerCase();
          if (!hay.includes(typedNorm)) continue;
        }
        seen.add(key);
        options.push({
          label: c.label,
          detail: c.detail ?? (c.target === c.label ? undefined : c.target),
          apply: (view, _completion, from, to) => {
            const insert = `${c.target}]]`;
            view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } });
          },
        });
        if (options.length >= 50) break;
      }

      return {
        from: before.from + 2,
        to: context.pos,
        options,
        validFor: /[^\]\n]*/,
      };
    };
  }, []);

  useEffect(() => {
    if (!hostRef.current) return;
    if (viewRef.current) return;

    const startState = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        markdown(),
        autocompletion({ override: [completionSource] }),
        oneDark,
        documentTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((v) => {
          if (!v.docChanged) return;
          const isUserEdit = v.transactions.some(
            (t) => t.isUserEvent("input") || t.isUserEvent("delete") || t.isUserEvent("paste"),
          );
          if (!isUserEdit) return;
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

export type MarkdownEditorHandle = {
  focus: () => void;
  insertText: (text: string) => void;
  getSelection: () => { from: number; to: number; text: string };
  replaceSelection: (text: string) => void;
};

export const MarkdownEditor = forwardRef(MarkdownEditorInner);
