// docs/site/assets/nav.js — Sidebar navigation + back-to-top + active state

(function() {
  'use strict';

  // ─── Active Sidebar Link ───────────────────────────
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.sidebar__link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage) {
      link.classList.add('active');
    }
  });

  // ─── Sidebar Toggle ────────────────────────────────
  const toggleBtn = document.getElementById('sidebarToggle');
  const layout = document.querySelector('.layout');

  if (toggleBtn && layout) {
    // Restore collapsed state
    if (localStorage.getItem('sidebar-collapsed') === 'true') {
      layout.classList.add('sidebar-collapsed');
    }
    toggleBtn.addEventListener('click', () => {
      const collapsed = layout.classList.toggle('sidebar-collapsed');
      localStorage.setItem('sidebar-collapsed', String(collapsed));
    });
  }

  // ─── Back to Top ──────────────────────────────────
  const backToTop = document.getElementById('backToTop');
  if (backToTop) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) {
        backToTop.classList.add('visible');
      } else {
        backToTop.classList.remove('visible');
      }
    });
    backToTop.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ─── Smooth Scroll for Anchor Links ───────────────
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ─── Keyboard Navigation ───────────────────────────
  document.addEventListener('keydown', (e) => {
    // ESC: close any open lightbox
    if (e.key === 'Escape') {
      const lb = document.querySelector('.lightbox.active');
      if (lb) lb.classList.remove('active');
    }
  });

})();
