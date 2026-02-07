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
        if (c && c.sub.length > 0) {
            sw.classList.remove("hidden");
            elS.innerHTML = c.sub.map(s => `<option value="${s}">${s}</option>`).join("");
        } else { sw.classList.add("hidden"); elS.innerHTML = ""; }
    };

    elT.onchange = fillCats; elC.onchange = fillSubs;
    fillCats();

    document.getElementById("date").value = new Date().toISOString().split('T')[0];

    fbMethods.onSnapshot(fbMethods.query(colRef, fbMethods.orderBy("date", "desc")), (snap) => {
        allTransactions = [];
        snap.forEach(d => allTransactions.push({ id: d.id, ...d.data() }));
        render();
    });

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

    const inc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (inc - exp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = inc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = exp.toLocaleString() + " ₸";

    // --- ЛОГИКА ВОЗМОЖНОГО ЗАРАБОТКА ---
    let possibleDotsSum = 0;   
    let realIncomeNoCargo = 0; 
    const potBreakdown = {};

    filtered.filter(t => t.type === 'income').forEach(t => {
        const sub = t.subcategory || t.categoryName || "";
        const amt = t.amount;

        // В РЕАЛЬНОМ: Оставляем всё (включая 4500), кроме Карго
        if (sub !== "Cargo" && sub !== "Карго") {
            realIncomeNoCargo += amt;
        }

        // В ВОЗМОЖНОМ: Считаем только точки (600/900/1000)
        if (["F1", "F2", "F3", "Ночь"].includes(sub) && ![4000, 4500, 5000].includes(amt)) {
            let pAmount = 0;
            if (["F1", "F2", "F3"].includes(sub)) {
                if (amt === 150) pAmount = 600;
                else if (amt === 300) pAmount = 900;
            } else if (sub === "Ночь" && amt === 500) {
                pAmount = 1000;
            }

            if (pAmount > 0) {
                if (!potBreakdown[sub]) potBreakdown[sub] = { count: 0, sum: 0 };
                potBreakdown[sub].count += 1;
                potBreakdown[sub].sum += pAmount;
                possibleDotsSum += pAmount;
            }
        }
    });

    const breakdownHTML = Object.entries(potBreakdown).map(([name, data]) => `
        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-top: 4px;">
            <span>${name} <small class="muted">x${data.count}</small></span>
            <b>${data.sum.toLocaleString()} ₸</b>
        </div>
    `).join("");

    document.getElementById("potentialStats").innerHTML = `
        <div style="margin-bottom: 10px; border-bottom: 1px solid #333; padding-bottom: 8px;">
            ${breakdownHTML || "<small class='muted'>Нет данных для пересчета</small>"}
        </div>
        <div style="display: flex; justify-content: space-between;">
            <span>Только точки (Возможно):</span>
            <b style="color: var(--accent);">${possibleDotsSum.toLocaleString()} ₸</b>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 8px; border-top: 1px solid #333; padding-top: 8px;">
            <span class="muted">Реал (без Карго):</span>
            <b>${realIncomeNoCargo.toLocaleString()} ₸</b>
        </div>
    `;

    // --- ИСТОРИЯ ---
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div><b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
            <small class="muted">${t.date} • ${t.subcategory || t.categoryName}</small></div>
            <button class="del-btn" onclick="deleteTx('${t.id}')">✕</button>
        </div>`).join("");

    // --- СТАТИСТИКА ДОХОДА (ПО ТОЧКАМ) ---
    const earns = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const k = t.subcategory || t.categoryName;
        if (!earns[k]) earns[k] = { sum: 0, count: 0, b: {} };
        earns[k].sum += t.amount; earns[k].count++;
        earns[k].b[t.amount] = (earns[k].b[t.amount] || 0) + 1;
    });
    document.getElementById("earningsDetails").innerHTML = Object.entries(earns).map(([k, d]) => `
        <div class="stat-row-complex">
            <div class="stat-main"><span>${k} (${d.count})</span><b>${d.sum.toLocaleString()} ₸</b></div>
            <div class="stat-sub">${Object.entries(d.b).map(([p, c]) => `${p}×${c}`).join(" | ")}</div>
        </div>
    `).join("");

    // --- СТАТИСТИКА РАСХОДОВ ---
    const exps = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        if (!exps[t.categoryName]) exps[t.categoryName] = { total: 0, subs: {} };
        exps[t.categoryName].total += t.amount;
        if (t.subcategory) exps[t.categoryName].subs[t.subcategory] = (exps[t.categoryName].subs[t.subcategory] || 0) + t.amount;
    });
    document.getElementById("expenseDetails").innerHTML = Object.entries(exps).map(([cat, d]) => `
        <details class="exp-details">
            <summary class="stat-main"><span>${cat}</span><b class="neg">${d.total.toLocaleString()} ₸</b></summary>
            <div class="exp-subs-content">
                ${Object.entries(d.subs).map(([n, s]) => `<div class="stat-sub-row"><span>${n}</span><span>${s} ₸</span></div>`).join("")}
            </div>
        </details>
    `).join("");
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
    const c = document.getElementById("histContent"); c.classList.toggle("hidden");
    document.getElementById("histArrow").textContent = c.classList.contains("hidden") ? "▼" : "▲";
};
document.getElementById("togglePotential").onclick = () => {
    const c = document.getElementById("potentialContent"); c.classList.toggle("hidden");
    document.getElementById("potArrow").textContent = c.classList.contains("hidden") ? "▼" : "▲";
};
