import type { ExecutionStatus } from "./types";

// Judge0 Language ID to Monaco Editor language mode mapping
export const LANGUAGE_MODE_MAP: Record<number, string> = {
  // Assembly
  45: "asm", // Assembly (NASM 2.14.02)
  46: "shell", // Bash (5.0.0)
  
  // C/C++
  50: "c", // C (GCC 9.2.0)
  75: "c", // C (Clang 7.0.1)
  76: "cpp", // C++ (Clang 7.0.1)
  48: "c", // C (GCC 7.4.0)
  49: "c", // C (GCC 8.3.0)
  52: "cpp", // C++ (GCC 7.4.0)
  53: "cpp", // C++ (GCC 8.3.0)
  54: "cpp", // C++ (GCC 9.2.0)
  
  // C#
  51: "csharp", // C# (Mono 6.6.0.161)
  
  // Clojure
  86: "clojure", // Clojure (1.10.1)
  
  // COBOL
  77: "cobol", // COBOL (GnuCOBOL 2.2)
  
  // Common Lisp
  55: "commonlisp", // Common Lisp (SBCL 2.0.0)
  
  // D
  56: "d", // D (DMD 2.089.1)
  
  // Elixir
  57: "elixir", // Elixir (1.9.4)
  
  // Erlang
  58: "erlang", // Erlang (OTP 22.2)
  
  // F#
  87: "fsharp", // F# (.NET Core SDK 3.1.202)
  
  // Fortran
  59: "fortran", // Fortran (GFortran 9.2.0)
  
  // Go
  60: "go", // Go (1.13.5)
  95: "go", // Go (1.18.5)
  
  // Groovy
  88: "groovy", // Groovy (3.0.3)
  
  // Haskell
  61: "haskell", // Haskell (GHC 8.8.1)
  
  // Java
  62: "java", // Java (OpenJDK 13.0.1)

  // JavaScript
  63: "javascript", // JavaScript (Node.js 12.14.0)
  
  // Kotlin
  78: "kotlin", // Kotlin (1.3.70)
  
  // Lua
  64: "lua", // Lua (5.3.5)
  
  // Objective-C
  79: "objective-c", // Objective-C (Clang 7.0.1)
  
  // OCaml
  65: "ocaml", // OCaml (4.09.0)
  
  // Octave
  66: "octave", // Octave (5.1.0)
  
  // Pascal
  67: "pascal", // Pascal (FPC 3.0.4)
  
  // Perl
  85: "perl", // Perl (5.28.1)
  
  // PHP
  68: "php", // PHP (7.4.1)
  
  // Plain Text
  43: "plaintext", // Plain Text
  44: "plaintext", // Executable
  
  // Prolog
  69: "prolog", // Prolog (GNU Prolog 1.4.5)
  
  // Python
  70: "python", // Python (2.7.17)
  71: "python", // Python (3.8.1)
  
  // R
  80: "r", // R (4.0.0)
  
  // Ruby
  72: "ruby", // Ruby (2.7.0)
  
  // Rust
  73: "rust", // Rust (1.40.0)
  
  // Scala
  81: "scala", // Scala (2.13.2)
  
  // SQL
  82: "sql", // SQL (SQLite 3.27.2)
  
  // Swift
  83: "swift", // Swift (5.2.3)
  
  // TypeScript
  74: "typescript", // TypeScript (3.7.4)
  
  // Visual Basic
  84: "vb", // Visual Basic.Net (vbnc 0.0.0.5943)
};

// Default language constants
export const DEFAULT_LANGUAGE_ID = 71; // Python 3.8.1
export const DEFAULT_FONT_SIZE = 14;
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 24;

// Panel size defaults (percentage)
export const DEFAULT_EDITOR_WIDTH = 60;
export const DEFAULT_EXECUTION_WIDTH = 40;

// Local storage keys
export const STORAGE_KEYS = {
  PANEL_SIZES: "gradeloop-ide-panel-sizes",
  FONT_SIZE: "gradeloop-ide-font-size",
  THEME: "gradeloop-ide-theme",
  LAST_LANGUAGE: "gradeloop-ide-last-language",
} as const;

// Judge0 status code to execution status mapping
export const STATUS_MAP: Record<number, ExecutionStatus> = {
  1: "running", // In Queue
  2: "running", // Processing
  3: "accepted", // Accepted
  4: "wrong_answer", // Wrong Answer
  5: "time_limit_exceeded", // Time Limit Exceeded
  6: "compilation_error", // Compilation Error
  7: "runtime_error", // Runtime Error (SIGSEGV)
  8: "runtime_error", // Runtime Error (SIGXFSZ)
  9: "runtime_error", // Runtime Error (SIGFPE)
  10: "runtime_error", // Runtime Error (SIGABRT)
  11: "runtime_error", // Runtime Error (NZEC)
  12: "runtime_error", // Runtime Error (Other)
  13: "internal_error", // Internal Error
  14: "internal_error", // Exec Format Error
};

// Status display configurations
export const STATUS_CONFIG = {
  idle: {
    label: "Ready",
    color: "text-gray-500",
    bgColor: "bg-gray-100 dark:bg-gray-800",
  },
  running: {
    label: "Running",
    color: "text-yellow-600",
    bgColor: "bg-yellow-100 dark:bg-yellow-900",
  },
  accepted: {
    label: "Accepted",
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900",
  },
  wrong_answer: {
    label: "Wrong Answer",
    color: "text-red-600",
    bgColor: "bg-red-100 dark:bg-red-900",
  },
  time_limit_exceeded: {
    label: "Time Limit",
    color: "text-orange-600",
    bgColor: "bg-orange-100 dark:bg-orange-900",
  },
  compilation_error: {
    label: "Compile Error",
    color: "text-red-600",
    bgColor: "bg-red-100 dark:bg-red-900",
  },
  runtime_error: {
    label: "Runtime Error",
    color: "text-red-600",
    bgColor: "bg-red-100 dark:bg-red-900",
  },
  internal_error: {
    label: "Internal Error",
    color: "text-red-600",
    bgColor: "bg-red-100 dark:bg-red-900",
  },
} as const;

// Monaco editor default options
export const MONACO_DEFAULT_OPTIONS = {
  minimap: { enabled: true },
  fontSize: DEFAULT_FONT_SIZE,
  lineNumbers: "on" as const,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  wordWrap: "on" as const,
  tabSize: 4,
  insertSpaces: true,
  formatOnPaste: true,
  formatOnType: true,
  quickSuggestions: true,
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnCommitCharacter: true,
  acceptSuggestionOnEnter: "on" as const,
  snippetSuggestions: "inline" as const,
  padding: { top: 16, bottom: 16 },
};

// Sample starter code for different languages
export const STARTER_CODE: Record<number, string> = {
  71: `# Python 3
def main():
    # Your code here
    print("Hello, World!")

if __name__ == "__main__":
    main()
`,
  62: `// Java
public class Main {
    public static void main(String[] args) {
        // Your code here
        System.out.println("Hello, World!");
    }
}
`,
  54: `// C++
#include <iostream>
using namespace std;

int main() {
    // Your code here
    cout << "Hello, World!" << endl;
    return 0;
}
`,
  50: `// C
#include <stdio.h>

int main() {
    // Your code here
    printf("Hello, World!\\n");
    return 0;
}
`,
  63: `// JavaScript (Node.js)
function main() {
    // Your code here
    console.log("Hello, World!");
}

main();
`,
  60: `// Go
package main

import "fmt"

func main() {
    // Your code here
    fmt.Println("Hello, World!")
}
`,
  73: `// Rust
fn main() {
    // Your code here
    println!("Hello, World!");
}
`,
};
