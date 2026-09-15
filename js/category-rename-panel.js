/* Панель переименования категорий.
 * Не вмешивается в добавление/удаление категорий.
 */
(() => {
  'use strict';

  const ROOT_ID = 'categoryRenamePanel';

  function getCategories(root) {
    return Array.from(root.querySelectorAll('.set-item')).map((item) => {
      const top = item.querySelector('.set-item-top');
      const text = top?.textContent || '';
      if (!/\(\+\)|\(−\)|\(-\)/.test(text)) return null;

      const del = item.querySelector('.set-del[onclick*="deleteSet"]');
      const onclick = del?.getAttribute('onclick') || '';
      const match = onclick.match(/deleteSet\(['"]([^'"]+)['"]\)/);
      if (!match) return null;

      const span = top.querySelector(':scope > span');
      let name = (span?.textContent || '').trim();
      name = name.replace(/^📂\s*/, '').replace(/\s*\((?:\+|−|-)\)\s*$/, '').trim();
      return { id: match[1], name };
    }).filter(Boolean);
  }

  async function renameSelected(root) {
    const select = root.querySelector('#renameCategorySelect');
    const input = root.querySelector('#renameCategoryInput');
    const id = select?.value;
    const newName = input?.value.trim();
    const oldName = select?.selectedOptions?.[0]?.dataset?.name || '';

    if (!id) return window.alert('Сначала выберите категорию.');
    if (!newName) return window.alert('Введите новое название категории.');
    if (newName.length > 100) return window.alert('Название слишком длинное (максимум 100 символов).');
    if (newName === oldName) return;

    const { fbDB, fbMethods, fbUser } = window;
    if (!fbDB || !fbMethods || !fbUser?.uid) {
      return window.alert('Firebase ещё не готов. Попробуйте ещё раз.');
    }

    const button = root.querySelector('#renameCategoryButton');
    if (button) { button.disabled = true; button.textContent = 'Сохранение…'; }

    try {
      const ref = fbMethods.doc(fbDB, 'users', fbUser.uid, 'settings', id);
      await fbMethods.updateDoc(ref, { name: newName });
      input.value = '';
      window.alert('Категория переименована.');
    } catch (error) {
      console.error('[MoneyTracker] Ошибка переименования категории:', error);
      window.alert('Не удалось переименовать категорию.\n' + (error?.message || 'Неизвестная ошибка'));
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Переименовать категорию'; }
    }
  }

  function render(root) {
    const panel = root.querySelector('#' + ROOT_ID);
    if (!panel) return;

    const select = panel.querySelector('#renameCategorySelect');
    const categories = getCategories(root);
    const current = select.value;
    select.innerHTML = '<option value="">Выберите категорию</option>';
    categories.forEach((cat) => {
      const option = document.createElement('option');
      option.value = cat.id;
      option.dataset.name = cat.name;
      option.textContent = cat.name;
      select.appendChild(option);
    });
    if (categories.some((cat) => cat.id === current)) select.value = current;
  }

  function init(root) {
    if (!root || root.dataset.categoryRenamePanelReady === '1') return;
    root.dataset.categoryRenamePanelReady = '1';

    const inner = root.querySelector('.settings-inner');
    if (!inner) return;

    const panel = document.createElement('div');
    panel.id = ROOT_ID;
    panel.className = 'card';
    panel.style.cssText = 'background:#1c1c1e;border-radius:16px;padding:14px;margin-bottom:10px;border:1px solid #1a1a1a;';
    panel.innerHTML = `
      <div class="card-title" style="color:#ffd166;">Переименовать категорию</div>
      <select id="renameCategorySelect" style="margin-bottom:8px;">
        <option value="">Выберите категорию</option>
      </select>
      <input id="renameCategoryInput" type="text" maxlength="100" placeholder="Новое название">
      <button id="renameCategoryButton" class="btn-main" style="background:#222;color:#fff;padding:11px;">Переименовать категорию</button>
    `;

    inner.insertBefore(panel, inner.firstChild);
    panel.querySelector('#renameCategoryButton').addEventListener('click', () => renameSelected(root));
    panel.querySelector('#renameCategorySelect').addEventListener('change', (event) => {
      const selected = event.target.selectedOptions[0];
      const input = panel.querySelector('#renameCategoryInput');
      if (selected?.dataset?.name) input.value = selected.dataset.name;
    });

    render(root);
    new MutationObserver(() => render(root)).observe(root, { childList: true, subtree: true });
  }

  function watch() {
    const root = document.getElementById('settingsPage');
    if (root) init(root);
    if (!root && document.body) {
      const observer = new MutationObserver(() => {
        const found = document.getElementById('settingsPage');
        if (!found) return;
        init(found);
        observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
})();
