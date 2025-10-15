// --- MODERN FIREBASE v9+ IMPORTS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithRedirect, signOut, getRedirectResult } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
// Chart.js import has been removed

// --- FIREBASE SETUP ---
const firebaseConfig = {
  apiKey: "AIzaSyCnbm3WlbPU2KiL5jVZatTQg1PMMGW-lNo",
  authDomain: "my-budget-tracker-b22b2.firebaseapp.com",
  projectId: "my-budget-tracker-b22b2",
  storageBucket: "my-budget-tracker-b22b2.firebasestorage.app",
  messagingSenderId: "411372843389",
  appId: "1:411372843389:web:78c5b98f1d4b7910dcdc14",
  measurementId: "G-WDG0G61K4X"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let currentUser;
let categories = [];
let budgetSettings = { cycleStartDay: 1 };
let viewingDate = new Date();
// expensePieChart variable has been removed
// --- END FIREBASE SETUP ---

// CHART_COLORS is still needed for the historical progress bars
const CHART_COLORS = ['#4CAF50','#2196F3','#FFC107','#E91E63','#9C27B0','#FF9800','#00BCD4','#8BC34A','#607D8B','#FF5722'];

// --- AUTHENTICATION (Using Redirect Flow) ---
function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  signInWithRedirect(auth, provider);
}
function signOutUser() { signOut(auth); }

getRedirectResult(auth)
  .then((result) => {
    if (result && result.user) {
        console.log("User signed in via redirect:", result.user.displayName);
    }
  }).catch((error) => {
    console.error("Error getting redirect result:", error);
  });

onAuthStateChanged(auth, async user => {
  const appContent = document.getElementById('appContent');
  const appLoader = document.getElementById('appLoader');
  const authButton = document.getElementById('authButton');
  const userInfoDiv = document.getElementById('userInfo');

  if (user) {
    currentUser = user;
    appLoader.textContent = `Loading data for ${user.displayName.split(' ')[0]}...`;
    
    const settingsRef = doc(db, 'users', currentUser.uid);
    const settingsDoc = await getDoc(settingsRef);

    if (settingsDoc.exists() && settingsDoc.data().settings) {
        budgetSettings = settingsDoc.data().settings;
    } else {
        await setDoc(settingsRef, { settings: budgetSettings });
    }

    userInfoDiv.textContent = `Hi, ${user.displayName.split(' ')[0]}`;
    authButton.textContent = 'Sign Out';
    
    appContent.style.display = 'block';
    appLoader.style.display = 'none';
    render();
  } else {
    currentUser = null;
    appContent.style.display = 'none';
    appLoader.style.display = 'block';
    appLoader.textContent = 'Please sign in to manage your budget.';
    userInfoDiv.textContent = '';
    authButton.textContent = 'Sign In with Google';
  }
});

// --- DATA & RENDERING LOGIC ---
async function render() {
    if (!currentUser) return;
    const { cycleStartDate, cycleEndDate } = getCycleDates(viewingDate);
    document.getElementById('cycleDisplay').textContent = 
      `${cycleStartDate.toLocaleDateString('en-GB')} - ${cycleEndDate.toLocaleDateString('en-GB')}`;
  
    const categoriesCol = collection(db, 'users', currentUser.uid, 'categories');
    const categoriesSnapshot = await getDocs(categoriesCol);
    categories = categoriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
    const container = document.getElementById("categories");
    container.innerHTML = "";
    let totalBudget = 0, totalSpentInCycle = 0;
  
    categories.forEach(cat => {
      const expensesInCycle = cat.expenses.filter(exp => new Date(exp.date) >= cycleStartDate && new Date(exp.date) <= cycleEndDate);
      const spentInCycle = expensesInCycle.reduce((acc, curr) => acc + curr.amount, 0);
      const bud = Math.round(cat.budget);
      const remainingInCycle = bud - spentInCycle;
      totalBudget += bud; totalSpentInCycle += spentInCycle;
      let percentRemaining = Math.max(0, Math.min(100, isFinite((remainingInCycle / bud) * 100) ? (remainingInCycle / bud) * 100 : 0));
      const item = document.createElement("div"); item.className = "category";
      item.innerHTML = `
        <div class="category-top">
          <div class="cat-left">${escapeHtml(cat.name)}</div>
          <div class="cat-right">
            <span><span class="${remainingInCycle < 0 ? 'negative' : ''}">${Math.round(remainingInCycle)}</span> / ${bud}</span>
            <button class="icon-btn" data-action="show-history" data-id="${cat.id}" title="View Full History">🕰️</button>
            <button class="icon-btn" data-action="manage-category" data-id="${cat.id}" title="Manage Category">✏️</button>
          </div>
        </div>
        <div class="progress"><div class="progress-bar" style="width: ${percentRemaining}%;">${Math.floor(percentRemaining)}%</div></div>
        <div class="controls">
          <input type="text" id="desc-${cat.id}" placeholder="Expense description" />
          <div class="controls-bottom">
              <input type="number" id="expense-${cat.id}" placeholder="Amount" min="0" />
              <input type="date" id="date-${cat.id}" value="${new Date().toISOString().slice(0, 10)}"/>
              <button class="btn" data-action="add-expense" data-id="${cat.id}">Add</button>
          </div>
        </div>`;
      container.appendChild(item);
    });
    document.getElementById("totalBudget").textContent = `Total Budget: ₹${totalBudget}`;
    document.getElementById("totalSpent").textContent = `Total Spent (this cycle): ₹${Math.round(totalSpentInCycle)}`;
    document.getElementById("totalRemaining").textContent = `Remaining (this cycle): ₹${Math.round(totalBudget - totalSpentInCycle)}`;
    // updatePieChart() call has been removed
    renderHistoricalSummary();
}

// --- EVENT HANDLING ---
document.addEventListener('DOMContentLoaded', () => {
  const authButton = document.getElementById('authButton');
  authButton.addEventListener('click', () => {
    if (currentUser) signOutUser(); else signInWithGoogle();
  });

  document.body.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const categoryId = target.dataset.id;
    const expenseId = target.dataset.expenseId;
    switch (action) {
      case 'add-category': addCategory(); break;
      case 'add-expense': addExpense(categoryId); break;
      case 'manage-category': manageCategory(categoryId); break;
      case 'show-history': showHistory(categoryId); break;
      case 'edit-expense': editExpense(categoryId, expenseId); break;
      case 'delete-expense': deleteExpense(categoryId, expenseId); break;
      case 'prev-cycle': navigateCycle(-1); break;
      case 'next-cycle': navigateCycle(1); break;
      case 'export-csv': exportCSV(); break;
      case 'close-modal': closeModal(); break;
    }
  });
});

// --- CORE FUNCTIONS ---
async function addCategory() {
  if (!currentUser) return;
  const name = document.getElementById("newName").value.trim();
  const budget = parseFloat(document.getElementById("newBudget").value);
  if (!name || !isFinite(budget) || budget <= 0) return alert("Enter valid name and budget");
  
  const categoriesCol = collection(db, 'users', currentUser.uid, 'categories');
  await addDoc(categoriesCol, { name, budget: Math.round(budget), expenses: [] });
  
  document.getElementById("newName").value = ""; document.getElementById("newBudget").value = "";
  render();
}
async function addExpense(categoryId) {
  if (!currentUser) return;
  const amount = parseFloat(document.getElementById(`expense-${categoryId}`).value);
  const description = document.getElementById(`desc-${categoryId}`).value.trim();
  const date = document.getElementById(`date-${categoryId}`).value;
  if (!amount || amount <= 0 || !description || !date) return alert("Please fill all expense fields.");
  
  const newExpense = { amount, description, date, id: Date.now() + Math.random() };
  const categoryRef = doc(db, 'users', currentUser.uid, 'categories', categoryId);
  await updateDoc(categoryRef, { expenses: arrayUnion(newExpense) });
  
  document.getElementById(`expense-${categoryId}`).value = ""; document.getElementById(`desc-${categoryId}`).value = "";
  render();
}
async function manageCategory(categoryId) {
    if (!currentUser) return;
    const catRef = doc(db, 'users', currentUser.uid, 'categories', categoryId);
    const docSnap = await getDoc(catRef);
    if (!docSnap.exists()) return;

    const cat = docSnap.data();
    const action = prompt(`Type 'edit' or 'delete' for "${cat.name}".`, "edit");
    if (!action) return;

    if (action.toLowerCase() === 'delete') {
      if (confirm(`Delete "${cat.name}"?`)) { await deleteDoc(catRef); render(); }
    } else if (action.toLowerCase() === 'edit') {
      const newName = prompt("Rename category:", cat.name); if (newName === null) return;
      const newBudget = parseInt(prompt("Set new budget:", String(Math.round(cat.budget))), 10);
      if (!isFinite(newBudget) || newBudget < 0) return alert("Enter a valid budget.");
      await updateDoc(catRef, { name: newName.trim() || cat.name, budget: Math.round(newBudget) });
      render();
    }
}
async function showHistory(categoryId) {
  const modal = document.getElementById('historyModal');
  const cat = categories.find(c => c.id === categoryId);
  if (!cat) return;
  document.getElementById('modalTitle').textContent = `Full History for: ${escapeHtml(cat.name)}`;
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = '';
  if (cat.expenses.length === 0) { modalBody.innerHTML = '<p>No expenses recorded yet.</p>'; } else {
    [...cat.expenses].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(exp => {
      const itemDiv = document.createElement('div'); itemDiv.className = 'history-item';
      itemDiv.innerHTML = `<div class="history-details"><span class="desc">₹${exp.amount} - ${escapeHtml(exp.description)}</span><span class="date">${exp.date}</span></div><div class="history-actions"><button class="btn" data-action="edit-expense" data-id="${categoryId}" data-expense-id="${exp.id}">Edit</button><button class="btn" data-action="delete-expense" data-id="${categoryId}" data-expense-id="${exp.id}">Delete</button></div>`;
      modalBody.appendChild(itemDiv);
    });
  }
  modal.style.display = 'block';
}
async function deleteExpense(categoryId, expenseId) {
  expenseId = Number(expenseId);
  if (!confirm("Delete this expense?")) return;
  const catRef = doc(db, 'users', currentUser.uid, 'categories', categoryId);
  const docSnap = await getDoc(catRef);
  if (!docSnap.exists()) return;
  
  const expenseToDelete = docSnap.data().expenses.find(exp => exp.id === expenseId);
  if (expenseToDelete) {
    await updateDoc(catRef, { expenses: arrayRemove(expenseToDelete) });
  }

  render();
  setTimeout(() => showHistory(categoryId), 100);
}
async function editExpense(categoryId, expenseId) {
    expenseId = Number(expenseId);
    const catRef = doc(db, 'users', currentUser.uid, 'categories', categoryId);
    const docSnap = await getDoc(catRef);
    if (!docSnap.exists()) return;

    let expenses = docSnap.data().expenses;
    const expIndex = expenses.findIndex(e => e.id === expenseId);
    if (expIndex === -1) return;
    const exp = expenses[expIndex];
    
    const newDate = prompt("Date:", exp.date); if (newDate === null) return;
    const newDesc = prompt("Description:", exp.description); if (newDesc === null) return;
    const newAmount = parseFloat(prompt("Amount:", exp.amount)); if (!isFinite(newAmount) || newAmount <= 0) return alert("Invalid amount.");
    
    expenses[expIndex] = { ...exp, amount: newAmount, description: newDesc.trim(), date: newDate };
    await updateDoc(catRef, { expenses });

    render();
    setTimeout(() => showHistory(categoryId), 100);
}
function closeModal() { document.getElementById('historyModal').style.display = 'none'; }
window.onclick = function(event) { if (event.target == document.getElementById('historyModal')) { closeModal(); } }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
function getCycleDates(dateForCycle) {
    const startDay = budgetSettings.cycleStartDay;
    let cycleStartDate = new Date(dateForCycle.getFullYear(), dateForCycle.getMonth(), startDay);
    if (dateForCycle.getDate() < startDay) { cycleStartDate.setMonth(cycleStartDate.getMonth() - 1); }
    let cycleEndDate = new Date(cycleStartDate.getFullYear(), cycleStartDate.getMonth() + 1, startDay - 1);
    cycleEndDate.setHours(23, 59, 59, 999);
    return { cycleStartDate, cycleEndDate };
}
function navigateCycle(direction) { viewingDate.setMonth(viewingDate.getMonth() + direction); render(); }
function renderHistoricalSummary() {
    const container = document.getElementById('historicalSummary');
    container.innerHTML = '<h3>Last 6 Months\' Spending</h3>';
    const totalBudget = categories.reduce((acc, cat) => acc + cat.budget, 0);
    if (totalBudget === 0) return;
    for (let i = 0; i < 6; i++) {
        const monthDate = new Date(); monthDate.setMonth(monthDate.getMonth() - i);
        const { cycleStartDate, cycleEndDate } = getCycleDates(monthDate);
        const monthDiv = document.createElement('div'); monthDiv.className = 'hist-month-bar';
        const label = document.createElement('div'); label.className = 'label';
        label.textContent = `${cycleStartDate.toLocaleDateString('en-GB')} - ${cycleEndDate.toLocaleDateString('en-GB')}`;
        const progressBar = document.createElement('div'); progressBar.className = 'multi-progress-bar';
        let totalSpentInMonth = 0;
        categories.forEach((cat, catIndex) => {
            const spentInMonth = cat.expenses.filter(exp => new Date(exp.date) >= cycleStartDate && new Date(exp.date) <= cycleEndDate).reduce((acc, curr) => acc + curr.amount, 0);
            totalSpentInMonth += spentInMonth;
            if (spentInMonth > 0) {
                const segment = document.createElement('div'); segment.className = 'multi-progress-bar-segment';
                segment.style.width = `${(spentInMonth / totalBudget) * 100}%`;
                segment.style.backgroundColor = CHART_COLORS[catIndex % CHART_COLORS.length];
                segment.title = `${cat.name}: ₹${Math.round(spentInMonth)}`;
                progressBar.appendChild(segment);
            }
        });
        if (totalSpentInMonth > 0) { monthDiv.appendChild(label); monthDiv.appendChild(progressBar); container.appendChild(monthDiv); }
    }
}
function exportCSV() {
    let csvContent = "Category,Date,Description,Amount\n";
    categories.forEach(cat => { cat.expenses.forEach(exp => { csvContent += [cat.name, exp.date, `"${exp.description.replace(/"/g, '""')}"`, exp.amount].join(",") + "\n"; }); });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = `budget_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}