#!/usr/bin/env python3
"""
Datemap deployment script — uses paramiko for SSH + SFTP to KVM4 server.
"""

import os
import sys
import time
import paramiko
import stat

# ── Server credentials ────────────────────────────────────────────────────────
HOST     = "187.127.140.170"
PORT     = 22
USER     = "root"
PASSWORD = "Amma@2808"

# ── Paths ─────────────────────────────────────────────────────────────────────
LOCAL_ROOT  = r"C:\Users\dhana\OneDrive\Desktop\CBC Projects\Date-all"
REMOTE_ROOT = "/var/www/datemap"

# ── Exclusions ────────────────────────────────────────────────────────────────
EXCLUDE_DIRS  = {"node_modules", ".git", ".claude", "logs"}
EXCLUDE_FILES = {"package-lock.json", "deploy.py"}

# ── Helpers ───────────────────────────────────────────────────────────────────

def banner(msg):
    print(f"\n{'='*60}")
    print(f"  {msg}")
    print(f"{'='*60}")

def ok(msg):
    print(f"  [OK]  {msg}")

def err(msg):
    print(f"  [ERR] {msg}")

def info(msg):
    print(f"  ...   {msg}")


def ssh_run(ssh, cmd, timeout=120, raise_on_error=True):
    """Run a command via SSH, stream output, return (exit_status, stdout, stderr)."""
    info(f"CMD: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout, get_pty=True)
    out_lines = []
    err_lines = []

    # Stream stdout (get_pty merges stderr into stdout)
    for line in iter(stdout.readline, ""):
        line = line.rstrip("\n")
        if line:
            print(f"        {line}")
            out_lines.append(line)

    exit_status = stdout.channel.recv_exit_status()

    # Try stderr in case get_pty didn't fully merge
    for line in stderr:
        line = line.rstrip("\n")
        if line:
            err_lines.append(line)

    if exit_status != 0 and raise_on_error:
        raise RuntimeError(
            f"Command failed (exit {exit_status}): {cmd}\n"
            + "\n".join(err_lines or out_lines[-10:])
        )
    return exit_status, "\n".join(out_lines), "\n".join(err_lines)


def sftp_mkdir_p(sftp, remote_dir):
    """Recursively create remote directories (like mkdir -p)."""
    parts = remote_dir.rstrip("/").split("/")
    path = ""
    for part in parts:
        if not part:
            path = "/"
            continue
        path = path.rstrip("/") + "/" + part
        try:
            sftp.stat(path)
        except FileNotFoundError:
            sftp.mkdir(path)


def upload_tree(sftp, local_dir, remote_dir):
    """Recursively upload local_dir → remote_dir via SFTP, honouring exclusions."""
    sftp_mkdir_p(sftp, remote_dir)
    total = 0

    for entry in os.scandir(local_dir):
        name = entry.name

        if entry.is_dir():
            if name in EXCLUDE_DIRS:
                info(f"  Skipping dir:  {name}")
                continue
            total += upload_tree(sftp, entry.path,
                                  remote_dir.rstrip("/") + "/" + name)

        elif entry.is_file():
            if name in EXCLUDE_FILES:
                info(f"  Skipping file: {name}")
                continue
            remote_path = remote_dir.rstrip("/") + "/" + name
            sftp.put(entry.path, remote_path)
            total += 1
            if total % 20 == 0:
                print(f"        Uploaded {total} files so far …")

    return total


# ── Main deployment ───────────────────────────────────────────────────────────

def main():
    results = {}

    # ── 1. Connect ────────────────────────────────────────────────────────────
    banner("STEP 1 — Connecting to server via SSH")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD,
                    timeout=30)
        ok(f"Connected to {HOST}")
        results["ssh_connect"] = "OK"
    except Exception as e:
        err(f"SSH connection failed: {e}")
        sys.exit(1)

    # ── 2. Create remote directory ────────────────────────────────────────────
    banner("STEP 2 — Creating /var/www/datemap on server")
    try:
        ssh_run(ssh, f"mkdir -p {REMOTE_ROOT}")
        ok(f"Directory {REMOTE_ROOT} ready")
        results["mkdir"] = "OK"
    except Exception as e:
        err(str(e))
        results["mkdir"] = f"FAILED: {e}"

    # ── 3. Upload project files via SFTP ──────────────────────────────────────
    banner("STEP 3 — Uploading project files via SFTP")
    try:
        sftp = ssh.open_sftp()
        info(f"Local:  {LOCAL_ROOT}")
        info(f"Remote: {REMOTE_ROOT}")
        total = upload_tree(sftp, LOCAL_ROOT, REMOTE_ROOT)
        sftp.close()
        ok(f"Uploaded {total} files successfully")
        results["sftp_upload"] = f"OK ({total} files)"
    except Exception as e:
        err(f"SFTP upload failed: {e}")
        results["sftp_upload"] = f"FAILED: {e}"
        ssh.close()
        sys.exit(1)

    # ── 4. Create .env file on server ─────────────────────────────────────────
    banner("STEP 4 — Writing .env on server")
    env_content = (
        "NODE_ENV=production\\n"
        "PORT=3000\\n"
        "DB_HOST=localhost\\n"
        "DB_PORT=5432\\n"
        "DB_NAME=datemap\\n"
        "DB_USER=datemap_user\\n"
        "DB_PASSWORD=Amma@2808\\n"
        "DB_ADMIN_PASSWORD=Amma@2808\\n"
        "JWT_SECRET=datemap_jwt_super_secret_2024_production\\n"
        "JWT_EXPIRES_IN=7d\\n"
        "UPLOAD_PATH=./public/uploads\\n"
        "MAX_FILE_SIZE=10485760\\n"
    )
    try:
        ssh_run(ssh,
            f"printf '{env_content}' > {REMOTE_ROOT}/.env && "
            f"chmod 600 {REMOTE_ROOT}/.env")
        ok(".env written")
        results["env_write"] = "OK"
    except Exception as e:
        err(str(e))
        results["env_write"] = f"FAILED: {e}"

    # ── 5. npm install ────────────────────────────────────────────────────────
    banner("STEP 5 — npm install --omit=dev")
    try:
        ssh_run(ssh,
            f"cd {REMOTE_ROOT} && npm install --omit=dev",
            timeout=300)
        ok("npm install complete")
        results["npm_install"] = "OK"
    except Exception as e:
        err(str(e))
        results["npm_install"] = f"FAILED: {e}"

    # ── 6. Create logs directory ──────────────────────────────────────────────
    banner("STEP 6 — Create logs directory")
    try:
        ssh_run(ssh, f"mkdir -p {REMOTE_ROOT}/logs && mkdir -p {REMOTE_ROOT}/public/uploads")
        ok("logs and uploads directories created")
        results["mkdir_logs"] = "OK"
    except Exception as e:
        err(str(e))
        results["mkdir_logs"] = f"FAILED: {e}"

    # ── 7. Ensure PostgreSQL is running ───────────────────────────────────────
    banner("STEP 7 — Ensure PostgreSQL is running")
    try:
        ssh_run(ssh, "systemctl is-active postgresql || systemctl start postgresql",
                raise_on_error=False)
        time.sleep(2)
        ok("PostgreSQL is running")
        results["postgres"] = "OK"
    except Exception as e:
        err(str(e))
        results["postgres"] = f"FAILED: {e}"

    # ── 8. Init database ──────────────────────────────────────────────────────
    banner("STEP 8 — node server/sql/init.js (create DB + schema)")
    try:
        ssh_run(ssh,
            f"cd {REMOTE_ROOT} && node server/sql/init.js",
            timeout=60)
        ok("DB initialised")
        results["db_init"] = "OK"
    except Exception as e:
        err(str(e))
        results["db_init"] = f"FAILED: {e}"

    # ── 9. Seed database ──────────────────────────────────────────────────────
    banner("STEP 9 — node server/sql/seed.js (create test users)")
    try:
        ssh_run(ssh,
            f"cd {REMOTE_ROOT} && node server/sql/seed.js",
            timeout=60)
        ok("DB seeded")
        results["db_seed"] = "OK"
    except Exception as e:
        err(str(e))
        results["db_seed"] = f"FAILED: {e}"

    # ── 10. Install PM2 if needed ─────────────────────────────────────────────
    banner("STEP 10 — Install PM2 globally (if not present)")
    try:
        ssh_run(ssh,
            "which pm2 || npm install -g pm2",
            timeout=120)
        ok("PM2 available")
        results["pm2_install"] = "OK"
    except Exception as e:
        err(str(e))
        results["pm2_install"] = f"FAILED: {e}"

    # ── 11. Start app with PM2 ────────────────────────────────────────────────
    banner("STEP 11 — Start app with PM2")
    try:
        # Remove old instance (ignore failure)
        ssh_run(ssh,
            f"cd {REMOTE_ROOT} && pm2 delete datemap 2>/dev/null || true",
            raise_on_error=False)
        # Start fresh
        ssh_run(ssh,
            f"cd {REMOTE_ROOT} && pm2 start ecosystem.config.js --env production",
            timeout=60)
        ok("PM2 app started")
        results["pm2_start"] = "OK"
    except Exception as e:
        err(str(e))
        results["pm2_start"] = f"FAILED: {e}"

    # ── 12. Save PM2 process list ─────────────────────────────────────────────
    banner("STEP 12 — pm2 save")
    try:
        ssh_run(ssh, "pm2 save", timeout=30)
        ok("PM2 list saved")
        results["pm2_save"] = "OK"
    except Exception as e:
        err(str(e))
        results["pm2_save"] = f"FAILED: {e}"

    # ── 13. Set up PM2 to start on boot ───────────────────────────────────────
    banner("STEP 13 — PM2 startup")
    try:
        status, out, _ = ssh_run(ssh, "pm2 startup systemd -u root --hp /root",
                                  timeout=30, raise_on_error=False)
        # If it printed a command to run, execute it
        for line in out.splitlines():
            if line.strip().startswith("sudo"):
                ssh_run(ssh, line.strip(), raise_on_error=False)
                break
        ok("PM2 startup configured")
        results["pm2_startup"] = "OK"
    except Exception as e:
        err(str(e))
        results["pm2_startup"] = f"FAILED: {e}"

    # ── 14. Install / configure Nginx ─────────────────────────────────────────
    banner("STEP 14 — Install Nginx if not present")
    try:
        ssh_run(ssh,
            "which nginx || (apt-get update -qq && apt-get install -y nginx)",
            timeout=180)
        ok("Nginx available")
        results["nginx_install"] = "OK"
    except Exception as e:
        err(str(e))
        results["nginx_install"] = f"FAILED: {e}"

    banner("STEP 15 — Configure Nginx site")
    try:
        ssh_run(ssh,
            f"cp {REMOTE_ROOT}/nginx.conf /etc/nginx/sites-available/datemap")
        ssh_run(ssh,
            "ln -sf /etc/nginx/sites-available/datemap "
            "/etc/nginx/sites-enabled/datemap")
        ssh_run(ssh,
            "rm -f /etc/nginx/sites-enabled/default")
        ok("Nginx site configured")
        results["nginx_config"] = "OK"
    except Exception as e:
        err(str(e))
        results["nginx_config"] = f"FAILED: {e}"

    banner("STEP 16 — Test & reload Nginx")
    try:
        ssh_run(ssh, "nginx -t && systemctl reload nginx", timeout=30)
        ok("Nginx reloaded")
        results["nginx_reload"] = "OK"
    except Exception as e:
        err(str(e))
        results["nginx_reload"] = f"FAILED: {e}"

    # ── 17. Health check ──────────────────────────────────────────────────────
    banner("STEP 17 — Health check: curl http://localhost:3000/api/health")
    time.sleep(5)   # give Node a moment to fully start
    try:
        status, out, _ = ssh_run(ssh,
            "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health",
            timeout=30, raise_on_error=False)
        # Also get full response body
        _, body, _ = ssh_run(ssh,
            "curl -s http://localhost:3000/api/health",
            timeout=30, raise_on_error=False)
        print(f"\n  Health check HTTP status : {out.strip()}")
        print(f"  Health check body        : {body.strip()}")
        results["health_check"] = f"HTTP {out.strip()} — {body.strip()}"
        ok("Health check done")
    except Exception as e:
        err(str(e))
        results["health_check"] = f"FAILED: {e}"

    # ── 18. PM2 status ────────────────────────────────────────────────────────
    banner("STEP 18 — Final PM2 status")
    try:
        _, pm2_out, _ = ssh_run(ssh, "pm2 list", raise_on_error=False)
        results["pm2_status"] = pm2_out
    except Exception as e:
        err(str(e))
        results["pm2_status"] = f"FAILED: {e}"

    ssh.close()

    # ── Summary ───────────────────────────────────────────────────────────────
    banner("DEPLOYMENT SUMMARY")
    for step, result in results.items():
        icon = "[OK]" if result.startswith("OK") or result.startswith("HTTP 2") else "[!!]"
        print(f"  {icon}  {step:20s}  {result[:80]}")

    print(f"\n  App URL : http://{HOST}")
    print(f"  API URL : http://{HOST}/api/health")


if __name__ == "__main__":
    main()
