package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
)

// Config func to get env value
// Optimized behaviour:
//  1. Check the OS environment first and return immediately if present.
//  2. Otherwise, attempt to locate a `.env` file starting from the current working
//     directory and walking up parent directories. Load the first `.env` found.
//  3. As a last resort, attempt to load `.env` from the current directory only if it exists.
//
// This avoids noisy repeated prints when no .env is present and avoids unnecessary loads.
func Config(key string) string {
	// Prefer values already present in the environment.
	if v := os.Getenv(key); v != "" {
		return v
	}

	// Look for a .env file in the current directory or any parent directory.
	cwd, err := os.Getwd()
	if err == nil {
		dir := cwd
		for {
			envPath := filepath.Join(dir, ".env")
			if fi, statErr := os.Stat(envPath); statErr == nil && !fi.IsDir() {
				// Found a .env in this parent directory — attempt to load it.
				if loadErr := godotenv.Load(envPath); loadErr != nil {
					fmt.Printf("Error loading .env file at %s: %v\n", envPath, loadErr)
				}
				// Return the environment value after loading .env
				return os.Getenv(key)
			}

			parent := filepath.Dir(dir)
			// Reached filesystem root (parent == dir) — stop searching.
			if parent == dir {
				break
			}
			dir = parent
		}
	}

	// If no .env found in parents, try to load .env from current directory only if it exists.
	if fi, err := os.Stat(".env"); err == nil && !fi.IsDir() {
		if loadErr := godotenv.Load(); loadErr != nil {
			fmt.Printf("Error loading .env from current dir: %v\n", loadErr)
		}
		return os.Getenv(key)
	}

	// Nothing found — return the OS env value (may be empty).
	return os.Getenv(key)
}
