const HEX_CHARS = "0123456789abcdef";

const bytesToHex = (bytes: Uint8Array): string => {
  let output = "";
  for (const byte of bytes) {
    output += HEX_CHARS[(byte >> 4) & 0x0f] + HEX_CHARS[byte & 0x0f];
  }
  return output;
};

export const randomHex = (length: number): string => {
  const bytesNeeded = Math.ceil(length / 2);
  const bytes = new Uint8Array(bytesNeeded);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes).slice(0, length);
};

export const hashToken = async (token: string): Promise<string> => {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
};

export const ensureHttps = (url: string): boolean => {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
};

export const getAuthToken = (c: {
  req: { header: (name: string) => string | undefined };
}) => c.req.header("X-PinchBench-Token")?.trim();
