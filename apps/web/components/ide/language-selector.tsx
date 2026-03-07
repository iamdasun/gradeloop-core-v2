"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Code2, Loader2 } from "lucide-react";
import type { LanguageOption } from "./types";
import { DEFAULT_LANGUAGE_ID } from "./constants";
import { cn } from "@/lib/utils";

interface LanguageSelectorProps {
  value: number;
  onChange: (languageId: number) => void;
  disabled?: boolean;
  /** Renders a compact version for use in the status bar */
  compact?: boolean;
  /** When provided, only these Judge0 language IDs are shown in the list */
  allowedIds?: number[];
}

export function LanguageSelector({
  value,
  onChange,
  disabled = false,
  compact = false,
  allowedIds,
}: LanguageSelectorProps) {
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // TODO: Replace with actual API call when backend endpoint is ready
        // For now, use a hardcoded list of common languages
        // Verified against Judge0 instance at /languages — IDs 91/92/93/94/95/105 do NOT exist.
        // Only languages with AST support in ACAFS (C, C++, C#, Java, Python, JS, TS, Go)
        // plus common languages available on this instance are listed.
        const commonLanguages: LanguageOption[] = [
          // Python
          { id: 71, name: "Python (3.8.1)", is_archived: false },
          // Java
          { id: 62, name: "Java (OpenJDK 13.0.1)", is_archived: false },
          // C++
          { id: 54, name: "C++ (GCC 9.2.0)", is_archived: false },
          { id: 76, name: "C++ (Clang 7.0.1)", is_archived: false },
          // C
          { id: 50, name: "C (GCC 9.2.0)", is_archived: false },
          { id: 75, name: "C (Clang 7.0.1)", is_archived: false },
          // C#
          { id: 51, name: "C# (Mono 6.6.0.161)", is_archived: false },
          // JavaScript / TypeScript
          { id: 63, name: "JavaScript (Node.js 12.14.0)", is_archived: false },
          { id: 74, name: "TypeScript (3.7.4)", is_archived: false },
          // Go
          { id: 60, name: "Go (1.13.5)", is_archived: false },
          // Other supported
          { id: 73, name: "Rust (1.40.0)", is_archived: false },
          { id: 72, name: "Ruby (2.7.0)", is_archived: false },
          { id: 68, name: "PHP (7.4.1)", is_archived: false },
          { id: 83, name: "Swift (5.2.3)", is_archived: false },
          { id: 78, name: "Kotlin (1.3.70)", is_archived: false },
          { id: 81, name: "Scala (2.13.2)", is_archived: false },
          { id: 80, name: "R (4.0.0)", is_archived: false },
          { id: 61, name: "Haskell (GHC 8.8.1)", is_archived: false },
          { id: 82, name: "SQL (SQLite 3.27.2)", is_archived: false },
        ];

        setLanguages(commonLanguages);
      } catch (err) {
        console.error("Failed to fetch languages:", err);
        setError("Failed to load languages");
        
        // Fallback to default language
        setLanguages([
          { id: DEFAULT_LANGUAGE_ID, name: "Python (3.8.1)", is_archived: false },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLanguages();
  }, []);

  const handleValueChange = (valueStr: string) => {
    const languageId = parseInt(valueStr, 10);
    onChange(languageId);
  };

  const selectedLanguage = languages.find((lang) => lang.id === value);

  if (isLoading) {
    return (
      <div className={cn(
        "flex items-center justify-center rounded-md border border-input bg-background px-3",
        compact ? "h-7 w-48" : "h-10 w-64"
      )}>
        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
        <span className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-10 w-64 items-center rounded-md border border-destructive bg-destructive/10 px-3">
        <span className="text-sm text-destructive">{error}</span>
      </div>
    );
  }

  return (
    <Select
      value={value.toString()}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger className={cn(compact ? "h-7 w-48 text-xs" : "w-64")}>
        <Code2 className={cn("mr-2 shrink-0", compact ? "h-3 w-3" : "h-4 w-4")} />
        <SelectValue>
          {selectedLanguage?.name || "Select Language"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-96">
        <SelectGroup>
          <SelectLabel>Programming Languages</SelectLabel>
          {languages
            .filter((lang) => !lang.is_archived)
            .filter((lang) => !allowedIds || allowedIds.includes(lang.id))
            .map((lang) => (
              <SelectItem key={lang.id} value={lang.id.toString()}>
                <div className="flex items-center gap-2">
                  <span>{lang.name}</span>
                  <span className="text-xs text-muted-foreground">
                    (ID: {lang.id})
                  </span>
                </div>
              </SelectItem>
            ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
