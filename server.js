const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const archiver = require('archiver');
const ProcessingEngine = require('./engine');

const app = express();
const port = process.env.PORT || 3000;

// Ensure upload directory exists
fs.ensureDirSync('uploads');

// Multer Configuration (Strictly following img-optimizer.md)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 20 * 1024 * 1024, // 20MB limit
        files: 5 // Max 5 images
    },
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
}).array('images', 5);

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// API: Batch Optimization
app.post('/api/optimize', (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded.', results: [], errors: [] });
        }

        const settings = JSON.parse(req.body.settings || '{}');
        const fileOverrides = JSON.parse(req.body.fileOverrides || '[]');
        const results = [];
        const errors = [];

        // Process files sequentially as per PRD "Processing Pipeline Order"
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            const override = fileOverrides[i] || {};

            try {
                // Merge global settings (format, quality) with per-file overrides (mode, crop, resize)
                const finalSettings = {
                    ...settings,
                    ...override
                };
                const optimized = await ProcessingEngine.process(file, finalSettings);
                results.push(optimized);
            } catch (pErr) {
                errors.push({ filename: file.originalname, reason: pErr.message });
            } finally {
                // Clean up original uploaded file safely for Windows
                try {
                    await fs.remove(file.path);
                } catch (e) {
                    console.warn(`Cleanup failed (likely locked): ${file.path}`);
                }
            }
        }

        res.json({ results, errors });
    });
});

// API: Download ZIP
app.get('/api/download-zip', async (req, res) => {
    const filePaths = req.query.files ? req.query.files.split(',') : [];
    if (filePaths.length === 0) return res.status(400).send('No files to zip.');

    const archive = archiver('zip', { zlib: { level: 9 } });
    res.attachment('optimized_images.zip');

    archive.pipe(res);

    for (const filePath of filePaths) {
        const fullPath = path.join(__dirname, filePath);
        if (await fs.pathExists(fullPath)) {
            archive.file(fullPath, { name: path.basename(filePath) });
        }
    }

    archive.finalize();

    // Note: We should ideally clean up optimized files after download or via a cron
});

// Serve optimized files for download
app.get('/download/:filename', async (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    if (await fs.pathExists(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).send('File not found');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
