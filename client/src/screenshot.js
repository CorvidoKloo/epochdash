const { desktopCapturer, screen } = require('electron');
const EventEmitter = require('events');

class ScreenshotCapture extends EventEmitter {
    constructor(apiClient) {
        super();
        this.api = apiClient;
        this.intervalId = null;
        this.timeEntryId = null;
        this.settings = {};
        this.paused = false;
        this.capturing = false;
    }

    start(intervalMs, timeEntryId, settings) {
        this.stop(); // Clear any existing
        this.timeEntryId = timeEntryId;
        this.settings = settings || {};
        this.paused = false;

        console.log(`📸 Screenshot capture started (interval: ${intervalMs / 1000}s)`);

        // First capture after a short random delay
        const firstDelay = Math.floor(Math.random() * Math.min(intervalMs, 60000)) + 5000;
        setTimeout(() => {
            if (!this.paused && this.timeEntryId) this.capture();
        }, firstDelay);

        // Then capture at regular intervals with random jitter
        this.intervalId = setInterval(() => {
            if (this.paused || this.capturing || !this.timeEntryId) return;
            const jitter = Math.floor(Math.random() * Math.min(intervalMs * 0.3, 30000));
            setTimeout(() => {
                if (!this.paused && this.timeEntryId) this.capture();
            }, jitter);
        }, intervalMs);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.paused = false;
        this.timeEntryId = null;
        console.log('📸 Screenshot capture stopped');
    }

    pause() {
        this.paused = true;
        console.log('📸 Screenshot capture paused (idle)');
    }

    resume() {
        this.paused = false;
        console.log('📸 Screenshot capture resumed');
    }

    /**
     * Capture the ENTIRE desktop — all monitors stitched together
     * at full native resolution (including HiDPI/Retina scaling).
     */
    async capture() {
        if (this.capturing) return;
        this.capturing = true;

        try {
            // ── 1. Determine full desktop bounds (all monitors) ──
            const displays = screen.getAllDisplays();
            const primaryDisplay = screen.getPrimaryDisplay();
            const scaleFactor = primaryDisplay.scaleFactor || 1;

            // Calculate the bounding rectangle spanning all monitors
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const d of displays) {
                minX = Math.min(minX, d.bounds.x);
                minY = Math.min(minY, d.bounds.y);
                maxX = Math.max(maxX, d.bounds.x + d.bounds.width);
                maxY = Math.max(maxY, d.bounds.y + d.bounds.height);
            }
            const totalWidth  = maxX - minX;
            const totalHeight = maxY - minY;

            console.log(`📐 Desktop: ${totalWidth}×${totalHeight} (${displays.length} display(s), scale: ${scaleFactor}x)`);

            // Use the actual pixel dimensions (scaled) so we get full resolution for the stitched panorama
            const captureWidth  = Math.round(totalWidth  * scaleFactor);
            const captureHeight = Math.round(totalHeight * scaleFactor);

            // Request `thumbnailSize` as the maximum native resolution of *any single* display.
            // Do NOT use the entire bounds (multi-monitor stitched bounds) here, as Mac/Windows 
            // native APIs will reject ultra-wide thumbnail dimensions and return an empty buffer!
            let maxDisplayWidth = 0, maxDisplayHeight = 0;
            for (const d of displays) {
                maxDisplayWidth = Math.max(maxDisplayWidth, d.bounds.width);
                maxDisplayHeight = Math.max(maxDisplayHeight, d.bounds.height);
            }
            const thumbW = Math.round(maxDisplayWidth * scaleFactor);
            const thumbH = Math.round(maxDisplayHeight * scaleFactor);

            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                fetchWindowIcons: false,
                thumbnailSize: { width: thumbW, height: thumbH }
            });

            if (sources.length === 0) {
                console.warn('⚠️ No screen sources available — check screen capture permissions');
                return;
            }

            console.log(`📺 Found ${sources.length} screen source(s): ${sources.map(s => s.name).join(', ')}`);

            // ── 3. Find 'Entire Screen' or Stitch Multiple Screens ──
            let bestScreenshot = null;
            let capturedWidth = thumbW;
            let capturedHeight = thumbH;

            // Try to find a source named "Entire Screen" (Windows sometimes provides this)
            const entireScreen = sources.find(s =>
                s.name.toLowerCase().includes('entire screen') ||
                s.name === 'Entire Screen'
            );

            if (entireScreen && !entireScreen.thumbnail.isEmpty()) {
                bestScreenshot = entireScreen.thumbnail;
                const sz = bestScreenshot.getSize();
                capturedWidth = sz.width;
                capturedHeight = sz.height;
                console.log(`  ✅ Using provided "Entire Screen": ${sz.width}×${sz.height}`);
            } else if (sources.length === 1) {
                // If there's only one monitor, just take its thumbnail
                bestScreenshot = sources[0].thumbnail;
                const sz = bestScreenshot.getSize();
                capturedWidth = sz.width;
                capturedHeight = sz.height;
                 console.log(`  ✅ Single screen captured: ${sz.width}×${sz.height}`);
            } else {
                // Multi-monitor: Stitch individual screen sources together using Jimp
                console.log(`  🧵 Stitching ${sources.length} screens into ${captureWidth}×${captureHeight} panorama...`);
                try {
                    const { Jimp, JimpMime } = require('jimp');
                    // Create an opaque black background for the combined frame
                    const composited = new Jimp({ width: captureWidth, height: captureHeight, color: 0x000000FF });
                    
                    const jimpImages = await Promise.all(sources.map(async s => {
                        if (s.thumbnail.isEmpty()) return null;
                        
                        // Try to find matching physical display layout via ID or Name
                        // Source display_id format varies by OS (sometimes just a number string, sometimes empty)
                        let display = displays.find(d => 
                            d.id.toString() === s.display_id || 
                            s.name.includes(d.id.toString())
                        );
                        // Fallback: assume first source maps to primary, etc. (imperfect but better than nothing)
                        if (!display) {
                            const index = sources.indexOf(s);
                            display = displays[index] || primaryDisplay;
                        }

                        // Convert nativeImage to Jimp buffer
                        const buffer = s.thumbnail.toPNG();
                        const img = await Jimp.read(buffer);
                        
                        // Map top-left offsets relative to bounding box
                        const x = Math.round((display.bounds.x - minX) * scaleFactor);
                        const y = Math.round((display.bounds.y - minY) * scaleFactor);
                        
                        console.log(`     🎨 Composing ${s.name} at (${x}, ${y})`);
                        return { img, x, y };
                    }));

                    // Stamp each monitor piece onto the panorama canvas
                    jimpImages.filter(item => item !== null).forEach(item => {
                        composited.composite(item.img, item.x, item.y);
                    });

                    // Output back to nativeImage so pipeline continues normally
                    const combinedJpgBuffer = await composited.getBuffer(JimpMime.jpeg);
                    bestScreenshot = require('electron').nativeImage.createFromBuffer(combinedJpgBuffer);
                    
                    capturedWidth = captureWidth;
                    capturedHeight = captureHeight;
                    console.log(`  ✅ Seamless stitching complete.`);
                } catch(err) {
                    console.error('⚠️ Stitching failed, falling back to primary screen only:', err.message);
                    bestScreenshot = sources[0].thumbnail;
                    const sz = bestScreenshot.getSize();
                    capturedWidth = sz.width;
                    capturedHeight = sz.height;
                }
            }

            if (!bestScreenshot || bestScreenshot.isEmpty()) {
                console.warn('⚠️ All screenshots were empty — macOS may need Screen Recording permission');
                console.warn('   Go to: System Preferences → Security & Privacy → Privacy → Screen Recording');
                this.emit('permission-needed', 'screen-recording');
                return;
            }

            const capturedSize = bestScreenshot.getSize();
            console.log(`📸 Captured: ${capturedSize.width}×${capturedSize.height}`);

            // ── 4. Convert to JPEG with quality setting ──
            const quality = this.settings.screenshot_quality || 'medium';
            const jpegQuality = { low: 40, medium: 65, high: 90 }[quality] || 65;
            const imageBuffer = bestScreenshot.toJPEG(jpegQuality);
            const imageBase64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

            // ── 5. Create a smaller thumbnail for the gallery view ──
            const thumbWidth = 480;
            const thumbRatio = capturedSize.height / capturedSize.width;
            const thumbHeightCalc = Math.round(thumbWidth * thumbRatio);
            const thumbImage = bestScreenshot.resize({
                width: thumbWidth,
                height: thumbHeightCalc,
                quality: 'good'
            });
            const thumbBuffer = thumbImage.toJPEG(45);
            const thumbBase64 = `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`;

            // ── 6. Upload to server ──
            await this.api.uploadScreenshot(this.timeEntryId, imageBase64, thumbBase64);

            const sizeKB = (imageBuffer.length / 1024).toFixed(0);
            const thumbKB = (thumbBuffer.length / 1024).toFixed(0);
            console.log(`✅ Screenshot uploaded: ${capturedSize.width}×${capturedSize.height} (${sizeKB}KB full, ${thumbKB}KB thumb)`);
            this.emit('captured', {
                width: capturedSize.width,
                height: capturedSize.height,
                sizeKB: parseInt(sizeKB)
            });

        } catch (err) {
            console.error('❌ Screenshot capture error:', err.message);
            this.emit('error', err);
        } finally {
            this.capturing = false;
        }
    }
}

module.exports = ScreenshotCapture;
