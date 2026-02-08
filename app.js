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

    const realTotalInc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const realTotalExp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (realTotalInc - realTotalExp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = realTotalInc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = realTotalExp.toLocaleString() + " ₸";

    // --- БЛОК 1: ДОХОД (РЕАЛ) С ДЕТАЛИЗАЦИЕЙ ШТУК ---
    const realStats = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const sub = t.subcategory || t.categoryName;
        if (!realStats[sub]) realStats[sub] = { sum: 0, count: 0, breakdown: {} };
        realStats[sub].sum += t.amount;
        realStats[sub].count++;
        // Считаем сколько раз встретилась конкретная сумма (например 150₸)
        realStats[sub].breakdown[t.amount] = (realStats[sub].breakdown[t.amount] || 0) + 1;
    });

    document.getElementById("earningsDetails").innerHTML = Object.entries(realStats).map(([k, d]) => `
        <div class="stat-row" style="margin-bottom:12px; border-bottom: 1px solid #222; padding-bottom: 4px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="color:#aaa; font-weight:bold;">${k} <small style="color:#555;">(${d.count})</small></span>
                <b style="font-size:16px; color:#eee;">${d.sum.toLocaleString()} ₸</b>
            </div>
            <div style="font-size:11px; color:#666; margin-top:2px;">
                ${Object.entries(d.breakdown).map(([price, count]) => `${price}₸ × ${count}`).join(" | ")}
            </div>
        </div>`).join("");

    // --- БЛОК 2: ВОЗМОЖНЫЙ ДОХОД (ВД) ---
    let totalVdSum = 0;
    let totalRdOfPoints = 0;
    const vdDetails = {};

    filtered.forEach(t => {
        if (t.type !== 'income') return;
        const sub = t.subcategory || "";
        const amt = t.amount;

        if (["F1", "F2", "F3", "Ночь"].includes(sub) && amt < 4000) {
            let potAmt = amt;
            if (amt === 150) potAmt = 600;
            else if (amt === 300) potAmt = 900;
            else if (sub === "Ночь" && amt === 500) potAmt = 1000;
            
            totalVdSum += potAmt;
            totalRdOfPoints += amt;

            if (!vdDetails[sub]) vdDetails[sub] = { vdSum: 0, rdSum: 0, count: 0 };
            vdDetails[sub].vdSum += potAmt;
            vdDetails[sub].rdSum += amt;
            vdDetails[sub].count++;
        }
    });

    const totalGain = totalVdSum - totalRdOfPoints;

    document.getElementById("potentialStats").innerHTML = `
        <div style="border-bottom: 1px solid #222; padding-bottom: 8px; margin-bottom: 10px;">
            ${Object.entries(vdDetails).map(([name, data]) => `
                <div style="margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; font-size:14px; color:#eee;">
                        <span>${name} <small style="color:#555;">x${data.count}</small></span>
                        <b>${data.vdSum.toLocaleString()} ₸</b>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:11px; color:#00ff7f; opacity:0.8;">
                        <span>Разница к реалу:</span>
                        <b>+${(data.vdSum - data.rdSum).toLocaleString()} ₸</b>
                    </div>
                </div>
            `).join("") || "<small class='muted'>Точек для анализа нет</small>"}
        </div>
        
        <div style="display:flex; justify-content:space-between; font-size:16px; color:var(--accent); font-weight:bold;">
            <span>Всего за точки:</span>
            <b>${totalVdSum.toLocaleString()} ₸</b>
        </div>

        <div style="margin-top:12px; background: rgba(0,255,127,0.08); border-left: 4px solid #00ff7f; padding:10px; border-radius:4px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12px; color:#eee;">Общая выгода:</span>
                <b style="color:#00ff7f; font-size:20px;">+${totalGain.toLocaleString()} ₸</b>
            </div>
        </div>
    `;

    // Расходы и История
    const exps = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        const k = t.categoryName || "Прочее";
        if (!exps[k]) exps[k] = 0;
        exps[k] += t.amount;
    });
    document.getElementById("expenseDetails").innerHTML = Object.entries(exps).map(([k, v]) => `
        <div class="stat-row"><span>${k}</span><b class="neg">${v.toLocaleString()} ₸</b></div>`).join("");

    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item" style="background:#161616; border-radius:8px; margin-bottom:5px; padding:12px; border:1px solid #222;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <b class="${t.type==='income'?'pos':'neg'}" style="font-size:16px;">${t.amount.toLocaleString()} ₸</b><br>
                    <small style="color:#444; font-size:11px;">${t.date} • ${t.subcategory || t.categoryName}</small>
                </div>
                <button onclick="deleteTx('${t.id}')" style="background:none; border:none; color:#333; font-size:20px; padding:5px;">✕</button>
            </div>
        </div>`).join("");
}

window.deleteTx = async (id) => { if(confirm("Удалить?")) await window.fbMethods.deleteDoc(window.fbMethods.doc(window.fbDB, "transactions", id)); };
