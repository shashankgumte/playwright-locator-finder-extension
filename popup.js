document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startInspect');
    const resultsDiv = document.getElementById('results');
    
    startBtn.addEventListener('click', async () => {
        try {
            // Get active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                throw new Error('No active tab found');
            }
            
            // Check if it's a valid web page
            if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) {
                throw new Error('Can only inspect web pages (http:// or https://)');
            }
            
            // Inject content script
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
            
            // Show success message briefly
            resultsDiv.textContent = 'Inspection started! Check the webpage.';
            resultsDiv.style.color = 'green';
            
            // Close popup after a short delay
            setTimeout(() => {
                window.close();
            }, 1000);
            
        } catch (error) {
            console.error('Error:', error);
            resultsDiv.textContent = `Error: ${error.message}`;
            resultsDiv.style.color = 'red';
        }
    });
});