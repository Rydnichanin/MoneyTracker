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

    const setToday = () => {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const local = new Date(now - offset).toISOString().split('T')[0];
        document.getElementById("date").value = local;
        return local;
    };
    setToday();

    fbMethods.onSnapshot(setRef, (snap) => {
        DEFAULTS = { income: [], expense: [] };
        ACCOUNTS = [];
        let setHtml = "";
        snap.forEach(d => {
            const data = d.data();
            if (data.type === 'category') {
                DEFAULTS[data.catType].push({ id: d.id, ...data });
                setHtml += `<div class="set-item">📂 ${data.name} <button onclick="deleteSet('${d.id}')">✕</button></div>`;
            } else if (data.type === 'account') {
                ACCOUNTS.push({ id: d.id, ...data });
                setHtml += `<div class="set-item">💳 ${data.name} <button onclick="deleteSet('${d.id}')">✕</button></div>`;
            }
        });
        document.getElementById("settingsList").innerHTML = setHtml;
        updateUI();
    });

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
        const id = document.getElementById("setParentCat").value;
        const sub = document.getElementById("setSubName").value;
        if (id && sub) await fbMethods.updateDoc(fbMethods.doc(fbDB, "settings", id), { sub: fbMethods.arrayUnion(sub) });
        document.getElementById("setSubName").value = "";
    };
    window.deleteSet = async (id) => { if(confirm("Удалить?")) await fbMethods.deleteDoc(fbMethods.doc(fbDB, "settings", id)); };

    function updateUI() {
        const elT = document.getElementById("type"), elC = document.getElementById("category"), 
              elS = document.getElementById("subcategory"), elAcc = document.getElementById("accountSelect");
        elAcc.innerHTML = ACCOUNTS.map(a => `<option value="${a.name}">${a.name}</option>`).join("") || '<option>Добавьте счет</option>';
        const cats = DEFAULTS[elT.value];
        elC.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        document.getElementById("setParentCat").innerHTML = [...DEFAULTS.income, ...DEFAULTS.expense].map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        const fillSubs = () => {
            const cat = cats.find(c => c.id === elC.value);
            if (cat && cat.sub?.length > 0) {
                document.getElementById("subcatWrap").classList.remove("hidden");
                elS.innerHTML = cat.sub.map(s => `<option value="${s}">${s}</option>`).join("");
            } else { document.getElementById("subcatWrap").classList.add("hidden"); elS.innerHTML = ""; }
        };
        elT.onchange = updateUI; elC.onchange = fillSubs; fillSubs();
    }

    fbMethods.onSnapshot(fbMethods.query(txRef, fbMethods.orderBy("date", "desc")), (snap) => {
        allTx = []; snap.forEach(d => allTx.push({ id: d.id, ...d.data() }));
        if (!document.getElementById("fromDate").value) setRange('today'); else render();
    });

    document.getElementById("txForm").onsubmit = async (e) => {
        e.preventDefault();
        const amt = Number(document.getElementById("amount").value);
        const catObj = [...DEFAULTS.income, ...DEFAULTS.expense].find(c => c.id === document.getElementById("category").value);
        if(!amt || !catObj) return;
        await fbMethods.addDoc(txRef, {
            type: document.getElementById("type").value,
            amount: amt,
            categoryName: catObj.name,
            subcategory: document.getElementById("subcategory").value || "",
            account: document.getElementById("accountSelect").value,
            date: document.getElementById("date").value,
            time: new Date().toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}),
            comment: document.getElementById("comment").value,
            createdAt: Date.now()
        });
        document.getElementById("amount").value = ""; document.getElementById("comment").value = ""; setToday();
    };
}

window.setRange = (m) => {
    const f = document.getElementById("fromDate"), t = document.getElementById("toDate"), n = new Date();
    const off = n.getTimezoneOffset() * 60000, today = new Date(n - off).toISOString().split('T')[0];
    if (m === 'today') { f.value = today; t.value = today; }
    else if (m === 'yesterday') { const y = new Date(n - off); y.setDate(y.getDate()-1); f.value = y.toISOString().split('T')[0]; t.value = f.value; }
    else { f.value = ""; t.value = ""; } render();
};

function render() {
    const from = document.getElementById("fromDate").value, to = document.getElementById("toDate").value;
    const filtered = allTx.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

    const inc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const gas = filtered.filter(t => t.subcategory === 'Бензин').reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (inc - exp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = inc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = exp.toLocaleString() + " ₸";

    // Счета
    const accs = {};
    filtered.forEach(t => { accs[t.account] = (accs[t.account] || 0) + (t.type === 'income' ? t.amount : -t.amount); });
    document.getElementById("accountBalances").innerHTML = Object.entries(accs).map(([n, v]) => `${n}: <b>${v.toLocaleString()}</b>`).join(" | ");

    // Реальный доход
    const statsInc = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const k = t.subcategory || t.categoryName;
        if(!statsInc[k]) statsInc[k] = { sum: 0, cnt: 0, br: {} };
        statsInc[k].sum += t.amount; statsInc[k].cnt++;
        statsInc[k].br[t.amount] = (statsInc[k].br[t.amount] || 0) + 1;
    });
    document.getElementById("earningsDetails").innerHTML = Object.entries(statsInc).map(([k, d]) => `
        <div class="stat-row"><div class="stat-main"><span>${k} (${d.cnt})</span><b>${d.sum.toLocaleString()} ₸</b></div>
        <div class="stat-sub">${Object.entries(d.br).map(([p, c]) => `${p}₸×${c}`).join(" | ")}</div></div>`).join("");

    // --- ЛОГИКА ВД ---
    let totalGain = 0; const vdData = {};
    const pts = ["F1", "F2", "F3"];

    filtered.forEach(t => {
        if (t.type === 'income') {
            let pot = -1; const a = t.amount;
            if (a >= 3000 && a <= 5000) pot = -1; 
            else if (pts.includes(t.subcategory)) {
                if (a === 150) pot = 600; else if (a === 300) pot = 900;
                else if ([1000, 1500, 2000].includes(a)) pot = a;
            } else if (t.subcategory === "Ночь") {
                if (a === 500) pot = 1000; else if ([1000, 1500, 2000].includes(a)) pot = a;
            }
            if (pot !== -1) {
                if(!vdData[t.subcategory]) vdData[t.subcategory] = { potSum: 0, realSum: 0 };
                vdData[t.subcategory].potSum += pot; vdData[t.subcategory].realSum += a;
            }
        }
    });

    document.getElementById("potentialStats").innerHTML = Object.entries(vdData).map(([n, d]) => {
        const diff = d.potSum - d.realSum; totalGain += diff;
        return `<div class="stat-row"><div class="stat-main"><span>${n} <small class="muted">(${d.realSum} → ${d.potSum})</small></span>
                <b>${d.potSum.toLocaleString()} ₸</b></div><div style="color:#65d48b;font-size:12px;">Выгода: +${diff.toLocaleString()} ₸</div></div>`;
    }).join("") || '<div class="muted">Нет данных ВД</div>';
    
    if(totalGain > 0) document.getElementById("potentialStats").innerHTML += `<div class="gain-box"><span>ЧИСТАЯ ВЫГОДА ВД:</span><span class="pos">+${totalGain.toLocaleString()} ₸</span></div>`;

    // Расходы и История
    const statsExp = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        if(!statsExp[t.categoryName]) statsExp[t.categoryName] = { sum: 0, subs: {} };
        statsExp[t.categoryName].sum += t.amount;
        if(t.subcategory) statsExp[t.categoryName].subs[t.subcategory] = (statsExp[t.categoryName].subs[t.subcategory] || 0) + t.amount;
    });
    document.getElementById("expenseDetails").innerHTML = Object.entries(statsExp).map(([c, d]) => `
        <div class="stat-row"><div class="stat-main"><span>${c}</span><b class="neg">${d.sum.toLocaleString()} ₸</b></div>
        <div class
