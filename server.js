'use strict';

require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const archiver = require('archiver');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const ProcessingEngine = require('./engine');

// ---------------------------------------------------------------------------
// Config — all tuneable values come from environment variables
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT) || 3000;
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 20 * 1024 * 1024; // 20 MB
const MAX_FILES = parseInt(process.env.MAX_FILES) || 10;
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const FILE_TTL_MS = (parseInt(process.env.FILE_TTL_HOURS) || 2) * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = (parseInt(process.env.CLEANUP_INTERVAL_MINUTES) || 60) * 60 * 1000;

// Absolute path used for all path-safety checks
const UPLOADS_ABS = path.resolve(__dirname, UPLOAD_DIR);

// ---------------------------------------------------------------------------
// Structured logging
// ---------------------------------------------------------------------------
function log(level, message) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), level, message }));
}

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = express();

app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOAD_DIR));

fs.ensureDirSync(UPLOAD_DIR);

// ---------------------------------------------------------------------------
// Multer — file upload handler
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
            'image/tiff', 'image/bmp', 'image/gif', 'image/svg+xml'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${file.mimetype}`));
        }
    }
}).array('images', MAX_FILES);

// ---------------------------------------------------------------------------
// Rate limiter — 50 optimize requests per IP per 15 minutes
// ---------------------------------------------------------------------------
const optimizeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again in 15 minutes.' }
});

// ---------------------------------------------------------------------------
// TTL-based file cleanup — runs on a fixed interval
// ---------------------------------------------------------------------------
async function cleanupOldFiles() {
    log('info', 'Running scheduled file cleanup');
    const now = Date.now();
    try {
        const files = await fs.readdir(UPLOADS_ABS);
        let deleted = 0;
        for (const file of files) {
            if (file === '.gitkeep') continue;
            const filePath = path.join(UPLOADS_ABS, file);
            try {
                const stat = await fs.stat(filePath);
                if (now - stat.mtimeMs > FILE_TTL_MS) {
                    await fs.remove(filePath);
                    deleted++;
                }
            } catch (e) {
                // File may be locked (Windows) or already deleted — skip silently
                log('warn', `Cleanup skipped ${file}: ${e.message}`);
            }
        }
        log('info', `Cleanup complete: removed ${deleted} file(s)`);
    } catch (e) {
        log('error', `Cleanup failed: ${e.message}`);
    }
}

setInterval(cleanupOldFiles, CLEANUP_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// ---------------------------------------------------------------------------
// API: Batch image optimization
// ---------------------------------------------------------------------------
app.post('/api/optimize', optimizeLimiter, (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded.', results: [], errors: [] });
        }

        let settings, fileOverrides;
        try {
            settings = JSON.parse(req.body.settings || '{}');
            fileOverrides = JSON.parse(req.body.fileOverrides || '[]');
        } catch (e) {
            return res.status(400).json({ error: 'Invalid JSON in settings or fileOverrides.' });
        }

        const results = [];
        const errors = [];
        log('info', `Processing ${req.files.length} file(s)`);

        // Process all files in parallel; Promise.allSettled ensures one failure
        // doesn't abort the entire batch
        const settled = await Promise.allSettled(
            req.files.map(async (file, i) => {
                const finalSettings = { ...settings, ...(fileOverrides[i] || {}) };
                try {
                    return await ProcessingEngine.process(file, finalSettings);
                } finally {
                    // Clean up the raw upload regardless of success/failure
                    try {
                        await fs.remove(file.path);
                    } catch (e) {
                        log('warn', `Cleanup failed (likely locked): ${file.path}`);
                    }
                }
            })
        );

        for (let i = 0; i < settled.length; i++) {
            const r = settled[i];
            if (r.status === 'fulfilled') {
                results.push(r.value);
            } else {
                errors.push({
                    filename: req.files[i].originalname,
                    reason: r.reason?.message || String(r.reason)
                });
            }
        }

        res.json({ results, errors });
    });
});

// ---------------------------------------------------------------------------
// API: Download ZIP of optimized files
// ---------------------------------------------------------------------------
app.get('/api/download-zip', async (req, res) => {
    const filePaths = req.query.files ? req.query.files.split(',') : [];
    if (filePaths.length === 0) {
        return res.status(400).json({ error: 'No files to zip.' });
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    res.attachment('optimized_images.zip');
    archive.pipe(res);

    const cleanupList = [];
    for (const filePath of filePaths) {
        // Sanitize: derive only the basename to block directory traversal
        const basename = path.basename(filePath);
        const fullPath = path.resolve(UPLOADS_ABS, basename);
        // Confirm the resolved path sits directly inside uploads — not above it
        if (path.dirname(fullPath) !== UPLOADS_ABS) continue;
        if (await fs.pathExists(fullPath)) {
            archive.file(fullPath, { name: basename });
            cleanupList.push(fullPath);
        }
    }

    // Delete optimized files once the archive has finished streaming
    archive.on('finish', async () => {
        for (const filePath of cleanupList) {
            try {
                await fs.remove(filePath);
            } catch (e) {
                log('warn', `Post-zip cleanup skipped: ${path.basename(filePath)}`);
            }
        }
        log('info', `ZIP download complete, cleaned up ${cleanupList.length} file(s)`);
    });

    await archive.finalize();
});

// ---------------------------------------------------------------------------
// Single-file download — path-traversal safe
// ---------------------------------------------------------------------------
app.get('/download/:filename', async (req, res) => {
    // path.basename strips any leading "../" or directory components
    const filename = path.basename(req.params.filename);
    const filePath = path.resolve(UPLOADS_ABS, filename);

    // Verify the resolved path is a direct child of the uploads directory
    if (path.dirname(filePath) !== UPLOADS_ABS) {
        return res.status(400).json({ error: 'Invalid filename.' });
    }

    if (await fs.pathExists(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).json({ error: 'File not found.' });
    }
});

// ---------------------------------------------------------------------------
// 404 + global error handlers (must be last)
// ---------------------------------------------------------------------------
app.use((req, res) => {
    res.status(404).json({ error: 'Not found.' });
});

// Express 5 forwards async errors automatically; this catches sync throws too
app.use((err, req, res, next) => {
    log('error', `Unhandled error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error.' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
    log('info', `Server started on port ${PORT}`);
    log('info', `Upload dir: ${UPLOADS_ABS} | TTL: ${FILE_TTL_MS / 3_600_000}h | Cleanup every: ${CLEANUP_INTERVAL_MS / 60_000}min`);
});
