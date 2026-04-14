/**
 * discover.js — handles Like / Nope / Reveal interactions only
 * Cards are rendered directly in index.html for reliability
 */

export function revealPhoto(id) {
  const photoArea = document.getElementById('photo-' + id);
  if (!photoArea || photoArea.classList.contains('revealed')) return;

  const avatars = {
    sarah:   { emoji: '👩', gradient: 'linear-gradient(160deg,#7c3aed,#ec4899,#f59e0b)' },
    jessica: { emoji: '👩‍🦰', gradient: 'linear-gradient(160deg,#0ea5e9,#6366f1,#10b981)' },
  };
  const p = avatars[id] || { emoji: '👤', gradient: 'linear-gradient(160deg,#334155,#475569)' };

  photoArea.classList.add('revealed');
  const placeholder = photoArea.querySelector('.photo-placeholder');
  if (placeholder) {
    placeholder.innerHTML = `
      <div class="photo-avatar" style="background:${p.gradient}">
        <span class="avatar-icon">${p.emoji}</span>
      </div>`;
  }

  const btn  = photoArea.querySelector('.reveal-btn');
  const note = photoArea.querySelector('.matched-note');
  if (btn)  btn.style.display = 'none';
  if (note) note.style.display = 'none';
}

function flashCard(id, type) {
  const flash = document.getElementById('flash-' + type + '-' + id);
  const card  = document.getElementById('card-' + id);
  if (!flash || !card) return;

  flash.innerHTML  = type === 'like' ? '💚' : '✕';
  if (type === 'nope') { flash.style.color = '#FE3C72'; flash.style.fontSize = '72px'; }
  flash.classList.add('active');
  card.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
  card.style.transform  = type === 'like' ? 'translateX(80px) rotate(8deg)' : 'translateX(-80px) rotate(-8deg)';
  card.style.opacity    = '0.6';

  setTimeout(() => {
    flash.classList.remove('active');
    card.style.transform = '';
    card.style.opacity   = '';
  }, 700);
}

export function triggerLike(id) { flashCard(id, 'like'); }
export function triggerNope(id) { flashCard(id, 'nope'); }

export function initDiscover() {
  // Reveal buttons
  document.querySelectorAll('[data-reveal]').forEach(btn => {
    btn.addEventListener('click', () => revealPhoto(btn.dataset.reveal));
  });

  // Like / Nope / Super / Boost buttons
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { action, id } = btn.dataset;
      if (action === 'like'  || action === 'super') triggerLike(id);
      if (action === 'nope') triggerNope(id);
    });
  });
}
