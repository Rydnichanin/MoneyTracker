let DEFAULTS = { income: [], expense: [] };
let ACCOUNTS = [];
let allTx = [];

const checkFB = setInterval(() => {
    if (window.fbDB && window.fbMethods) { clearInterval(checkFB); initApp(); }
}, 100);

function initApp() {
    const { fbDB, fbMethods } = window;
    const txRef = fbMethods.collection(fbDB, "transactions");
    const setRef = fbMethods.collection(fbDB, "settings");

    // Сразу вешаем "слежку" за календарями
    document.getElementById("fromDate").addEventListener("change", render);
    document.getElementById("toDate").addEventListener("change", render);

    // Дальше твой остальной код (setToday, onSnapshot и т.д.)
    // ...

    // Функция автозаполнения даты
    const setToday = () => {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const local = new Date(now - offset).toISOString().split('T')[0];
        document.getElementById("date").value = local;
        return local;
    };
    
    setToday();

    // 1. ЗАГРУЗКА НАСТРОЕК
    fbMethods.onSnapshot(setRef, (snap) => {
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
        document.getElementById("settingsList").innerHTML = setHtml;
        updateUI();
    });

    // 2. ФУНКЦИИ КНОПОК НАСТРОЕК
    window.addCategory = async () => {
        const name = document.getElementById("setCatName").value;
        const catType = document.getElementById("setCatType").value;
        if (name) await fbMethods.addDoc(setRef, { type: 'category', name, catType, sub: [] });
        document.getElementById("setCatName").value = "";
    };

    window.addAccount = async () => {
        const name = document.getElementById("setAccName").value;
        if (name) await fbMethods.addDoc(setRef, { type: 'account', name });
        document.getElementById("setAccName").value = "";
    };

    window.addSub = async () => {
        const parentId = document.getElementById("setParentCat").value;
        const subName = document.getElementById("setSubName").value;
        if (parentId && subName) {
            await fbMethods.updateDoc(fbMethods.doc(fbDB, "settings", parentId), {
                sub: fbMethods.arrayUnion(subName)
            });
        }
        document.getElementById("setSubName").value = "";
    };

    window.deleteSet = async (id) => { if(confirm("Удалить?")) await fbMethods.deleteDoc(fbMethods.doc(fbDB, "settings", id)); };

    // 3. UI И ТРАНЗАКЦИИ
    function updateUI() {
        const elT = document.getElementById("type"), elC = document.getElementById("category"), 
              elS = document.getElementById("subcategory"), elAcc = document.getElementById("accountSelect");

        elAcc.innerHTML = ACCOUNTS.map(a => `<option value="${a.name}">${a.name}</option>`).join("") || '<option>Счет не выбран</option>';
        
        const currentCats = DEFAULTS[elT.value];
        elC.innerHTML = currentCats.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        
        document.getElementById("setParentCat").innerHTML = [...DEFAULTS.income, ...DEFAULTS.expense].map(c => `<option value="${c.id}">${c.name}</option>`).join("");

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

    fbMethods.onSnapshot(fbMethods.query(txRef, fbMethods.orderBy("date", "desc")), (snap) => {
        allTx = [];
        snap.forEach(d => allTx.push({ id: d.id, ...d.data() }));
        if (!document.getElementById("fromDate").value) setRange('today'); 
        else render();
    });

    document.getElementById("txForm").onsubmit = async (e) => {
        e.preventDefault();
        const amt = Number(document.getElementById("amount").value);
        if(!amt) return;
        
        const catId = document.getElementById("category").value;
        const catObj = [...DEFAULTS.income, ...DEFAULTS.expense].find(c => c.id === catId);
        
        await fbMethods.addDoc(txRef, {
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
    // 1. Проверка элементов интерфейса
    const fromEl = document.getElementById("fromDate");
    const toEl = document.getElementById("toDate");
    if (!fromEl || !toEl) return;

    const from = fromEl.value;
    const to = toEl.value;

    // 2. Фильтрация по датам
    const filtered = allTx.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

    // 3. Расчет основных сумм
    const inc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    // 4. УМНЫЙ РАСЧЕТ БЕНЗИНА
    const gas = filtered.filter(t => {
        if (t.type !== 'expense') return false;
        // Приводим к нижнему регистру и убираем пробелы для сравнения
        const sub = (t.subcategory || "").toLowerCase().trim();
        const cat = (t.categoryName || "").toLowerCase().trim();
        return sub === 'бензин' || cat === 'бензин';
    }).reduce((s, t) => s + t.amount, 0);

    // 5. Вывод основных показателей
    document.getElementById("balance").textContent = (inc - exp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = inc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = exp.toLocaleString() + " ₸";

    // 6. ОБНОВЛЕНИЕ ПОЛОСКИ БЕНЗИНА
    const gasP = inc > 0 ? ((gas / inc) * 100).toFixed(1) : 0;
    const gasText = document.getElementById("gasText");
    const gasFill = document.getElementById("gasFill");
    
    if (gasText) {
        gasText.textContent = `Бензин: ${gasP}% (${gas.toLocaleString()} ₸)`;
    }
    if (gasFill) {
        // Множитель * 3 делает полоску заметнее (33% расхода заполнит её всю)
        gasFill.style.width = Math.min(gasP * 3, 100) + "%";
    }

    // 7. Баланс по счетам
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

    // 8. Статистика РД (Реальный Доход)
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

    // 9. Статистика ВД (Возможный Доход)
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

    // 10. Статистика Расходов
    const statsExp = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        if(!statsExp[t.categoryName]) statsExp[t.categoryName] = { sum: 0, subs: {} };
        statsExp[t.categoryName].sum += t.amount;
        if(t.subcategory) statsExp[t.categoryName].subs[t.subcategory] = (statsExp[t.categoryName].subs[t.subcategory] || 0) + t.amount;
    });
    document.getElementById("expenseDetails").innerHTML = Object.entries(statsExp).map(([c, d]) => `
        <div class="stat-row"><div class="stat-main"><span>${c}</span><b class="neg">${d.sum.toLocaleString()} ₸</b></div>
        <div class="stat-sub">${Object.entries(d.subs).map(([s, v]) => `${s}: ${v.toLocaleString()}`).join(" | ")}</div></div>`).join("");

    // 11. История операций
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item"><div><b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
        <small class="muted">${t.time} | ${t.subcategory || t.categoryName} [${t.account}]</small>
        ${t.comment ? `<div style="color:#65d48b; font-size:12px;">📝 ${t.comment}</div>` : ''}</div>
        <button onclick="deleteTx('${t.id}')" style="background:none;border:none;color:#444;padding:10px;">✕</button></div>`).join("");
}
