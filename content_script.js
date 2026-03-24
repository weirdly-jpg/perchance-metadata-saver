/**
 * Perchance Image Meta-Saver (v1.6)
 * Fixes: 
 * - "Maximum call stack size exceeded" on large images (Chunked Processing).
 * - Transparent overlays blocking image detection (Deep Drill Logic).
 * - Global URL matching if coordinate drilling fails.
 */

let lastX = 0;
let lastY = 0;

// Track mouse coordinates for pinpoint image detection
document.addEventListener("contextmenu", (event) => {
    lastX = event.clientX;
    lastY = event.clientY;
}, true);

/**
 * UI Notification
 */
function showToast(message, color = "#2ecc71") {
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed; top: 20px; right: 20px; background: ${color}; color: white; 
        padding: 12px 24px; border-radius: 8px; font-family: sans-serif; 
        font-size: 14px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.15); 
        transition: opacity 0.5s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

/**
 * Manually injects XMP Metadata into a JPEG DataURL
 * Uses chunked processing to prevent RangeErrors on large files
 */
function injectXMP(jpegBase64, prompt) {
    const escapedPrompt = prompt.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[m]));
    
    // Clean prompt for keywords (strip "prompt:" and anything after "negativePrompt:")
    let cleanTags = prompt.replace(/^prompt[:=]\s*/i, '');
    const negIndex = cleanTags.search(/negativePrompt[:=]/i);
    if (negIndex !== -1) {
        cleanTags = cleanTags.substring(0, negIndex);
    }

    // Parse keywords
    const keywords = cleanTags.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3) 
        .filter((v, i, a) => a.indexOf(v) === i) 
        .map(w => `<rdf:li>${w.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[m]))}</rdf:li>`)
        .join('');

    const xmpPacket = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.6-c140">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" 
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapedPrompt}</rdf:li></rdf:Alt></dc:description>
   <dc:subject><rdf:Bag>${keywords}</rdf:Bag></dc:subject>
   <xmp:CreatorTool>Perchance AI Generator</xmp:CreatorTool>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta><?xpacket end="w"?>`;

    const xmpHeader = "http://ns.adobe.com/xap/1.0/\0";
    const xmpBlob = new TextEncoder().encode(xmpHeader + xmpPacket);
    
    const binaryString = atob(jpegBase64.split(',')[1]);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

    const app1Length = xmpBlob.length + 2;
    const app1Marker = new Uint8Array([0xFF, 0xE1, (app1Length >> 8) & 0xFF, app1Length & 0xFF]);

    const newBytes = new Uint8Array(app1Marker.length + xmpBlob.length + bytes.length);
    newBytes.set(bytes.slice(0, 2), 0);
    newBytes.set(app1Marker, 2);
    newBytes.set(xmpBlob, 6);
    newBytes.set(bytes.slice(2), 6 + xmpBlob.length);

    // FIXED: Convert to binary string using chunks to avoid Stack Size errors
    let binary = "";
    const chunkSize = 8192; 
    for (let i = 0; i < newBytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, newBytes.slice(i, i + chunkSize));
    }

    return 'data:image/jpeg;base64,' + btoa(binary);
}

/**
 * Handle image processing request from background.js
 */
chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg.action === "processImage") {
        try {
            // 1. Try coordinate drilling (best for overlays)
            const elements = document.elementsFromPoint(lastX, lastY);
            let targetImg = elements.find(el => el.tagName === "IMG");

            // 2. Global URL fallback (best for frames or unusual layouts)
            if (!targetImg) {
                const allImages = Array.from(document.querySelectorAll('img'));
                targetImg = allImages.find(img => img.src === msg.url);
            }

            if (!targetImg) {
                showToast("❌ Image element not found", "#e74c3c");
                return;
            }

            processTarget(targetImg, msg.url);
        } catch (e) {
            console.error("Saver Error:", e);
            showToast("❌ Script error occurred", "#e74c3c");
        }
    }
});

/**
 * Fetches, injects metadata, and triggers download
 */
async function processTarget(img, url) {
    const fullMetadata = img.title || img.getAttribute("data-title") || img.alt || "";
    const splitMatch = fullMetadata.match(/^(.*?)(?=\s*seed[=:\s])/i);
    const promptOnly = splitMatch ? splitMatch[1].trim() : (fullMetadata || "perchance_image");
    const seedMatch = fullMetadata.match(/seed[=:\s](\d+)/i);
    const fileName = seedMatch ? `${seedMatch[1]}.jpg` : `perchance_${Date.now()}.jpg`;

    try {
        const response = await fetch(url, { mode: 'cors' }).catch(() => fetch(url));
        const blob = await response.blob();
        const reader = new FileReader();
        
        reader.onloadend = function() {
            const tempImg = new Image();
            tempImg.crossOrigin = "anonymous";
            tempImg.onload = function() {
                const canvas = document.createElement('canvas');
                canvas.width = tempImg.width; 
                canvas.height = tempImg.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(tempImg, 0, 0);
                
                let jpegData = canvas.toDataURL("image/jpeg", 0.95);

                // EXIF UserComment
                const exifObj = { 
                    "0th": { [piexif.ImageIFD.ImageDescription]: promptOnly }, 
                    "Exif": { [piexif.ExifIFD.UserComment]: "ASCII\0\0\0" + fullMetadata } 
                };
                jpegData = piexif.insert(piexif.dump(exifObj), jpegData);

                // XMP Injection
                const finalJpeg = injectXMP(jpegData, promptOnly);

                // Trigger Download
                const link = document.createElement('a');
                link.href = finalJpeg;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                showToast(`✅ Saved: ${seedMatch ? seedMatch[1] : 'Success'}`);
            };
            tempImg.src = reader.result;
        };
        reader.readAsDataURL(blob);
    } catch (err) {
        console.error("Fetch/Process Failed:", err);
        showToast("❌ Download failed", "#e74c3c");
    }
}