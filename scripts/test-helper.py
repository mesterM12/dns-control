#!/usr/bin/env python3
"""Exercise helper actions with mocked system tools; never touches live DNS."""
from pathlib import Path
import json
import os
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
MOCK = r'''#!/usr/bin/env python3
from pathlib import Path
import os, sys, json

root = Path(os.environ['DNS_TEST_ROOT'])
name = Path(sys.argv[0]).name
args = sys.argv[1:]
scenario = os.environ.get('DNS_TEST_SCENARIO', '')
with (root / 'calls.jsonl').open('a') as stream:
    stream.write(json.dumps([name, *args]) + '\n')

if name == 'route':
    print('   interface: en0')
elif name == 'networksetup' and args == ['-listnetworkserviceorder']:
    print('(1) Wi-Fi\n(Hardware Port: Wi-Fi, Device: en0)')
elif name == 'launchctl':
    state = root / 'loaded'
    if args[0] == 'print':
        if not state.exists():
            sys.exit(1)
        probes = root / 'probes'
        after_probes = probes.exists() and int(probes.read_text()) >= 2
        running = scenario not in {'unrelated_resolver', 'failed_kickstart', 'stopped_job'}
        if scenario == 'waiting_then_started':
            running = (root / 'started').exists()
        if scenario == 'crash_after_probe' and after_probes:
            running = False
        print('system/com.local.dnscrypt-proxy = {')
        print('  state = ' + ('running' if running else 'waiting'))
        if (running or scenario == 'stopped_job') and scenario != 'missing_pid':
            pid = 4343 if scenario == 'pid_changes_after_probe' and after_probes else 4242
            if scenario == 'invalid_pid':
                pid = 'not-a-pid'
            print('  pid = ' + str(pid))
        print('}')
    elif args[0] == 'bootstrap':
        if scenario == 'bootstrap_fail':
            sys.exit(1)
        state.touch()
    elif args[0] == 'kickstart' and scenario == 'failed_kickstart':
        sys.exit(1)
    elif args[0] == 'kickstart' and scenario == 'waiting_then_started':
        (root / 'started').touch()
    elif args[0] == 'bootout':
        state.unlink(missing_ok=True)
elif name == 'lsof':
    assert '-nP' in args and '-a' in args and '-Fpn' in args
    assert args[args.index('-p') + 1] == '4242'
    tcp = '-iTCP:53' in args
    assert ('-sTCP:LISTEN' in args) == tcp
    if scenario in {'occupied_ports', 'lsof_failure'}:
        sys.exit(1)
    if (scenario == 'tcp_missing' and tcp) or (scenario == 'udp_missing' and not tcp):
        sys.exit(1)
    print('p' + ('9000' if scenario == 'wrong_owner' else '4242'))
    print('f4')
    print('n' + ('127.0.0.1:5353' if scenario == 'wrong_port' else '127.0.0.1:53'))
    if scenario != 'missing_ipv6':
        print('f5')
        print('n' + ('[::2]:53' if scenario == 'wrong_address' else '[::1]:53'))
    if scenario == 'wildcard':
        print('f6\nn*:53')
elif name == 'dig':
    probes = root / 'probes'
    probes.write_text(str(int(probes.read_text()) + 1 if probes.exists() else 1))
    if scenario != 'both_probes_fail' and not (scenario == 'ipv6_probe_fail' and '@::1' in args):
        print('192.0.2.1')
'''


with tempfile.TemporaryDirectory(prefix="dns-control-helper-test-") as directory:
    root = Path(directory)
    source = (ROOT / "privileged/dns-control-helper").read_text()
    for constant, command in [
        ("NETWORKSETUP", "networksetup"),
        ("ROUTE", "route"),
        ("LAUNCHCTL", "launchctl"),
        ("LSOF", "lsof"),
        ("DIG", "dig"),
        ("SLEEP", "sleep"),
    ]:
        target = root / command
        target.write_text(MOCK)
        target.chmod(0o700)
        source = re.sub(r"^" + constant + r"=.*$", constant + "=" + str(target), source, flags=re.M)
    plist = root / "resolver.plist"
    plist.touch()
    source = re.sub(r"^PLIST=.*$", "PLIST=" + str(plist), source, flags=re.M)
    helper = root / "helper"
    helper.write_text(source)
    helper.chmod(0o700)
    env = {**os.environ, "DNS_TEST_ROOT": str(root)}
    scenarios = 0

    def run(action, loaded=False, scenario=""):
        global scenarios
        scenarios += 1
        for name in ["calls.jsonl", "loaded", "probes", "started"]:
            (root / name).unlink(missing_ok=True)
        if loaded:
            (root / "loaded").touch()
        result = subprocess.run(
            ["/bin/sh", str(helper), action],
            env={**env, "DNS_TEST_SCENARIO": scenario},
            capture_output=True,
            text=True,
            timeout=10,
        )
        calls_path = root / "calls.jsonl"
        calls = [json.loads(line) for line in calls_path.read_text().splitlines()] if calls_path.exists() else []
        return result, calls

    result, calls = run("invalid")
    assert result.returncode == 64 and calls == [], (result, calls)

    for scenario in [
        "ipv6_probe_fail",
        "both_probes_fail",
        "unrelated_resolver",
        "failed_kickstart",
        "stopped_job",
        "missing_pid",
        "invalid_pid",
        "occupied_ports",
        "wrong_owner",
        "wrong_port",
        "missing_ipv6",
        "wrong_address",
        "wildcard",
        "tcp_missing",
        "udp_missing",
        "lsof_failure",
        "bootstrap_fail",
        "crash_after_probe",
        "pid_changes_after_probe",
    ]:
        result, calls = run("enable", scenario=scenario)
        assert result.returncode != 0, (scenario, result, calls)
        assert not any(c[:2] == ["networksetup", "-setdnsservers"] for c in calls), (scenario, calls)
        if scenario in {"unrelated_resolver", "failed_kickstart", "missing_pid", "invalid_pid", "occupied_ports"}:
            assert not any(c[0] == "dig" for c in calls), (scenario, calls)

    for loaded in [False, True]:
        result, calls = run("enable", loaded=loaded)
        assert result.returncode == 0, (result, calls)
        change = next(i for i, c in enumerate(calls) if c[:2] == ["networksetup", "-setdnsservers"])
        probes = [i for i, c in enumerate(calls[:change]) if c[0] == "dig"]
        assert len(probes) == 2, calls
        assert "@127.0.0.1" in calls[probes[0]] and "@::1" in calls[probes[1]], calls
        assert sum(c[0] == "lsof" for c in calls[:probes[0]]) == 2, calls
        assert sum(c[0] == "lsof" for c in calls[probes[-1] + 1:change]) == 2, calls
        assert calls[change] == ["networksetup", "-setdnsservers", "Wi-Fi", "127.0.0.1", "::1"], calls
        assert not any(c[:2] == ["launchctl", "kickstart"] for c in calls), calls
        assert any(c[:2] == ["launchctl", "bootstrap"] for c in calls) != loaded, calls

    result, calls = run("enable", loaded=True, scenario="waiting_then_started")
    assert result.returncode == 0, (result, calls)
    assert ["launchctl", "kickstart", "system/com.local.dnscrypt-proxy"] in calls, calls
    assert not any("-k" in c for c in calls), calls
    assert ["networksetup", "-setdnsservers", "Wi-Fi", "127.0.0.1", "::1"] in calls, calls

    result, calls = run("disable", loaded=True)
    assert result.returncode == 0 and (root / "loaded").exists(), (result, calls)
    assert ["networksetup", "-setdnsservers", "Wi-Fi", "Empty"] in calls, calls
    assert not any(c[0] in {"launchctl", "lsof", "dig"} for c in calls), calls

    result, calls = run("stop", loaded=True)
    assert result.returncode == 0 and not (root / "loaded").exists(), (result, calls)
    reset = next(i for i, c in enumerate(calls) if c[:2] == ["networksetup", "-setdnsservers"])
    stop = next(i for i, c in enumerate(calls) if c[:2] == ["launchctl", "bootout"])
    assert reset < stop, calls
    assert ["launchctl", "disable", "system/com.local.dnscrypt-proxy"] in calls, calls
    assert not any("pkill" in c[0] or "brew" in c[0] for c in calls), calls

print(f"{scenarios} helper scenarios passed with mocked system tools; no live DNS or services changed.")
