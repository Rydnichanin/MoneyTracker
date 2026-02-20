import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, arrayUnion 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Используем конфиг из твоего последнего HTML
const firebaseConfig = {
    apiKey: "AIzaSyBYvSsrzjgkrBwhaBAt0KlCGrAtzgOPYx8",
    authDomain: "moneytracker-5335b.firebaseapp.com",
    projectId: "moneytracker-5335b",
    storageBucket: "moneytracker-5335b.firebasestorage.app",
    messagingSenderId: "440589448883",
    appId: "1:440589448883:web:5ad507b270fa414731a2c6"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let DEFAULTS = { income: [], expense: [] };
let ACCOUNTS = [];
let allTx = [];

// Привязываем к window для работы кнопок из HTML
window.fbDB = db;
window.fbMethods = { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, arrayUnion };

function initApp() {
    const txRef = collection(db, "transactions");
    const setRef = collection(db, "settings");

    const setToday = () => {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const local = new Date(now - offset).toISOString().split('T')[0];
        const el = document.getElementById("date");
        if(el) el.value = local;
        return local;
    };
    setToday();

    // 1. ЗАГРУЗКА НАСТРОЕК
    onSnapshot(setRef, (snap) => {
        DEFAULTS = { income: [], expense: [] };
        ACCOUNTS = [];
        let setHtml = "";

        snap.forEach(d => {
            const data = d.data();
            if (data.type === 'category') {
                DEFAULTS[data.catType].push({ id: d.id, ...data });
                setHtml += `<div class="set-item">📂 ${data.name} (${data.catType === 'income'?'+':'-'}) 
                    <button onclick="deleteSet('${d.id}')">✕</button>
                    <div style="font-size:10px; color:#666;">${(data.sub || []).join(", ")}</div></div>`;
            } else if (data.type === 'account') {
                ACCOUNTS.push({ id: d.id, ...data });
                setHtml += `<div class="set-item">💳 ${data.name} <button onclick="deleteSet('${d.id}')">✕</button></div>`;
            }
        });
        const listEl = document.getElementById("settingsList");
        if(listEl) listEl.innerHTML = setHtml;
        updateUI();
    });

    // 2. ФУНКЦИИ КНОПОК НАСТРОЕК
    window.addCategory = async () => {
        const name = document.getElementById("setCatName").value;
        const catType = document.getElementById("setCatType").value;
        if (name) await addDoc(setRef, { type: 'category', name, catType, sub: [] });
        document.getElementById("setCatName").value = "";
    };

    window.addAccount = async () => {
        const name = document.getElementById("setAccName").value;
        if (name) await addDoc(setRef, { type: 'account', name });
        document.getElementById("setAccName").value = "";
    };

    window.addSub = async () => {
        const parentId = document.getElementById("setParentCat").value;
        const subName = document.getElementById("setSubName").value;
        if (parentId && subName) {
            await updateDoc(doc(db, "settings", parentId), {
                sub: arrayUnion(subName)
            });
        }
        document.getElementById("setSubName").value = "";
    };

    window.deleteSet = async (id) => { if(confirm("Удалить?")) await deleteDoc(doc(db, "settings", id)); };

    // 3. UI ТРАНЗАКЦИЙ
    function updateUI() {
        const elT = document.getElementById("type"), elC = document.getElementById("category"), 
              elS = document.getElementById("subcategory"), elAcc = document.getElementById("accountSelect");
        if(!elT || !elC) return;

        elAcc.innerHTML = ACCOUNTS.map(a => `<option value="${a.name}">${a.name}</option>`).join("") || '<option>Счет не выбран</option>';
        
        const currentCats = DEFAULTS[elT.value];
        elC.innerHTML = currentCats.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        
        const parentCatEl = document.getElementById("setParentCat");
        if(parentCatEl) parentCatEl.innerHTML = [...DEFAULTS.income, ...DEFAULTS.expense].map(c => `<option value="${c.id}">${c.name}</option>`).join("");

        const fillSubs = () => {
            const cat = currentCats.find(c => c.id === elC.value);
            if (cat && cat.sub && cat.sub.length > 0) {
                document.getElementById("subcatWrap").classList.remove("hidden");
                elS.innerHTML = cat.sub.map(s => `<option value="${s}">${s}</option>`).join("");
            } else {
                document.getElementById("subcatWrap").classList.add("hidden");
                elS.innerHTML = "";
            }
        };

        elT.onchange = updateUI;
        elC.onchange = fillSubs;
        fillSubs();
    }

    onSnapshot(query(txRef, orderBy("date", "desc")), (snap) => {
        allTx = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!document.getElementById("fromDate").value) window.setRange('today'); 
        else render();
    });

    document.getElementById("txForm").onsubmit = async (e) => {
        e.preventDefault();
        const amt = Number(document.getElementById("amount").value);
        if(!amt) return;
        
        const catId = document.getElementById("category").value;
        const catObj = [...DEFAULTS.income, ...DEFAULTS.expense].find(c => c.id === catId);
        
        await addDoc(txRef, {
            type: document.getElementById("type").value,
            amount: amt,
            categoryName: catObj ? catObj.name : "Без категории",
            subcategory: document.getElementById("subcategory").value || "",
            account: document.getElementById("accountSelect").value,
            date: document.getElementById("date").value,
            time: new Date().toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}),
            createdAt: Date.now(),
            comment: document.getElementById("comment").value
        });
        
        document.getElementById("amount").value = "";
        document.getElementById("comment").value = "";
        setToday();
    };
}

// 4. ГЛОБАЛЬНЫЕ ФУНКЦИИ ФИЛЬТРОВ И РЕНДЕРА
window.setRange = (mode) => {
    const f = document.getElementById("fromDate"), t = document.getElementById("toDate");
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const today = new Date(now - offset).toISOString().split('T')[0];

    if (mode === 'today') { f.value = today; t.value = today; }
    else if (mode === 'yesterday') {
        const y = new Date(now - offset); y.setDate(y.getDate() - 1);
        const yStr = y.toISOString().split('T')[0];
        f.value = yStr; t.value = yStr;
    } else { f.value = ""; t.value = ""; }
    render();
};

function render() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    const filtered = allTx.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

    const inc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    
    // УМНЫЙ БЕНЗИН: ищет подстроку "бенз" в подкатегории или категории
    const gas = filtered.filter(t => {
        const sub = (t.subcategory || "").toLowerCase();
        const cat = (t.categoryName || "").toLowerCase();
        return t.type === 'expense' && (sub.includes("бенз") || cat.includes("бенз"));
    }).reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (inc - exp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = inc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = exp.toLocaleString() + " ₸";

    const accs = {};
    filtered.forEach(t => {
        if(!accs[t.account]) accs[t.account] = 0;
        accs[t.account] += (t.type === 'income' ? t.amount : -t.amount);
    });
    document.getElementById("accountBalances").innerHTML = Object.entries(accs).map(([n, v]) => 
        `<span>${n}: <b style="color:${v>=0?'#65d48b':'#ff6b6b'}">${v.toLocaleString()}</b></span>`).join(" | ");

    const gasP = inc > 0 ? ((gas / inc) * 100).toFixed(1) : 0;
    document.getElementById("gasText").textContent = `Бензин: ${gasP}% (${gas.toLocaleString()} ₸)`;
    document.getElementById("gasFill").style.width = Math.min(gasP * 3, 100) + "%";

    const statsInc = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const key = t.subcategory || t.categoryName;
        if(!statsInc[key]) statsInc[key] = { sum: 0, cnt: 0, br: {} };
        statsInc[key].sum += t.amount; statsInc[key].cnt++;
        statsInc[key].br[t.amount] = (statsInc[key].br[t.amount] || 0) + 1;
    });
    document.getElementById("earningsDetails").innerHTML = Object.entries(statsInc).map(([k, d]) => `
        <div class="stat-row"><div class="stat-main"><span>${k} (${d.cnt})</span><b>${d.sum.toLocaleString()} ₸</b></div>
        <div class="stat-sub">${Object.entries(d.br).map(([p, c]) => `${p}₸×${c}`).join(" | ")}</div></div>`).join("");

    // ВД: ЛИМИТ 3000
    let totalGain = 0; const vdStats = {}; const vds = ["F1", "F2", "F3", "Ночь"];
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
                <div class="stat-vd-info" style="color:#65d48b; font-size:12px;">Выгода: +${diff.toLocaleString()} ₸</div></div>`;
    }).join("");
    document.getElementById("potentialStats").innerHTML = vdHtml || '<div class="muted">Нет данных ВД</div>';
    if(totalGain > 0) document.getElementById("potentialStats").innerHTML += `<div class="gain-box"><span>ВЫГОДА ВД:</span><span class="pos">+${totalGain.toLocaleString()} ₸</span></div>`;

    const statsExp = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        if(!statsExp[t.categoryName]) statsExp[t.categoryName] = { sum: 0, subs: {} };
        statsExp[t.categoryName].sum += t.amount;
        if(t.subcategory) statsExp[t.categoryName].subs[t.subcategory] = (statsExp[t.categoryName].subs[t.subcategory] || 0) + t.amount;
    });
    document.getElementById("expenseDetails").innerHTML = Object.entries(statsExp).map(([c, d]) => `
        <div class="stat-row"><div class="stat-main"><span>${c}</span><b class="neg">${d.sum.toLocaleString()} ₸</b></div>
        <div class="stat-sub">${Object.entries(d.subs).map(([s, v]) => `${s}: ${v.toLocaleString()}`).join(" | ")}</div></div>`).join("");

    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item"><div><b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
        <small class="muted">${t.time} | ${t.subcategory || t.categoryName} [${t.account}]</small>
        ${t.comment ? `<div style="color:#65d48b; font-size:12px;">📝 ${t.comment}</div>` : ''}</div>
        <button onclick="deleteTx('${t.id}')" style="background:none;border:none;color:#444;padding:10px;">✕</button></div>`).join("");
}

window.deleteTx = async (id) => { if(confirm("Удалить?")) await deleteDoc(doc(db, "transactions", id)); };

// Запуск приложения
initApp();
window.render = render;
