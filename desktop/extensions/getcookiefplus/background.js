function checkHost(url) {
  try {
    return String(url || "").split("/")[2].indexOf("facebook.com") > -1;
  } catch (_) {
    return false;
  }
}

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (changeInfo.status !== "complete" || !checkHost(tab && tab.url)) return;
  chrome.storage.local.get("enableGetUidIcon", function (settings) {
    if (settings.enableGetUidIcon === "0") return;
    chrome.tabs.executeScript(tabId, { files: ["timuid.js"] });
    if (chrome.tabs.insertCSS) chrome.tabs.insertCSS(tabId, { file: "timuid.css" });
  });
});
