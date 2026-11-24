/**
 * Perchance Image Meta-Saver (v2.0)
 * Fixes:
 * - "Maximum call stack size exceeded" on large images (Chunked Processing).
 * - Transparent overlays blocking image detection (Deep Drill Logic).
 * - Global URL matching if coordinate drilling fails.
 * - Filenames are now seed_checksum (CRC32 of the final file bytes).
 * - Titled frames: prompt/seed recovered from the tile via a MAIN-world
 *   page hook (injected.js), since isolated content scripts cannot read
 *   the tile's JS output object; history-lightbox seed via info panel.
 */

let lastX = 0;
let lastY = 0;

// Bump with each release; printed to the tab console so you can confirm
// which version is actually running in the page.
const PMS_VERSION = '2.0';
try { console.info('[Perchance Meta-Saver] content script v' + PMS_VERSION + ' loaded'); } catch (loadLogErr) {}

// ---- Page-hook bridge (tile outputs live in the page's MAIN world and are
// invisible to this isolated world, so a tiny injected script reads them) ----
let pmsSeq = 0;
const pmsPending = new Map();

function ensureHook() {
    try {
        if (document.getElementById('pms-hook')) return;
        const s = document.createElement('script');
        s.id = 'pms-hook';
        s.src = chrome.runtime.getURL('injected.js');
        (document.head || document.documentElement).appendChild(s);
    } catch (hookErr) {}
}
try { ensureHook(); } catch (e) {}

window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== 'pms-hook' || d.cmd !== 'tileMeta-result') return;
    if (d.v !== 1) return; // stale hook copy from a future update: ignore
    const cb = pmsPending.get(d.id);
    if (cb) { pmsPending.delete(d.id); try { cb(d.result); } catch (e2) {} }
});

// Ask the page hook for the tile behind a click. Resolves null when the
// hook is unreachable or no tile matches (timeouts are normal off-tile).
function queryTileMeta(src, x, y) {
    try { ensureHook(); } catch (e) {}
    return new Promise((resolve) => {
        const id = ++pmsSeq;
        pmsPending.set(id, resolve);
        window.postMessage({ source: 'pms-hook', cmd: 'tileMeta', id: id, src: src, x: x, y: y }, '*');
        setTimeout(() => {
            if (pmsPending.has(id)) { pmsPending.delete(id); resolve(null); }
        }, 1500);
    });
}

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
 * CRC32 (IEEE) of raw bytes -> 8 lowercase hex chars.
 * Used for the <checksum> half of the seed_checksum filename.
 */
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32hex(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return ((c ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0');
}

function dataUrlToBytes(dataUrl) {
    const binaryString = atob(dataUrl.split(',')[1]);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
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
    let fullMetadata = img.title || img.getAttribute("data-title") || img.alt || "";
    let metaSource = fullMetadata ? 'img-attrs' : 'none';
    // __TPS_TILE_META_BEGIN
    // Titled (flattened overlay) frames carry no metadata on the <img>
    // itself (alt is empty). The finished output lives on the tile iframe
    // as a JS property, which this isolated world cannot read directly,
    // so ask the MAIN-world page hook (injected.js) for it. Live frames
    // are unaffected: their <img> already carries metadata, so this is skipped.
    try {
        if (!fullMetadata) {
            const tm = await queryTileMeta(url, lastX, lastY);
            if (tm && (tm.prompt || tm.seed)) {
                fullMetadata = tm.seed ? ((tm.prompt || "") + " seed:" + tm.seed) : (tm.prompt || "");
                metaSource = 'tile-hook';
            }
        }
    } catch (tileMetaErr) {}
    // History lightbox: its frame output carries prompt only (no seed),
    // so fill a missing seed from the lightbox info panel text.
    try {
        if (!/seed[=:\s]\d+/i.test(fullMetadata)) {
            const lbImg = document.getElementById('history-lightbox-img');
            if (lbImg && (img === lbImg || (img.src && img.src === lbImg.src))) {
                const infoEl = document.getElementById('history-lightbox-info');
                const t = infoEl ? (infoEl.textContent || '') : '';
                const lsm = t.match(/Seed:\s*(\d+)/i);
                if (lsm) {
                    fullMetadata = (fullMetadata ? fullMetadata : 'perchance_image') + ' seed:' + lsm[1];
                    metaSource = metaSource === 'none' ? 'lightbox-info' : (metaSource + '+lightbox-info');
                }
            }
        }
    } catch (lightboxErr) {}
    // Fallback for layouts that store metadata on ancestor elements.
    try {
        if (!fullMetadata) {
            let el = img.parentElement;
            while (el && el !== document.body && el !== document.documentElement) {
                const t = el.getAttribute ? (el.getAttribute('data-prompt') || el.getAttribute('data-title') || el.title) : '';
                const sd = el.getAttribute ? el.getAttribute('data-seed') : '';
                if (t || sd) {
                    fullMetadata = sd ? ((t || '') + ' seed:' + sd) : (t || '');
                    metaSource = 'ancestor-attrs';
                    break;
                }
                el = el.parentElement;
            }
        }
    } catch (ancestorErr) {}
    // __TPS_TILE_META_END
    try {
        const diagSeed = (fullMetadata.match(/seed[=:\s](\d+)/i) || [])[1] || 'none';
        console.info('[Perchance Meta-Saver v' + PMS_VERSION + '] metadata source: ' + metaSource + ', seed: ' + diagSeed);
    } catch (logErr) {}
    const splitMatch = fullMetadata.match(/^(.*?)(?=\s*seed[=:\s])/i);
    const promptOnly = splitMatch ? splitMatch[1].trim() : (fullMetadata || "perchance_image");
    const seedMatch = fullMetadata.match(/seed[=:\s](\d+)/i);
    const seedPart = seedMatch ? seedMatch[1] : `perchance_${Date.now()}`;

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

                // Filename = seed_checksum, where checksum = CRC32 of the
                // FINAL file bytes (after EXIF/XMP embedding), 8 lowercase hex.
                const fileName = `${seedPart}_${crc32hex(dataUrlToBytes(finalJpeg))}.jpg`;

                // Trigger Download
                const link = document.createElement('a');
                link.href = finalJpeg;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                if (seedMatch) {
                    showToast(`✅ Saved: ${fileName}`);
                } else {
                    // No seed found anywhere (no tile output, no ancestor
                    // metadata): saved anyway, but the name can't carry one.
                    showToast(`⚠️ Saved without seed: ${fileName}`, "#e67e22");
                }
            };
            tempImg.src = reader.result;
        };
        reader.readAsDataURL(blob);
    } catch (err) {
        console.error("Fetch/Process Failed:", err);
        showToast("❌ Download failed", "#e74c3c");
    }
}