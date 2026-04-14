#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fix seed.js interests array issue and verify deployment.
"""
import sys
import io
import time
import paramiko

# Force UTF-8 output on Windows so Unicode from server output doesn't crash
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

HOST     = "187.127.140.170"
PORT     = 22
USER     = "root"
PASSWORD = "Amma@2808"
REMOTE   = "/var/www/datemap"

def banner(msg):
    print(f"\n{'='*60}\n  {msg}\n{'='*60}")

def ok(msg):
    print(f"  [OK]  {msg}")

def err(msg):
    print(f"  [ERR] {msg}")

def run(ssh, cmd, timeout=120, raise_on_error=True):
    print(f"  >>> {cmd[:100]}")
    # Use LANG=C to avoid encoding issues in output decoding
    stdin, stdout, stderr = ssh.exec_command(
        f"export LANG=C LC_ALL=C; {cmd}", timeout=timeout, get_pty=False
    )
    out = stdout.read().decode("utf-8", errors="replace")
    err_txt = stderr.read().decode("utf-8", errors="replace")
    rc = stdout.channel.recv_exit_status()

    if out.strip():
        for line in out.strip().splitlines():
            print(f"      {line}")
    if err_txt.strip():
        for line in err_txt.strip().splitlines():
            print(f"  ERR {line}")

    if rc != 0 and raise_on_error:
        raise RuntimeError(f"Exit {rc}: {cmd}\n{err_txt or out}")
    return rc, out, err_txt


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
    ok(f"Connected to {HOST}")

    # ── Fix seed.js: change JSON.stringify(u.interests) → u.interests ─────────
    banner("FIX — Patch seed.js to pass array natively to pg")

    # The fix: PostgreSQL's node-postgres (pg) handles JS arrays natively
    # when passed directly. JSON.stringify turns it into a JSON string, not
    # a proper pg array. We replace JSON.stringify(u.interests) with u.interests.
    fix_cmd = r"""sed -i 's/JSON\.stringify(u\.interests)/u.interests/g' """ + REMOTE + "/server/sql/seed.js"
    run(ssh, fix_cmd)
    ok("seed.js patched")

    # Verify the patch
    run(ssh, f"grep -n 'interests' {REMOTE}/server/sql/seed.js | grep -i 'stringify' || echo 'Patch confirmed: no more JSON.stringify'")

    # ── Re-run seed ────────────────────────────────────────────────────────────
    banner("RE-RUN — node server/sql/seed.js")
    rc, out, _ = run(ssh, f"cd {REMOTE} && node server/sql/seed.js", timeout=60, raise_on_error=False)
    if rc == 0:
        ok("Seed completed successfully")
    else:
        err(f"Seed still failing (rc={rc})")

    # ── npm install verification ───────────────────────────────────────────────
    banner("VERIFY — node_modules present")
    run(ssh, f"ls {REMOTE}/node_modules | wc -l")

    # ── PM2 status ────────────────────────────────────────────────────────────
    banner("VERIFY — PM2 status")
    rc, out, _ = run(ssh, "pm2 jlist", raise_on_error=False)
    if "datemap" in out:
        ok("datemap process found in PM2")
    # Plain text list
    run(ssh, "pm2 list --no-color", raise_on_error=False)

    # ── Health check ──────────────────────────────────────────────────────────
    banner("VERIFY — curl http://localhost:3000/api/health")
    time.sleep(2)
    rc, out, _ = run(ssh, "curl -s http://localhost:3000/api/health", raise_on_error=False)
    print(f"\n  Health response: {out.strip()}")
    if '"status":"ok"' in out:
        ok("App is healthy!")
    else:
        err("Health check did not return expected JSON")

    # ── Nginx status ──────────────────────────────────────────────────────────
    banner("VERIFY — Nginx status")
    run(ssh, "systemctl is-active nginx", raise_on_error=False)

    # ── Quick end-to-end via public IP ────────────────────────────────────────
    banner("VERIFY — curl http://187.127.140.170/api/health (via Nginx)")
    rc, out, _ = run(ssh, "curl -s http://187.127.140.170/api/health", raise_on_error=False)
    print(f"  Public health response: {out.strip()}")

    # ── check logs for startup errors ─────────────────────────────────────────
    banner("VERIFY — Recent PM2 error log (last 20 lines)")
    run(ssh, f"tail -20 {REMOTE}/logs/error.log 2>/dev/null || echo 'No error log yet'",
        raise_on_error=False)

    banner("DEPLOYMENT COMPLETE")
    print(f"""
  App URL  : http://187.127.140.170
  Health   : http://187.127.140.170/api/health

  Test accounts (all password: Test1234!):
    alex@test.com
    sarah@test.com
    jessica@test.com
    maya@test.com
""")
    ssh.close()


if __name__ == "__main__":
    main()
