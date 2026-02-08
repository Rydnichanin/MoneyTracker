const DEFAULTS = {
    income: [{ id: "delivery", name: "Доставка", sub: ["F1", "F2", "F3", "Карго", "Ночь"] }],
    expense: [
        { id: "auto", name: "Авто", sub: ["Бензин", "Ремонт", "Мойка"] },
        { id: "drinks", name: "Напитки", sub: [] },
        { id: "clothes", name: "Одежда", sub: [] },
        { id: "home", name: "Дом/быт", sub: [] },
        { id: "food", name: "Еда", sub: [] },
        { id: "other", name: "Прочее", sub: [] }
    ]
};

// ... (код initApp остается прежним) ...

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

    // --- ДОХОД ПО ТОЧКАМ ---
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
        if (t.type === 'income' && pts.includes(t.subcategory) && t.amount < 4000) {
            if(!vdStats[t.subcategory]) vdStats[t.subcategory] = { vdSum: 0, breakdown: {} };
            let pot = t.amount === 150 ? 600 : (t.amount === 300 ? 900 : (t.subcategory === "Ночь" && t.amount === 500 ? 1000 : t.amount));
            vdStats[t.subcategory].vdSum += pot;
            vdStats[t.subcategory].breakdown[pot] = (vdStats[t.subcategory].breakdown[pot] || 0) + 1;
        }
    });

    const vdHtml = Object.entries(vdStats).map(([p, data]) => {
        const currentRealSum = realBySub[p] ? realBySub[p].sum : 0;
        const diff = data.vdSum - currentRealSum;
        totalGain += diff;
        const breakdownStr = Object.entries(data.breakdown).sort((a,b)=>a[0]-b[0]).map(([price, count]) => `${price}₸×${count}`).join(" | ");
        return `
            <div class="stat-row">
                <div class="stat-main"><span>${p}</span><b>${data.vdSum.toLocaleString()} ₸</b></div>
                <div class="stat-sub" style="color:#777">ВД Тарифы: ${breakdownStr}</div>
                <div class="stat-vd-info">Выгода: +${diff.toLocaleString()} ₸</div>
            </div>`;
    }).join("");

    document.getElementById("potentialStats").innerHTML = vdHtml || '<div class="muted" style="text-align:center; padding:10px;">Нет данных</div>';
    if (totalGain !== 0) {
        document.getElementById("potentialStats").innerHTML += `<div class="gain-box"><span>ОБЩАЯ ВЫГОДА:</span><span class="${totalGain >=0 ? 'pos':'neg'}">${totalGain.toLocaleString()} ₸</span></div>`;
    }

    // --- РАСХОДЫ (С ПОДКАТЕГОРИЯМИ) ---
    const exGroups = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        if (!exGroups[t.categoryName]) exGroups[t.categoryName] = { total: 0, subs: {} };
        exGroups[t.categoryName].total += t.amount;
        if (t.subcategory) {
            exGroups[t.categoryName].subs[t.subcategory] = (exGroups[t.categoryName].subs[t.subcategory] || 0) + t.amount;
        }
    });

    document.getElementById("expenseDetails").innerHTML = Object.entries(exGroups).map(([cat, data]) => {
        let subHtml = "";
        if (Object.keys(data.subs).length > 0) {
            subHtml = `<div class="stat-sub" style="margin-top: 4px; color: #aaa;">${Object.entries(data.subs).map(([s, v]) => `${s}: ${v.toLocaleString()} ₸`).join(" | ")}</div>`;
        }
        return `
            <div class="stat-row" style="padding: 10px 0; border-bottom: 1px solid #222;">
                <div class="stat-main"><span>${cat}</span><b class="neg">${data.total.toLocaleString()} ₸</b></div>
                ${subHtml}
            </div>`;
    }).join("");

    // --- ИСТОРИЯ ---
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div><b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
            <small class="muted">${t.date} | ${t.subcategory || t.categoryName}</small></div>
            <button onclick="deleteTx('${t.id}')" style="background:none;border:none;color:#444;padding:10px;">✕</button>
        </div>`).join("");
}
// ... остальной код ...
