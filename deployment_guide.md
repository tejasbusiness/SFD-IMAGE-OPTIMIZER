# Deployment Guide: SynergyFirst Digital Image Optimizer

Follow these steps to deploy the application to your subdomain: `image-optimizer.synergyfirstdigital.com`.

## 1. Prerequisites
Ensure your server has **Node.js (v18+)** and **npm** installed.

## 2. File Upload
Upload all files in the current directory (except `node_modules` and `.git`) to:
`/home/u176113648/domains/synergyfirstdigital.com/public_html/image-optimizer`

## 3. Installation
Using SSH, navigate to the directory and install dependencies:
```bash
cd /home/u176113648/domains/synergyfirstdigital.com/public_html/image-optimizer
npm install
```

## 4. Environment Configuration
The application runs on port **3000** by default. To change this, you can set the `PORT` environment variable.

## 5. Reverse Proxy (.htaccess)
If your hosting uses Apache (typical for Hostinger), you need to point the subdomain to the Node.js process. Create or edit the `.htaccess` file in the same directory:

```apache
RewriteEngine On
RewriteRule ^$ http://127.0.0.1:3000/ [P,L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ http://127.0.0.1:3000/$1 [P,L]
```

## 6. Starting the Application
We recommend using **PM2** to keep the application running in the background.

**Install PM2 (if not already):**
```bash
npm install -g pm2
```

**Start the App:**
```bash
pm2 start server.js --name "sfd-optimizer"
```

**Ensure it starts on reboot:**
```bash
pm2 save
pm2 startup
```

---
> [!NOTE]
> Ensure the `uploads` directory has write permissions: `chmod 755 uploads`
