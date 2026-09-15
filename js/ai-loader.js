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
      script.dataset.moneytrackerAi = '1';
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
      script.dataset.moneytrackerAddressParser = '1';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Address parser failed to load'));
      document.head.appendChild(script);
    });

    return window.__moneyTrackerAddressParserPromise;
  }

  // Переименование уже существующих категорий. Создание и удаление не меняем.
  function initCategoryEditor() {
    const root = document.getElementById('settingsPage');
    if (!root || root.dataset.categoryEditorReady === '1') return;
    root.dataset.categoryEditorReady = '1';

    const getItems = () => Array.from(root.querySelectorAll('.set-item')).filter((item) => {
      const top = item.querySelector('.set-item-top');
      return top && /\(\+\)|\(−\)/.test(top.textContent || '');
    });

    const getId = (item) => {
      const del = item.querySelector('.set-del[onclick*="deleteSet"]');
      const m = (del?.getAttribute('onclick') || '').match(/deleteSet\(['\"]([^'\"]+)['\"]\)/);
      return m ? m[1] : null;
    };

    const getName = (item) => {
      const top = item.querySelector('.set-item-top');
      const span = top?.querySelector(':scope > span');
      let name = (span?.textContent || top?.textContent || '').trim();
      return name.replace(/^📂\s*/, '').replace(/\s*\((?:\+|−)\)\s*$/, '').trim();
    };

    const rename = async (id, oldName) => {
      const newName = window.prompt('Новое название категории:', oldName);
      if (newName === null) return;
      const clean = newName.trim();
      if (!clean) return window.alert('Название не может быть пустым.');
      if (clean === oldName) return;
      if (clean.length > 100) return window.alert('Название слишком длинное (максимум 100 символов).');

      const { fbDB, fbMethods, fbUser } = window;
      if (!fbDB || !fbMethods || !fbUser?.uid) {
        return window.alert('Firebase ещё не готов. Попробуйте ещё раз.');
      }

      try {
        const ref = fbMethods.doc(fbDB, 'users', fbUser.uid, 'settings', id);
        await fbMethods.updateDoc(ref, { name: clean });
      } catch (error) {
        console.error('[MoneyTracker] Ошибка переименования категории:', error);
        window.alert('Не удалось переименовать категорию.\n' + (error?.message || 'Неизвестная ошибка'));
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
          actions.style.cssText = 'display:flex;align-items:center;gap:8px;';
          del.replaceWith(actions);
          actions.append(edit, del);
        } else {
          top.appendChild(edit);
        }
      });
    };

    new MutationObserver(addButtons).observe(root, { childList: true, subtree: true });
    addButtons();
  }

  window.loadMoneyTrackerAI = loadAI;
  window.loadMoneyTrackerAddressParser = loadAddressParser;

  // Address recognition is always enabled. It checks Firebase before applying
  // pattern-based rules, while the AI parser remains secondary functionality.
  loadAddressParser().catch(error => console.warn(error));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCategoryEditor, { once: true });
  } else {
    initCategoryEditor();
  }

  const idle = window.requestIdleCallback || ((callback) => setTimeout(callback, 2500));
  idle(() => loadAI(), { timeout: 5000 });
})();
