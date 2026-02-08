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
        const cat = DEFAULTS[elT.value].find(i => i.id === elC.value);
        if (cat && cat.sub.length > 0) { sw.classList.remove("hidden"); elS.innerHTML = cat.sub.map(s => `<option value="${s}">${s}</option>`).join(""); }
        else { sw.classList.add("hidden"); elS.innerHTML = ""; }
    };

    elT.onchange = fillCats; elC.onchange = fillSubs;
    fillCats();

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
        if(!amt) return;
        const catObj = DEFAULTS[elT.value].find(i => i.id === elC.value);
        try {
            await fbMethods.addDoc(colRef, {
                type: elT.value, amount: amt, categoryName: catObj.name,
                subcategory: elS.value || "", date: document.getElementById("date").value,
                createdAt: Date.now()
            });
            document.getElementById("amount").value = "";
        } catch (err) { alert("Ошибка сохранения!"); }
    };
}

function render() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    const filtered = allTransactions.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

    // Реальные итоги (карманы)
    const realInc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const realExp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (realInc - realExp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = realInc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = realExp.toLocaleString() + " ₸";

    // --- РАСЧЕТ ВД (ТОЛЬКО ТОЧКИ ИЗ СПИСКА) ---
    let vdOnlyPoints = 0;
    let rdOnlyPoints = 0;
    let potBreakdown = {};

    filtered.forEach(t => {
        if (t.type !== 'income') return;
        const sub = t.subcategory || "";
        const amt = t.amount;

        // Считаем ТОЛЬКО точки (F1, F2, F3, Ночь) и игнорируем всё остальное
        if (["F1", "F2", "F3", "Ночь"].includes(sub) && amt < 4000) {
            let pAmt = amt;
            if (amt === 150) pAmt = 600;
            else if (amt === 300) pAmt = 900;
            else if (sub === "Ночь" && amt === 500) pAmt = 1000;
            // 1000 и 2000 учитываются без изменений

            vdOnlyPoints += pAmt;
            rdOnlyPoints += amt;

            if(!potBreakdown[sub]) potBreakdown[sub] = { count: 0, sum: 0 };
            potBreakdown[sub].count++;
            potBreakdown[sub].sum += pAmt;
        }
    });

    const pureGain = vdOnlyPoints - rdOnlyPoints;

    document.getElementById("potentialStats").innerHTML = `
        <div style="border-bottom: 1px solid #333; padding-bottom: 8px; margin-bottom: 10px;">
            ${Object.entries(potBreakdown).map(([n, d]) => `
                <div style="display:flex; justify-content:space-between; font-size:13px; margin-top:4px;">
                    <span>${n} x${d.count}</span><b>${d.sum.toLocaleString()} ₸</b>
                </div>`).join("") || "<small class='muted'>Точек нет</small>"}
        </div>
        <div style="display:flex; justify-content:space-between; font-size:15px; color:var(--accent); font-weight:bold;">
            <span>Всего за точки (ВД):</span><b>${vdOnlyPoints.toLocaleString()} ₸</b>
        </div>
        <div style="margin-top:10px; border:1px solid var(--pos); padding:8px; border-radius:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <small>Выгода (разница):</small><b class="pos">+${pureGain.toLocaleString()} ₸</b>
            </div>
        </div>
    `;

    // Реальный доход по категориям
    const earns = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const k = t.subcategory || t.categoryName;
        if (!earns[k]) earns[k] = { sum: 0, count: 0 };
        earns[k].sum += t.amount; earns[k].count++;
    });
    document.getElementById("earningsDetails").innerHTML = Object.entries(earns).map(([k, d]) => `
        <div class="stat-row"><span>${k} (${d.count})</span><b>${d.sum.toLocaleString()} ₸</b></div>`).join("");

    // Расходы (Группировка)
    const exps = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        const k = t.categoryName || "Прочее";
        if (!exps[k]) exps[k] = 0;
        exps[k] += t.amount;
    });
    document.getElementById("expenseDetails").innerHTML = Object.entries(exps).map(([k, v]) => `
        <div class="stat-row"><span>${k}</span><b class="neg">${v.toLocaleString()} ₸</b></div>`).join("") || "Расходов нет";

    // История
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div><b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
            <small class="muted">${t.date} • ${t.subcategory || t.categoryName}</small></div>
            <button onclick="deleteTx('${t.id}')" style="background:none; border:none; color:#555;">✕</button>
        </div>`).join("");
}

window.deleteTx = async (id) => { if(confirm("Удалить?")) await window.fbMethods.deleteDoc(window.fbMethods.doc(window.fbDB, "transactions", id)); };
