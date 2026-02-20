import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// === 1. ТВОЙ FIREBASE CONFIG ===
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

// Делаем доступными для функций в HTML
const fbMethods = { collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc };

let allTx = [];
let allSets = [];

// === 2. ИНИЦИАЛИЗАЦИЯ (СЛУШАЕМ БАЗУ) ===
async function initApp() {
    // Слушаем транзакции
    const qTx = query(collection(db, "transactions"), orderBy("date", "desc"));
    onSnapshot(qTx, (snap) => {
        allTx = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        render();
    });

    // Слушаем настройки (счета и категории)
    const qSets = query(collection(db, "settings"), orderBy("name"));
    onSnapshot(qSets, (snap) => {
        allSets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        updateSettingsUI();
        render(); // Перерисовываем, если изменились названия
    });
}

// === 3. ГЛОБАЛЬНЫЕ ФУНКЦИИ УДАЛЕНИЯ ===
window.deleteTx = async (id) => {
    if (!id || !confirm("Удалить эту запись из истории?")) return;
    try {
        await deleteDoc(doc(db, "transactions", id));
    } catch (e) { console.error(e); }
};

window.deleteSet = async (id) => {
    if (!id || !confirm("Удалить этот пункт из настроек?")) return;
    try {
        await deleteDoc(doc(db, "settings", id));
    } catch (e) { console.error(e); }
};

// === 4. ГЛАВНАЯ ФУНКЦИЯ ОТРИСОВКИ (RENDER) ===
function render() {
    const from = document.getElementById("fromDate")?.value;
    const to = document.getElementById("toDate")?.value;

    const filtered = allTx.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

    // Приход / Расход
    const inc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    // БЕНЗИН (Умный поиск по слову "бенз")
    const gas = filtered.filter(t => {
        if (t.type !== 'expense') return false;
        const sub = (t.subcategory || "").toLowerCase();
        const cat = (t.categoryName || "").toLowerCase();
        return sub.includes('бенз') || cat.includes('бенз');
    }).reduce((s, t) => s + t.amount, 0);

    // Баланс
    const balEl = document.getElementById("balance");
    if (balEl) balEl.textContent = (inc - exp).toLocaleString() + " ₸";
    
    document.getElementById("totalIncome").textContent = inc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = exp.toLocaleString() + " ₸";

    // Полоска бензина
    const gasP = inc > 0 ? ((gas / inc) * 100).toFixed(1) : 0;
    const gasText = document.getElementById("gasText");
    const gasFill = document.getElementById("gasFill");
    if (gasText) gasText.textContent = `Бензин: ${gasP}% (${gas.toLocaleString()} ₸)`;
    if (gasFill) gasFill.style.width = Math.min(gasP * 3, 100) + "%";

    // Баланс по счетам (Наличные, Каспи)
    const accs = {};
    filtered.forEach(t => {
        if(!accs[t.account]) accs[t.account] = 0;
        accs[t.account] += (t.type === 'income' ? t.amount : -t.amount);
    });
    const accEl = document.getElementById("accountBalances");
    if (accEl) {
        accEl.innerHTML = Object.entries(accs).map(([n, v]) => 
            `<span>${n}: <b style="color:${v>=0?'#65d48b':'#ff6b6b'}">${v.toLocaleString()}</b></span>`
        ).join(" | ");
    }

    // Статистика РД (Реальный Доход)
    const statsInc = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const key = t.subcategory || t.categoryName || "Прочее";
        if(!statsInc[key]) statsInc[key] = { sum: 0, cnt: 0, br: {} };
        statsInc[key].sum += t.amount; statsInc[key].cnt++;
        statsInc[key].br[t.amount] = (statsInc[key].br[t.amount] || 0) + 1;
    });
    document.getElementById("earningsDetails").innerHTML = Object.entries(statsInc).map(([k, d]) => `
        <div class="stat-row"><div class="stat-main"><span>${k} (${d.cnt})</span><b>${d.sum.toLocaleString()} ₸</b></div>
        <div class="stat-sub">${Object.entries(d.br).map(([p, c]) => `${p}₸×${c}`).join(" | ")}</div></div>`).join("");

    // Статистика ВД (Лимит 3000)
    let totalGain = 0; 
    const vdStats = {}; 
    const vds = ["F1", "F2", "F3", "Ночь"];
    filtered.forEach(t => {
        if (t.type === 'income' && vds.includes(t.subcategory) && t.amount < 3000) {
            if(!vdStats[t.subcategory]) vdStats[t.subcategory] = { vdSum: 0 };
            let p = t.amount;
            if (t.amount === 150) p = 600;
            else if (t.amount === 300) p = 900;
            else if (t.subcategory === "Ночь" && t.amount === 500) p = 1000;
            vdStats[t.subcategory].vdSum += p;
        }
    });
    const vdHtml = Object.entries(vdStats).map(([p, data]) => {
        const rSum = statsInc[p] ? statsInc[p].sum : 0;
        const diff = data.vdSum - rSum; totalGain += diff;
        return `<div class="stat-row"><div class="stat-main"><span>${p}</span><b>${data.vdSum.toLocaleString()} ₸</b></div>
                <div style="color:#65d48b; font-size:12px;">Выгода: +${diff.toLocaleString()} ₸</div></div>`;
    }).join("");
    document.getElementById("potentialStats").innerHTML = vdHtml || '<div class="muted">Нет данных ВД</div>';
    if(totalGain > 0) document.getElementById("potentialStats").innerHTML += `<div class="gain-box"><span>ВЫГОДА ВД:</span><span class="pos">+${totalGain.toLocaleString()} ₸</span></div>`;

    // Расходы по категориям
    const statsExp = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        const cat = t.categoryName || "Прочее";
        if(!statsExp[cat]) statsExp[cat] = { sum: 0, subs: {} };
        statsExp[cat].sum += t.amount;
        if(t.subcategory) statsExp[cat].subs[t.subcategory] = (statsExp[cat].subs[t.subcategory] || 0) + t.amount;
    });
    document.getElementById("expenseDetails").innerHTML = Object.entries(statsExp).map(([c, d]) => `
        <div class="stat-row"><div class="stat-main"><span>${c}</span><b class="neg">${d.sum.toLocaleString()} ₸</b></div>
        <div class="stat-sub">${Object.entries(d.subs).map(([s, v]) => `${s}: ${v.toLocaleString()}`).join(" | ")}</div></div>`).join("");

    // История операций
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div>
                <b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
                <small class="muted">${t.time} | ${t.subcategory || t.categoryName} [${t.account}]</small>
            </div>
            <button onclick="deleteTx('${t.id}')" style="background:none; border:none; color:#555; padding:10px; cursor:pointer;">✕</button>
        </div>`).join("");
}

// === 5. ОБНОВЛЕНИЕ СПИСКОВ В НАСТРОЙКАХ И ФОРМЕ ===
function updateSettingsUI() {
    const accSelect = document.getElementById("accSelect");
    const catSelect = document.getElementById("catSelect");
    const setList = document.getElementById("settingsList");

    if (setList) {
        setList.innerHTML = allSets.map(s => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #333;">
                <span><small style="color:#888;">${s.type === 'acc' ? 'Счёт' : 'Кат'}:</small> ${s.name}</span>
                <button onclick="deleteSet('${s.id}')" style="background:none; border:none; color:#ff6b6b; cursor:pointer;">✕</button>
            </div>`).join("");
    }

    // Наполняем селекторы
    if (accSelect) {
        const accs = allSets.filter(s => s.type === 'acc');
        accSelect.innerHTML = accs.map(a => `<option value="${a.name}">${a.name}</option>`).join("");
    }
    if (catSelect) {
        const cats = allSets.filter(s => s.type === 'cat');
        catSelect.innerHTML = cats.map(c => `<option value="${c.name}">${c.name}</option>`).join("");
    }
}

// Запуск
initApp();
window.render = render;
