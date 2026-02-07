const DEFAULTS = {
    income: [
        { id: "delivery", name: "Доставка", sub: ["F1", "F2", "F3", "Карго", "Ночь"] },
        { id: "other_inc", name: "Прочий доход", sub: [] }
    ],
    expense: [
        { id: "auto", name: "Авто", sub: ["Бензин", "Ремонт", "Запчасти", "Мойка"] },
        { id: "food", name: "Еда", sub: [] },
        { id: "drinks", name: "Напитки", sub: [] },
        { id: "home", name: "Дом/Быт", sub: [] },
        { id: "clothes", name: "Одежда", sub: [] },
        { id: "other_exp", name: "Прочее", sub: [] }
    ]
};

let allTransactions = [];

const checkFB = setInterval(() => {
    if (window.fbDB && window.fbMethods) { 
        clearInterval(checkFB); 
        initApp(); 
    }
}, 100);

function initApp() {
    const { fbDB, fbMethods } = window;
    const colRef = fbMethods.collection(fbDB, "transactions");

    const elT = document.getElementById("type"), elC = document.getElementById("category"), 
          elS = document.getElementById("subcategory"), sw = document.getElementById("subcatWrap");

    const fillCategories = () => {
        const type = elT.value;
        const cats = DEFAULTS[type] || [];
        elC.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        fillSubcategories();
    };

    const fillSubcategories = () => {
        const cats = DEFAULTS[elT.value] || [];
        const currentCat = cats.find(c => c.id === elC.value);
        if (currentCat && currentCat.sub && currentCat.sub.length > 0) { 
            sw.classList.remove("hidden"); 
            elS.innerHTML = currentCat.sub.map(s => `<option value="${s}">${s}</option>`).join(""); 
        } else {
            sw.classList.add("hidden");
            elS.innerHTML = ""; 
        }
    };

    elT.onchange = fillCategories;
    elC.onchange = fillSubcategories;
    fillCategories();

    document.getElementById("date").value = new Date().toISOString().split('T')[0];

    fbMethods.onSnapshot(fbMethods.query(colRef, fbMethods.orderBy("date", "desc")), (snapshot) => {
        allTransactions = [];
        snapshot.forEach(doc => allTransactions.push({ id: doc.id, ...doc.data() }));
        render();
    });

    document.getElementById("fromDate").onchange = render;
    document.getElementById("toDate").onchange = render;

    document.getElementById("txForm").onsubmit = async (e) => {
        e.preventDefault();
        const amount = Number(document.getElementById("amount").value);
        const type = elT.value;
        const catObj = DEFAULTS[type].find(c => c.id === elC.value);
        
        try {
            await fbMethods.addDoc(colRef, {
                type: type,
                amount: amount,
                categoryId: elC.value,
                categoryName: catObj ? catObj.name : elC.value,
                subcategory: elS.value || "",
                date: document.getElementById("date").value,
                accountId: document.getElementById("account").value,
                createdAt: Date.now()
            });
            document.getElementById("amount").value = "";
        } catch (e) { alert("Ошибка!"); }
    };
}

function render() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    const filtered = allTransactions.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

    const inc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (inc - exp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = inc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = exp.toLocaleString() + " ₸";

    // --- ЛОГИКА ВОЗМОЖНОГО ЗАРАБОТКА ---
    let potTotal = 0;
    let realBaseForComp = 0; 
    const potBreakdown = {};

    filtered.filter(t => t.type === 'income').forEach(t => {
        const sub = t.subcategory || t.categoryName || "";
        
        // Фильтр: считаем только F1-F3 и Ночь. Карго и з/п игнорируем.
        if (!["F1", "F2", "F3", "Ночь"].includes(sub) || [4000, 4500, 5000].includes(t.amount)) return;

        realBaseForComp += t.amount;

        let pAmount = t.amount;
        if (["F1", "F2", "F3"].includes(sub)) {
            if (t.amount === 150) pAmount = 600;
            else if (t.amount === 300) pAmount = 900;
        } else if (sub === "Ночь" && t.amount === 500) {
            pAmount = 1000;
        }

        if (!potBreakdown[sub]) potBreakdown[sub] = { count: 0, sum: 0 };
        potBreakdown[sub].count += 1;
        potBreakdown[sub].sum += pAmount;
        potTotal += pAmount;
    });

    const diff = potTotal - realBaseForComp;

    const breakdownHTML = Object.entries(potBreakdown)
        .sort((a,b) => b[1].sum - a[1].sum)
        .map(([name, data]) => `
            <div style="display: flex; justify-content: space-between; font-size: 13px; color: #ccc; margin-top: 4px;">
                <span>${name} <small style="color:#777">x${data.count}</small></span>
                <span>${data.sum.toLocaleString()} ₸</span>
            </div>
        `).join("");

    document.getElementById("potentialStats").innerHTML = `
        <div style="margin-bottom: 10px; border-bottom: 1px solid #333; padding-bottom: 8px;">
            ${breakdownHTML || "<small class='muted'>Нет данных по точкам</small>"}
        </div>
        <div style="display: flex; justify-content: space-between;">
            <span style="color: #ffd166;">Возможно за точки:</span>
            <b style="color: #ffd166;">${potTotal.toLocaleString()} ₸</b>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 5px;">
            <span class="muted">Чистая выгода:</span>
            <b class="pos">+${diff.toLocaleString()} ₸</b>
        </div>
    `;

    // --- ИСТОРИЯ И ОСТАЛЬНАЯ СТАТИСТИКА ---
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div><b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
            <small class="muted">${t.date} • ${t.subcategory || t.categoryName || t.categoryId}</small></div>
            <button class="del-btn" onclick="deleteTx('${t.id}')">✕</button>
        </div>`).join("");

    const earns = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const k = t.subcategory || t.categoryName || "Прочее";
        if (!earns[k]) earns[k] = { sum: 0, count: 0, breakdown: {} };
        earns[k].sum += t.amount;
        earns[k].count += 1;
        earns[k].breakdown[t.amount] = (earns[k].breakdown[t.amount] || 0) + 1;
    });
    
    document.getElementById("earningsDetails").innerHTML = Object.keys(earns).sort((a,b)=>earns[b].sum-earns[a].sum).map(k => {
        const det = Object.entries(earns[k].breakdown).sort((a,b)=>b[0]-a[0]).map(([p, c]) => `${p}×${c}шт`).join(" | ");
        return `<div class="stat-row-complex">
            <div class="stat-main"><span>${k} <small>(${earns[k].count} шт.)</small></span><b>${earns[k].sum.toLocaleString()} ₸</b></div>
            <div class="stat-sub">${det}</div>
        </div>`;
    }).join("");

    const expStats = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        const mainCat = t.categoryName || "Прочее";
        const subCat = t.subcategory || "";
        if (!expStats[mainCat]) expStats[mainCat] = { total: 0, subs: {} };
        expStats[mainCat].total += t.amount;
        if (subCat) expStats[mainCat].subs[subCat] = (expStats[mainCat].subs[subCat] || 0) + t.amount;
    });

    document.getElementById("expenseDetails").innerHTML = Object.keys(expStats).sort((a,b) => expStats[b].total - expStats[a].total).map(cat => {
        const data = expStats[cat];
        const hasSubs = Object.keys(data.subs).length > 0;
        if (hasSubs) {
            const subRows = Object.entries(data.subs).sort((a,b) => b[1] - a[1]).map(([n, s]) => `
                <div class="stat-sub-row"><span>${n}</span><span>${s.toLocaleString()} ₸</span></div>
            `).join("");
            return `<details class="exp-details">
                <summary class="stat-main"><span>${cat} <small>▼</small></span><b class="neg">${data.total.toLocaleString()} ₸</b></summary>
                <div class="exp-subs-content">${subRows}</div>
            </details>`;
        } else {
            return `<div class="stat-main" style="padding: 12px 0; border-bottom: 1px solid #222;"><span>${cat}</span><b class="neg">${data.total.toLocaleString()} ₸</b></div>`;
        }
    }).join("");
}

window.setAmount = (v) => { document.getElementById("amount").value = v; };
window.deleteTx = async (id) => { if(confirm("Удалить?")) await window.fbMethods.deleteDoc(window.fbMethods.doc(window.fbDB, "transactions", id)); };

document.querySelector(".quick2").onclick = (e) => {
    const r = e.target.dataset.range; if (!r) return;
    const now = new Date().toISOString().split('T')[0];
    if (r === 'today') { document.getElementById("fromDate").value = now; document.getElementById("toDate").value = now; }
    else if (r === 'week') {
        const d = new Date(); d.setDate(d.getDate() - 7);
        document.getElementById("fromDate").value = d.toISOString().split('T')[0];
        document.getElementById("toDate").value = now;
    } else { document.getElementById("fromDate").value = ""; document.getElementById("toDate").value = ""; }
    render();
};

document.getElementById("toggleHistory").onclick = () => {
    const c = document.getElementById("histContent");
    c.classList.toggle("hidden");
    document.getElementById("histArrow").textContent = c.classList.contains("hidden") ? "▼" : "▲";
};

document.getElementById("togglePotential").onclick = () => {
    const c = document.getElementById("potentialContent");
    c.classList.toggle("hidden");
    document.getElementById("potArrow").textContent = c.classList.contains("hidden") ? "▼" : "▲";
};
