# Setup Guide

## 1. DNS — point subdomain to your Google Cloud instance

In your domain registrar (or Cloudflare if you're using it as a proxy), add an A record:

```
Type:  A
Name:  redirects
Value: <your Google Cloud instance public IP>
TTL:   3600
```

---

## 2. Upload the app to your Google Cloud instance

From your local machine:
```bash
scp -r redirect-app/ user@YOUR_SERVER_IP:~/redirect-app
```

Or use git — push this folder to a repo and `git clone` it on the server.

---

## 3. Install Node.js on the server (if not already installed)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

## 4. Install dependencies and configure

```bash
cd ~/redirect-app
npm install
cp .env.example .env
nano .env   # set your ADMIN_PASS — change it from "changeme"!
```

---

## 5. Run with PM2 (keeps it alive after reboots)

```bash
# Install PM2 globally (you may already have it for n8n)
sudo npm install -g pm2

# Start the app
pm2 start app.js --name redirect-app

# Save so it restarts on reboot
pm2 save
pm2 startup   # follow the printed command
```

---

## 6. Set up nginx

```bash
sudo cp ~/redirect-app/nginx.conf /etc/nginx/sites-available/redirects.sweetsmilingsoul.com
sudo ln -s /etc/nginx/sites-available/redirects.sweetsmilingsoul.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7. Add HTTPS with Let's Encrypt (free)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d redirects.sweetsmilingsoul.com
```

Certbot auto-renews — nothing else to do.

---

## 8. Done!

- Admin panel: https://redirects.sweetsmilingsoul.com/admin
- Login with the user/pass you set in `.env`
- Create a link → get a QR PNG → done

---

## Updating a link destination

Currently you'd delete and recreate (QR code URL stays the same, only destination changes).
If you want to edit in place, just ask — easy to add.
