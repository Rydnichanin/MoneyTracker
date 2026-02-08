const DEFAULTS = {
    income: [
        { id: "delivery", name: "Доставка", sub: ["F1", "F2", "F3", "Карго", "Ночь"] },
        { id: "other_inc", name: "Прочий доход", sub: [] }
    ],
    expense: [
        { id: "auto", name: "Авто", sub: ["Бензин", "Ремонт", "Мойка", "Запчасти"] },
        { id: "house", name: "Быт", sub: [] },
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

    document.getElementById("fromDate").oninput = render;
    document.getElementById("toDate").oninput = render;

    document.getElementById("txForm").onsubmit = async (e) => {
        e.preventDefault();
        const amt = Number(document.getElementById("amount").value);
        const catObj = DEFAULTS[elT.value].find(i => i.id === elC.value);
        await fbMethods.addDoc(colRef, {
            type: elT.value, 
            amount: amt, 
            categoryName: catObj ? catObj.name : "Прочее",
            subcategory: elS.value || "", 
            date: document.getElementById("date").value,
            createdAt: Date.now()
        });
        document.getElementById("amount").value = "";
    };
}

function render() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    const filtered = allTransactions.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

    // --- РЕАЛЬНЫЕ ПОКАЗАТЕЛИ ---
    const realTotalInc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const realTotalExp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (realTotalInc - realTotalExp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = realTotalInc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = realTotalExp.toLocaleString() + " ₸";

    // --- РАСЧЕТ ВД (СТРОГО ПО ТВОЕЙ ФОРМУЛЕ) ---
    let totalPotDotsOnly = 0;   // Сумма всех точек по НОВОМУ тарифу
    let totalRealDotsOnly = 0;  // Сумма тех же самых записей по СТАРОМУ тарифу
    const potBreakdown = {};

    filtered.forEach(t => {
        if (t.type !== 'income') return;
        const sub = t.subcategory || "";
        const amt = t.amount;

        // Исключаем Карго и ЗП (4000+)
        if (sub === "Карго" || amt >= 4000) return;

        // Только точки
        if (["F1", "F2", "F3", "Ночь"].includes(sub)) {
            let pAmt = amt; // Значение которое "должно быть"
            
            if (amt === 150) pAmt = 600;
            else if (amt === 300) pAmt = 900;
            else if (sub === "Ночь" && amt === 500) pAmt = 1000;
            // 1000 и 2000 остаются как есть
            
            if (!potBreakdown[sub]) potBreakdown[sub] = { count: 0, sumPot: 0 };
            potBreakdown[sub].count++;
            potBreakdown[sub].sumPot += pAmt;
            
            totalPotDotsOnly += pAmt;
            totalRealDotsOnly += amt;
        }
    });

    // Чистая выгода = (Все точки по-новому) МИНУС (Все точки по-старому)
    const pureGain = totalPotDotsOnly - totalRealDotsOnly;
    // Финальный ВД = Твой реальный доход (с ЗП и прочим) + выгода
    const finalVdTotal = realTotalInc + pureGain;

    document.getElementById("potentialStats").innerHTML = `
        <div style="border-bottom: 1px solid #333; padding-bottom: 8px; margin-bottom: 10px;">
            ${Object.entries(potBreakdown).map(([n, d]) => `
                <div style="display:flex; justify-content:space-between; font-size:13px; margin-top:4px;">
                    <span>${n} <small class="muted">x${d.count}</small></span>
                    <b>${d.sumPot.toLocaleString()} ₸</b>
                </div>
            `).join("") || "<small class='muted'>Точек для пересчета не найдено</small>"}
        </div>
        <div style="display:flex; justify-content:space-between; font-size:15px; color: var(--accent); font-weight: bold;">
            <span>Итого (ВД + Зарплаты):</span>
            <b>${finalVdTotal.toLocaleString()} ₸</b>
        </div>
        <div class="gain-box">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12px;">Чистая выгода:</span>
                <b class="pos" style="font-size:18px;">+${pureGain.toLocaleString()} ₸</b>
            </div>
        </div>
    `;

    // --- ИСТОРИЯ, ДОХОДЫ И РАСХОДЫ ---
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div><b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
            <small class="muted">${t.date} • ${t.subcategory || t.categoryName}</small></div>
            <button onclick="deleteTx('${t.id}')" style="background:none; border:none; color:#444; padding:5px 10px;">✕</button>
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
        const k = t.categoryName || "Прочее";
        if (!exps[k]) exps[k] = 0;
        exps[k] += t.amount;
    });
    document.getElementById("expenseDetails").innerHTML = Object.entries(exps).map(([k, v]) => `
        <div class="stat-row">
            <div class="stat-main"><span>${k}</span><b class="neg">${v.toLocaleString()} ₸</b></div>
        </div>`).join("") || "<small class='muted'>Расходов нет</small>";
}

window.deleteTx = async (id) => { if(confirm("Удалить запись?")) await window.fbMethods.deleteDoc(window.fbMethods.doc(window.fbDB, "transactions", id)); };
