/**
 * Perchance EXIF Saver - Background Script
 * Handles the context menu creation and communication.
 */

// 1. Create the right-click menu item when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "perchanceSaveWithMetadata",
    title: "Save Image with Prompt (EXIF/XMP)",
    contexts: ["image"],
    documentUrlPatterns: ["https://*.perchance.org/*", "https://*.perchance.io/*"]
  });
});

// 2. Listen for when the user clicks the menu item
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "perchanceSaveWithMetadata") {
    // Send a message to the content script in the specific tab/frame that was clicked
    chrome.tabs.sendMessage(tab.id, {
      action: "processImage",
      url: info.srcUrl
    }, { frameId: info.frameId }); // frameId is crucial for Perchance's iframe setup
  }
});