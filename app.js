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

    // Слушатели для фильтров дат
    document.getElementById("fromDate").onchange = render;
    document.getElementById("toDate").onchange = render;

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
    
    // Фильтрация данных по выбранным датам
    const filtered = allTransactions.filter(t => {
        const d = t.date;
        return (!from || d >= from) && (!to || d <= to);
    });

    const realTotalInc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const realTotalExp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    // --- 1. ДОХОД ПО ТОЧКАМ (РЕАЛ) ---
    const realBySub = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const sub = t.subcategory || t.categoryName;
        if (!realBySub[sub]) realBySub[sub] = { sum: 0, count: 0, breakdown: {} };
        realBySub[sub].sum += t.amount;
        realBySub[sub].count++;
        realBySub[sub].breakdown[t.amount] = (realBySub[sub].breakdown[t.amount] || 0) + 1;
    });

    document.getElementById("earningsDetails").innerHTML = Object.entries(realBySub).map(([k, d]) => `
        <div class="stat-row" style="margin-bottom:12px; border-bottom: 1px solid #222; padding-bottom: 4px;">
            <div style="display:flex; justify-content:space-between;">
                <span style="color:#aaa; font-weight:bold;">${k} <small>(${d.count})</small></span>
                <b style="color:#eee;">${d.sum.toLocaleString()} ₸</b>
            </div>
            <div style="font-size:11px; color:#666; margin-top:2px;">
                ${Object.entries(d.breakdown).map(([p, c]) => `${p}₸×${c}`).join(" | ")}
            </div>
        </div>`).join("") || "<small class='muted'>Нет данных за этот период</small>";

    // --- 2. ВОЗМОЖНЫЙ ДОХОД (ВД) С ДЕТАЛИЗАЦИЕЙ ---
    let totalVd = 0;
    const vdStats = {};
    const points = ["F1", "F2", "F3", "Ночь"];

    filtered.forEach(t => {
        if (t.type === 'income' && points.includes(t.subcategory)) {
            if (!vdStats[t.subcategory]) vdStats[t.subcategory] = { sum: 0, breakdown: {} };
            let pot = t.amount;
            if (t.amount < 4000) {
                if (t.amount === 150) pot = 600;
                else if (t.amount === 300) pot = 900;
                else if (t.subcategory === "Ночь" && t.amount === 500) pot = 1000;
                totalVd += pot;
                vdStats[t.subcategory].sum += pot;
                vdStats[t.subcategory].breakdown[pot] = (vdStats[t.subcategory].breakdown[pot] || 0) + 1;
            }
        }
    });

    let totalGain = 0;
    const vdHtml = points.map(p => {
        const vdData = vdStats[p] || { sum: 0, breakdown: {} };
        const rdSum = (realBySub[p] ? realBySub[p].sum : 0);
        const diff = vdData.sum - rdSum;
        totalGain += diff;
        if (vdData.sum === 0 && rdSum === 0) return "";
        const detailStr = Object.entries(vdData.breakdown).map(([price, count]) => `${price}₸×${count}`).join(" | ");
        return `
            <div style="margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; font-size:14px; color:#eee; font-weight:bold;">
                    <span>${p}</span><b>${vdData.sum.toLocaleString()} ₸</b>
                </div>
                <div style="font-size:10px; color:#555; margin-bottom:2px;">${detailStr || 'Точки не пересчитаны'}</div>
                <div style="display:flex; justify-content:space-between; font-size:11px; color:${diff >= 0 ? '#00ff7f' : '#ff4444'};">
                    <span>Разница к реалу:</span><b>${diff >= 0 ? '+' : ''}${diff.toLocaleString()} ₸</b>
                </div>
            </div>`;
    }).join("");

    document.getElementById("potentialStats").innerHTML = `
        <div style="border-bottom: 1px solid #222; padding-bottom: 8px;">${vdHtml || "<small class='muted'>Точек нет</small>"}</div>
        <div style="display:flex; justify-content:space-between; margin-top:10px; font-weight:bold; color:var(--accent);">
            <span>Итого (ВД):</span><b>${totalVd.toLocaleString()} ₸</b>
        </div>
        <div style="margin-top:12px; background: rgba(0,255,127,0.08); border-left: 4px solid #00ff7f; padding:10px; border-radius:4px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12px;">Общая разница:</span>
                <b style="color:#00ff7f; font-size:20px;">${totalGain >= 0 ? '+' : ''}${totalGain.toLocaleString()} ₸</b>
            </div>
        </div>`;

    // --- 3. РАСХОДЫ (ГРУППИРОВКА) ---
    const expGroups = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        const cat = t.categoryName || "Прочее";
        if (!expGroups[cat]) expGroups[cat] = { total: 0, subs: {} };
        expGroups[cat].total += t.amount;
        if (t.subcategory) expGroups[cat].subs[t.subcategory] = (expGroups[cat].subs[t.subcategory] || 0) + t.amount;
    });

    document.getElementById("expenseDetails").innerHTML = Object.entries(expGroups).map(([name, data]) => {
        let subHtml = Object.entries(data.subs).map(([sName, sVal]) => `
            <div style="display:flex; justify-content:space-between; font-size:12px; color:#777; padding-left:10px; margin-top:2px;">
                <span>• ${sName}</span><span>${sVal.toLocaleString()} ₸</span>
            </div>`).join("");
        return `
            <div style="margin-bottom:12px; background: rgba(255,255,255,0.02); padding: 8px; border-radius: 6px;">
                <div style="display:flex; justify-content:space-between; font-weight:bold; border-bottom: 1px solid #222; padding-bottom:4px;">
                    <span style="color:#ccc;">${name}</span>
                    <b class="neg">${data.total.toLocaleString()} ₸</b>
                </div>
                ${subHtml}
            </div>`;
    }).join("") || "Расходов нет";

    // ИТОГИ И ИСТОРИЯ
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
