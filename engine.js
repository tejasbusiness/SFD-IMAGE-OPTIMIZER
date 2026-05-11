'use strict';

const sharp = require('sharp');
const fs = require('fs-extra');
const path = require('path');

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

/**
 * Image Processing Engine (IMGOPT_ENGINE)
 * Follows the pipeline order from img-optimizer.md:
 * validate → load → crop → resize → format+compress → output
 */
class ProcessingEngine {
    static async process(file, settings) {
        // Load into buffer first to release the file handle (fixes EBUSY on Windows)
        const buffer = await fs.readFile(file.path);
        let pipeline = sharp(buffer);

        const metadata = await pipeline.metadata();

        // 1. Validate — handled by multer/server before this is called

        // 2. Load — sharp(buffer) above

        // 3. Crop
        if (settings.mode === 'crop' && settings.crop && settings.crop.width && settings.crop.height) {
            pipeline = pipeline.extract({
                left: Math.round(settings.crop.x),
                top: Math.round(settings.crop.y),
                width: Math.round(settings.crop.width),
                height: Math.round(settings.crop.height)
            });
        }

        // 4. Resize
        if (settings.mode === 'resize' && settings.resize) {
            if (settings.resize.type === 'pixels') {
                pipeline = pipeline.resize({
                    width: settings.resize.width ? parseInt(settings.resize.width) : null,
                    height: settings.resize.height ? parseInt(settings.resize.height) : null,
                    fit: 'inside'
                });
            } else if (settings.resize.type === 'percentage') {
                const scale = parseFloat(settings.resize.percentage) / 100;
                const newWidth = Math.round(metadata.width * scale);
                pipeline = pipeline.resize({ width: newWidth });
            }
        }

        // 5+6. Format & Compression
        const format = settings.format || 'webp';
        const quality = parseInt(settings.quality) || 80;

        switch (format) {
            case 'jpeg':
            case 'jpg':
                pipeline = pipeline.jpeg({ quality, mozjpeg: true });
                break;
            case 'png':
                // PNG quality 100 → compression 0 (none); quality 0 → compression 9 (max)
                pipeline = pipeline.png({ compressionLevel: Math.min(9, Math.floor((100 - quality) / 10)) });
                break;
            case 'webp':
                pipeline = pipeline.webp({ quality });
                break;
            case 'tiff':
                pipeline = pipeline.tiff({ quality });
                break;
            case 'bmp':
                // Sharp has limited BMP output; file is served as-is from the loaded buffer
                break;
            default:
                pipeline = pipeline.toFormat(format, { quality });
        }

        const randomId = Math.random().toString(36).substring(2, 12);
        const newFilename = `sfd-img-optimizer-${randomId}.${format}`;
        const outputPath = path.join(UPLOAD_DIR, newFilename).replace(/\\/g, '/');
        const result = await pipeline.toFile(outputPath);

        return {
            path: outputPath,
            filename: newFilename,
            originalSize: file.size,
            optimizedSize: result.size,
            format: result.format,
            width: result.width,
            height: result.height
        };
    }
}

module.exports = ProcessingEngine;
