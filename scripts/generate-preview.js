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
        
        // Get all sections (including hero-section)
        const sections = await page.evaluate(() => {
            const heroSection = document.querySelector('.hero-section');
            const regularSections = Array.from(document.querySelectorAll('.section:not(.hero-section)'));
            const allSections = heroSection ? [heroSection, ...regularSections] : regularSections;
            
            return allSections.map((section, index) => ({
                index,
                id: section.id || `section-${index}`,
                selector: section.className.includes('hero-section') ? '.hero-section' : `.section:nth-of-type(${index + 1})`
            }));
        });
        
        console.log(`  📋 Found ${sections.length} sections to record`);
        
        // Function to wait for all typing animations to complete in a section
        const waitForTypingComplete = async (sectionSelector) => {
            const maxWaitTime = 60000; // Maximum 60 seconds per section
            const checkInterval = 500; // Check every 500ms
            const startTime = Date.now();
            
            while (Date.now() - startTime < maxWaitTime) {
                const isComplete = await page.evaluate((selector) => {
                    const section = document.querySelector(selector);
                    if (!section) return true; // Section not found, consider complete
                    
                    // Check if section has terminal-reveal class (animation started)
                    if (!section.classList.contains('terminal-reveal')) {
                        return false; // Animation hasn't started yet
                    }
                    
                    // Check if there are any elements still typing
                    const typingElements = section.querySelectorAll('.typing-element:not(.typing-complete)');
                    return typingElements.length === 0;
                }, sectionSelector);
                
                if (isComplete) {
                    // Wait a bit more to ensure all animations are fully rendered
                    await page.waitForTimeout(1000);
                    return true;
                }
                
                await page.waitForTimeout(checkInterval);
            }
            
            console.log(`  ⚠️  Timeout waiting for section ${sectionSelector}, continuing...`);
            return false;
        };
        
        // Scroll through each section and wait for animations
        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            console.log(`  📍 Section ${i + 1}/${sections.length}: ${section.id || 'Unknown'}`);
            
            // Scroll to section
            await page.evaluate((index) => {
                const heroSection = document.querySelector('.hero-section');
                const regularSections = Array.from(document.querySelectorAll('.section:not(.hero-section)'));
                const allSections = heroSection ? [heroSection, ...regularSections] : regularSections;
                
                if (index < allSections.length) {
                    allSections[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, i);
            
            // Wait for scroll to complete
            await page.waitForTimeout(1000);
            
            // For non-hero sections, wait for terminal-reveal class and typing animations
            if (!section.selector.includes('hero-section')) {
                console.log(`    ⏳ Waiting for section to reveal...`);
                
                // Wait for terminal-reveal class (section becomes visible)
                try {
                    await page.waitForSelector(`${section.selector}.terminal-reveal`, { 
                        timeout: 5000 
                    });
                } catch (e) {
                    // If it doesn't appear, trigger it manually by ensuring visibility
                    await page.evaluate((selector) => {
                        const section = document.querySelector(selector);
                        if (section && !section.classList.contains('terminal-reveal')) {
                            // Manually trigger the reveal by ensuring it's in viewport
                            const rect = section.getBoundingClientRect();
                            const isVisible = rect.top < window.innerHeight * 0.95 && rect.bottom > 0;
                            if (isVisible) {
                                section.classList.add('terminal-reveal');
                            }
                        }
                    }, section.selector);
                }
                
                // Wait a bit for scan animation
                await page.waitForTimeout(600);
                
                console.log(`    ⌨️  Waiting for typing animations to complete...`);
                await waitForTypingComplete(section.selector);
                console.log(`    ✅ Section ${i + 1} complete`);
            } else {
                // For hero section, just wait a bit to show it
                console.log(`    ⏸️  Showing hero section...`);
                await page.waitForTimeout(3000); // Show hero section for 3 seconds
            }
            
            // Small pause between sections
            await page.waitForTimeout(500);
        }
        
        // Wait a bit more at the end
        await page.waitForTimeout(1000);
        
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
