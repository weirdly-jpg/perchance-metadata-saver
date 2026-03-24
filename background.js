// This must be the first line
try {
  importScripts('piexif.js');
} catch (e) {
  console.error("Library load failed:", e);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "savePerchanceImage",
    title: "Save with EXIF Metadata",
    contexts: ["image"],
    documentUrlPatterns: ["*://*.perchance.org/*"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "savePerchanceImage") {
    chrome.tabs.sendMessage(tab.id, {
      action: "processImage",
      url: info.srcUrl
    });
  }
});