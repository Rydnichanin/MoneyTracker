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

    // ИСТОРИЯ
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div><b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
            <small class="muted">${t.date} • ${t.subcategory || t.categoryName || t.categoryId}</small></div>
            <button class="del-btn" onclick="deleteTx('${t.id}')">✕</button>
        </div>`).join("");

    // СТАТИСТИКА ДОХОДОВ
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

    // --- СТАТИСТИКА РАСХОДОВ (СВОРАЧИВАЕМАЯ) ---
    const expStats = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        const mainCat = t.categoryName || "Прочее";
        const subCat = t.subcategory || "";

        if (!expStats[mainCat]) {
            expStats[mainCat] = { total: 0, subs: {} };
        }
        expStats[mainCat].total += t.amount;
        
        if (subCat) {
            expStats[mainCat].subs[subCat] = (expStats[mainCat].subs[subCat] || 0) + t.amount;
        }
    });

    document.getElementById("expenseDetails").innerHTML = Object.keys(expStats)
        .sort((a,b) => expStats[b].total - expStats[a].total)
        .map(cat => {
            const data = expStats[cat];
            const hasSubs = Object.keys(data.subs).length > 0;

            if (hasSubs) {
                // Если есть подкатегории, рисуем сворачиваемый список
                const subRows = Object.entries(data.subs)
                    .sort((a,b) => b[1] - a[1])
                    .map(([name, sum]) => `
                        <div class="stat-sub-row">
                            <span>${name}</span>
                            <span>${sum.toLocaleString()} ₸</span>
                        </div>
                    `).join("");

                return `
                <details class="exp-details">
                    <summary class="stat-main">
                        <span>${cat} <small>▼</small></span>
                        <b class="neg">${data.total.toLocaleString()} ₸</b>
                    </summary>
                    <div class="exp-subs-content">
                        ${subRows}
                    </div>
                </details>`;
            } else {
                // Если подкатегорий нет, просто строка
                return `
                <div class="stat-main" style="padding: 12px 0; border-bottom: 1px solid #222;">
                    <span>${cat}</span>
                    <b class="neg">${data.total.toLocaleString()} ₸</b>
                </div>`;
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
