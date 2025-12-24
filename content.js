// Content script - checks if page should be blocked
(async function() {
  const response = await chrome.runtime.sendMessage({
    action: 'checkBlock',
    url: window.location.href
  });
  
  if (response && response.blocked) {
    window.stop();
    document.documentElement.innerHTML = '';
    window.location.href = chrome.runtime.getURL('blocked.html') + 
      '?reason=' + response.reason + 
      '&limit=' + (response.limit || '') +
      '&url=' + encodeURIComponent(window.location.href);
  }
})();