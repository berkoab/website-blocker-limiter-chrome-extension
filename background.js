// Background service worker
let timeTracking = {};

// Check if URL matches blocked site
function matchesSite(url, blockedSite) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/^www\./, '');
    const blockedDomain = blockedSite.replace(/^www\./, '');
    
    // Check if it's a domain block or specific URL block
    if (blockedSite.includes('/')) {
      // Specific URL block
      return url.includes(blockedSite);
    } else {
      // Domain block
      return hostname === blockedDomain || hostname.endsWith('.' + blockedDomain);
    }
  } catch (e) {
    return false;
  }
}

// Check if site should be blocked
async function shouldBlockSite(url) {
  const data = await chrome.storage.local.get(['blockedSites', 'timeLimitedSites', 'timeUsage']);
  const blockedSites = data.blockedSites || [];
  const timeLimitedSites = data.timeLimitedSites || [];
  const timeUsage = data.timeUsage || {};
  
  // Check full blocks
  for (const site of blockedSites) {
    if (matchesSite(url, site)) {
      return { blocked: true, reason: 'fully-blocked' };
    }
  }
  
  // Check time limits
  const today = new Date().toDateString();
  for (const site of timeLimitedSites) {
    if (matchesSite(url, site.url)) {
      const usage = timeUsage[site.url];
      if (usage && usage.date === today && usage.time >= site.limit * 60) {
        return { blocked: true, reason: 'time-exceeded', limit: site.limit };
      }
      return { blocked: false, timeLimited: true, site: site.url, limit: site.limit };
    }
  }
  
  return { blocked: false };
}

// Update time usage
async function updateTimeUsage(url, seconds) {
  const data = await chrome.storage.local.get(['timeLimitedSites', 'timeUsage']);
  const timeLimitedSites = data.timeLimitedSites || [];
  const timeUsage = data.timeUsage || {};
  const today = new Date().toDateString();
  
  for (const site of timeLimitedSites) {
    if (matchesSite(url, site.url)) {
      if (!timeUsage[site.url] || timeUsage[site.url].date !== today) {
        timeUsage[site.url] = { date: today, time: 0 };
      }
      timeUsage[site.url].time += seconds;
      await chrome.storage.local.set({ timeUsage });
      
      // Check if limit exceeded
      if (timeUsage[site.url].time >= site.limit * 60) {
        // Reload the tab to trigger block
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.url && matchesSite(tab.url, site.url)) {
            chrome.tabs.reload(tab.id);
          }
        }
      }
      break;
    }
  }
}

// Track time on tabs
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url) {
    startTracking(activeInfo.tabId, tab.url);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    startTracking(tabId, changeInfo.url);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    stopAllTracking();
  } else {
    chrome.tabs.query({ active: true, windowId }, (tabs) => {
      if (tabs[0]) {
        startTracking(tabs[0].id, tabs[0].url);
      }
    });
  }
});

function startTracking(tabId, url) {
  stopAllTracking();
  
  shouldBlockSite(url).then(result => {
    if (result.timeLimited) {
      timeTracking[tabId] = {
        url: url,
        site: result.site,
        startTime: Date.now()
      };
    }
  });
}

function stopAllTracking() {
  for (const tabId in timeTracking) {
    const tracking = timeTracking[tabId];
    const elapsed = Math.floor((Date.now() - tracking.startTime) / 1000);
    if (elapsed > 0) {
      updateTimeUsage(tracking.url, elapsed);
    }
  }
  timeTracking = {};
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (timeTracking[tabId]) {
    const tracking = timeTracking[tabId];
    const elapsed = Math.floor((Date.now() - tracking.startTime) / 1000);
    if (elapsed > 0) {
      updateTimeUsage(tracking.url, elapsed);
    }
    delete timeTracking[tabId];
  }
});

// Periodic save (every 5 seconds)
setInterval(() => {
  for (const tabId in timeTracking) {
    const tracking = timeTracking[tabId];
    const elapsed = Math.floor((Date.now() - tracking.startTime) / 1000);
    if (elapsed >= 5) {
      updateTimeUsage(tracking.url, elapsed);
      tracking.startTime = Date.now();
    }
  }
}, 5000);

// Handle navigation
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  
  const result = await shouldBlockSite(details.url);
  if (result.blocked) {
    chrome.tabs.update(details.tabId, {
      url: chrome.runtime.getURL('blocked.html') + 
           '?reason=' + result.reason + 
           '&limit=' + (result.limit || '') +
           '&url=' + encodeURIComponent(details.url)
    });
  }
});

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkBlock') {
    shouldBlockSite(request.url).then(sendResponse);
    return true;
  }
});