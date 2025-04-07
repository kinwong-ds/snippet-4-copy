// background.js

// Listen for the extension's toolbar icon being clicked
chrome.action.onClicked.addListener((tab) => {
  // Check if the side panel API is available
  if (chrome.sidePanel) {
    // Open the side panel for the current tab
    chrome.sidePanel.open({ windowId: tab.windowId });
  } else {
    console.error("Side Panel API not available.");
  }
});