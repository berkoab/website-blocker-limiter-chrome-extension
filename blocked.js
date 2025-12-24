// Blocked page script
const params = new URLSearchParams(window.location.search);
const reason = params.get('reason');
const limit = params.get('limit');
const url = params.get('url');

document.getElementById('blockedUrl').textContent = decodeURIComponent(url || '');

if (reason === 'time-exceeded') {
  document.getElementById('title').textContent = 'Time Limit Exceeded';
  document.getElementById('message').textContent = 
    'You have reached your daily time limit for this website.';
  document.getElementById('timeInfo').style.display = 'block';
  document.getElementById('timeInfo').innerHTML = 
    `<strong>Daily Limit:</strong> ${limit} minutes<br>` +
    `<strong>Status:</strong> Limit reached for today<br>` +
    `<em>This website will be accessible again tomorrow.</em>`;
} else {
  document.getElementById('message').textContent = 
    'This website has been blocked by your website blocker extension.';
}