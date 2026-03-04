"use client";

import { useEffect, useRef, useState } from "react";
import Editor, { Monaco, OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { LANGUAGE_MODE_MAP, MONACO_DEFAULT_OPTIONS } from "./constants";
import { Loader2 } from "lucide-react";

interface EditorPanelProps {
  value: string;
  onChange: (value: string) => void;
  language: number;
  fontSize?: number;
  readOnly?: boolean;
  theme?: "light" | "dark";
  onRun?: () => void;
  onSave?: () => void;
}

export function EditorPanel({
  value,
  onChange,
  language,
  fontSize = MONACO_DEFAULT_OPTIONS.fontSize,
  readOnly = false,
  theme = "dark",
  onRun,
  onSave,
}: EditorPanelProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Get Monaco language mode from Judge0 language ID
  const monacoLanguage = LANGUAGE_MODE_MAP[language] || "plaintext";

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setIsLoading(false);

    // Register keyboard shortcuts
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => {
        onRun?.();
      }
    );

    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => {
        onSave?.();
      }
    );

    // Focus the editor
    editor.focus();
  };

  const handleEditorChange = (value: string | undefined) => {
    onChange(value || "");
  };

  // Update editor model language when language changes
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        monacoRef.current.editor.setModelLanguage(model, monacoLanguage);
      }
    }
  }, [monacoLanguage]);

  // Update font size when it changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({ fontSize });
    }
  }, [fontSize]);

  return (
    <div className="relative h-full w-full">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading editor...</p>
          </div>
        </div>
      )}
      <Editor
        height="100%"
        language={monacoLanguage}
        value={value}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        theme={theme === "dark" ? "vs-dark" : "vs-light"}
        options={{
          ...MONACO_DEFAULT_OPTIONS,
          fontSize,
          readOnly,
        }}
        loading={
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      />
    </div>
  );
}
