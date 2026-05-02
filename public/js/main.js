/**
 * Sfd Image Optimizer - Client Engine
 * Handles UI state, file staging, and API orchestration.
 */

class App {
    constructor() {
        this.files = []; // Array of { id, file, settings, metadata, previewUrl }
        this.syncResize = false;
        this.activeCropFileId = null;
        this.cropper = null;
        this.currentStage = 'upload'; // upload, config, results

        this.init();
    }

    init() {
        lucide.createIcons();
        this.bindEvents();
        this.setupCustomSelects();
    }

    bindEvents() {
        const themeBtn = document.getElementById('theme-toggle');
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        const optimizeBtn = document.getElementById('optimize-btn');
        const globalQuality = document.getElementById('global-quality');
        const startAgainBtn = document.getElementById('start-again-btn');

        // Theme Toggle
        themeBtn.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
            localStorage.setItem('theme', isDark ? 'light' : 'dark');
        });

        // Drag & Drop
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            this.handleFiles(e.dataTransfer.files);
        });

        fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
            fileInput.value = ''; // Reset for same file re-upload
        });

        // Global Optimization Trigger
        optimizeBtn.addEventListener('click', () => this.startOptimization());

        // Global Settings Feedback
        globalQuality.addEventListener('input', (e) => {
            document.getElementById('global-quality-val').textContent = `${e.target.value}%`;
            // Batch update all cards that are set to 'percentage'
            this.files.forEach(f => {
                const qValueDisplay = document.querySelector(`.card[data-id="${f.id}"] .quality-val`);
                if (qValueDisplay) qValueDisplay.textContent = `${e.target.value}%`;
            });
        });

        startAgainBtn.addEventListener('click', () => window.location.reload());

        // Sync Resize Toggle
        const syncToggle = document.getElementById('sync-resize-toggle');
        syncToggle.addEventListener('change', (e) => {
            this.syncResize = e.target.checked;
        });

        // Modal Events
        document.getElementById('cancel-crop').addEventListener('click', () => this.closeCropModal());
        document.getElementById('apply-crop').addEventListener('click', () => this.applyCrop());
        
        document.querySelectorAll('.ratio-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const ratio = parseFloat(btn.dataset.ratio);
                this.cropper.setAspectRatio(isNaN(ratio) ? NaN : ratio);
            });
        });
    }

    async handleFiles(fileList) {
        if (!fileList.length) return;

        const incoming = Array.from(fileList).slice(0, 10 - this.files.length);
        
        for (const file of incoming) {
            const id = Math.random().toString(36).substring(2, 9);
            const previewUrl = URL.createObjectURL(file);
            const dims = await this.getImageDimensions(previewUrl);

            this.files.push({
                id,
                file,
                previewUrl,
                metadata: { width: dims.width, height: dims.height, size: file.size },
                settings: {
                    mode: 'resize', // 'resize' or 'crop'
                    resize: { type: 'percentage', percentage: 100, width: dims.width, height: dims.height },
                    crop: null // { x, y, width, height }
                }
            });
        }

        this.transitionTo('config');
        this.renderConfigCards();
    }

    getImageDimensions(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.width, height: img.height });
            img.src = url;
        });
    }

    transitionTo(stage) {
        this.currentStage = stage;
        document.querySelectorAll('section').forEach(s => s.classList.remove('stage-active'));
        document.getElementById(`step-${stage}`).classList.add('stage-active');
        
        const footerBar = document.getElementById('global-footer-bar');
        footerBar.style.display = stage === 'config' ? 'block' : 'none';
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    renderConfigCards() {
        const container = document.getElementById('config-list');
        container.innerHTML = '';

        this.files.forEach(fileData => {
            const card = document.createElement('div');
            card.className = 'file-config-card';
            card.dataset.id = fileData.id;
            
            card.innerHTML = `
                <button class="remove-file-btn" onclick="app.removeFile('${fileData.id}')">
                    <i data-lucide="x"></i>
                </button>
                <div class="preview-img-container">
                    <img src="${fileData.previewUrl}" alt="preview">
                </div>
                <div class="file-settings-area">
                    <div class="settings-header">
                        <span class="file-name" title="${fileData.file.name}">${fileData.file.name}</span>
                        <div class="compact-stats">${fileData.metadata.width} &times; ${fileData.metadata.height}px &bull; ${(fileData.file.size / 1024).toFixed(1)} KB</div>
                    </div>
                    
                    <div class="settings-tabs">
                        <div class="settings-tab ${fileData.settings.mode === 'resize' ? 'active' : ''}" onclick="app.setCardTab('${fileData.id}', 'resize')">Resize</div>
                        <div class="settings-tab ${fileData.settings.mode === 'crop' ? 'active' : ''}" onclick="app.setCardTab('${fileData.id}', 'crop')">Crop</div>
                    </div>

                    <div class="tab-content-wrapper" style="margin-top: 20px;">
                        <!-- Resize Tab Content -->
                        <div class="tab-content ${fileData.settings.mode === 'resize' ? 'active' : ''}" data-tab="resize">
                            <div class="resize-v2-container">
                                <div class="compact-row">
                                    <div class="resize-mode-radios">
                                        <label class="radio-item">
                                            <input type="radio" name="r-mode-${fileData.id}" value="percentage" ${fileData.settings.resize.type === 'percentage' ? 'checked' : ''} onchange="app.updateResizeType('${fileData.id}', 'percentage')">
                                            <span>Percentage</span>
                                        </label>
                                        <label class="radio-item">
                                            <input type="radio" name="r-mode-${fileData.id}" value="pixels" ${fileData.settings.resize.type === 'pixels' ? 'checked' : ''} onchange="app.updateResizeType('${fileData.id}', 'pixels')">
                                            <span>Dimensions</span>
                                        </label>
                                    </div>
                                    <div class="compact-stats new-dims" id="new-dims-${fileData.id}">
                                        ${fileData.metadata.width} &times; ${fileData.metadata.height}px
                                    </div>
                                </div>

                                <div class="horizontal-controls">
                                    ${fileData.settings.resize.type === 'percentage' ? `
                                        <div class="mini-group" style="flex: 1;">
                                            <label>Scale (%)</label>
                                            <input type="number" value="${fileData.settings.resize.percentage}" step="1" min="1" max="200" oninput="app.updateResizeVal('${fileData.id}', 'percentage', this.value)">
                                        </div>
                                    ` : `
                                        <div class="dim-row-v2">
                                            <div class="mini-group">
                                                <label>Width</label>
                                                <input type="number" value="${fileData.settings.resize.width}" oninput="app.updateResizeVal('${fileData.id}', 'width', this.value)">
                                            </div>
                                            <i data-lucide="link" class="link-icon"></i>
                                            <div class="mini-group">
                                                <label>Height</label>
                                                <input type="number" value="${fileData.settings.resize.height}" oninput="app.updateResizeVal('${fileData.id}', 'height', this.value)">
                                            </div>
                                        </div>
                                    `}
                                </div>
                            </div>
                        </div>

                        <!-- Crop Tab Content -->
                        <div class="tab-content ${fileData.settings.mode === 'crop' ? 'active' : ''}" data-tab="crop">
                            <div class="crop-mini-panel">
                                <div class="crop-info">
                                    <h3>Free-form Cropping</h3>
                                    <p>${fileData.settings.crop ? 'Custom area selected.' : 'No crop area defined yet.'}</p>
                                </div>
                                <button class="secondary-btn" onclick="app.openCropModal('${fileData.id}')">
                                    <i data-lucide="crop"></i> ${fileData.settings.crop ? 'Edit Crop' : 'Open Editor'}
                                </button>
                                ${fileData.settings.crop ? `
                                    <div class="crop-status-indicator">
                                        <i data-lucide="check-circle"></i>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
        
        lucide.createIcons();
    }

    removeFile(id) {
        this.files = this.files.filter(f => f.id !== id);
        if (this.files.length === 0) {
            this.transitionTo('upload');
        } else {
            this.renderConfigCards();
        }
    }

    setCardTab(id, mode) {
        const file = this.files.find(f => f.id === id);
        file.settings.mode = mode;
        this.renderConfigCards();
    }

    updateResizeType(id, type) {
        if (this.syncResize) {
            this.files.forEach(f => { f.settings.resize.type = type; });
        } else {
            const file = this.files.find(f => f.id === id);
            file.settings.resize.type = type;
        }
        this.renderConfigCards();
    }

    updateResizeVal(id, key, val) {
        const v = parseInt(val) || 0;
        const filesToUpdate = this.syncResize ? this.files : [this.files.find(f => f.id === id)];

        filesToUpdate.forEach(file => {
            const isCurrentCard = file.id === id;

            if (key === 'percentage') {
                file.settings.resize.percentage = v;
                const scale = v / 100;
                const nw = Math.round(file.metadata.width * scale);
                const nh = Math.round(file.metadata.height * scale);
                const dimsEl = document.getElementById(`new-dims-${file.id}`);
                if (dimsEl) dimsEl.innerHTML = `${nw} &times; ${nh}px`;

                // Update other cards' percentage input without re-rendering
                if (!isCurrentCard) {
                    const card = document.querySelector(`.file-config-card[data-id="${file.id}"]`);
                    if (card) {
                        const pctInput = card.querySelector('.horizontal-controls .mini-group input[type="number"]');
                        if (pctInput) pctInput.value = v;
                    }
                }
            } else if (key === 'width') {
                file.settings.resize.width = v;
                const ratio = file.metadata.height / file.metadata.width;
                file.settings.resize.height = Math.round(v * ratio);
                const dimsEl = document.getElementById(`new-dims-${file.id}`);
                if (dimsEl) dimsEl.innerHTML = `${v} &times; ${file.settings.resize.height}px`;

                // Update height input directly (and width for synced cards)
                const card = document.querySelector(`.file-config-card[data-id="${file.id}"]`);
                if (card) {
                    const heightInput = card.querySelector('.dim-row-v2 .mini-group:last-child input');
                    if (heightInput) heightInput.value = file.settings.resize.height;
                    if (!isCurrentCard) {
                        const widthInput = card.querySelector('.dim-row-v2 .mini-group:first-child input');
                        if (widthInput) widthInput.value = v;
                    }
                }
            } else if (key === 'height') {
                file.settings.resize.height = v;
                const ratio = file.metadata.width / file.metadata.height;
                file.settings.resize.width = Math.round(v * ratio);
                const dimsEl = document.getElementById(`new-dims-${file.id}`);
                if (dimsEl) dimsEl.innerHTML = `${file.settings.resize.width} &times; ${v}px`;

                // Update width input directly (and height for synced cards)
                const card = document.querySelector(`.file-config-card[data-id="${file.id}"]`);
                if (card) {
                    const widthInput = card.querySelector('.dim-row-v2 .mini-group:first-child input');
                    if (widthInput) widthInput.value = file.settings.resize.width;
                    if (!isCurrentCard) {
                        const heightInput = card.querySelector('.dim-row-v2 .mini-group:last-child input');
                        if (heightInput) heightInput.value = v;
                    }
                }
            }
        });
    }

    // Modal Logic
    openCropModal(id) {
        const file = this.files.find(f => f.id === id);
        this.activeCropFileId = id;
        const modal = document.getElementById('crop-modal');
        const img = document.getElementById('crop-target');
        
        img.src = file.previewUrl;
        modal.style.display = 'flex';

        if (this.cropper) this.cropper.destroy();
        
        this.cropper = new Cropper(img, {
            viewMode: 1,
            autoCropArea: 0.8,
            ready: () => {
                if (file.settings.crop) {
                    // Re-apply existing crop if any
                    // Note: Cropper expects data relative to original image
                    this.cropper.setData(file.settings.crop.data);
                }
            }
        });
    }

    closeCropModal() {
        document.getElementById('crop-modal').style.display = 'none';
        if (this.cropper) {
            this.cropper.destroy();
            this.cropper = null;
        }
    }

    applyCrop() {
        const data = this.cropper.getData();
        const file = this.files.find(f => f.id === this.activeCropFileId);
        
        file.settings.crop = {
            x: data.x,
            y: data.y,
            width: data.width,
            height: data.height,
            data: data // Save full state for re-editing
        };
        
        this.closeCropModal();
        this.renderConfigCards();
    }

    async startOptimization() {
        const optimizeBtn = document.getElementById('optimize-btn');
        const progressFill = document.getElementById('upload-progress');
        const format = document.getElementById('global-format').value;
        const quality = document.getElementById('global-quality').value;

        // UI State: Loading
        optimizeBtn.disabled = true;
        optimizeBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Processing...';
        lucide.createIcons();
        progressFill.style.width = '10%';

        const formData = new FormData();
        
        // Global Settings
        formData.append('settings', JSON.stringify({ format, quality }));

        // Per-file instructions
        const fileOverrides = this.files.map(f => ({
            mode: f.settings.mode,
            resize: f.settings.resize,
            crop: f.settings.crop
        }));
        formData.append('fileOverrides', JSON.stringify(fileOverrides));

        this.files.forEach(f => {
            formData.append('images', f.file);
        });

        try {
            progressFill.style.width = '40%';
            const response = await fetch('/api/optimize', {
                method: 'POST',
                body: formData
            });

            progressFill.style.width = '80%';
            const data = await response.json();
            
            if (data.results) {
                this.renderResults(data.results, data.errors);
                this.transitionTo('results');
            } else {
                alert('Optimization failed: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error(err);
            alert('A network error occurred.');
        } finally {
            optimizeBtn.disabled = false;
            optimizeBtn.innerHTML = '<i data-lucide="zap"></i> Optimize All';
            lucide.createIcons();
            progressFill.style.width = '0%';
        }
    }

    renderResults(results, errors) {
        const container = document.getElementById('results-list');
        container.innerHTML = '';
        
        let totalOriginal = 0;
        let totalOptimized = 0;

        results.forEach(res => {
            totalOriginal += res.originalSize;
            totalOptimized += res.optimizedSize;
            
            const savings = Math.max(0, ((res.originalSize - res.optimizedSize) / res.originalSize) * 100);
            
            const card = document.createElement('div');
            card.className = 'result-card';
            card.innerHTML = `
                <div class="result-info">
                    <div class="result-preview">
                        <img src="/${res.path}" alt="optimized">
                    </div>
                    <div class="result-meta">
                        <div class="result-filename">${res.filename}</div>
                        <div class="result-stats-row">
                            <span class="stat-item"><strong>${(res.optimizedSize / 1024).toFixed(1)} KB</strong></span>
                            <span class="stat-divider">&bull;</span>
                            <span class="stat-item">${res.width} &times; ${res.height}px</span>
                        </div>
                    </div>
                </div>
                <div class="result-actions">
                    <div class="savings-badge">-${savings.toFixed(0)}%</div>
                    <a href="/download/${res.filename}" class="secondary-btn mini-btn">
                        <i data-lucide="download"></i> Download
                    </a>
                </div>
            `;
            container.appendChild(card);
        });

        // Add errors if any
        errors.forEach(err => {
            const card = document.createElement('div');
            card.className = 'result-card error';
            card.innerHTML = `
                <div class="result-info">
                    <div class="result-icon" style="color: var(--error);">!</div>
                    <div class="result-meta">
                        <div class="result-filename">${err.filename}</div>
                        <div class="error-text">Failed: ${err.reason}</div>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

        // Summary
        const totalSavings = Math.max(0, ((totalOriginal - totalOptimized) / totalOriginal) * 100);
        document.getElementById('batch-summary').innerHTML = `
            Optimized <strong>${results.length}</strong> images. Total savings: <strong>${totalSavings.toFixed(1)}%</strong>
        `;

        // Update ZIP link
        const fileList = results.map(r => r.path).join(',');
        document.getElementById('download-zip').href = `/api/download-zip?files=${fileList}`;

        lucide.createIcons();
    }

    setupCustomSelects() {
        document.querySelectorAll('select:not(#file-input)').forEach(select => {
            const container = document.createElement('div');
            container.className = 'custom-select-container';
            
            const trigger = document.createElement('div');
            trigger.className = 'custom-select-trigger';
            trigger.textContent = select.options[select.selectedIndex].text;
            
            const options = document.createElement('div');
            options.className = 'custom-select-options';
            
            Array.from(select.options).forEach((opt, idx) => {
                const o = document.createElement('div');
                o.className = `custom-select-option ${idx === select.selectedIndex ? 'selected' : ''}`;
                o.textContent = opt.text;
                o.dataset.value = opt.value;
                
                o.addEventListener('click', () => {
                    select.value = opt.value;
                    trigger.textContent = opt.text;
                    options.querySelectorAll('.custom-select-option').forEach(el => el.classList.remove('selected'));
                    o.classList.add('selected');
                    container.classList.remove('open');
                    
                    // Trigger native change event
                    select.dispatchEvent(new Event('change'));
                });
                options.appendChild(o);
            });

            trigger.onclick = (e) => {
                e.stopPropagation();
                // Determine direction based on space
                const rect = trigger.getBoundingClientRect();
                const spaceBelow = window.innerHeight - rect.bottom;
                const spaceNeeded = 260;

                if (spaceBelow < spaceNeeded && rect.top > spaceNeeded) {
                    container.classList.add('open-up');
                } else {
                    container.classList.remove('open-up');
                }

                document.querySelectorAll('.custom-select-container').forEach(c => {
                    if (c !== container) c.classList.remove('open', 'open-up');
                });
                container.classList.toggle('open');
            };

            container.appendChild(trigger);
            container.appendChild(options);
            select.classList.add('native-hide');
            select.parentNode.insertBefore(container, select);
        });
    }
}

// Global click to close dropdowns
document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select-container').forEach(c => c.classList.remove('open'));
});

window.app = new App();
