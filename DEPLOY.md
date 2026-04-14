# Verified Dating — Deployment Guide
## Ubuntu 22+ · PostgreSQL 17 · Node.js · KVM4

---

## 1. Upload project to server

```bash
# On your local machine — copy project to server
scp -r "Date-all/" user@YOUR_SERVER_IP:/var/www/verified-dating

# OR use git
ssh user@YOUR_SERVER_IP
mkdir -p /var/www/verified-dating
cd /var/www/verified-dating
git clone YOUR_REPO_URL .
```

---

## 2. Install Node dependencies

```bash
cd /var/www/verified-dating
npm install --omit=dev
```

---

## 3. Set up environment

```bash
cp .env.example .env
nano .env
```

Fill in:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=verified_dating
DB_USER=verified_user
DB_PASSWORD=YOUR_STRONG_PASSWORD

JWT_SECRET=run_this_to_generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_REFRESH_SECRET=run_again_for_different_value

PORT=3000
NODE_ENV=production
CLIENT_URL=http://YOUR_SERVER_IP    # update to https://yourdomain.com later
```

---

## 4. Initialise the database

```bash
# Add admin postgres password to .env temporarily
DB_ADMIN_PASSWORD=your_postgres_superuser_password

node server/sql/init.js

# Remove DB_ADMIN_PASSWORD from .env after init
```

---

## 5. Create uploads & logs directories

```bash
mkdir -p /var/www/verified-dating/public/uploads
mkdir -p /var/www/verified-dating/logs
chmod 755 /var/www/verified-dating/public/uploads
```

---

## 6. Install & configure PM2

```bash
sudo npm install -g pm2

cd /var/www/verified-dating
pm2 start ecosystem.config.js --env production

# Save process list and enable startup
pm2 save
pm2 startup
# Run the command it prints (starts PM2 on boot)
```

### PM2 useful commands
```bash
pm2 status              # show running processes
pm2 logs verified-dating   # tail logs
pm2 restart verified-dating
pm2 stop verified-dating
```

---

## 7. Install & configure Nginx

```bash
sudo apt install nginx -y

# Copy config
sudo cp /var/www/verified-dating/nginx.conf /etc/nginx/sites-available/verified-dating

# Edit it — replace YOUR_DOMAIN_HERE with your IP or domain
sudo nano /etc/nginx/sites-available/verified-dating

# Enable
sudo ln -s /etc/nginx/sites-available/verified-dating /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # remove default site

# Test & reload
sudo nginx -t
sudo systemctl reload nginx
```

---

## 8. Open firewall ports

```bash
sudo ufw allow 22      # SSH
sudo ufw allow 80      # HTTP
sudo ufw allow 443     # HTTPS (for later)
sudo ufw enable
```

---

## 9. Test it

Open your browser: `http://YOUR_SERVER_IP`

You should see the Verified dating app login screen.

---

## 10. Add SSL (when you have a domain)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com

# Auto-renewal (already set up by certbot, verify):
sudo systemctl status certbot.timer
```

Then uncomment the HTTPS block in `nginx.conf` and update `.env`:
```
CLIENT_URL=https://yourdomain.com
```

---

## 11. Add SMTP email (when ready)

Update `.env`:
```
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your_smtp_password
SMTP_FROM=Verified Dating <noreply@yourdomain.com>
```

Then restart: `pm2 restart verified-dating`

---

## File structure

```
/var/www/verified-dating/
├── server/
│   ├── index.js          ← Express + Socket.io entry
│   ├── config/db.js      ← PostgreSQL pool
│   ├── routes/           ← auth, profiles, swipes, matches, safety
│   ├── middleware/        ← JWT auth, multer upload
│   ├── socket/chat.js    ← Socket.io real-time messaging
│   └── sql/              ← schema + init script
├── assets/               ← frontend CSS + JS
├── public/uploads/       ← user photo uploads
├── index.html            ← app shell (served by Express)
├── .env                  ← secrets (never commit this)
├── ecosystem.config.js   ← PM2 config
└── nginx.conf            ← Nginx reverse proxy config
```
