/**
 * profile.js — toggle switches and profile settings interactivity
 */

export function initProfile() {
  // Toggle switches
  document.querySelectorAll('.toggle').forEach(toggle => {
    toggle.addEventListener('click', () => toggle.classList.toggle('off'));
  });

  // Setting rows with chevron — placeholder for future routing
  document.querySelectorAll('.setting-row').forEach(row => {
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') row.click();
    });
    // Accessibility
    if (!row.getAttribute('tabindex')) row.setAttribute('tabindex', '0');
  });
}
