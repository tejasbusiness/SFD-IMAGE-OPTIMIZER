# Image Optimizer

A fast, self-hosted image optimization API built with Node.js, Express, and Sharp. Supports batch processing, format conversion, resizing, cropping, and ZIP download of results.

---

## Features

- Batch upload up to 10 images per request
- Output formats: JPEG, PNG, WebP, TIFF, BMP, GIF
- Per-file resize (pixels or percentage) and crop operations
- Single ZIP download of all optimized images
- TTL-based automatic file cleanup
- Rate limiting and structured JSON logging
- Docker-ready with health check

---

## Prerequisites

- **Local**: Node.js 20+ and npm
- **Docker**: Docker Engine 24+

---

## Installation

### Local

```bash
git clone https://github.com/tejasbusiness/SFD-IMAGE-OPTIMIZER.git
cd SFD-IMAGE-OPTIMIZER

# Copy and edit environment variables
cp .env.example .env

npm install
npm start
```

The server starts at `http://localhost:3000`.

### Docker

```bash
# Build
docker build -t sfd-image-optimizer .

# Run with default settings
docker run -p 3000:3000 sfd-image-optimizer

# Run with custom environment and persistent uploads volume
docker run -p 3000:3000 \
  -e PORT=3000 \
  -e FILE_TTL_HOURS=4 \
  -v $(pwd)/uploads:/app/uploads \
  sfd-image-optimizer
```

---

## Environment Variables

| Variable                   | Default    | Description                                      |
|----------------------------|------------|--------------------------------------------------|
| `PORT`                     | `3000`     | HTTP port the server listens on                  |
| `MAX_FILE_SIZE`            | `20971520` | Max upload size per file in bytes (20 MB)        |
| `MAX_FILES`                | `10`       | Max number of files per batch request            |
| `UPLOAD_DIR`               | `uploads`  | Directory for temporary file storage             |
| `FILE_TTL_HOURS`           | `2`        | Hours before uploaded files are auto-deleted     |
| `CLEANUP_INTERVAL_MINUTES` | `60`       | How often the cleanup job runs (minutes)         |

Copy `.env.example` to `.env` and adjust as needed. `.env` is excluded from Docker builds automatically.

---

## API Endpoints

### `GET /health`

Returns server status, uptime, and memory usage. Used by the Docker `HEALTHCHECK`.

**Response:**
```json
{
  "status": "ok",
  "uptime": 142.3,
  "memory": { "rss": 52428800, "heapUsed": 18900000 }
}
```

---

### `POST /api/optimize`

Batch-optimize images. Rate-limited to **50 requests per 15 minutes per IP**.

**Request:** `multipart/form-data`

| Field           | Type   | Description                                              |
|-----------------|--------|----------------------------------------------------------|
| `images`        | files  | 1–10 image files                                         |
| `settings`      | JSON   | Global settings applied to all files (see below)        |
| `fileOverrides` | JSON   | Array of per-file setting overrides (index-matched)      |

**`settings` object:**

| Key       | Values                                  | Default  |
|-----------|-----------------------------------------|----------|
| `format`  | `jpeg`, `png`, `webp`, `tiff`, `bmp`   | `webp`   |
| `quality` | `1`–`100`                               | `80`     |
| `mode`    | `resize`, `crop`, or omit for none      | —        |
| `resize`  | `{ type: "pixels", width, height }` or `{ type: "percentage", percentage }` | — |
| `crop`    | `{ x, y, width, height }`              | —        |

**Response:**
```json
{
  "results": [
    {
      "path": "uploads/sfd-img-optimizer-abc123.webp",
      "filename": "sfd-img-optimizer-abc123.webp",
      "originalSize": 204800,
      "optimizedSize": 38400,
      "format": "webp",
      "width": 1920,
      "height": 1080
    }
  ],
  "errors": [
    { "filename": "bad.tiff", "reason": "Input file is missing or of an unsupported image format" }
  ]
}
```

---

### `GET /api/download-zip?files=path1,path2`

Downloads a ZIP archive containing the listed optimized files. Files are deleted from the server after the ZIP is streamed.

| Query param | Description                                               |
|-------------|-----------------------------------------------------------|
| `files`     | Comma-separated list of file paths returned by `/api/optimize` |

---

### `GET /download/:filename`

Downloads a single optimized file by filename. Path-traversal safe.

---

## Usage Examples

### Optimize a single image to WebP at 75% quality

```bash
curl -X POST http://localhost:3000/api/optimize \
  -F "images=@photo.jpg" \
  -F 'settings={"format":"webp","quality":75}'
```

### Batch optimize with per-file overrides

```bash
curl -X POST http://localhost:3000/api/optimize \
  -F "images=@photo1.jpg" \
  -F "images=@photo2.png" \
  -F 'settings={"format":"webp","quality":80}' \
  -F 'fileOverrides=[{"quality":90},{"mode":"resize","resize":{"type":"pixels","width":800}}]'
```

### Download all results as a ZIP

```bash
# Use the "path" values from the optimize response
curl -O -J "http://localhost:3000/api/download-zip?files=uploads/sfd-img-optimizer-abc.webp,uploads/sfd-img-optimizer-def.webp"
```

### Health check

```bash
curl http://localhost:3000/health
```

---

## Deployment

### Docker Compose (Coolify / self-hosted)

```yaml
services:
  image-optimizer:
    build: .
    ports:
      - "3000:3000"
    environment:
      FILE_TTL_HOURS: 2
      CLEANUP_INTERVAL_MINUTES: 60
    volumes:
      - uploads:/app/uploads
    restart: unless-stopped

volumes:
  uploads:
```

### Reverse proxy (nginx)

```nginx
location / {
    proxy_pass http://localhost:3000;
    client_max_body_size 210m;
    proxy_read_timeout 120s;
}
```

---

## Troubleshooting

**`sharp: Installation error` or missing libvips**
Sharp 0.31+ bundles its own libvips. If you see this in Docker, uncomment the `libvips42` install block in the `Dockerfile` and rebuild.

**Files not deleted after download**
Windows file locking can delay deletion. Files are always cleaned up by the TTL job (default: every 60 minutes). Lower `CLEANUP_INTERVAL_MINUTES` if you need faster cleanup.

**Rate limit errors (429)**
`/api/optimize` allows 50 requests per 15 minutes per IP. The limit resets automatically; the `Retry-After` header tells you when.

**ZIP download is empty**
The `files` query parameter must match the `path` values exactly as returned by `/api/optimize` (e.g. `uploads/sfd-img-optimizer-abc.webp`).
