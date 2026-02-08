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
        { id: "other_exp", name: "Прочее", sub: [] }
    ]
};

let allTransactions = [];

// Ждем пока Firebase загрузится в window из HTML
const checkFB = setInterval(() => {
    if (window.fbDB && window.fbMethods) {
        clearInterval(checkFB);
        initApp();
    }
}, 100);

function initApp() {
    const { fbDB, fbMethods } = window;
    const colRef = fbMethods.collection(fbDB, "transactions");
    
    const elT = document.getElementById("type");
    const elC = document.getElementById("category");
    const elS = document.getElementById("subcategory");
    const sw = document.getElementById("subcatWrap");
    const elDate = document.getElementById("date");

    // Ставим сегодняшнюю дату в форму по умолчанию
    elDate.value = new Date().toISOString().split('T')[0];

    // Логика категорий
    const fillCats = () => {
        elC.innerHTML = DEFAULTS[elT.value].map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        fillSubs();
    };
    const fillSubs = () => {
        const cat = DEFAULTS[elT.value].find(i => i.id === elC.value);
        if (cat && cat.sub.length > 0) {
            sw.classList.remove("hidden");
            elS.innerHTML = cat.sub.map(s => `<option value="${s}">${s}</option>`).join("");
        } else {
            sw.classList.add("hidden");
            elS.innerHTML = "";
        }
    };

    elT.onchange = fillCats;
    elC.onchange = fillSubs;
    fillCats();

    // Слушатели для фильтров
    document.getElementById("fromDate").oninput = render;
    document.getElementById("toDate").oninput = render;

    // Чтение данных
    fbMethods.onSnapshot(fbMethods.query(colRef, fbMethods.orderBy("date", "desc")), (snap) => {
        allTransactions = [];
        snap.forEach(d => allTransactions.push({ id: d.id, ...d.data() }));
        render();
    });

    // Сохранение
    document.getElementById("txForm").onsubmit = async (e) => {
        e.preventDefault();
        const amt = Number(document.getElementById("amount").value);
        if(!amt) return;

        const catObj = DEFAULTS[elT.value].find(i => i.id === elC.value);
        
        await fbMethods.addDoc(colRef, {
            type: elT.value,
            amount: amt,
            categoryName: catObj.name,
            subcategory: elS.value || "",
            date: elDate.value,
            createdAt: Date.now()
        });
        
        document.getElementById("amount").value = "";
    };
}

function render() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    
    const filtered = allTransactions.filter(t => {
        return (!from || t.date >= from) && (!to || t.date <= to);
    });

    const realTotalInc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const realTotalExp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    // Вывод баланса
    document.getElementById("balance").textContent = (realTotalInc - realTotalExp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = realTotalInc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = realTotalExp.toLocaleString() + " ₸";

    // 1. РЕАЛЬНЫЙ ДОХОД (По точкам)
    const realBySub = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const key = t.subcategory || t.categoryName;
        if (!realBySub[key]) realBySub[key] = { sum: 0, count: 0, breakdown: {} };
        realBySub[key].sum += t.amount;
        realBySub[key].count++;
        realBySub[key].breakdown[t.amount] = (realBySub[key].breakdown[t.amount] || 0) + 1;
    });

    document.getElementById("earningsDetails").innerHTML = Object.entries(realBySub).map(([k, d]) => `
        <div class="stat-row">
            <div class="stat-main"><span>${k} (${d.count})</span><b>${d.sum.toLocaleString()} ₸</b></div>
            <div class="stat-sub">${Object.entries(d.breakdown).map(([p, c]) => `${p}₸×${c}`).join(" | ")}</div>
        </div>`).join("");

    // 2. ВД (Возможный доход)
    let totalVd = 0;
    const vdStats = {};
    const pts = ["F1", "F2", "F3", "Ночь"];

    filtered.forEach(t => {
        if (t.type === 'income' && pts.includes(t.subcategory)) {
            if (!vdStats[t.subcategory]) vdStats[t.subcategory] = { sum: 0 };
            let pot = t.amount;
            if (t.amount === 150) pot = 600;
            else if (t.amount === 300) pot = 900;
            else if (t.subcategory === "Ночь" && t.amount === 500) pot = 1000;
            
            totalVd += pot;
            vdStats[t.subcategory].sum += pot;
        }
    });

    let totalGain = 0;
    const vdHtml = pts.map(p => {
        const vdVal = vdStats[p]?.sum || 0;
        const rdVal = realBySub[p]?.sum || 0;
        const diff = vdVal - rdVal;
        totalGain += diff;
        if (vdVal === 0 && rdVal === 0) return "";
        return `
            <div class="stat-item">
                <span>${p} (ВД: ${vdVal.toLocaleString()} ₸)</span>
                <span class="diff-pos">+${diff.toLocaleString()} ₸</span>
            </div>`;
    }).join("");

    document.getElementById("potentialStats").innerHTML = vdHtml + `
        <div class="gain-box">
            <div style="display:flex; justify-content:space-between; font-weight:bold;">
                <span>ВЫГОДА:</span><span class="pos">+${totalGain.toLocaleString()} ₸</span>
            </div>
        </div>`;

    // 3. РАСХОДЫ
    const expGroups = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        const cat = t.categoryName;
        if (!expGroups[cat]) expGroups[cat] = { sum: 0, subs: {} };
        expGroups[cat].sum += t.amount;
        if (t.subcategory) {
            expGroups[cat].subs[t.subcategory] = (expGroups[cat].subs[t.subcategory] || 0) + t.amount;
        }
    });

    document.getElementById("expenseDetails").innerHTML = Object.entries(expGroups).map(([name, data]) => `
        <div class="stat-row">
            <div class="stat-main"><span>${name}</span><b class="neg">${data.sum.toLocaleString()} ₸</b></div>
            ${Object.entries(data.subs).map(([s, v]) => `<div style="font-size:12px; color:#666;">• ${s}: ${v} ₸</div>`).join("")}
        </div>`).join("");

    // 4. ИСТОРИЯ
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div>
                <b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
                <small class="muted">${t.date} | ${t.subcategory || t.categoryName}</small>
            </div>
            <button onclick="deleteTx('${t.id}')" style="background:none; border:none; color:#444; font-size:18px;">✕</button>
        </div>`).join("");
}

window.deleteTx = async (id) => {
    if(confirm("Удалить?")) {
        await window.fbMethods.deleteDoc(window.fbMethods.doc(window.fbDB, "transactions", id));
    }
};
window.render = render;
