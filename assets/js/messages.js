/**
 * messages.js — desktop chat panel + mobile chat screen
 */

const REPLIES = [
  "That sounds wonderful! 😊",
  "Haha, yes exactly! I totally agree.",
  "I'd love that! When are you thinking?",
  "You have great taste 🎨",
  "Saturday works perfectly for me!",
  "Can't wait — this is going to be fun ✨",
  "Tell me more, I'm intrigued 👀",
  "Okay okay, you've convinced me 😄",
  "That's actually a great idea!",
  "I was thinking the same thing 😌"
];
let replyIdx = 0;
let typingTimeout = null;

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollBottom(listEl) {
  if (listEl) listEl.scrollTop = listEl.scrollHeight;
}

function addSentBubble(listEl, text) {
  const typing = listEl.querySelector('.typing-indicator');
  const row = document.createElement('div');
  row.className = 'msg-row sent';
  row.innerHTML = `
    <div class="msg-bubble-group">
      <div class="msg-bubble">${escapeHTML(text)}</div>
      <div class="msg-time">${formatTime()}
        <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><path d="M18 7l-1.41-1.41-6.34 6.34-2.83-2.83-1.41 1.41 4.24 4.24 7.75-7.75zm-14 5l4.24 4.24 9.17-9.17-1.41-1.41-7.76 7.75-2.83-2.83L4 12z"/></svg>
      </div>
    </div>`;
  if (typing) listEl.insertBefore(row, typing);
  else listEl.appendChild(row);
  scrollBottom(listEl);
}

function addReceivedBubble(listEl, text) {
  const typing = listEl.querySelector('.typing-indicator');
  const row = document.createElement('div');
  row.className = 'msg-row received';
  row.innerHTML = `
    <div class="msg-bubble-avatar">👩</div>
    <div class="msg-bubble-group">
      <div class="msg-bubble">${escapeHTML(text)}</div>
      <div class="msg-time">${formatTime()}</div>
    </div>`;
  if (typing) listEl.insertBefore(row, typing);
  else listEl.appendChild(row);
  scrollBottom(listEl);
}

function setTypingVisible(listEl, visible) {
  const t = listEl ? listEl.querySelector('.typing-indicator') : null;
  if (t) t.style.display = visible ? 'flex' : 'none';
}

function simulateReply(listEl) {
  if (typingTimeout) clearTimeout(typingTimeout);
  setTypingVisible(listEl, true);
  scrollBottom(listEl);
  typingTimeout = setTimeout(() => {
    setTypingVisible(listEl, false);
    addReceivedBubble(listEl, REPLIES[replyIdx % REPLIES.length]);
    replyIdx++;
  }, 1300 + Math.random() * 700);
}

function wireSend(inputId, sendBtnId, listId) {
  const input   = document.getElementById(inputId);
  const sendBtn = document.getElementById(sendBtnId);
  const getList = () => document.getElementById(listId);

  function send() {
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addSentBubble(getList(), text);
    simulateReply(getList());
  }

  if (sendBtn) sendBtn.addEventListener('click', send);
  if (input)   input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
}

export function initMessages() {
  // Desktop chat panel
  wireSend('msg-input', 'msg-send-btn', 'desktop-msg-list');
  // Mobile messages screen
  wireSend('mobile-msg-input', 'mobile-msg-send-btn', 'mobile-msg-list');

  // Scroll desktop list to bottom on load
  setTimeout(() => {
    const list = document.getElementById('desktop-msg-list');
    if (list) list.scrollTop = list.scrollHeight;
  }, 100);
}
