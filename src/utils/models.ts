/**
 * Normalize model names by stripping the "openrouter/" prefix.
 * This ensures consistent model identification regardless of how
 * the model was specified (e.g., "openrouter/anthropic/claude-sonnet-4"
 * becomes "anthropic/claude-sonnet-4").
 */
export function normalizeModelName(model: string): string {
  if (!model) return model;
  // Strip "openrouter/" prefix if present
  if (model.startsWith("openrouter/")) {
    return model.slice("openrouter/".length);
  }
  return model;
}
