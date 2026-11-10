import { isAbsolute } from "node:path/posix";

// File references are evaluated relative to the TOML location by dnscrypt-proxy.
// The installer moves only the TOML, so require explicit absolute paths for both
// inputs and outputs rather than silently changing what those references mean.
const fileFields = new Set([
  "file",
  "log_file",
  "tls_key_log_file",
  "cache_file",
  "forwarding_rules",
  "cloaking_rules",
  "map_file",
  "blocked_names_file",
  "blocked_ips_file",
  "allowed_names_file",
  "allowed_ips_file",
  "cert_file",
  "cert_key_file",
  "client_cert",
  "client_key",
  "root_ca",
  "tls_certificate",
  "tls_key",
]);

export function validateResolverConfigPaths(contents: string): void {
  let config: unknown;
  try {
    config = Bun.TOML.parse(contents);
  } catch {
    // Parser diagnostics can contain configuration lines, including credentials.
    throw new Error("Resolver configuration is not valid TOML. No privileged files were changed.");
  }

  const inspect = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) inspect(entry);
    } else if (value !== null && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) {
        if (fileFields.has(key) && typeof entry === "string" && entry !== "" && !isAbsolute(entry)) {
          // Only fixed schema field names are safe to include in diagnostics;
          // source names and path values can contain private provider details.
          throw new Error(`Resolver field ${key} must use an absolute file path before installation. Supporting files are not copied. No privileged files were changed.`);
        }
        inspect(entry);
      }
    }
  };
  inspect(config);
}
