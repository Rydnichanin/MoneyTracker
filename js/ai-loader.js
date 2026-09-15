(() => {
  let promise = null;

  function loadAI() {
    if (promise) return promise;

    promise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-moneytracker-ai]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = './ai_parser.js?v=3';
      script.async = true;
      script.dataset.moneyTrackerAi = '1';
      script.onload = () => resolve();
      script.onerror = () => {
        promise = null;
        reject(new Error('AI parser failed to load'));
      };
      document.head.appendChild(script);
    });

    return promise;
  }

  function loadAddressParser() {
    if (window.__moneyTrackerAddressParserPromise) return window.__moneyTrackerAddressParserPromise;

    window.__moneyTrackerAddressParserPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-moneytracker-address-parser]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = './js/address-parser.js?v=1';
      script.async = true;
      script.dataset.moneyTrackerAddressParser = '1';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Address parser failed to load'));
      document.head.appendChild(script);
    });

    return window.__moneyTrackerAddressParserPromise;
  }

  function loadCategoryRenamePanel() {
    if (window.__moneyTrackerCategoryRenamePanelPromise) return window.__moneyTrackerCategoryRenamePanelPromise;

    window.__moneyTrackerCategoryRenamePanelPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-moneytracker-category-rename]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = './js/category-rename-panel.js?v=1';
      script.async = true;
      script.dataset.moneytrackerCategoryRename = '1';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Category rename panel failed to load'));
      document.head.appendChild(script);
    });

    return window.__moneyTrackerCategoryRenamePanelPromise;
  }

  // Старую логику кнопки ✏️ оставляем, но новый отдельный блок является основным способом переименования.
  function initCategoryEditor(root) {
    if (!root || root.dataset.categoryEditorReady === '1') return;
    root.dataset.categoryEditorReady = '1';

    const getItems = () => Array.from(root.querySelectorAll('.set-item')).filter((item) => {
      const top = item.querySelector('.set-item-top');
      const text = top?.textContent || '';
      return top && (text.includes('(+)') || text.includes('(−)') || text.includes('(-)'));
    });

    const getId = (item) => {
      const del = item.querySelector('.set-del[onclick*="deleteSet"]');
      const onclick = del?.getAttribute('onclick') || '';
      const m = onclick.match(/deleteSet\(['"]([^'"]+)['"]\)/);
      return m ? m[1] : null;
    };

    const getName = (item) => {
      const top = item.querySelector('.set-item-top');
      const span = top?.querySelector(':scope > span');
      let name = (span?.textContent || top?.textContent || '').trim();
      name = name.replace(/^📂\s*/, '');
      name = name.replace(/\s*\((?:\+|−|-)\)\s*$/, '');
      return name.trim();
    };

    const rename = async (id, oldName) => {
      const newName = window.prompt('Новое название категории:', oldName);
      if (newName === null) return;
      const clean = newName.trim();
      if (!clean || clean === oldName || clean.length > 100) return;
      const { fbDB, fbMethods, fbUser } = window;
      if (!fbDB || !fbMethods || !fbUser?.uid) return;
      try {
        const ref = fbMethods.doc(fbDB, 'users', fbUser.uid, 'settings', id);
        await fbMethods.updateDoc(ref, { name: clean });
      } catch (error) {
        console.error('[MoneyTracker] Ошибка переименования категории:', error);
      }
    };

    const addButtons = () => {
      getItems().forEach((item) => {
        const top = item.querySelector('.set-item-top');
        if (!top || top.querySelector('.set-edit')) return;
        const id = getId(item);
        if (!id) return;
        const del = top.querySelector('.set-del');
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'set-edit';
        edit.title = 'Переименовать категорию';
        edit.textContent = '✏️';
        edit.style.cssText = 'background:none;border:none;color:#ffd166;font-size:17px;cursor:pointer;padding:0;line-height:1;';
        edit.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          rename(id, getName(item));
        });
        if (del) {
          const actions = document.createElement('span');
          actions.className = 'set-actions';
          actions.style.cssText = 'display:flex;align-items:center;gap:8px;';
          del.replaceWith(actions);
          actions.append(edit, del);
        } else top.appendChild(edit);
      });
    };

    addButtons();
    new MutationObserver(addButtons).observe(root, { childList: true, subtree: true });
  }

  function watchForSettingsPage() {
    const tryInit = () => {
      const root = document.getElementById('settingsPage');
      if (root) initCategoryEditor(root);
    };

    tryInit();

    if (!document.getElementById('settingsPage') && document.body) {
      const bodyObserver = new MutationObserver(() => {
        const root = document.getElementById('settingsPage');
        if (!root) return;
        initCategoryEditor(root);
        bodyObserver.disconnect();
      });
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  window.loadMoneyTrackerAI = loadAI;
  window.loadMoneyTrackerAddressParser = loadAddressParser;
  window.loadMoneyTrackerCategoryRenamePanel = loadCategoryRenamePanel;

  loadAddressParser().catch(error => console.warn(error));
  loadCategoryRenamePanel().catch(error => console.warn(error));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchForSettingsPage, { once: true });
  } else {
    watchForSettingsPage();
  }

  const idle = window.requestIdleCallback || ((callback) => setTimeout(callback, 2500));
  idle(() => loadAI(), { timeout: 5000 });
})();
