const sharp = require('sharp');
const fs = require('fs-extra');
const path = require('path');

/**
 * Image Processing Engine (IMGOPT_ENGINE)
 * Strictly follows the pipeline order from img-optimizer.md
 */

class ProcessingEngine {
    static async process(file, settings) {
        // Load into buffer first to release file handle (fixes EBUSY on Windows)
        const buffer = await fs.readFile(file.path);
        let pipeline = sharp(buffer);

        const metadata = await pipeline.metadata();

        // 1. Validate (Done by multer/server before calling this)

        // 2. Load image safely (Done by sharp(file.path))

        // 3. Apply Crop (if enabled and mode is crop)
        if (settings.mode === 'crop' && settings.crop && settings.crop.width && settings.crop.height) {
            pipeline = pipeline.extract({
                left: Math.round(settings.crop.x),
                top: Math.round(settings.crop.y),
                width: Math.round(settings.crop.width),
                height: Math.round(settings.crop.height)
            });
        }

        // 4. Apply Resize (if enabled and mode is resize)
        if (settings.mode === 'resize' && settings.resize) {
            if (settings.resize.type === 'pixels') {
                const resizeOptions = {
                    width: settings.resize.width ? parseInt(settings.resize.width) : null,
                    height: settings.resize.height ? parseInt(settings.resize.height) : null,
                    fit: 'inside'
                };
                pipeline = pipeline.resize(resizeOptions);
            } else if (settings.resize.type === 'percentage') {
                const scale = parseFloat(settings.resize.percentage) / 100;
                const newWidth = Math.round(metadata.width * scale);
                pipeline = pipeline.resize({ width: newWidth });
            }
        }

        // 5. Apply Format & 6. Apply Compression/Optimization
        const format = settings.format || 'webp';
        const quality = parseInt(settings.quality) || 80;

        switch (format) {
            case 'jpeg':
            case 'jpg':
                pipeline = pipeline.jpeg({ quality, mozjpeg: true });
                break;
            case 'png':
                // PNG quality 100 means compression 9 (max), quality 0 means compression 0
                const compressionLevel = Math.min(9, Math.floor((100 - quality) / 10));
                pipeline = pipeline.png({ compressionLevel });
                break;
            case 'webp':
                pipeline = pipeline.webp({ quality });
                break;
            case 'tiff':
                pipeline = pipeline.tiff({ quality });
                break;
            case 'bmp':
                // Note: Sharp output to BMP is limited. 
                // We will handle BMP by converting to PNG if needed or using a buffer.
                // However, Sharp natively supports reading BMP.
                // For V1, if BMP output is selected, we might need an extra step or inform.
                break;
            default:
                pipeline = pipeline.toFormat(format, { quality });
        }

        const randomId = Math.random().toString(36).substring(2, 12);
        const newFilename = `sfd-img-optimizer-${randomId}.${format}`;
        const outputPath = path.join('uploads', newFilename).replace(/\\/g, '/');
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
