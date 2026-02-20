import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 1. КОНФИГУРАЦИЯ
const firebaseConfig = {
    apiKey: "AIzaSyDNk1We9du5BJyrgGbQrkqd7tSDscneIOA",
    authDomain: "gold-11fa4.firebaseapp.com",
    projectId: "gold-11fa4",
    storageBucket: "gold-11fa4.firebasestorage.app",
    messagingSenderId: "226774330161",
    appId: "1:226774330161:web:d1e1c93ade5dcea31d5e10",
    measurementId: "G-7MLLBN1YZ4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let allTx = [];
let allSets = [];

// 2. ФУНКЦИИ УДАЛЕНИЯ (Выносим в window сразу)
window.deleteTx = async (id) => {
    if (!id || !confirm("Удалить эту запись?")) return;
    try {
        await deleteDoc(doc(db, "transactions", id));
    } catch (e) { console.error("Ошибка удаления транзакции:", e); }
};

window.deleteSet = async (id) => {
    if (!id || !confirm("Удалить из настроек?")) return;
    try {
        await deleteDoc(doc(db, "settings", id));
    } catch (e) { console.error("Ошибка удаления настройки:", e); }
};

// 3. ОБНОВЛЕНИЕ ИНТЕРФЕЙСА НАСТРОЕК (Счета и Категории)
function updateSettingsUI() {
    const accSelect = document.getElementById("accSelect");
    const catSelect = document.getElementById("catSelect");
    const setList = document.getElementById("settingsList");

    if (setList) {
        setList.innerHTML = allSets.map(s => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #333;">
                <span><small style="color:#888;">${s.type === 'acc' ? 'Счёт' : 'Кат'}:</small> ${s.name}</span>
                <button onclick="deleteSet('${s.id}')" style="background:none; border:none; color:#ff6b6b; cursor:pointer; padding:5px;">✕</button>
            </div>`).join("");
    }

    // Заполнение выпадающих списков
    if (accSelect) {
        const accs = allSets.filter(s => s.type === 'acc');
        accSelect.innerHTML = accs.length ? accs.map(a => `<option value="${a.name}">${a.name}</option>`).join("") : '<option value="">Нет счетов</option>';
    }
    if (catSelect) {
        const cats = allSets.filter(s => s.type === 'cat');
        catSelect.innerHTML = cats.length ? cats.map(c => `<option value="${c.name}">${c.name}</option>`).join("") : '<option value="">Нет категорий</option>';
    }
}

// 4. ГЛАВНАЯ ФУНКЦИЯ ОТРИСОВКИ (RENDER)
function render() {
    const from = document.getElementById("fromDate")?.value;
    const to = document.getElementById("toDate")?.value;

    const filtered = allTx.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

    const inc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    // Бензин
    const gas = filtered.filter(t => {
        if (t.type !== 'expense') return false;
        const sub = (t.subcategory || "").toLowerCase();
        const cat = (t.categoryName || "").toLowerCase();
        return sub.includes('бенз') || cat.includes('бенз');
    }).reduce((s, t) => s + t.amount, 0);

    // Вывод цифр
    if(document.getElementById("balance")) document.getElementById("balance").textContent = (inc - exp).toLocaleString() + " ₸";
    if(document.getElementById("totalIncome")) document.getElementById("totalIncome").textContent = inc.toLocaleString() + " ₸";
    if(document.getElementById("totalExpense")) document.getElementById("totalExpense").textContent = exp.toLocaleString() + " ₸";

    // Полоска бензина
    const gasP = inc > 0 ? ((gas / inc) * 100).toFixed(1) : 0;
    const gasText = document.getElementById("gasText");
    const gasFill = document.getElementById("gasFill");
    if (gasText) gasText.textContent = `Бензин: ${gasP}% (${gas.toLocaleString()} ₸)`;
    if (gasFill) gasFill.style.width = Math.min(gasP * 3, 100) + "%";

    // История
    const listEl = document.getElementById("list");
    if (listEl) {
        listEl.innerHTML = filtered.map(t => `
            <div class="item">
                <div>
                    <b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
                    <small class="muted">${t.time} | ${t.subcategory || t.categoryName} [${t.account}]</small>
                </div>
                <button onclick="deleteTx('${t.id}')" style="background:none; border:none; color:#555; padding:10px; cursor:pointer;">✕</button>
            </div>`).join("");
    }
    
    // Вызов остальных расчетов (ВД и т.д.) если функции есть
    if (window.updateStats) window.updateStats(filtered, inc);
}

// 5. ЗАПУСК И СЛУШАТЕЛИ
const init = () => {
    // Слушаем транзакции
    onSnapshot(query(collection(db, "transactions"), orderBy("date", "desc")), (snap) => {
        allTx = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        render();
    });

    // Слушаем настройки
    onSnapshot(query(collection(db, "settings"), orderBy("name")), (snap) => {
        allSets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        updateSettingsUI();
        render();
    });
};

init();
window.render = render;
