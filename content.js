<!-- ===================== content.js ===================== -->
<!-- Save as: content.js -->
<script>
/**
 * Goal: given info.srcUrl (from context menu click), find the corresponding image element
 * and extract:
 *  - titleText: from attribute/title-like fields
 *  - seed: from within titleText (seed=12345)
 *
 * Optimized for generator pages where metadata is stored in title/aria-label/data-*.
 */

function extractSeed(titleText) {
  if (!titleText) return "";
  const m = titleText.match(/seed\s*=\s*([0-9]+)/i);
  return m ? m[1] : "";
}

function bestTitleForImage(img) {
  if (!img) return "";

  // priority: actual title attribute on img
  const direct =
    img.getAttribute("title") ||
    img.title ||
    img.getAttribute("data-title") ||
    img.getAttribute("data-prompt") ||
    img.getAttribute("aria-label") ||
    img.alt;

  if (direct && direct.trim()) return direct.trim();

  // check nearby container (common in generator UIs)
  const host = img.closest("[title],[data-title],[data-prompt],[aria-label]");
  if (host) {
    const t =
      host.getAttribute("title") ||
      host.getAttribute("data-title") ||
      host.getAttribute("data-prompt") ||
      host.getAttribute("aria-label");
    if (t && t.trim()) return t.trim();
  }

  // sometimes metadata is in a sibling caption element
  const fig = img.closest("figure");
  if (fig) {
    const cap = fig.querySelector("figcaption");
    if (cap && cap.textContent.trim()) return cap.textContent.trim();
  }

  return "";
}

function findImageBySrcUrl(srcUrl) {
  // Exact match
  const imgs = Array.from(document.images || []);
  let img = imgs.find(i => i.currentSrc === srcUrl || i.src === srcUrl);
  if (img) return img;

  // Some sites use blob URLs or transformed URLs; try "includes" heuristic
  try {
    const u = new URL(srcUrl);
    const key = (u.pathname.split("/").pop() || "").slice(0, 24);
    if (key) {
      img = imgs.find(i => (i.currentSrc || i.src || "").includes(key));
      if (img) return img;
    }
  } catch {}

  return null;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "AI_EXIF_GET_IMAGE_INFO") return;

  const img = findImageBySrcUrl(msg.srcUrl);
  const titleText = bestTitleForImage(img);
  const seed = extractSeed(titleText);

  sendResponse({
    titleText,
    seed
  });

  // synchronous response
});
</script>
