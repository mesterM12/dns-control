const helperDestination = "/usr/local/libexec/dns-control-helper";
const sudoersDestination = "/etc/sudoers.d/dns-control";

export function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

export function sudoersRule(user: string) {
  if (!/^[a-z_][a-z0-9_-]*$/i.test(user)) {
    throw new Error("Unable to determine a safe macOS username.");
  }
  return `${user} ALL=(root) NOPASSWD: ${helperDestination} enable, ${helperDestination} disable, ${helperDestination} stop`;
}

export function printLine(value: string) {
  // The shell receives one backslash here, so printf emits a real newline.
  return `/usr/bin/printf '%s\\n' ${shellQuote(value)}`;
}

export function helperInstallCommands(helperSource: string, user: string) {
  return [
    `/bin/test ! -L ${helperDestination} && /bin/test ! -L ${sudoersDestination}`,
    "/usr/bin/install -d -o root -g wheel -m 0755 /usr/local/libexec /etc/sudoers.d",
    `/usr/bin/install -o root -g wheel -m 0755 ${shellQuote(helperSource)} ${helperDestination}`,
    // A unique root-owned temporary rule avoids following a predictable .tmp path.
    `rule_tmp=$(/usr/bin/mktemp ${sudoersDestination}.XXXXXX)`,
    `trap '/bin/rm -f "$rule_tmp"' EXIT`,
    `${printLine(sudoersRule(user))} > "$rule_tmp"`,
    `/usr/sbin/visudo -cf "$rule_tmp"`,
    `/usr/bin/install -o root -g wheel -m 0440 "$rule_tmp" ${sudoersDestination}`,
  ];
}
