const { app, desktopCapturer, screen } = require('electron');

app.whenReady().then(async () => {
    try {
        const displays = screen.getAllDisplays();
        let maxW = 0, maxH = 0;
        displays.forEach(d => {
            maxW = Math.max(maxW, d.bounds.width);
            maxH = Math.max(maxH, d.bounds.height);
        });
        const scaleFactor = screen.getPrimaryDisplay().scaleFactor || 1;
        const width = Math.round(maxW * scaleFactor);
        const height = Math.round(maxH * scaleFactor);

        console.log(`Requesting thumbnailSize: ${width}x${height}`);
        
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width, height }
        });
        
        console.log(`Found ${sources.length} sources`);
        sources.forEach(s => {
            console.log(`Source name: ${s.name}, thumbnail empty: ${s.thumbnail.isEmpty()}`);
            if (!s.thumbnail.isEmpty()) {
                const size = s.thumbnail.getSize();
                console.log(`  Thumbnail size: ${size.width}x${size.height}`);
            }
        });
    } catch (e) {
        console.error("Error:", e);
    }
    app.quit();
});
