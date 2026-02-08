const DEFAULTS = {
    income: [
        { id: "delivery", name: "Доставка", sub: ["F1", "F2", "F3", "Карго", "Ночь"] },
        { id: "other_inc", name: "Прочий доход", sub: [] }
    ],
    expense: [
        { id: "auto", name: "Авто", sub: ["Бензин", "Ремонт", "Мойка", "Запчасти"] },
        { id: "house", name: "Дом/Быт", sub: [] },
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
        await fbMethods.addDoc(colRef, {
            type: elT.value, amount: amt, categoryName: catObj.name,
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

    // Общие итоги
    const realInc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const realExp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (realInc - realExp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = realInc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = realExp.toLocaleString() + " ₸";

    // --- РАСЧЕТ ДОХОДА ПО ТОЧКАМ (КРАСИВЫЙ) ---
    const earns = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const k = t.subcategory || t.categoryName;
        if (!earns[k]) earns[k] = { sum: 0, count: 0 };
        earns[k].sum += t.amount; earns[k].count++;
    });

    document.getElementById("earningsDetails").innerHTML = Object.entries(earns).map(([k, d]) => `
        <div class="stat-row" style="margin-bottom:8px;">
            <span style="color:#ccc;">${k} <small style="color:#666;">(${d.count})</small></span>
            <b style="font-size:16px;">${d.sum.toLocaleString()} ₸</b>
        </div>`).join("");

    // --- РАСЧЕТ ВОЗМОЖНОГО ДОХОДА (МАТЕМАТИКА) ---
    let vdPointsSum = 0;
    let rdPointsSum = 0;
    let potBreakdown = {};

    filtered.forEach(t => {
        if (t.type !== 'income') return;
        const sub = t.subcategory || "";
        const amt = t.amount;

        // Берем ТОЛЬКО точки (F1, F2, F3, Ночь) для сравнения
        if (["F1", "F2", "F3", "Ночь"].includes(sub) && amt < 4000) {
            let pAmt = amt;
            if (amt === 150) pAmt = 600;
            else if (amt === 300) pAmt = 900;
            else if (sub === "Ночь" && amt === 500) pAmt = 1000;
            
            vdPointsSum += pAmt;
            rdPointsSum += amt;

            if(!potBreakdown[sub]) potBreakdown[sub] = { count: 0, sum: 0 };
            potBreakdown[sub].count++;
            potBreakdown[sub].sum += pAmt;
        }
    });

    const pureGain = vdPointsSum - rdPointsSum;

    document.getElementById("potentialStats").innerHTML = `
        <div style="border-bottom: 1px solid #222; padding-bottom: 8px; margin-bottom: 10px;">
            ${Object.entries(potBreakdown).map(([n, d]) => `
                <div style="display:flex; justify-content:space-between; font-size:13px; margin-top:4px; color:#aaa;">
                    <span>${n} x${d.count}</span><span style="color:#eee;">${d.sum.toLocaleString()} ₸</span>
                </div>`).join("") || "<small class='muted'>Нет точек</small>"}
        </div>
        <div style="display:flex; justify-content:space-between; font-size:16px; color:var(--accent); font-weight:bold;">
            <span>Итого:</span><b>${vdPointsSum.toLocaleString()} ₸</b>
        </div>
        <div style="margin-top:12px; background: rgba(0,255,127,0.05); border: 1px solid rgba(0,255,127,0.2); padding:10px; border-radius:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:13px; color:#00ff7f;">Разница (Выгода):</span>
                <b class="pos" style="font-size:18px;">+${pureGain.toLocaleString()} ₸</b>
            </div>
        </div>
    `;

    // Расходы (КРАСИВЫЕ)
    const exps = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        const k = t.categoryName || "Прочее";
        if (!exps[k]) exps[k] = 0;
        exps[k] += t.amount;
    });
    document.getElementById("expenseDetails").innerHTML = Object.entries(exps).map(([k, v]) => `
        <div class="stat-row" style="margin-bottom:6px;">
            <span style="color:#ccc;">${k}</span>
            <b class="neg" style="font-size:16px;">${v.toLocaleString()} ₸</b>
        </div>`).join("") || "Нет расходов";

    // История
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item" style="background:#1a1a1a; margin-bottom:4px; border-radius:6px; padding:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <b class="${t.type==='income'?'pos':'neg'}" style="font-size:15px;">${t.amount.toLocaleString()} ₸</b><br>
                    <small style="color:#555;">${t.date} • ${t.subcategory || t.categoryName}</small>
                </div>
                <button onclick="deleteTx('${t.id}')" style="background:none; border:none; color:#333; font-size:18px;">✕</button>
            </div>
        </div>`).join("");
}

window.deleteTx = async (id) => { if(confirm("Удалить?")) await window.fbMethods.deleteDoc(window.fbMethods.doc(window.fbDB, "transactions", id)); };
