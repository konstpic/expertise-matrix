const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SITE_URL = process.env.SITE_URL || 'https://konstpic.github.io/expertise-matrix/';
const OUTPUT_DIR = path.join(__dirname, '..');
const SCREENSHOTS_DIR = path.join(OUTPUT_DIR, 'screenshots');
const PREVIEW_GIF = path.join(OUTPUT_DIR, 'preview.gif');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function generatePreview() {
    console.log('🚀 Starting preview generation...');
    console.log(`📍 Site URL: ${SITE_URL}`);
    
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 2 // Higher quality
    });
    
    const page = await context.newPage();
    
    try {
        console.log('📸 Loading page...');
        await page.goto(SITE_URL, { 
            waitUntil: 'networkidle',
            timeout: 30000 
        });
        
        // Wait for initial animations to complete
        await page.waitForTimeout(2000);
        
        // Simulate user interaction to activate audio (if needed)
        await page.mouse.move(100, 100);
        await page.waitForTimeout(500);
        
        const screenshots = [];
        const totalFrames = 30; // 30 frames for smooth animation
        const delayBetweenFrames = 200; // 200ms between frames
        
        console.log('📷 Capturing frames...');
        
        // Scroll through the page to show different sections
        for (let i = 0; i < totalFrames; i++) {
            // Calculate scroll position (smooth scroll through page)
            const scrollProgress = i / (totalFrames - 1);
            const maxScroll = await page.evaluate(() => {
                return Math.max(
                    document.body.scrollHeight,
                    document.documentElement.scrollHeight
                ) - window.innerHeight;
            });
            
            const scrollPosition = Math.min(scrollProgress * maxScroll, maxScroll);
            
            // Smooth scroll to position
            await page.evaluate((pos) => {
                window.scrollTo({
                    top: pos,
                    behavior: 'smooth'
                });
            }, scrollPosition);
            
            // Wait for scroll to complete
            await page.waitForTimeout(300);
            
            // Take screenshot
            const screenshotPath = path.join(SCREENSHOTS_DIR, `frame-${String(i).padStart(3, '0')}.png`);
            await page.screenshot({
                path: screenshotPath,
                fullPage: false, // Only visible viewport
                type: 'png'
            });
            
            screenshots.push(screenshotPath);
            
            // Show progress
            if ((i + 1) % 5 === 0) {
                console.log(`  📸 Captured ${i + 1}/${totalFrames} frames...`);
            }
        }
        
        console.log('🎬 Creating GIF...');
        
        // Create GIF using ffmpeg (more reliable for animated GIFs)
        // Check if ffmpeg is available
        try {
            execSync('ffmpeg -version', { stdio: 'ignore' });
            
            console.log('  🎨 Generating optimized GIF palette...');
            // First generate palette for better quality
            const palettePath = path.join(SCREENSHOTS_DIR, 'palette.png');
            const paletteCommand = [
                'ffmpeg',
                '-y',
                '-i', path.join(SCREENSHOTS_DIR, 'frame-%03d.png'),
                '-vf', 'fps=10,scale=1280:-1:flags=lanczos,palettegen',
                palettePath
            ];
            
            execSync(paletteCommand, { stdio: 'ignore' });
            
            console.log('  🎬 Creating final GIF...');
            // Use palette to create optimized GIF
            // First scale and set fps, then apply palette
            const gifCommand = [
                'ffmpeg',
                '-y',
                '-framerate', '10',
                '-i', path.join(SCREENSHOTS_DIR, 'frame-%03d.png'),
                '-i', palettePath,
                '-filter_complex', '[0:v]fps=10,scale=1280:-1:flags=lanczos[x];[x][1:v]paletteuse',
                '-loop', '0',
                PREVIEW_GIF
            ];
            
            // Execute command as array to avoid shell interpretation issues
            execSync(gifCommand, { stdio: 'inherit' });
            
            // Clean up palette
            if (fs.existsSync(palettePath)) {
                fs.unlinkSync(palettePath);
            }
            
            console.log('✅ GIF created successfully!');
        } catch (ffmpegError) {
            console.error('❌ ffmpeg is required to create GIF.');
            console.error('   Please install ffmpeg: https://ffmpeg.org/download.html');
            console.error('   Or use GitHub Actions which has ffmpeg pre-installed.');
            throw ffmpegError;
        }
        
        // Clean up screenshots
        console.log('🧹 Cleaning up temporary files...');
        screenshots.forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
        
        if (fs.existsSync(SCREENSHOTS_DIR)) {
            fs.rmdirSync(SCREENSHOTS_DIR);
        }
        
        console.log(`✨ Preview GIF generated: ${PREVIEW_GIF}`);
        
    } catch (error) {
        console.error('❌ Error generating preview:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

// Run if called directly
if (require.main === module) {
    generatePreview().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { generatePreview };
