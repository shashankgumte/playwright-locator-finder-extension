chrome.runtime.onInstalled.addListener(() => {
    console.log('Playwright Locator Finder extension installed');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    // This will open the popup, which is handled by the popup.html
});