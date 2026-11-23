# Perchance Image Metadata Saver (v1.7)

A browser extension for Perchance AI users to save images with full prompt and seed metadata embedded directly into the file.

### 🌟 Features
* **EXIF Support:** Stores the prompt in the "Image Description" field.
* **XMP Support:** Injects searchable keywords and descriptions (Perfect for Adobe Bridge, XnViewMP, and macOS Finder).
* **Automatic Naming:** Files are named by seed and checksum (e.g., \12345_9ef3697f.jpg`), where the checksum is CRC32 of the final file bytes.
* **Overlay Bypass:** Works even on generators with transparent overlays.

### 🛠 Installation (Developer Mode)
Since this is not on the Chrome Web Store yet, users can install it manually:
1. Download this repository as a ZIP (Click the green 'Code' button > Download ZIP).
2. Unzip the folder on your computer.
3. Open your browser and go to `chrome://extensions` (or `opera://extensions`).
4. Enable **Developer Mode** (top right toggle).
5. Click **Load unpacked** and select the unzipped folder.

### 📸 How to Use
1. Generate an image on Perchance.
2. Right-click the image and select **"Save Image with Prompt"**.
3. Your image will download with all metadata included!
