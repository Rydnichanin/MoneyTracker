const DEFAULTS = {
    income: [
        { id: "delivery", name: "Доставка", sub: ["F1", "F2", "F3", "Карго", "Ночь"] },
        { id: "other_inc", name: "Прочий доход", sub: [] }
    ],
    expense: [
        { id: "auto", name: "Авто", sub: ["Бензин", "Ремонт", "Мойка", "Запчасти"] },
        { id: "food", name: "Еда", sub: [] },
        { id: "other_exp", name: "Прочее", sub: [] }
    ]
};

let allTransactions = [];

const checkFB = setInterval(() => {
    if (window.fbDB && window.fbMethods) { clearInterval(checkFB); initApp(); }
}, 100);

function initApp() {
    const { fbDB, fbMethods } = window;
    const colRef = fbMethods.collection(fbDB, "transactions");
    const elT = document.getElementById("type"), elC = document.getElementById("category"), 
          elS = document.getElementById("subcategory"), sw = document.getElementById("subcatWrap");

    const fillCats = () => {
        elC.innerHTML = DEFAULTS[elT.value].map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        fillSubs();
    };
    const fillSubs = () => {
        const c = DEFAULTS[elT.value].find(i => i.id === elC.value);
        if (c && c.sub.length > 0) { sw.classList.remove("hidden"); elS.innerHTML = c.sub.map(s => `<option value="${s}">${s}</option>`).join(""); }
        else { sw.classList.add("hidden"); elS.innerHTML = ""; }
    };

    elT.onchange = fillCats; elC.onchange = fillSubs;
    fillCats();

    document.getElementById("date").value = new Date().toISOString().split('T')[0];

    fbMethods.onSnapshot(fbMethods.query(colRef, fbMethods.orderBy("date", "desc")), (snap) => {
        allTransactions = [];
        snap.forEach(d => allTransactions.push({ id: d.id, ...d.data() }));
        render();
    });

    document.getElementById("fromDate").onchange = render;
    document.getElementById("toDate").onchange = render;

    document.getElementById("txForm").onsubmit = async (e) => {
        e.preventDefault();
        const amt = Number(document.getElementById("amount").value);
        const cat = DEFAULTS[elT.value].find(i => i.id === elC.value);
        await fbMethods.addDoc(colRef, {
            type: elT.value, amount: amt, categoryName: cat.name,
            subcategory: elS.value || "", date: document.getElementById("date").value,
            createdAt: Date.now()
        });
        document.getElementById("amount").value = "";
    };
}

function render() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    const filtered = allTransactions.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

    const incRealTotal = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expTotal = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (incRealTotal - expTotal).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = incRealTotal.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = expTotal.toLocaleString() + " ₸";

    // --- МАТЕМАТИКА ВОЗМОЖНОГО ЗАРАБОТКА ---
    let possibleDotsSum = 0;   
    let realIncomeNoCargo = 0; 
    const potBreakdown = {};

    filtered.filter(t => t.type === 'income').forEach(t => {
        const sub = t.subcategory || "";
        const amt = t.amount;

        // В Реальном: всё кроме Карго
        if (sub !== "Карго") realIncomeNoCargo += amt;

        // В Возможном: пересчет только точек
        if (["F1", "F2", "F3", "Ночь"].includes(sub) && ![4000, 4500, 5000].includes(amt)) {
            let pAmt = amt;
            if (amt === 150) pAmt = 600;
            else if (amt === 300) pAmt = 900;
            else if (sub === "Ночь" && amt === 500) pAmt = 1000;
            // 1000 и 2000 остаются как есть по умолчанию

            if (!potBreakdown[sub]) potBreakdown[sub] = { count: 0, sum: 0 };
            potBreakdown[sub].count++;
            potBreakdown[sub].sum += pAmt;
            possibleDotsSum += pAmt;
        }
    });

    // Считаем разницу: (ВЗ за точки + Зарплаты) - Реальный доход без Карго
    // Для простоты: Разница = Пересчитанные точки - Их реальная стоимость
    const realDotsValue = filtered.filter(t => ["F1", "F2", "F3", "Ночь"].includes(t.subcategory) && ![4000, 4500, 5000].includes(t.amount)).reduce((s,t)=>s+t.amount, 0);
    const pureGain = possibleDotsSum - realDotsValue;

    document.getElementById("potentialStats").innerHTML = `
        <div style="border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 10px;">
            ${Object.entries(potBreakdown).map(([n, d]) => `
                <div style="display:flex; justify-content:space-between; font-size:13px; margin-top:5px;">
                    <span>${n} <small class="muted">x${d.count}</small></span>
                    <b>${d.sum.toLocaleString()} ₸</b>
                </div>
            `).join("") || "<small class='muted'>Нет данных за период</small>"}
        </div>
        <div style="display:flex; justify-content:space-between; font-size:14px;">
            <span>Всего (Возможно):</span>
            <b style="color:var(--accent)">${(possibleDotsSum + (realIncomeNoCargo - realDotsValue)).toLocaleString()} ₸</b>
        </div>
        <div class="gain-box">
            <div style="display:flex; justify-content:space-between;">
                <span>Чистая выгода:</span>
                <b class="pos">+${pureGain.toLocaleString()} ₸</b>
            </div>
        </div>
    `;

    // --- ИСТОРИЯ И ДЕТАЛИ ---
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div><b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
            <small class="muted">${t.date} • ${t.subcategory || t.categoryName}</small></div>
            <button class="del-btn" onclick="deleteTx('${t.id}')">✕</button>
        </div>`).join("");

    const earns = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const k = t.subcategory || t.categoryName;
        if (!earns[k]) earns[k] = { sum: 0, count: 0, b: {} };
        earns[k].sum += t.amount; earns[k].count++;
        earns[k].b[t.amount] = (earns[k].b[t.amount] || 0) + 1;
    });
    document.getElementById("earningsDetails").innerHTML = Object.entries(earns).map(([k, d]) => `
        <div class="stat-row">
            <div class="stat-main"><span>${k} (${d.count})</span><b>${d.sum.toLocaleString()} ₸</b></div>
            <div class="stat-sub">${Object.entries(d.b).map(([p, c]) => `${p}×${c}`).join(" | ")}</div>
        </div>`).join("");

    const exps = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        if (!exps[t.categoryName]) exps[t.categoryName] = { total: 0, subs: {} };
        exps[t.categoryName].total += t.amount;
        if (t.subcategory) exps[t.categoryName].subs[t.subcategory] = (exps[t.categoryName].subs[t.subcategory] || 0) + t.amount;
    });
    document.getElementById("expenseDetails").innerHTML = Object.entries(exps).map(([cat, d]) => `
        <div class="stat-row">
            <div class="stat-main"><span>${cat}</span><b class="neg">${d.total.toLocaleString()} ₸</b></div>
        </div>`).join("");
}

window.deleteTx = async (id) => { if(confirm("Удалить?")) await window.fbMethods.deleteDoc(window.fbMethods.doc(window.fbDB, "transactions", id)); };
