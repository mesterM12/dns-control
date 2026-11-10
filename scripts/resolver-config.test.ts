import { describe, expect, test } from "bun:test";
import { validateResolverConfigPaths } from "./resolver-config";

describe("resolver configuration relocation preflight", () => {
  test.each([
    ["forwarding_rules = 'rules.txt'", "forwarding_rules"],
    ["cloaking_rules = 'rules.txt'", "cloaking_rules"],
    ["[blocked_names]\nblocked_names_file = 'rules.txt'", "blocked_names_file"],
    ["[blocked_ips]\nblocked_ips_file = 'rules.txt'", "blocked_ips_file"],
    ["[allowed_names]\nallowed_names_file = 'rules.txt'", "allowed_names_file"],
    ["[allowed_ips]\nallowed_ips_file = 'rules.txt'", "allowed_ips_file"],
    ["[captive_portals]\nmap_file = 'rules.txt'", "map_file"],
    ["[local_doh]\ncert_file = 'server.pem'", "cert_file"],
    ["[local_doh]\ncert_key_file = 'server.key'", "cert_key_file"],
    ["[sources.fixture]\ncache_file = 'resolvers.md'", "cache_file"],
    ["[doh_client_x509_auth]\ncreds = [{client_cert = 'client.crt'}]", "client_cert"],
    ["[doh_client_x509_auth]\ncreds = [{client_key = 'client.key'}]", "client_key"],
    ["[doh_client_x509_auth]\ncreds = [{root_ca = 'root.crt'}]", "root_ca"],
    ["[monitoring_ui]\ntls_certificate = 'server.crt'", "tls_certificate"],
    ["[monitoring_ui]\ntls_key = 'server.key'", "tls_key"],
    ["log_file = 'resolver.log'", "log_file"],
    ["tls_key_log_file = 'keylog.txt'", "tls_key_log_file"],
    ["[query_log]\nfile = 'query.log'", "file"],
    ["[nx_log]\nfile = '../nx.log'", "file"],
  ])("rejects relocated relative reference %s", (contents, field) => {
    expect(() => validateResolverConfigPaths(contents)).toThrow(`Resolver field ${field} must use an absolute file path`);
  });

  test("accepts absolute file references, including credentials in arrays", () => {
    expect(() => validateResolverConfigPaths(`
forwarding_rules = '/var/lib/dns-control/forwarding.txt'
[blocked_names]
blocked_names_file = '/var/lib/dns-control/blocked.txt'
[sources.fixture]
cache_file = '/var/cache/dns-control/resolvers.md'
[local_doh]
cert_file = '/Library/Application Support/DNS Control/server.pem'
cert_key_file = '/Library/Application Support/DNS Control/server.key'
[doh_client_x509_auth]
creds = [{client_cert = '/var/lib/dns-control/client.crt', client_key = '/var/lib/dns-control/client.key', root_ca = '/var/lib/dns-control/root.crt'}]
[monitoring_ui]
tls_certificate = '/var/lib/dns-control/ui.crt'
tls_key = '/var/lib/dns-control/ui.key'
`)).not.toThrow();
  });

  test("allows disabled empty references and non-file settings", () => {
    expect(() => validateResolverConfigPaths(`
listen_addresses = ['127.0.0.1:53', '[::1]:53']
log_file = ''
server_names = ['fixture']
[sources.fixture]
urls = ['https://resolver.invalid/list']
[monitoring_ui]
tls_certificate = ''
tls_key = ''
`)).not.toThrow();
  });

  test("never includes provider names or file values in diagnostics", () => {
    const contents = `[sources.PRIVATE_FIXTURE]\ncache_file = 'PRIVATE_FIXTURE.txt'`;
    try {
      validateResolverConfigPaths(contents);
      throw new Error("Expected invalid reference to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("cache_file");
      expect((error as Error).message).not.toContain("PRIVATE_FIXTURE");
    }
  });

  test("redacts malformed TOML parser diagnostics", () => {
    try {
      validateResolverConfigPaths(`password = 'PRIVATE_FIXTURE`);
      throw new Error("Expected malformed TOML to be rejected");
    } catch (error) {
      expect((error as Error).message).toBe("Resolver configuration is not valid TOML. No privileged files were changed.");
    }
  });
});
