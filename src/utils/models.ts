/**
 * Normalize model names for consistent identification.
 *
 * Transformations applied:
 * 1. Strip "openrouter/" prefix (e.g., "openrouter/anthropic/claude-sonnet-4"
 *    becomes "anthropic/claude-sonnet-4")
 * 2. Strip ":free" suffix (e.g., "nvidia/nemotron-3-super-120b-a12b:free"
 *    becomes "nvidia/nemotron-3-super-120b-a12b")
 *
 * This ensures models are treated as the same regardless of routing prefix
 * or free-tier suffix.
 */
export function normalizeModelName(model: string): string {
  if (!model) return model;

  let normalized = model;

  // Strip "openrouter/" prefix if present
  if (normalized.startsWith("openrouter/")) {
    normalized = normalized.slice("openrouter/".length);
  }

  // Strip ":free" suffix if present
  if (normalized.endsWith(":free")) {
    normalized = normalized.slice(0, -":free".length);
  }

  return normalized;
}
