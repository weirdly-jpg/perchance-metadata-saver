console.log("Perchance EXIF Saver: Content Script Loaded");

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.action === "processImage") {
    try {
      const { url } = msg;
      
      // 1. Find the image element to get the 'title'
      const imgElement = document.querySelector(`img[src="${url}"]`);
      const metadata = imgElement ? imgElement.title : "No metadata found";
      
      // 2. Fetch the image data
      const response = await fetch(url);
      const blob = await response.blob();
      const imgBitmap = await createImageBitmap(blob);

      // 3. Draw to canvas (to get JPEG for piexif compatibility)
      const canvas = document.createElement('canvas');
      canvas.width = imgBitmap.width;
      canvas.height = imgBitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgBitmap, 0, 0);
      const jpegData = canvas.toDataURL("image/jpeg", 0.95);

      // 4. Inject EXIF (piexif must be loaded in manifest before this script)
      const zeroth = {};
      const exif = {};
      // 0x9286 is the UserComment tag
      exif[piexif.ExifIFD.UserComment] = metadata; 
      const exifObj = {"0th": zeroth, "Exif": exif};
      const exifBytes = piexif.dump(exifObj);
      const modifiedJpeg = piexif.insert(exifBytes, jpegData);

      // 5. Parse filename (Seed)
      const seedMatch = metadata.match(/seed=(\d+)/);
      const fileName = seedMatch ? `${seedMatch[1]}.jpg` : `perchance_${Date.now()}.jpg`;

      // 6. Trigger Download
      const link = document.createElement('a');
      link.href = modifiedJpeg;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error("Perchance EXIF Saver Error:", error);
    }
  }
});