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

    // 1. ПОДГРУЖАЕМ НАСТРОЙКИ (Категории, Счета)
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

    // 2. ФУНКЦИИ НАСТРОЕК
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

    window.deleteSet = async (id) => { if(confirm("Удалить настройку?")) await fbMethods.deleteDoc(fbMethods.doc(fbDB, "settings", id)); };

    // 3. ОБНОВЛЕНИЕ ИНТЕРФЕЙСА
    function updateUI() {
        const elT = document.getElementById("type"), elC = document.getElementById("category"), 
              elS = document.getElementById("subcategory"), elAcc = document.getElementById("accountSelect");

        elAcc.innerHTML = ACCOUNTS.map(a => `<option value="${a.name}">${a.name}</option>`).join("") || '<option>Добавьте счет</option>';
        
        const cats = DEFAULTS[elT.value];
        elC.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        
        // Список категорий для добавления подкатегорий в настройках
        document.getElementById("setParentCat").innerHTML = [...DEFAULTS.income, ...DEFAULTS.expense].map(c => `<option value="${c.id}">${c.name}</option>`).join("");

        const fillSubs = () => {
            const cat = cats.find(c => c.id === elC.value);
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

    // 4. ТРАНЗАКЦИИ
    fbMethods.onSnapshot(fbMethods.query(txRef, fbMethods.orderBy("date", "desc")), (snap) => {
        allTx = [];
        snap.forEach(d => allTx.push({ id: d.id, ...d.data() }));
        render();
    });

    document.getElementById("txForm").onsubmit = async (e) => {
        e.preventDefault();
        const amt = Number(document.getElementById("amount").value);
        if(!amt) return;
        const catObj = DEFAULTS[document.getElementById("type").value].find(c => c.id === document.getElementById("category").value);
        
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
        document.getElementById("amount").value = "";
        document.getElementById("comment").value = "";
    };
}

function render() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    const filtered = allTx.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

    const realInc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const realExp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const gasExp = filtered.filter(t => t.subcategory === 'Бензин').reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (realInc - realExp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = realInc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = realExp.toLocaleString() + " ₸";

    // Баланс по счетам
    const accBals = {};
    filtered.forEach(t => {
        if(!accBals[t.account]) accBals[t.account] = 0;
        accBals[t.account] += (t.type === 'income' ? t.amount : -t.amount);
    });
    document.getElementById("accountBalances").innerHTML = Object.entries(accBals).map(([name, val]) => 
        `<span>${name}: <b class="${val>=0?'pos':'neg'}">${val.toLocaleString()}</b></span>`).join(" | ");

    const gasP = realInc > 0 ? ((gasExp / realInc) * 100).toFixed(1) : 0;
    document.getElementById("gasText").textContent = `Бензин: ${gasP}% (${gasExp.toLocaleString()} ₸)`;
    document.getElementById("gasFill").style.width = Math.min(gasP * 3, 100) + "%";

    // Статистика Дохода (Реал)
    const realBySub = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const k = t.subcategory || t.categoryName;
        if (!realBySub[k]) realBySub[k] = { sum: 0, count: 0, br: {} };
        realBySub[k].sum += t.amount; realBySub[k].count++;
        realBySub[k].br[t.amount] = (realBySub[k].br[t.amount] || 0) + 1;
    });
    document.getElementById("earningsDetails").innerHTML = Object.entries(realBySub).map(([k, d]) => `
        <div class="stat-row"><div class="stat-main"><span>${k} (${d.count})</span><b>${d.sum.toLocaleString()} ₸</b></div>
        <div class="stat-sub">${Object.entries(d.br).map(([p, c]) => `${p}₸×${c}`).join(" | ")}</div></div>`).join("");

    // ВОЗМОЖНЫЙ ДОХОД
    let totalGain = 0; const vdStats = {}; const pts = ["F1", "F2", "F3", "Ночь"];
    filtered.forEach(t => {
        if (t.type === 'income' && pts.includes(t.subcategory) && t.amount < 4000) {
            if(!vdStats[t.subcategory]) vdStats[t.subcategory] = { vdSum: 0 };
            let pot = t.amount;
            if (t.amount === 150) pot = 600;
            else if (t.amount === 300) pot = 900;
            else if (t.subcategory === "Ночь" && t.amount === 500) pot = 1000;
            vdStats[t.subcategory].vdSum += pot;
        }
    });
    const vdHtml = Object.entries(vdStats).map(([p, data]) => {
        const rSum = realBySub[p] ? realBySub[p].sum : 0;
        const diff = data.vdSum - rSum; totalGain += diff;
        return `<div class="stat-row"><div class="stat-main"><span>${p}</span><b>${data.vdSum.toLocaleString()} ₸</b></div>
                <div class="stat-vd-info">Выгода: +${diff.toLocaleString()} ₸</div></div>`;
    }).join("");
    document.getElementById("potentialStats").innerHTML = vdHtml || '<div class="muted">Нет данных</div>';
    if(totalGain > 0) document.getElementById("potentialStats").innerHTML += `<div class="gain-box"><span>ВЫГОДА ВД:</span><span class="pos">+${totalGain.toLocaleString()} ₸</span></div>`;

    // Расходы
    const exG = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        if (!exG[t.categoryName]) exG[t.categoryName] = { total: 0, subs: {} };
        exG[t.categoryName].total += t.amount;
        if (t.subcategory) exG[t.categoryName].subs[t.subcategory] = (exG[t.categoryName].subs[t.subcategory] || 0) + t.amount;
    });
    document.getElementById("expenseDetails").innerHTML = Object.entries(exG).map(([c, d]) => `
        <div class="stat-row"><div class="stat-main"><span>${c}</span><b class="neg">${d.total.toLocaleString()} ₸</b></div>
        <div class="stat-sub">${Object.entries(d.subs).map(([s, v]) => `${s}: ${v.toLocaleString()}₸`).join(" | ")}</div></div>`).join("");

    // История
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item"><div style="flex:1">
            <b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
            <small class="muted">${t.date} ${t.time} | ${t.subcategory || t.categoryName} [${t.account}]</small>
            ${t.comment ? `<div style="color:var(--pos); font-size:12px;">📝 ${t.comment}</div>` : ''}
        </div><button onclick="deleteTx('${t.id}')" style="background:none;border:none;color:#444;padding:10px;">✕</button></div>`).join("");
}

window.deleteTx = async (id) => { if(confirm("Удалить?")) await window.fbMethods.deleteDoc(window.fbMethods.doc(window.fbDB, "transactions", id)); };
