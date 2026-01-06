const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SITE_URL = process.env.SITE_URL || 'https://konstpic.github.io/expertise-matrix/';
const OUTPUT_DIR = path.join(__dirname, '..');
const TEMP_VIDEO = path.join(OUTPUT_DIR, 'preview-temp.mp4');
const PREVIEW_GIF = path.join(OUTPUT_DIR, 'preview.gif');
const VIDEO_DURATION = 10; // seconds

async function generatePreview() {
    console.log('🚀 Starting preview generation...');
    console.log(`📍 Site URL: ${SITE_URL}`);
    console.log(`⏱️  Video duration: ${VIDEO_DURATION} seconds`);
    
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 2, // Higher quality
        recordVideo: {
            dir: OUTPUT_DIR,
            size: { width: 1280, height: 720 }
        }
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
        
        console.log('🎥 Recording video...');
        
        // Start video recording
        await page.video().path(); // Initialize video recording
        
        // Animate scroll through the page
        const maxScroll = await page.evaluate(() => {
            return Math.max(
                document.body.scrollHeight,
                document.documentElement.scrollHeight
            ) - window.innerHeight;
        });
        
        // Smooth scroll animation over VIDEO_DURATION seconds
        const scrollSteps = 60; // 60 steps for smooth animation
        const stepDelay = (VIDEO_DURATION * 1000) / scrollSteps;
        
        for (let i = 0; i <= scrollSteps; i++) {
            const scrollProgress = i / scrollSteps;
            const scrollPosition = Math.min(scrollProgress * maxScroll, maxScroll);
            
            // Smooth scroll to position
            await page.evaluate((pos) => {
                window.scrollTo({
                    top: pos,
                    behavior: 'smooth'
                });
            }, scrollPosition);
            
            // Wait for next step
            await page.waitForTimeout(stepDelay);
            
            // Show progress
            if (i % 10 === 0) {
                const progress = Math.round((i / scrollSteps) * 100);
                console.log(`  📹 Recording... ${progress}%`);
            }
        }
        
        // Wait a bit more to ensure video is complete
        await page.waitForTimeout(500);
        
        console.log('💾 Saving video...');
        
        // Get video path before closing
        const video = page.video();
        const videoPath = video ? await video.path() : null;
        
        // Close page and context to finalize video recording
        await page.close();
        await context.close();
        
        // Wait for video file to be written
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Move video file to our temp location
        if (videoPath && fs.existsSync(videoPath)) {
            // If video is already in the right place, just rename
            if (videoPath !== TEMP_VIDEO) {
                fs.renameSync(videoPath, TEMP_VIDEO);
            }
        } else {
            // Fallback: find video file in output directory
            const videoFiles = fs.readdirSync(OUTPUT_DIR)
                .filter(file => file.endsWith('.webm') || file.endsWith('.mp4'))
                .map(file => path.join(OUTPUT_DIR, file));
            
            if (videoFiles.length > 0) {
                fs.renameSync(videoFiles[0], TEMP_VIDEO);
            } else {
                throw new Error('Video file was not created');
            }
        }
        
        console.log('🎬 Converting video to GIF...');
        
        // Convert video to GIF using ffmpeg
        try {
            execSync('ffmpeg -version', { stdio: 'ignore' });
            
            console.log('  🎨 Generating optimized GIF palette from video...');
            // First generate palette from video for better quality
            const palettePath = path.join(OUTPUT_DIR, 'palette.png');
            const paletteCommand = `ffmpeg -y -i "${TEMP_VIDEO}" -vf "fps=15,scale=1280:-1:flags=lanczos,palettegen" "${palettePath}"`;
            
            execSync(paletteCommand, { stdio: 'ignore' });
            
            console.log('  🎬 Creating final GIF from video...');
            // Use palette to create optimized GIF from video
            const gifCommand = `ffmpeg -y -i "${TEMP_VIDEO}" -i "${palettePath}" -filter_complex "[0:v]fps=15,scale=1280:-1:flags=lanczos[x];[x][1:v]paletteuse" -loop 0 "${PREVIEW_GIF}"`;
            
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
        
        // Clean up temporary video
        console.log('🧹 Cleaning up temporary files...');
        if (fs.existsSync(TEMP_VIDEO)) {
            fs.unlinkSync(TEMP_VIDEO);
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
