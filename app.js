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

// Проверка загрузки Firebase
const checkFB = setInterval(() => {
    if (window.fbDB && window.fbMethods) { clearInterval(checkFB); initApp(); }
}, 100);

// Кнопки быстрой вставки суммы (твои 500 и 5000)
window.setAmount = (val) => {
    const el = document.getElementById("amount");
    if (el) el.value = val;
};

// Функция переключения периодов
window.setPeriod = (type) => {
    const fromEl = document.getElementById("fromDate");
    const toEl = document.getElementById("toDate");
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    let from = "";
    let to = today;

    if (type === 'today') {
        from = today;
    } else if (type === 'yesterday') {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        from = d.toISOString().split('T')[0];
        to = from;
    } else if (type === 'week') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        from = d.toISOString().split('T')[0];
    } else if (type === 'month') {
        from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    } else if (type === 'all') {
        from = ""; to = "";
    }

    fromEl.value = from;
    toEl.value = to;
    render(); // Мгновенный пересчет
};

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
    const filtered = allTransactions.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

    const realTotalInc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const realTotalExp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    
    // БЕНЗИН И ПРИБЫЛЬ
    const gasExp = filtered.filter(t => t.subcategory === 'Бензин').reduce((s, t) => s + t.amount, 0);
    const gasPercent = realTotalInc > 0 ? ((gasExp / realTotalInc) * 100).toFixed(1) : 0;
    let gasColor = gasPercent > 20 ? "#ff4444" : (gasPercent > 15 ? "#ffeb3b" : "#00ff7f");

    document.getElementById("totalIncome").textContent = realTotalInc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = realTotalExp.toLocaleString() + " ₸";
    document.getElementById("balance").innerHTML = `
        <div style="font-size: 24px;">${(realTotalInc - realTotalExp).toLocaleString()} ₸</div>
        <div style="font-size: 11px; color: #888; margin-top: 4px;">ЧИСТАЯ ПРИБЫЛЬ ЗА ПЕРИОД</div>
        <div style="margin-top: 12px; background: #222; border-radius: 10px; height: 8px; overflow: hidden;">
            <div style="width: ${Math.min(gasPercent * 2, 100)}%; background: ${gasColor}; height: 100%;"></div>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:10px; margin-top:6px;">
            <span style="color:#666;">РАСХОД НА ТОПЛИВО:</span>
            <span style="color:${gasColor}; font-weight:bold;">${gasPercent}% (${gasExp.toLocaleString()} ₸)</span>
        </div>
    `;

    // 1. РЕАЛЬНЫЙ ДОХОД (ДЕТАЛЬНО)
    const realBySub = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const sub = t.subcategory || t.categoryName;
        if (!realBySub[sub]) realBySub[sub] = { sum: 0, count: 0, breakdown: {} };
        realBySub[sub].sum += t.amount; realBySub[sub].count++;
        realBySub[sub].breakdown[t.amount] = (realBySub[sub].breakdown[t.amount] || 0) + 1;
    });

    document.getElementById("earningsDetails").innerHTML = Object.entries(realBySub).map(([k, d]) => `
        <div class="stat-row" style="margin-bottom:12px; border-bottom: 1px solid #222; padding-bottom: 6px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="color:#aaa; font-weight:bold;">${k} <small>(${d.count})</small></span>
                <b style="color:#eee;">${d.sum.toLocaleString()} ₸</b>
            </div>
            <div style="font-size:10px; color:#555; margin-top:2px;">
                ${Object.entries(d.breakdown).map(([p, c]) => `${p}₸×${c}`).join(" | ")}
            </div>
        </div>`).join("") || "Данных нет";

    // 2. ВД (ПОТЕНЦИАЛ)
    let totalVd = 0; const vdStats = {}; const pts = ["F1", "F2", "F3", "Ночь"];
    filtered.forEach(t => {
        if (t.type === 'income' && pts.includes(t.subcategory) && t.amount < 4000) {
            if (!vdStats[t.subcategory]) vdStats[t.subcategory] = { sum: 0, breakdown: {} };
            let pot = (t.amount === 150 ? 600 : (t.amount === 300 ? 900 : (t.subcategory === "Ночь" && t.amount === 500 ? 1000 : t.amount)));
            totalVd += pot; vdStats[t.subcategory].sum += pot;
            vdStats[t.subcategory].breakdown[pot] = (vdStats[t.subcategory].breakdown[pot] || 0) + 1;
        }
    });

    let totalGain = 0;
    const vdHtml = pts.map(p => {
        const d = vdStats[p] || { sum: 0, breakdown: {} };
        const rd = (realBySub[p] ? realBySub[p].sum : 0);
        const diff = d.sum - rd; totalGain += diff;
        if (d.sum === 0 && rd === 0) return "";
        return `
            <div style="margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; font-size:14px; color:#eee; font-weight:bold;">
                    <span>${p}</span><b>${d.sum.toLocaleString()} ₸</b>
                </div>
                <div style="font-size:10px; color:#555; margin-bottom:2px;">${Object.entries(d.breakdown).map(([pr, co]) => `${pr}₸×${co}`).join(" | ")}</div>
                <div style="display:flex; justify-content:space-between; font-size:11px; color:${diff >= 0 ? '#00ff7f' : '#ff4444'};">
                    <span>Разница:</span><b>${diff >= 0 ? '+' : ''}${diff.toLocaleString()} ₸</b>
                </div>
            </div>`;
    }).join("");

    document.getElementById("potentialStats").innerHTML = vdHtml + `
        <div style="margin-top:10px; padding-top:10px; border-top:1px solid #222; display:flex; justify-content:space-between; font-weight:bold; color:var(--accent);">
            <span>ВСЕГО ВД:</span><b>${totalVd.toLocaleString()} ₸</b>
        </div>
        <div style="margin-top:10px; background: rgba(0,255,127,0.05); padding:10px; border-radius:8px; display:flex; justify-content:space-between;">
            <span style="font-size:12px;">ВЫГОДА:</span><b style="color:#00ff7f; font-size:18px;">+${totalGain.toLocaleString()} ₸</b>
        </div>`;

    // 3. РАСХОДЫ (ГРУППИРОВКА)
    const expG = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        const cat = t.categoryName || "Прочее";
        if (!expG[cat]) expG[cat] = { total: 0, subs: {} };
        expG[cat].total += t.amount;
        if (t.subcategory) expG[cat].subs[t.subcategory] = (expG[cat].subs[t.subcategory] || 0) + t.amount;
    });

    document.getElementById("expenseDetails").innerHTML = Object.entries(expG).map(([n, d]) => `
        <div style="margin-bottom:12px; background: rgba(255,255,255,0.02); padding: 10px; border-radius: 8px; border: 1px solid #222;">
            <div style="display:flex; justify-content:space-between; font-weight:bold; margin-bottom:4px;">
                <span style="color:#ccc;">${n}</span><b class="neg">${d.total.toLocaleString()} ₸</b>
            </div>
            ${Object.entries(d.subs).map(([sn, sv]) => `<div style="display:flex; justify-content:space-between; font-size:12px; color:#666;"><span>• ${sn}</span><span>${sv.toLocaleString()} ₸</span></div>`).join("")}
        </div>`).join("") || "Расходов нет";

    // 4. ИСТОРИЯ
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item" style="background:#161616; border-radius:10px; margin-bottom:8px; padding:12px; border:1px solid #222;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div><b class="${t.type==='income'?'pos':'neg'}" style="font-size:16px;">${t.amount.toLocaleString()} ₸</b><br>
                <small style="color:#444;">${t.date} • ${t.subcategory || t.categoryName}</small></div>
                <button onclick="deleteTx('${t.id}')" style="background:none; border:none; color:#333; font-size:18px;">✕</button>
            </div>
        </div>`).join("");
}

window.deleteTx = async (id) => { if(confirm("Удалить?")) await window.fbMethods.deleteDoc(window.fbMethods.doc(window.fbDB, "transactions", id)); };
