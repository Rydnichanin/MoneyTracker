import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// === ТВОЙ FIREBASE CONFIG (найден в твоих данных) ===
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

// Глобальные переменные для работы
let allTx = [];
let allSets = [];

// === ИНИЦИАЛИЗАЦИЯ (СЛУШАЕМ БАЗУ) ===
async function initApp() {
    // Подписка на транзакции
    const qTx = query(collection(db, "transactions"), orderBy("date", "desc"));
    onSnapshot(qTx, (snap) => {
        allTx = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        render();
    });

    // Подписка на настройки (категории и счета)
    const qSets = query(collection(db, "settings"), orderBy("name"));
    onSnapshot(qSets, (snap) => {
        allSets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        updateSettingsUI();
        render();
    });
}

// === ФУНКЦИИ УДАЛЕНИЯ ===
window.deleteTx = async (id) => {
    if (!id) return;
    if (confirm("Удалить эту запись?")) {
        try {
            await deleteDoc(doc(db, "transactions", id));
        } catch (e) {
            console.error("Ошибка удаления:", e);
        }
    }
};

window.deleteSet = async (id) => {
    if (confirm("Удалить этот пункт настроек?")) {
        try {
            await deleteDoc(doc(db, "settings", id));
        } catch (e) {
            console.error("Ошибка удаления настройки:", e);
        }
    }
};

// === ГЛАВНАЯ ФУНКЦИЯ ОТРИСОВКИ ===
function render() {
    const from = document.getElementById("fromDate")?.value;
    const to = document.getElementById("toDate")?.value;

    const filtered = allTx.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

    const inc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    // Расчет бензина
    const gas = filtered.filter(t => {
        if (t.type !== 'expense') return false;
        const sub = (t.subcategory || "").toLowerCase();
        const cat = (t.categoryName || "").toLowerCase();
        return sub.includes('бенз') || cat.includes('бенз');
    }).reduce((s, t) => s + t.amount, 0);

    // Обновление интерфейса
    if(document.getElementById("balance")) document.getElementById("balance").textContent = (inc - exp).toLocaleString() + " ₸";
    if(document.getElementById("totalIncome")) document.getElementById("totalIncome").textContent = inc.toLocaleString() + " ₸";
    if(document.getElementById("totalExpense")) document.getElementById("totalExpense").textContent = exp.toLocaleString() + " ₸";

    const gasP = inc > 0 ? ((gas / inc) * 100).toFixed(1) : 0;
    const gasText = document.getElementById("gasText");
    const gasFill = document.getElementById("gasFill");
    if (gasText) gasText.textContent = `Бензин: ${gasP}% (${gas.toLocaleString()} ₸)`;
    if (gasFill) gasFill.style.width = Math.min(gasP * 3, 100) + "%";

    // История операций
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
}

function updateSettingsUI() {
    const list = document.getElementById("settingsList");
    if (!list) return;

    list.innerHTML = allSets.map(s => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #333;">
            <span><small style="color:#888;">${s.type === 'acc' ? 'Счёт' : 'Кат'}:</small> ${s.name}</span>
            <button onclick="deleteSet('${s.id}')" style="background:none; border:none; color:#ff6b6b; cursor:pointer;">✕</button>
        </div>
    `).join("");

    const accSelect = document.getElementById("accSelect");
    const catSelect = document.getElementById("catSelect");
    if (accSelect) accSelect.innerHTML = allSets.filter(s => s.type === 'acc').map(a => `<option value="${a.name}">${a.name}</option>`).join("");
    if (catSelect) catSelect.innerHTML = allSets.filter(s => s.type === 'cat').map(c => `<option value="${c.name}">${c.name}</option>`).join("");
}

initApp();
window.render = render;
