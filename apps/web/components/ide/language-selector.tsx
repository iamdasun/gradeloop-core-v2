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

interface LanguageSelectorProps {
  value: number;
  onChange: (languageId: number) => void;
  disabled?: boolean;
}

export function LanguageSelector({
  value,
  onChange,
  disabled = false,
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
        const commonLanguages: LanguageOption[] = [
          { id: 71, name: "Python (3.8.1)", is_archived: false },
          { id: 92, name: "Python (3.11.2)", is_archived: false },
          { id: 62, name: "Java (OpenJDK 13.0.1)", is_archived: false },
          { id: 91, name: "Java (JDK 17.0.6)", is_archived: false },
          { id: 54, name: "C++ (GCC 9.2.0)", is_archived: false },
          { id: 105, name: "C++ (GCC 14.1.0)", is_archived: false },
          { id: 50, name: "C (GCC 9.2.0)", is_archived: false },
          { id: 75, name: "C (Clang 7.0.1)", is_archived: false },
          { id: 63, name: "JavaScript (Node.js 12.14.0)", is_archived: false },
          { id: 93, name: "JavaScript (Node.js 18.15.0)", is_archived: false },
          { id: 74, name: "TypeScript (3.7.4)", is_archived: false },
          { id: 94, name: "TypeScript (5.0.3)", is_archived: false },
          { id: 60, name: "Go (1.13.5)", is_archived: false },
          { id: 95, name: "Go (1.18.5)", is_archived: false },
          { id: 73, name: "Rust (1.40.0)", is_archived: false },
          { id: 51, name: "C# (Mono 6.6.0.161)", is_archived: false },
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
      <div className="flex h-10 w-64 items-center justify-center rounded-md border border-input bg-background px-3">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading languages...</span>
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
      <SelectTrigger className="w-64">
        <Code2 className="mr-2 h-4 w-4" />
        <SelectValue>
          {selectedLanguage?.name || "Select Language"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-96">
        <SelectGroup>
          <SelectLabel>Programming Languages</SelectLabel>
          {languages
            .filter((lang) => !lang.is_archived)
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
