const DEFAULTS = {
    income: [{ id: "delivery", name: "Доставка", sub: ["F1", "F2", "F3", "Карго", "Ночь"] }],
    expense: [
        { id: "auto", name: "Авто", sub: ["Бензин", "Ремонт", "Мойка"] },
        { id: "drinks", name: "Напитки", sub: [] }, // Добавлено
        { id: "clothes", name: "Одежда", sub: [] }, // Добавлено
        { id: "home", name: "Дом/быт", sub: [] },   // Добавлено
        { id: "food", name: "Еда", sub: [] },
        { id: "other", name: "Прочее", sub: [] }
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

    elDate.value = new Date().toISOString().split('T')[0];

    const fillCats = () => {
        elC.innerHTML = DEFAULTS[elT.value].map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        fillSubs();
    };
    const fillSubs = () => {
        const cat = DEFAULTS[elT.value].find(i => i.id === elC.value);
        if (cat && cat.sub.length > 0) { sw.classList.remove("hidden"); elS.innerHTML = cat.sub.map(s => `<option value="${s}">${s}</option>`).join(""); }
        else { sw.classList.add("hidden"); elS.innerHTML = ""; }
    };

    elT.onchange = fillCats; elC.onchange = fillSubs; fillCats();
    document.getElementById("fromDate").oninput = render;
    document.getElementById("toDate").oninput = render;

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
            subcategory: elS.value || "", date: elDate.value, createdAt: Date.now()
        });
        document.getElementById("amount").value = "";
    };
}

function render() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    const filtered = allTransactions.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

    const realInc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const realExp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const gasExp = filtered.filter(t => t.subcategory === 'Бензин').reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (realInc - realExp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = realInc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = realExp.toLocaleString() + " ₸";
    
    const gasPerc = realInc > 0 ? ((gasExp / realInc) * 100).toFixed(1) : 0;
    document.getElementById("gasText").textContent = `Бензин к доходу: ${gasPerc}% (${gasExp.toLocaleString()} ₸)`;
    document.getElementById("gasFill").style.width = Math.min(gasPerc * 3, 100) + "%";

    // --- ДОХОД ПО ТОЧКАМ (РЕАЛЬНЫЙ) ---
    const realBySub = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const k = t.subcategory || t.categoryName;
        if (!realBySub[k]) realBySub[k] = { sum: 0, count: 0, breakdown: {} };
        realBySub[k].sum += t.amount; realBySub[k].count++;
        realBySub[k].breakdown[t.amount] = (realBySub[k].breakdown[t.amount] || 0) + 1;
    });

    document.getElementById("earningsDetails").innerHTML = Object.entries(realBySub).map(([k, d]) => `
        <div class="stat-row">
            <div class="stat-main"><span>${k} (${d.count})</span><b>${d.sum.toLocaleString()} ₸</b></div>
            <div class="stat-sub">${Object.entries(d.breakdown).map(([p, c]) => `${p}₸×${c}`).join(" | ")}</div>
        </div>`).join("");

    // --- ВОЗМОЖНЫЙ ДОХОД ---
    let totalGain = 0;
    const vdStats = {};
    const pts = ["F1", "F2", "F3", "Ночь"];

    filtered.forEach(t => {
        if (t.type === 'income' && pts.includes(t.subcategory)) {
            if(!vdStats[t.subcategory]) vdStats[t.subcategory] = { vdSum: 0, breakdown: {} };
            
            // В ВД считаем только точки (< 4000)
            if (t.amount < 4000) {
                let pot = t.amount;
                if (t.amount === 150) pot = 600;
                else if (t.amount === 300) pot = 900;
                else if (t.subcategory === "Ночь" && t.amount === 500) pot = 1000;
                
                vdStats[t.subcategory].vdSum += pot;
                vdStats[t.subcategory].breakdown[pot] = (vdStats[t.subcategory].breakdown[pot] || 0) + 1;
            }
        }
    });

    const vdHtml = Object.entries(vdStats).map(([p, data]) => {
        const currentRealSum = realBySub[p] ? realBySub[p].sum : 0;
        const diff = data.vdSum - currentRealSum;
        totalGain += diff;
        
        const breakdownStr = Object.entries(data.breakdown).map(([price, count]) => `${price}₸×${count}`).join(" | ");
        return `
            <div class="stat-row">
                <div class="stat-main"><span>${p}</span><b>${data.vdSum.toLocaleString()} ₸</b></div>
                <div class="stat-sub" style="color:#555">ВД Тарифы: ${breakdownStr || 'Только крупные суммы'}</div>
                <div class="stat-vd-info">Выгода к реалу: +${diff.toLocaleString()} ₸</div>
            </div>`;
    }).join("");

    document.getElementById("potentialStats").innerHTML = vdHtml || '<div class="muted" style="text-align:center; padding:10px;">Нет данных</div>';
    if (totalGain !== 0) {
        document.getElementById("potentialStats").innerHTML += `<div class="gain-box"><span>ОБЩАЯ ВЫГОДА ВД:</span><span class="${totalGain >= 0 ? 'pos' : 'neg'}">${totalGain.toLocaleString()} ₸</span></div>`;
    }

    // --- РАСХОДЫ (С ПОДКАТЕГОРИЯМИ) ---
    const exG = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        if (!exG[t.categoryName]) exG[t.categoryName] = { total: 0, subs: {} };
        exG[t.categoryName].total += t.amount;
        if (t.subcategory) {
            exG[t.categoryName].subs[t.subcategory] = (exG[t.categoryName].subs[t.subcategory] || 0) + t.amount;
        }
    });

    document.getElementById("expenseDetails").innerHTML = Object.entries(exG).map(([cat, data]) => {
        let subHtml = "";
        if (Object.keys(data.subs).length > 0) {
            subHtml = `<div class="stat-sub" style="color:#888; font-size:0.85em; margin-top:2px;">
                ${Object.entries(data.subs).map(([s, v]) => `${s}: ${v.toLocaleString()}₸`).join(" | ")}
            </div>`;
        }
        return `
            <div class="stat-row" style="margin-bottom:8px;">
                <div class="stat-main"><span>${cat}</span><b class="neg">${data.total.toLocaleString()} ₸</b></div>
                ${subHtml}
            </div>`;
    }).join("");

    // ИСТОРИЯ
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div><b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
            <small class="muted">${t.date} | ${t.subcategory || t.categoryName}</small></div>
            <button onclick="deleteTx('${t.id}')" style="background:none;border:none;color:#444;padding:10px;">✕</button>
        </div>`).join("");
}

window.render = render;
window.deleteTx = async (id) => { if(confirm("Удалить?")) await window.fbMethods.deleteDoc(window.fbMethods.doc(window.fbDB, "transactions", id)); };
