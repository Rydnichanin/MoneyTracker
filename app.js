const DEFAULTS = {
    income: [
        { id: "delivery", name: "Доставка", sub: ["F1", "F2", "F3", "Карго", "Ночь"] },
        { id: "other_inc", name: "Прочий доход", sub: [] }
    ],
    expense: [
        { id: "auto", name: "Авто", sub: ["Бензин", "Ремонт", "Мойка", "Запчасти"] },
        { id: "house", name: "Дом/Быт", sub: [] },
        { id: "food", name: "Еда", sub: [] },
        { id: "drinks", name: "Напитки", sub: [] },
        { id: "clothes", name: "Одежда", sub: [] },
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
          elS = document.getElementById("subcategory"), sw = document.getElementById("subcatWrap"),
          elDate = document.getElementById("date");

    const today = new Date().toISOString().split('T')[0];
    elDate.value = today;

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

    document.getElementById("txForm").onsubmit = async (e) => {
        e.preventDefault();
        const amt = Number(document.getElementById("amount").value);
        if(!amt) return;
        const catObj = DEFAULTS[elT.value].find(i => i.id === elC.value);
        await fbMethods.addDoc(colRef, {
            type: elT.value, amount: amt, categoryName: catObj.name,
            subcategory: elS.value || "", date: elDate.value,
            createdAt: Date.now()
        });
        document.getElementById("amount").value = "";
        elDate.value = today;
    };
}

function render() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    const filtered = allTransactions.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

    // --- 1. СНАЧАЛА СЧИТАЕМ ВЕСЬ РЕАЛ (ДЛЯ ВЫДЕЛЕННЫХ СУММ) ---
    const realBySub = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const sub = t.subcategory || t.categoryName;
        if (!realBySub[sub]) realBySub[sub] = { sum: 0, count: 0, breakdown: {} };
        realBySub[sub].sum += t.amount;
        realBySub[sub].count++;
        realBySub[sub].breakdown[t.amount] = (realBySub[sub].breakdown[t.amount] || 0) + 1;
    });

    // Отрисовка блока "Доход по точкам (Реал)"
    document.getElementById("earningsDetails").innerHTML = Object.entries(realBySub).map(([k, d]) => `
        <div class="stat-row" style="margin-bottom:12px; border-bottom: 1px solid #222; padding-bottom: 4px;">
            <div style="display:flex; justify-content:space-between;">
                <span style="color:#aaa;">${k} <small>(${d.count})</small></span>
                <b style="color:#eee;">${d.sum.toLocaleString()} ₸</b>
            </div>
            <div style="font-size:11px; color:#666;">
                ${Object.entries(d.breakdown).map(([p, c]) => `${p}₸×${c}`).join(" | ")}
            </div>
        </div>`).join("");

    // --- 2. СЧИТАЕМ ВД И ВЫЧИТАЕМ ВЫДЕЛЕННЫЕ СУММЫ ---
    let totalVd = 0;
    const vdDetails = {};
    const points = ["F1", "F2", "F3", "Ночь"];

    filtered.forEach(t => {
        if (t.type === 'income' && points.includes(t.subcategory)) {
            // Считаем ВД только для точек < 4000
            if (t.amount < 4000) {
                let pot = t.amount;
                if (t.amount === 150) pot = 600;
                else if (t.amount === 300) pot = 900;
                else if (t.subcategory === "Ночь" && t.amount === 500) pot = 1000;
                
                totalVd += pot;
                if (!vdDetails[t.subcategory]) vdDetails[t.subcategory] = 0;
                vdDetails[t.subcategory] += pot;
            }
        }
    });

    // Считаем разницу: (ВД каждой категории) - (Полная сумма Реало из выделенного)
    let totalGain = 0;
    const vdHtml = points.map(p => {
        const vdSum = vdDetails[p] || 0;
        const rdSum = (realBySub[p] ? realBySub[p].sum : 0); // Та самая сумма со скрина
        const diff = vdSum - rdSum;
        totalGain += diff;
        
        return `
            <div style="margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; font-size:14px; color:#eee;">
                    <span>${p}</span><b>${vdSum.toLocaleString()} ₸</b>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:11px; color:${diff >= 0 ? '#00ff7f' : '#ff4444'};">
                    <span>Разница к реалу:</span><b>${diff >= 0 ? '+' : ''}${diff.toLocaleString()} ₸</b>
                </div>
            </div>`;
    }).join("");

    document.getElementById("potentialStats").innerHTML = `
        <div style="border-bottom: 1px solid #222; padding-bottom: 8px;">${vdHtml}</div>
        <div style="display:flex; justify-content:space-between; margin-top:10px; font-weight:bold; color:var(--accent);">
            <span>Итого (ВД):</span><b>${totalVd.toLocaleString()} ₸</b>
        </div>
        <div style="margin-top:12px; background: rgba(0,255,127,0.08); border-left: 4px solid #00ff7f; padding:10px; border-radius:4px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12px;">Общая разница:</span>
                <b style="color:#00ff7f; font-size:20px;">${totalGain >= 0 ? '+' : ''}${totalGain.toLocaleString()} ₸</b>
            </div>
        </div>`;

    // Расходы (с подкатегориями)
    const exps = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        const n = t.subcategory || t.categoryName || "Прочее";
        exps[n] = (exps[n] || 0) + t.amount;
    });
    document.getElementById("expenseDetails").innerHTML = Object.entries(exps).map(([k, v]) => `
        <div class="stat-row"><span>${k}</span><b class="neg">${v.toLocaleString()} ₸</b></div>`).join("");

    // История и Баланс
    document.getElementById("totalIncome").textContent = realTotalInc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = realTotalExp.toLocaleString() + " ₸";
    document.getElementById("balance").textContent = (realTotalInc - realTotalExp).toLocaleString() + " ₸";
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item" style="background:#161616; border-radius:8px; margin-bottom:5px; padding:12px; border:1px solid #222;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
                    <small style="color:#444;">${t.date} • ${t.subcategory || t.categoryName}</small>
                </div>
                <button onclick="deleteTx('${t.id}')" style="background:none; border:none; color:#333; font-size:18px;">✕</button>
            </div>
        </div>`).join("");
}

window.deleteTx = async (id) => { if(confirm("Удалить?")) await window.fbMethods.deleteDoc(window.fbMethods.doc(window.fbDB, "transactions", id)); };
