# Sales Portal — Server Setup & Configuration

## Server Info

| Field            | Value                          |
|------------------|--------------------------------|
| Provider         | AWS EC2                        |
| Instance OS      | Ubuntu 24.04.3 LTS             |
| Private IP       | 172.31.44.48                   |
| Public IP        | 3.22.171.189                   |
| Node.js          | v22.17.0 (via nvm)             |
| PM2              | v6.0.14                        |
| Nginx            | Installed (`/usr/sbin/nginx`)  |
| MySQL            | Installed locally              |

---

## What's Running

### Frontend (Nginx)
- **Served by:** Nginx (system service — always on, survives reboots)
- **What it does:** Serves the built React app from static files
- **Build location:** `/home/ubuntu/sales_portal/frontend/dist`
- **Accessible at:** `http://3.22.171.189` (port 80)
- **Config file:** `/etc/nginx/sites-available/default`

**Nginx config:**
```nginx
server {
    listen 80;
    location / {
        root /home/ubuntu/sales_portal/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**How it works:**
- Any request to `/` serves the React app (index.html, JS, CSS)
- Any request to `/api/*` gets forwarded to the Express backend on port 3000
- `try_files $uri $uri/ /index.html` makes React Router work (all routes fall back to index.html)

### Backend (PM2)
- **Managed by:** PM2 (process manager — restarts on crash, survives reboots if `pm2 startup` was run)
- **Entry point:** `/home/ubuntu/sales_portal/backend/main.mjs`
- **Runs on:** `http://localhost:3000` (not exposed directly — Nginx proxies `/api/` to it)
- **PM2 name:** `backend`

### Database (MySQL)
- **Runs on:** localhost
- **Database name:** `portalData`
- **User:** `root`

---

## EC2 Security Group Rules

| Type       | Port  | Source    | Purpose                |
|------------|-------|----------|------------------------|
| SSH        | 22    | 0.0.0.0/0 | Terminal access       |
| HTTP       | 80    | 0.0.0.0/0 | Frontend + API (Nginx)|
| Custom TCP | 3000  | 0.0.0.0/0 | Backend (optional, Nginx proxies this) |
| Custom TCP | 5173  | 0.0.0.0/0 | Dev server (can remove now) |

**Note:** Ports 3000 and 5173 can be removed from the security group. Nginx on port 80 handles everything.

---

## Environment Files

### Backend (`/home/ubuntu/sales_portal/backend/.env`)
```
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASS=<your-db-password>
DB_NAME=portalData
JWT_SECRET=<your-jwt-secret>
```

### Frontend (`/home/ubuntu/sales_portal/frontend/.env`)
```
VITE_API_BASE_URL=http://localhost:3000
```

**Important:** The frontend `.env` is baked into the build at `npm run build` time. If you change it, you must rebuild:
```bash
cd ~/sales_portal/frontend
npm run build
```
No need to restart Nginx — it just serves the new files.

---

## Common Commands

### Check status
```bash
pm2 list                        # Is backend running?
sudo systemctl status nginx     # Is Nginx running?
```

### View logs
```bash
pm2 logs backend                # Backend logs
sudo tail -f /var/log/nginx/error.log   # Nginx error logs
sudo tail -f /var/log/nginx/access.log  # Nginx access logs
```

### Restart services
```bash
pm2 restart backend             # Restart backend
sudo systemctl restart nginx    # Restart Nginx
```

### Deploy code updates
```bash
cd ~/sales_portal
git pull

# Backend changes:
cd backend
npm install
pm2 restart backend

# Frontend changes:
cd frontend
npm install
npm run build
# Nginx automatically serves the new build — no restart needed
```

### Make PM2 survive reboots
```bash
pm2 save
pm2 startup
# Then run the sudo command it prints
```

---

## Architecture Diagram

```
Browser
  │
  ▼
http://3.22.171.189:80
  │
  ▼
┌──────────────────────────┐
│        NGINX             │
│   (port 80, always on)   │
├──────────────────────────┤
│                          │
│  /          → serves     │
│               dist/      │
│               (React)    │
│                          │
│  /api/*     → proxy to   │
│               localhost   │
│               :3000       │
│               (Express)  │
└──────────────────────────┘
                │
                ▼
┌──────────────────────────┐
│     EXPRESS (PM2)        │
│     (port 3000)          │
│     main.mjs             │
└──────────────────────────┘
                │
                ▼
┌──────────────────────────┐
│       MySQL              │
│     portalData           │
│     (localhost)          │
└──────────────────────────┘
```

---

## Cleanup (Optional)

Remove unused security group rules:
- Port 5173 (dev server — no longer needed)
- Port 3000 (Nginx proxies this — no need to expose directly)

Kill any stray `serve` processes from earlier:
```bash
sudo kill $(sudo lsof -t -i:5173) 2>/dev/null
```
