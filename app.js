const DEFAULTS = {
    income: [{ id: "delivery", name: "Доставка", sub: ["F1", "F2", "F3", "Карго", "Ночь"] }],
    expense: [
        { id: "auto", name: "Авто", sub: ["Бензин", "Ремонт", "Запчасти", "Мойка"] },
        { id: "food", name: "Еда", sub: [] }
    ]
};

let allTransactions = [];
let unsubscribe = null;

const checkFB = setInterval(() => {
    if (window.fbAuth) {
        clearInterval(checkFB);
        initAuth();
    }
}, 300);

function initAuth() {
    const { fbAuth, fbMethods, fbGoogleProvider } = window;
    
    document.getElementById("googleBtn").onclick = async () => {
        try { await fbMethods.signInWithPopup(fbAuth, fbGoogleProvider); } catch (e) { console.error(e); }
    };

    fbMethods.onAuthStateChanged(fbAuth, (user) => {
        if (user) {
            document.getElementById("loginScreen").classList.add("hidden");
            document.getElementById("appScreen").classList.remove("hidden");
            if (user.photoURL) {
                const img = document.getElementById("userPhoto");
                img.src = user.photoURL; img.style.display = "block";
            }
            initApp();
        } else {
            document.getElementById("loginScreen").classList.remove("hidden");
            document.getElementById("appScreen").classList.add("hidden");
            if (unsubscribe) unsubscribe();
            allTransactions = [];
        }
    });

    document.getElementById("loginForm").onsubmit = async (e) => {
        e.preventDefault();
        try {
            await fbMethods.signInWithEmailAndPassword(fbAuth, document.getElementById("email").value, document.getElementById("password").value);
        } catch (err) { document.getElementById("loginError").textContent = "Ошибка входа"; }
    };

    document.getElementById("logoutBtn").onclick = () => { if(confirm("Выйти?")) fbMethods.signOut(fbAuth); };
}

window.setAmount = (val) => { document.getElementById("amount").value = val; };

function initApp() {
    const { fbDB, fbMethods } = window;
    const colRef = fbMethods.collection(fbDB, "transactions");
    document.getElementById("date").value = new Date().toISOString().split('T')[0];

    const elT = document.getElementById("type"), elC = document.getElementById("category"), elS = document.getElementById("subcategory"), sw = document.getElementById("subcatWrap");
    const updateSelects = () => {
        const cats = DEFAULTS[elT.value];
        elC.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        const cur = cats.find(c => c.id === elC.value);
        if (cur && cur.sub && cur.sub.length) { 
            sw.classList.remove("hidden"); 
            elS.innerHTML = cur.sub.map(s => `<option value="${s}">${s}</option>`).join(""); 
        } else { sw.classList.add("hidden"); }
    };
    elT.onchange = updateSelects; elC.onchange = updateSelects;
    updateSelects();

    const q = fbMethods.query(colRef, fbMethods.orderBy("date", "desc"));
    unsubscribe = fbMethods.onSnapshot(q, (snapshot) => {
        allTransactions = [];
        snapshot.forEach(doc => allTransactions.push({ id: doc.id, ...doc.data() }));
        render();
    });

    document.getElementById("txForm").onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById("saveBtn");
        btn.disabled = true;
        try {
            await fbMethods.addDoc(colRef, {
                type: elT.value,
                amount: Number(document.getElementById("amount").value),
                categoryId: elC.value,
                subcategory: elS.value || "",
                date: document.getElementById("date").value,
                accountId: document.getElementById("account").value,
                createdAt: Date.now()
            });
            document.getElementById("amount").value = "";
        } catch (e) { alert("Ошибка!"); }
        btn.disabled = false;
    };

    window.deleteTx = async (id) => {
        if (confirm("Удалить?")) await fbMethods.deleteDoc(fbMethods.doc(fbDB, "transactions", id));
    };
}

function render() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    
    // 1. ФИЛЬТРУЕМ ДАННЫЕ
    const filtered = allTransactions.filter(t => {
        const isAfter = !from || t.date >= from;
        const isBefore = !to || t.date <= to;
        return isAfter && isBefore;
    });

    // 2. СЧИТАЕМ БАЛАНС ПО ФИЛЬТРУ
    const inc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (inc - exp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = inc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = exp.toLocaleString() + " ₸";

    // 3. ОБНОВЛЯЕМ СПИСОК
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div class="meta">
                <b class="${t.type === 'income' ? 'pos' : 'neg'}">${t.amount.toLocaleString()} ₸</b>
                <div class="small muted">${t.date} • ${t.subcategory || t.categoryId}</div>
            </div>
            <button class="iconbtn" onclick="deleteTx('${t.id}')">✕</button>
        </div>
    `).join("");

    // 4. ОБНОВЛЯЕМ СТАТИСТИКУ ПО ФИЛЬТРУ
    updateStats(filtered);
}

function updateStats(list) {
    const incList = list.filter(t => t.type === 'income');
    const earns = {};
    
    incList.forEach(t => {
        const key = t.subcategory || t.categoryId || "Общее";
        earns[key] = (earns[key] || 0) + t.amount;
    });

    const earnEl = document.getElementById("earningsDetails");
    const sortedKeys = Object.keys(earns).sort((a, b) => earns[b] - earns[a]);
    
    earnEl.innerHTML = sortedKeys.length > 0 
        ? sortedKeys.map(k => `
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #2c2c2e;">
                <span style="color:#65d48b">${k}</span><b>${earns[k].toLocaleString()} ₸</b>
            </div>`).join("")
        : "<div class='small muted'>Нет данных за период</div>";
}

// ЛОГИКА КНОПОК ФИЛЬТРАЦИИ
document.querySelector(".quick2").onclick = (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    
    const range = btn.dataset.range;
    const now = new Date();
    const nowStr = now.toISOString().split('T')[0];
    
    const fromInput = document.getElementById("fromDate");
    const toInput = document.getElementById("toDate");

    if (range === 'today') {
        fromInput.value = nowStr;
        toInput.value = nowStr;
    } else if (range === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        fromInput.value = weekAgo.toISOString().split('T')[0];
        toInput.value = nowStr;
    } else {
        fromInput.value = "";
        toInput.value = "";
    }
    
    // Визуальная подсветка активной кнопки
    document.querySelectorAll(".quick2 .chip").forEach(c => c.style.background = "#2c2c2e");
    btn.style.background = "#65d48b";
    btn.style.color = "#000";
    setTimeout(() => { btn.style.color = "#fff"; btn.style.background = "#2c2c2e"; }, 500);

    render();
};

document.getElementById("toggleHistory").onclick = () => {
    const c = document.getElementById("histContent");
    c.classList.toggle("hidden");
    document.getElementById("histArrow").textContent = c.classList.contains("hidden") ? "▼" : "▲";
};
