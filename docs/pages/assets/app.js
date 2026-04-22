// docs/pages/assets/app.js
const currentPage = location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.sidebar__link').forEach(link => {
  if (link.getAttribute('href') === currentPage) link.classList.add('active');
});

const lightbox = document.createElement('div');
lightbox.className = 'lightbox';
lightbox.innerHTML = '<span class="lightbox__close">&#x2715;</span><div class="lightbox__content"></div>';
document.body.appendChild(lightbox);
lightbox.querySelector('.lightbox__close').addEventListener('click', () => lightbox.classList.remove('active'));
lightbox.addEventListener('click', e => { if (e.target === lightbox) lightbox.classList.remove('active'); });
document.querySelectorAll('.diagram-container').forEach(el => {
  el.addEventListener('click', () => {
    const clone = el.cloneNode(true);
    lightbox.querySelector('.lightbox__content').innerHTML = '';
    lightbox.querySelector('.lightbox__content').appendChild(clone);
    lightbox.classList.add('active');
    if (window.mermaid) mermaid.run({ nodes: lightbox.querySelectorAll('.mermaid:not([data-processed])') });
  });
});

let searchData = null;
async function initSearch() {
  try { const res = await fetch('search-data.json'); if (res.ok) searchData = await res.json(); } catch {}
}
const searchInput = document.querySelector('.search-input');
const searchResultsEl = document.querySelector('.search-results');
searchInput?.addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  if (!q || !searchData || !searchResultsEl) { if (searchResultsEl) searchResultsEl.style.display = 'none'; return; }
  const hits = Object.values(searchData).filter(d => d.title.toLowerCase().includes(q) || d.excerpt.toLowerCase().includes(q)).slice(0, 8);
  if (!hits.length) { searchResultsEl.style.display = 'none'; return; }
  searchResultsEl.innerHTML = hits.map(d => `<a class="search-result-item" href="${d.url}"><div class="search-result-item__title">${d.title}</div><div class="search-result-item__excerpt">${d.excerpt.slice(0,80)}…</div></a>`).join('');
  searchResultsEl.style.display = 'block';
});
document.addEventListener('click', e => { if (!e.target.closest('.search-wrap') && searchResultsEl) searchResultsEl.style.display = 'none'; });
initSearch();

const sidebarToggle = document.getElementById('sidebarToggle');
const pageWrapper = document.querySelector('.page-wrapper');
const sidebarEl = document.querySelector('.sidebar');
const resizerEl = document.getElementById('sidebarResizer');
if (localStorage.getItem('sidebar-collapsed') === 'true') pageWrapper?.classList.add('sidebar-collapsed');
const savedW = localStorage.getItem('sidebar-width');
if (savedW) document.documentElement.style.setProperty('--sidebar-w', savedW);
sidebarToggle?.addEventListener('click', () => {
  const collapsed = pageWrapper.classList.toggle('sidebar-collapsed');
  localStorage.setItem('sidebar-collapsed', collapsed);
});
if (resizerEl && pageWrapper && sidebarEl) {
  let startX, startW;
  resizerEl.addEventListener('mousedown', e => {
    startX = e.clientX; startW = sidebarEl.offsetWidth;
    resizerEl.classList.add('dragging');
    document.body.style.cssText += 'user-select:none;cursor:col-resize;';
    const move = e => { const w = Math.max(140, Math.min(520, startW + e.clientX - startX)); document.documentElement.style.setProperty('--sidebar-w', w + 'px'); };
    const up = () => {
      resizerEl.classList.remove('dragging'); document.body.style.userSelect = ''; document.body.style.cursor = '';
      const w = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim();
      localStorage.setItem('sidebar-width', w);
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  });
}
