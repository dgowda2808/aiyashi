#!/usr/bin/env python3
"""Quick deploy — uploads changed files, runs migrations, and restarts app."""
import paramiko, os

HOST, PORT, USER, PASSWORD = "187.127.140.170", 22, "root", "Amma@2808"
REMOTE = "/var/www/datemap"
LOCAL  = r"C:\Users\dhana\OneDrive\Desktop\CBC Projects\Date-all"

FILES = [
    ("admin.html",                            f"{REMOTE}/admin.html"),
    ("assets/css/landing.css",                f"{REMOTE}/assets/css/landing.css"),
    ("assets/js/app.js",                      f"{REMOTE}/assets/js/app.js"),
    ("assets/js/router.js",                   f"{REMOTE}/assets/js/router.js"),
    ("assets/js/api.js",                      f"{REMOTE}/assets/js/api.js"),
    ("index.html",                            f"{REMOTE}/index.html"),
    ("server/routes/admin.js",                f"{REMOTE}/server/routes/admin.js"),
    ("server/routes/profiles.js",             f"{REMOTE}/server/routes/profiles.js"),
    ("server/email.js",                       f"{REMOTE}/server/email.js"),
    ("server/sql/migrate_race_income.js",      f"{REMOTE}/server/sql/migrate_race_income.js"),
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
print(f"Connected to {HOST}")

sftp = ssh.open_sftp()
for local_rel, remote_path in FILES:
    local_path = LOCAL + "\\" + local_rel.replace("/", "\\")
    if not os.path.exists(local_path):
        print(f"  SKIP (not found): {local_rel}")
        continue
    sftp.put(local_path, remote_path)
    print(f"  Uploaded {local_rel}")
sftp.close()

print("\nRunning DB migration (race + income columns)...")
_, stdout, stderr = ssh.exec_command(f"cd {REMOTE} && node server/sql/migrate_race_income.js 2>&1")
out = stdout.read().decode().strip()
err = stderr.read().decode().strip()
if out: print(" ", out)
if err: print("  STDERR:", err)

print("\nRestarting PM2...")
_, stdout, _ = ssh.exec_command("pm2 restart datemap && pm2 list", get_pty=True)
for line in stdout:
    print(" ", line.rstrip())

ssh.close()
print("\nDone! Visit http://187.127.140.170")
