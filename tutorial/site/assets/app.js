// Keelson Tutorial Interactive App Script
(function() {
  // Theme Switching
  const themeToggle = document.getElementById('themeToggle');
  const savedTheme = localStorage.getItem('keelson_theme');

  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.body.classList.remove('theme-auto');
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const nextTheme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nextTheme);
      document.body.classList.remove('theme-auto');
      localStorage.setItem('keelson_theme', nextTheme);
    });
  }

  // Mobile Sidebar Drawer
  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  function toggleSidebar() {
    if (sidebar && sidebarOverlay) {
      sidebar.classList.toggle('open');
      sidebarOverlay.classList.toggle('open');
    }
  }

  if (menuToggle) menuToggle.addEventListener('click', toggleSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);

  // Copy Code Functionality
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const codeId = btn.getAttribute('data-code-id');
      const codeEl = document.getElementById(codeId);
      if (!codeEl) return;

      try {
        await navigator.clipboard.writeText(codeEl.innerText);
        const labelEl = btn.querySelector('.copy-label');
        const originalText = labelEl ? labelEl.innerText : '复制';
        if (labelEl) labelEl.innerText = '已复制!';
        btn.classList.add('copied');
        setTimeout(() => {
          if (labelEl) labelEl.innerText = originalText;
          btn.classList.remove('copied');
        }, 2000);
      } catch (e) {
        console.error('Failed to copy', e);
      }
    });
  });

  // Client-side Navigation Filter / Search
  const searchInput = document.getElementById('searchInput');
  const navList = document.getElementById('navList');

  if (searchInput && navList) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const items = navList.querySelectorAll('.nav-item');
      items.forEach(item => {
        const text = item.innerText.toLowerCase();
        if (text.includes(q)) {
          item.style.display = '';
        } else {
          item.style.display = 'none';
        }
      });
    });

    // Keyboard shortcut Cmd/Ctrl + K to focus search
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
      }
    });
  }

  // ScrollSpy for Right TOC & Subnav
  const headings = Array.from(document.querySelectorAll('.markdown-body h2, .markdown-body h3'));
  const tocLinks = Array.from(document.querySelectorAll('.right-toc-list .toc-link, .sidebar-subnav .subnav-link'));

  if (headings.length > 0 && tocLinks.length > 0) {
    function onScroll() {
      const scrollPos = window.scrollY + 100;
      let currentId = '';

      for (let i = 0; i < headings.length; i++) {
        const h = headings[i];
        if (h.offsetTop <= scrollPos) {
          currentId = h.id;
        } else {
          break;
        }
      }

      tocLinks.forEach(link => {
        const target = link.getAttribute('data-anchor') || link.getAttribute('data-toc-target');
        if (target === currentId) {
          link.classList.add('active-toc');
        } else {
          link.classList.remove('active-toc');
        }
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
