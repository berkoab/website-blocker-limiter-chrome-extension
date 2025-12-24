// Popup script - Simplified and debugged version
console.log('Popup script loaded');

let passwordHash = null;

// Simple hash function
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Show status message
function showStatus(message, isError = false) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'status show ' + (isError ? 'error' : 'success');
  setTimeout(() => {
    status.className = 'status';
  }, 3000);
}

// Load data
async function loadData() {
  try {
    const data = await chrome.storage.local.get(['passwordHash', 'blockedSites', 'timeLimitedSites', 'timeUsage', 'securityQuestion', 'securityAnswerHash']);
    passwordHash = data.passwordHash || null;
    
    console.log('Loaded data:', data);
    
    const passwordSetup = document.getElementById('passwordSetup');
    const mainSection = document.getElementById('mainSection');
    const listsSection = document.getElementById('listsSection');
    const timeSection = document.getElementById('timeSection');
    const resetSection = document.getElementById('resetSection');
    
    // Check if elements exist before accessing style
    if (!passwordSetup || !mainSection || !listsSection || !timeSection || !resetSection) {
      console.error('Some UI elements are missing');
      return;
    }
    
    if (!passwordHash) {
      passwordSetup.style.display = 'block';
      mainSection.style.display = 'none';
      listsSection.style.display = 'none';
      timeSection.style.display = 'none';
      resetSection.style.display = 'none';
    } else {
      passwordSetup.style.display = 'none';
      mainSection.style.display = 'block';
      listsSection.style.display = 'block';
      timeSection.style.display = 'block';
      resetSection.style.display = 'none';
    }
    
    displayBlockedSites(data.blockedSites || []);
    displayTimeLimitedSites(data.timeLimitedSites || [], data.timeUsage || {});
  } catch (error) {
    console.error('Error loading data:', error);
    showStatus('Error loading data: ' + error.message, true);
  }
}

// Display blocked sites
function displayBlockedSites(sites) {
  const list = document.getElementById('blockedList');
  if (sites.length === 0) {
    list.innerHTML = '<p style="color: #999; font-size: 13px;">No blocked websites</p>';
    return;
  }
  
  list.innerHTML = sites.map(site => `
    <div class="website-item">
      <div class="website-info">
        <div class="website-url">${escapeHtml(site)}</div>
      </div>
      <button class="delete" data-url="${escapeHtml(site)}" data-type="blocked">Remove</button>
    </div>
  `).join('');
  
  list.querySelectorAll('button.delete').forEach(btn => {
    btn.addEventListener('click', () => removeSite(btn.dataset.url, btn.dataset.type));
  });
}

// Display time-limited sites
function displayTimeLimitedSites(sites, usage) {
  const list = document.getElementById('timeLimitedList');
  if (sites.length === 0) {
    list.innerHTML = '<p style="color: #999; font-size: 13px;">No time-limited websites</p>';
    return;
  }
  
  const today = new Date().toDateString();
  
  list.innerHTML = sites.map(site => {
    const used = (usage[site.url] && usage[site.url].date === today) 
      ? Math.floor(usage[site.url].time / 60) 
      : 0;
    const remaining = Math.max(0, site.limit - used);
    
    return `
      <div class="website-item">
        <div class="website-info">
          <div class="website-url">${escapeHtml(site.url)}</div>
          <div class="time-info">Limit: ${site.limit}min/day | Used: ${used}min | Remaining: ${remaining}min</div>
        </div>
        <button class="delete" data-url="${escapeHtml(site.url)}" data-type="timelimited">Remove</button>
      </div>
    `;
  }).join('');
  
  list.querySelectorAll('button.delete').forEach(btn => {
    btn.addEventListener('click', () => removeSite(btn.dataset.url, btn.dataset.type));
  });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Normalize URL
function normalizeUrl(url) {
  url = url.trim();
  
  // Remove protocol
  url = url.replace(/^https?:\/\//, '');
  
  // Remove www
  url = url.replace(/^www\./, '');
  
  // If it has a path, keep it (for specific page blocking)
  // Otherwise just return the domain
  if (url.includes('/')) {
    // Check if it's just a trailing slash
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    // If there's actual path content, keep full URL
    if (url.split('/')[1]) {
      return url;
    }
  }
  
  // Just domain
  return url.split('/')[0];
}

// Add website function
async function addWebsite() {
  console.log('Add website clicked');
  
  if (!passwordHash) {
    showStatus('Please set a password first', true);
    return;
  }
  
  let url = document.getElementById('websiteUrl').value.trim();
  if (!url) {
    showStatus('Please enter a URL', true);
    return;
  }
  
  url = normalizeUrl(url);
  console.log('Normalized URL:', url);
  
  const blockType = document.querySelector('input[name="blockType"]:checked').value;
  const data = await chrome.storage.local.get(['blockedSites', 'timeLimitedSites']);
  
  try {
    if (blockType === 'full') {
      const blockedSites = data.blockedSites || [];
      if (blockedSites.includes(url)) {
        showStatus('Website already blocked', true);
        return;
      }
      blockedSites.push(url);
      await chrome.storage.local.set({ blockedSites });
      console.log('Blocked sites updated:', blockedSites);
      showStatus('✅ Website blocked successfully!');
    } else {
      const timeLimit = parseInt(document.getElementById('timeLimit').value);
      if (!timeLimit || timeLimit < 1) {
        showStatus('Please enter a valid time limit', true);
        return;
      }
      
      const timeLimitedSites = data.timeLimitedSites || [];
      if (timeLimitedSites.find(s => s.url === url)) {
        showStatus('Website already has a time limit', true);
        return;
      }
      
      timeLimitedSites.push({ url, limit: timeLimit });
      await chrome.storage.local.set({ timeLimitedSites });
      console.log('Time limited sites updated:', timeLimitedSites);
      showStatus('✅ Time limit set successfully!');
    }
    
    document.getElementById('websiteUrl').value = '';
    await loadData();
  } catch (error) {
    console.error('Error adding website:', error);
    showStatus('Error: ' + error.message, true);
  }
}

// Remove website
async function removeSite(url, type) {
  // Show password modal
  const modal = document.getElementById('passwordModal');
  const removeUrlEl = document.getElementById('removeUrl');
  const confirmPasswordInput = document.getElementById('modalConfirmPassword');
  
  removeUrlEl.textContent = url;
  confirmPasswordInput.value = '';
  modal.style.display = 'flex';
  
  // Focus after a short delay to ensure modal is visible
  setTimeout(() => {
    confirmPasswordInput.focus();
  }, 100);
  
  // Store the removal info
  window.pendingRemoval = { url, type };
}

// Handle password modal
function setupPasswordModal() {
  const modal = document.getElementById('passwordModal');
  const confirmPasswordInput = document.getElementById('modalConfirmPassword');
  const confirmBtn = document.getElementById('confirmRemoveBtn');
  const cancelBtn = document.getElementById('cancelRemoveBtn');
  
  if (!modal || !confirmPasswordInput || !confirmBtn || !cancelBtn) {
    console.error('Password modal elements not found');
    console.log('modal:', modal);
    console.log('input:', confirmPasswordInput);
    console.log('confirm:', confirmBtn);
    console.log('cancel:', cancelBtn);
    return;
  }
  
  console.log('Setting up password modal');
  
  // Confirm removal
  const confirmRemoval = async () => {
    console.log('Confirm removal called');
    console.log('Input element:', confirmPasswordInput);
    console.log('Input value:', confirmPasswordInput.value);
    
    const password = confirmPasswordInput.value.trim();
    
    console.log('Password entered, length:', password.length);
    
    if (!password) {
      console.log('No password entered');
      showStatus('Please enter password', true);
      return;
    }
    
    const hash = await hashPassword(password);
    console.log('Password hash matches:', hash === passwordHash);
    
    if (hash !== passwordHash) {
      showStatus('❌ Incorrect password', true);
      confirmPasswordInput.value = '';
      confirmPasswordInput.focus();
      return;
    }
    
    // Password correct, remove the site
    if (!window.pendingRemoval) {
      console.error('No pending removal found');
      showStatus('Error: No pending removal', true);
      modal.style.display = 'none';
      return;
    }
    
    const { url, type } = window.pendingRemoval;
    console.log('Removing:', url, type);
    const data = await chrome.storage.local.get(['blockedSites', 'timeLimitedSites']);
    
    if (type === 'blocked') {
      const blockedSites = (data.blockedSites || []).filter(s => s !== url);
      await chrome.storage.local.set({ blockedSites });
    } else {
      const timeLimitedSites = (data.timeLimitedSites || []).filter(s => s.url !== url);
      await chrome.storage.local.set({ timeLimitedSites });
    }
    
    showStatus('✅ Website removed successfully!');
    modal.style.display = 'none';
    confirmPasswordInput.value = '';
    window.pendingRemoval = null;
    loadData();
  };
  
  // Cancel removal
  const cancelRemoval = () => {
    console.log('Cancel removal called');
    modal.style.display = 'none';
    confirmPasswordInput.value = '';
    window.pendingRemoval = null;
  };
  
  // Add event listeners
  confirmBtn.onclick = confirmRemoval;
  cancelBtn.onclick = cancelRemoval;
  
  console.log('Event listeners attached');
  
  // Allow Enter key
  confirmPasswordInput.onkeypress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmRemoval();
    }
  };
  
  // Click outside to close
  modal.onclick = (e) => {
    if (e.target === modal) {
      cancelRemoval();
    }
  };
}

// Wait for DOM to load
window.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, attaching listeners');
  
  let isResetting = false; // Flag to prevent auto-refresh during reset
  
  // Setup password modal for removals
  setupPasswordModal();
  
  // Set password button
  const setPasswordBtn = document.getElementById('setPasswordBtn');
  if (setPasswordBtn) {
    setPasswordBtn.addEventListener('click', async () => {
      console.log('Set password clicked');
      const newPass = document.getElementById('newPassword').value;
      const confirmPass = document.getElementById('confirmPassword').value;
      const securityQuestion = document.getElementById('securityQuestion').value;
      const securityAnswer = document.getElementById('securityAnswer').value.trim();
      
      if (!newPass) {
        showStatus('Please enter a password', true);
        return;
      }
      
      if (newPass.length < 4) {
        showStatus('Password must be at least 4 characters', true);
        return;
      }
      
      if (newPass !== confirmPass) {
        showStatus('Passwords do not match', true);
        return;
      }
      
      if (!securityQuestion) {
        showStatus('Please select a security question', true);
        return;
      }
      
      if (!securityAnswer) {
        showStatus('Please answer the security question', true);
        return;
      }
      
      try {
        const hash = await hashPassword(newPass);
        const answerHash = await hashPassword(securityAnswer.toLowerCase());
        
        await chrome.storage.local.set({ 
          passwordHash: hash,
          securityQuestion: securityQuestion,
          securityAnswerHash: answerHash
        });
        
        passwordHash = hash;
        
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        document.getElementById('securityAnswer').value = '';
        showStatus('✅ Password set successfully!');
        await loadData();
      } catch (error) {
        console.error('Error setting password:', error);
        showStatus('Error: ' + error.message, true);
      }
    });
  }

  // Add website button
  const addBtn = document.getElementById('addBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      console.log('Add button clicked');
      addWebsite();
    });
  }

  // Add current website button
  const addCurrentBtn = document.getElementById('addCurrentBtn');
  if (addCurrentBtn) {
    addCurrentBtn.addEventListener('click', async () => {
      console.log('Add current website clicked');
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log('Current tab:', tab);
        
        if (tab && tab.url) {
          if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
            showStatus('Cannot block Chrome system pages', true);
            return;
          }
          const url = new URL(tab.url);
          document.getElementById('websiteUrl').value = url.hostname;
          // Automatically add it
          await addWebsite();
        } else {
          showStatus('No active tab found', true);
        }
      } catch (error) {
        console.error('Error getting current tab:', error);
        showStatus('Error: ' + error.message, true);
      }
    });
  }

  // Handle block type radio change
  document.querySelectorAll('input[name="blockType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const timeLimitInput = document.getElementById('timeLimitInput');
      if (e.target.value === 'time') {
        timeLimitInput.classList.add('active');
      } else {
        timeLimitInput.classList.remove('active');
      }
    });
  });

  // Allow Enter key to add website
  const websiteUrl = document.getElementById('websiteUrl');
  if (websiteUrl) {
    websiteUrl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addWebsite();
      }
    });
  }

  // Forgot password button
  const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener('click', async () => {
      isResetting = true; // Stop auto-refresh
      
      const data = await chrome.storage.local.get(['securityQuestion']);
      
      if (!data.securityQuestion) {
        showStatus('No security question set. You must reset all data.', true);
        const confirm = window.confirm('Reset all data including blocked websites? This cannot be undone.');
        if (confirm) {
          await chrome.storage.local.clear();
          showStatus('✅ All data cleared. Please set a new password.');
          isResetting = false;
          await loadData();
        } else {
          isResetting = false;
        }
        return;
      }
      
      // Show reset section
      const questionTexts = {
        pet: "What is your first pet's name?",
        city: "What city were you born in?",
        school: "What is your mother's maiden name?",
        car: "What was your first car?",
        teacher: "What is your favorite teacher's name?"
      };
      
      document.getElementById('resetQuestionLabel').textContent = questionTexts[data.securityQuestion];
      document.getElementById('mainSection').style.display = 'none';
      document.getElementById('listsSection').style.display = 'none';
      document.getElementById('timeSection').style.display = 'none';
      document.getElementById('resetSection').style.display = 'block';
    });
  }

  // Reset password button
  const resetPasswordBtn = document.getElementById('resetPasswordBtn');
  if (resetPasswordBtn) {
    resetPasswordBtn.addEventListener('click', async () => {
      const answer = document.getElementById('resetAnswer').value.trim().toLowerCase();
      const newPass = document.getElementById('resetNewPassword').value;
      const confirmPass = document.getElementById('resetConfirmPassword').value;
      
      if (!answer) {
        showStatus('Please answer the security question', true);
        return;
      }
      
      if (!newPass || newPass.length < 4) {
        showStatus('Password must be at least 4 characters', true);
        return;
      }
      
      if (newPass !== confirmPass) {
        showStatus('Passwords do not match', true);
        return;
      }
      
      const data = await chrome.storage.local.get(['securityAnswerHash']);
      const answerHash = await hashPassword(answer);
      
      if (answerHash !== data.securityAnswerHash) {
        showStatus('❌ Incorrect answer to security question', true);
        return;
      }
      
      // Reset password
      const newHash = await hashPassword(newPass);
      await chrome.storage.local.set({ passwordHash: newHash });
      passwordHash = newHash;
      
      document.getElementById('resetAnswer').value = '';
      document.getElementById('resetNewPassword').value = '';
      document.getElementById('resetConfirmPassword').value = '';
      
      showStatus('✅ Password reset successfully!');
      isResetting = false; // Resume auto-refresh
      await loadData();
    });
  }

  // Cancel reset button
  const cancelResetBtn = document.getElementById('cancelResetBtn');
  if (cancelResetBtn) {
    cancelResetBtn.addEventListener('click', () => {
      document.getElementById('resetAnswer').value = '';
      document.getElementById('resetNewPassword').value = '';
      document.getElementById('resetConfirmPassword').value = '';
      isResetting = false; // Resume auto-refresh
      loadData();
    });
  }

  // Initial load
  console.log('Loading initial data...');
  loadData();
  
  // Refresh every 2 seconds (but not during reset)
  setInterval(() => {
    if (!isResetting) {
      loadData();
    }
  }, 2000);
});