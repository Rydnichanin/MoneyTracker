/* Редактор существующих категорий для настроек MoneyTracker.
 * Добавляет только переименование: создание и удаление остаются без изменений.
 */
(function () {
  'use strict';

  const SETTINGS_SELECTOR = '#settingsPage';

  function getCategoryItems() {
    const root = document.querySelector(SETTINGS_SELECTOR);
    if (!root) return [];

    return Array.from(root.querySelectorAll('.set-item')).filter((item) => {
      const top = item.querySelector('.set-item-top');
      if (!top) return false;
      const text = top.textContent || '';
      return /\(\+\)|\(−\)/.test(text);
    });
  }

  function getCategoryId(item) {
    const del = item.querySelector('.set-del[onclick*="deleteSet"]');
    const onclick = del?.getAttribute('onclick') || '';
    const match = onclick.match(/deleteSet\(['\"]([^'\"]+)['\"]\)/);
    return match ? match[1] : null;
  }

  function getCategoryName(item) {
    const top = item.querySelector('.set-item-top');
    const firstSpan = top?.querySelector(':scope > span');
    let name = (firstSpan?.textContent || top?.textContent || '').trim();
    name = name.replace(/^📂\s*/, '').replace(/\s*\((?:\+|−)\)\s*$/, '').trim();
    return name;
  }

  function addEditors() {
    getCategoryItems().forEach((item) => {
      const top = item.querySelector('.set-item-top');
      if (!top || top.querySelector('.set-edit')) return;

      const id = getCategoryId(item);
      if (!id) return;

      const actions = document.createElement('span');
      actions.style.cssText = 'display:flex;align-items:center;gap:8px;';

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'set-edit';
      edit.title = 'Переименовать категорию';
      edit.textContent = '✏️';
      edit.style.cssText = 'background:none;border:none;color:#ffd166;font-size:17px;cursor:pointer;padding:0;line-height:1;';
      edit.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        renameCategory(id, getCategoryName(item));
      });

      const del = top.querySelector('.set-del');
      if (del) {
        del.replaceWith(actions);
        actions.appendChild(edit);
        actions.appendChild(del);
      } else {
        top.appendChild(edit);
      }
    });
  }

  async function renameCategory(id, oldName) {
    const newName = window.prompt('Новое название категории:', oldName);
    if (newName === null) return;

    const cleanName = newName.trim();
    if (!cleanName) {
      window.alert('Название не может быть пустым.');
      return;
    }
    if (cleanName === oldName) return;
    if (cleanName.length > 100) {
      window.alert('Название слишком длинное (максимум 100 символов).');
      return;
    }

    const { fbDB, fbMethods, fbUser } = window;
    if (!fbDB || !fbMethods || !fbUser?.uid) {
      window.alert('Firebase ещё не готов. Попробуйте ещё раз.');
      return;
    }

    try {
      const categoryRef = fbMethods.doc(fbDB, 'users', fbUser.uid, 'settings', id);
      await fbMethods.updateDoc(categoryRef, { name: cleanName });
      window.dispatchEvent(new CustomEvent('categoryRenamed', {
        detail: { id, oldName, newName: cleanName }
      }));
    } catch (error) {
      console.error('[CategoryEditor] Ошибка переименования:', error);
      window.alert('Не удалось переименовать категорию.\n' + (error?.message || 'Неизвестная ошибка'));
    }
  }

  function init() {
    const root = document.querySelector(SETTINGS_SELECTOR);
    if (!root) return;

    const observer = new MutationObserver(() => addEditors());
    observer.observe(root, { childList: true, subtree: true });
    addEditors();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
