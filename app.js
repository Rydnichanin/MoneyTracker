const DEFAULTS = {
    income: [{ id: "delivery", name: "Доставка", sub: ["F1", "F2", "F3", "Карго", "Ночь"] }],
    expense: [{ id: "auto", name: "Авто", sub: ["Бензин", "Ремонт", "Запчасти", "Мойка"] }, { id: "food", name: "Еда", sub: [] }]
};

let allTransactions = [];
let unsubscribe = null;

// Инициализация Auth
const checkFB = setInterval(() => {
    if (window.fbAuth) { clearInterval(checkFB); initAuth(); }
}, 300);

function initAuth() {
    const { fbAuth, fbMethods, fbGoogleProvider } = window;
    fbMethods.onAuthStateChanged(fbAuth, (user) => {
        if (user) {
            document.getElementById("loginScreen").classList.add("hidden");
            document.getElementById("appScreen").classList.remove("hidden");
            if (user.photoURL) { const img = document.getElementById("userPhoto"); img.src = user.photoURL; img.style.display = "block"; }
            initApp();
        } else {
            document.getElementById("loginScreen").classList.remove("hidden");
            document.getElementById("appScreen").classList.add("hidden");
        }
    });
    document.getElementById("googleBtn").onclick = () => fbMethods.signInWithPopup(fbAuth, fbGoogleProvider);
    document.getElementById("logoutBtn").onclick = () => fbMethods.signOut(fbAuth);
}

function initApp() {
    const { fbDB, fbMethods } = window;
    const colRef = fbMethods.collection(fbDB, "transactions");
    
    // Текущая дата в форму
    document.getElementById("date").value = new Date().toISOString().split('T')[0];

    // Выбор категорий
    const elT = document.getElementById("type"), elC = document.getElementById("category"), elS = document.getElementById("subcategory"), sw = document.getElementById("subcatWrap");
    const updateSelects = () => {
        const cats = DEFAULTS[elT.value];
        elC.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        const cur = cats.find(c => c.id === elC.value);
        if (cur?.sub?.length) { sw.classList.remove("hidden"); elS.innerHTML = cur.sub.map(s => `<option value="${s}">${s}</option>`).join(""); }
        else sw.classList.add("hidden");
    };
    elT.onchange = updateSelects; elC.onchange = updateSelects;
    updateSelects();

    // Слушатель данных
    const q = fbMethods.query(colRef, fbMethods.orderBy("date", "desc"));
    unsubscribe = fbMethods.onSnapshot(q, (snapshot) => {
        allTransactions = [];
        snapshot.forEach(doc => allTransactions.push({ id: doc.id, ...doc.data() }));
        render();
    });

    // Изменение даты вручную — сразу обновлять экран
    document.getElementById("fromDate").onchange = render;
    document.getElementById("toDate").onchange = render;

    // Сохранение
    document.getElementById("txForm").onsubmit = async (e) => {
        e.preventDefault();
        await fbMethods.addDoc(colRef, {
            type: elT.value,
            amount: Number(document.getElementById("amount").value),
            categoryId: elC.value,
            subcategory: elS.value || "",
            date: document.getElementById("date").value,
            createdAt: Date.now()
        });
        document.getElementById("amount").value = "";
    };

    window.deleteTx = async (id) => { if(confirm("Удалить?")) await fbMethods.deleteDoc(fbMethods.doc(fbDB, "transactions", id)); };
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

    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div><b>${t.amount.toLocaleString()} ₸</b><br><small class="muted">${t.date} • ${t.subcategory || t.categoryId}</small></div>
            <button class="iconbtn" onclick="deleteTx('${t.id}')">✕</button>
        </div>`).join("");

    const earns = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const k = t.subcategory || "Прочее";
        earns[k] = (earns[k] || 0) + t.amount;
    });
    document.getElementById("earningsDetails").innerHTML = Object.keys(earns).map(k => `
        <div class="stat-row"><span>${k}</span><b>${earns[k].toLocaleString()} ₸</b></div>`).join("");
}

// Кнопки быстрого выбора
document.querySelector(".quick2").onclick = (e) => {
    const r = e.target.dataset.range;
    if (!r) return;
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
    document.getElementById("histContent").classList.toggle("hidden");
};
