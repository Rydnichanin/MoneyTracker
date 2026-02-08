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

    document.getElementById("fromDate").oninput = render;
    document.getElementById("toDate").oninput = render;

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

    const realTotalInc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const realTotalExp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (realTotalInc - realTotalExp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = realTotalInc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = realTotalExp.toLocaleString() + " ₸";

    // --- ЛОГИКА ВЗ (ТОЛЬКО ТОЧКИ) ---
    let potDotsSum = 0;       
    let realBaseDotsValue = 0; 
    const potBreakdown = {};

    filtered.filter(t => t.type === 'income').forEach(t => {
        const sub = t.subcategory || "";
        const amt = t.amount;

        // Исключаем Карго и Зарплаты (4000, 4500, 5000)
        if (sub === "Карго" || [4000, 4500, 5000].includes(amt)) return;

        // Считаем только точки F1, F2, F3, Ночь
        if (["F1", "F2", "F3", "Ночь"].includes(sub)) {
            let pAmt = amt;
            if (amt === 150) pAmt = 600;
            else if (amt === 300) pAmt = 900;
            else if (sub === "Ночь" && amt === 500) pAmt = 1000;
            // 1000 и 2000 остаются как есть автоматически
            
            if (!potBreakdown[sub]) potBreakdown[sub] = { count: 0, sum: 0 };
            potBreakdown[sub].count++;
            potBreakdown[sub].sum += pAmt;
            
            potDotsSum += pAmt;
            realBaseDotsValue += amt;
        }
    });

    const pureGain = potDotsSum - realBaseDotsValue;

    document.getElementById("potentialStats").innerHTML = `
        <div style="border-bottom: 1px solid #333; padding-bottom: 8px; margin-bottom: 10px;">
            ${Object.entries(potBreakdown).map(([n, d]) => `
                <div style="display:flex; justify-content:space-between; font-size:13px; margin-top:4px;">
                    <span>${n} <small class="muted">x${d.count}</small></span>
                    <b>${d.sum.toLocaleString()} ₸</b>
                </div>
            `).join("") || "<small class='muted'>Нет точек для пересчета</small>"}
        </div>
        <div style="display:flex; justify-content:space-between; font-size:14px;">
            <span>Итого за точки (ВД):</span>
            <b style="color:var(--accent)">${potDotsSum.toLocaleString()} ₸</b>
        </div>
        <div class="gain-box">
            <div style="display:flex; justify-content:space-between;">
                <span style="font-size: 13px;">Чистая выгода:</span>
                <b class="pos">+${pureGain.toLocaleString()} ₸</b>
            </div>
            <div style="font-size: 10px; color: #888; margin-top: 5px; text-align: center;">
                (Разница между новыми тарифами и реалом)
            </div>
        </div>
    `;

    // ИСТОРИЯ
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div><b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
            <small class="muted">${t.date} • ${t.subcategory || t.categoryName}</small></div>
            <button onclick="deleteTx('${t.id}')" style="background:none; border:none; color:#555; padding:10px;">✕</button>
        </div>`).join("");

    // СТАТИСТИКА ДОХОДОВ
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

    // СТАТИСТИКА РАСХОДОВ
    const exps = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        const k = t.categoryName;
        if (!exps[k]) exps[k] = 0;
        exps[k] += t.amount;
    });
    document.getElementById("expenseDetails").innerHTML = Object.entries(exps).map(([k, v]) => `
        <div class="stat-row">
            <div class="stat-main"><span>${k}</span><b class="neg">${v.toLocaleString()} ₸</b></div>
        </div>`).join("") || "<small class='muted'>Нет расходов</small>";
}

window.deleteTx = async (id) => { if(confirm("Удалить запись?")) await window.fbMethods.deleteDoc(window.fbMethods.doc(window.fbDB, "transactions", id)); };
