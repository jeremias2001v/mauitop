import { collection, getDocs, getDoc, doc, updateDoc, setDoc, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { db, auth } from "./firebase-config.js";

// DOM Elements
const screens = document.querySelectorAll('.screen');

// Theme Logic
const savedTheme = localStorage.getItem('theme-meseros');
if (savedTheme === 'dark') document.body.classList.add('dark-theme');

const darkIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const lightIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

document.querySelectorAll('.theme-toggle').forEach(btn => {
  btn.innerHTML = document.body.classList.contains('dark-theme') ? darkIcon : lightIcon;
  btn.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme-meseros', isDark ? 'dark' : 'light');
    document.querySelectorAll('.theme-toggle').forEach(b => b.innerHTML = isDark ? darkIcon : lightIcon);
  });
});
const loginScreen = document.getElementById('login-screen');
const tablesScreen = document.getElementById('tables-screen');
const posScreen = document.getElementById('pos-screen');

// Login
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const btnLogin = document.getElementById('btn-login');

// Data state
let currentUser = null;
let currentMeseroName = "Mesero";
let numMesas = 10;
let livePedidos = [];
let localCategorias = [];
let localProductos = [];

// Order state
let selectedTable = null;
let selectedActivePedido = null;
let cart = {}; // itemId -> qty

function showScreen(screenId) {
  screens.forEach(s => s.classList.remove('active-screen'));
  document.getElementById(screenId).classList.add('active-screen');
}

// ----------------------------------------------------
// 1. AUTHENTICATION & INITIALIZATION
// ----------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    try {
      // Find mesero name
      const q = query(collection(db, "meseros"), where("correo", "==", user.email));
      const snap = await getDocs(q);
      if (!snap.empty) {
        currentMeseroName = snap.docs[0].data().nombre;
      } else {
        currentMeseroName = user.email.split('@')[0]; // Admin fallback
      }
      document.getElementById('waiter-name').innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${currentMeseroName}`;

      initRestaurantData();
    } catch (e) {
      console.error("Error cargando perfil:", e);
      alert("No se pudo cargar tu perfil. Es posible que el correo no esté en la base de datos de meseros. Detalles: " + e.message);
    }
  } else {
    currentUser = null;
    showScreen('login-screen');
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const em = document.getElementById('email').value.trim();
  const pw = document.getElementById('password').value;
  btnLogin.disabled = true;
  btnLogin.textContent = "Verificando...";
  loginError.style.display = 'none';
  try {
    await signInWithEmailAndPassword(auth, em, pw);
  } catch (err) {
    console.error(err);
    loginError.textContent = "Credenciales incorrectas.";
    loginError.style.display = 'block';
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = "Entrar al Sistema";
  }
});

document.getElementById('btn-logout').addEventListener('click', () => {
  signOut(auth);
});

async function initRestaurantData() {
  try {
    // 1. Fetch tables config
    const opSnap = await getDoc(doc(db, "configuracion", "operacion"));
    if (opSnap.exists() && opSnap.data().mesasActivas) {
      numMesas = opSnap.data().mesasActivas;
    }

    // 2. Fetch Catalog
    const cSnap = await getDocs(collection(db, "categorias"));
    localCategorias = cSnap.docs.map(d => d.data());

    const pSnap = await getDocs(collection(db, "productos"));
    localProductos = pSnap.docs.map(d => d.data());

    // 3. Setup real time listener for Orders
    setupLiveOrders();

    showScreen('tables-screen');
  } catch (e) {
    console.error("Error init:", e);
    alert("Error inicializando el catálogo o mesas: " + e.message);
  }
}

// ----------------------------------------------------
// 2. MESAS LOGIC
// ----------------------------------------------------
function setupLiveOrders() {
  onSnapshot(collection(db, "pedidos"), (snapshot) => {
    livePedidos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTables();
  });
}

function renderTables() {
  const container = document.getElementById('tables-grid');
  let html = '';

  // Icono + clase CSS según el estado real
  function estadoData(estado) {
    if (estado === 'En Preparación') return { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`, cls: 'table-cooking' };
    if (estado === 'Listo')          return { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`, cls: 'table-ready' };
    return { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`, cls: 'table-occupied' }; // Pendiente
  }

  // Mesas configuradas
  const configuredMesaNames = new Set();
  for (let i = 1; i <= numMesas; i++) {
    configuredMesaNames.add(`M${i}`);
    configuredMesaNames.add(`Mesa ${i}`);
  }

  for (let i = 1; i <= numMesas; i++) {
    const tableName = `M${i}`;
    const legacyName = `Mesa ${i}`;
    const activeOrder = livePedidos.find(p => (p.mesa === tableName || p.mesa === legacyName) && p.estado !== 'Entregado');

    if (activeOrder) {
      const { icon, cls } = estadoData(activeOrder.estado);
      const total = '$' + Number(activeOrder.total).toLocaleString('es-CO');
      html += `
        <button class="table-btn ${cls}" onclick="openTable('${activeOrder.mesa}')">
          <div class="t-icon">${icon}</div>
          <div class="t-num">${i}</div>
          <div class="t-info">${total}</div>
        </button>`;
    } else {
      html += `
        <button class="table-btn table-free" onclick="openTable('${tableName}')">
          <div class="t-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/></svg></div>
          <div class="t-num">${i}</div>
          <div class="t-info">Libre</div>
        </button>`;
    }
  }

  // ── Mesas huérfanas ──
  const orphaned = livePedidos.filter(
    p => p.estado !== 'Entregado' && !configuredMesaNames.has(p.mesa)
  );

  if (orphaned.length > 0) {
    html += `<div class="orphaned-divider" style="display:inline-flex; align-items:center; gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Fuera de config</div>`;
    orphaned.forEach(order => {
      const num = (order.mesa || '').replace(/\D/g, '') || '?';
      html += `
        <button class="table-btn table-orphaned" onclick="openTable('${order.mesa}')">
          <div class="t-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
          <div class="t-num">${num}</div>
          <div class="t-info">Mover →</div>
        </button>`;
    });
  }

  container.innerHTML = html;
}

window.openTable = function (tableName) {
  selectedTable = tableName;
  document.getElementById('pos-table-number').textContent = tableName;

  // Check condition
  const activeOrder = livePedidos.find(p => p.mesa === tableName && p.estado !== 'Entregado');
  selectedActivePedido = activeOrder || null;

  if (activeOrder) {
    // Show occupied view
    document.getElementById('new-order-container').style.display = 'none';
    const occInfo = document.getElementById('occupied-info');
    occInfo.style.display = 'block';

    const itemsHtml = (activeOrder.ítems || []).map(it =>
      `<div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding:8px 0;">
        <span><b>${it.cantidad}x</b> ${it.nombre}</span>
        <span style="color:var(--text-main); font-weight:bold;">$${(it.precio * it.cantidad).toLocaleString('es-CO')}</span>
      </div>`
    ).join('');

    document.getElementById('occupied-items').innerHTML = itemsHtml;
    document.getElementById('occupied-total').textContent = '$' + Number(activeOrder.total).toLocaleString('es-CO');
  } else {
    // Show new order view
    document.getElementById('occupied-info').style.display = 'none';
    document.getElementById('new-order-container').style.display = 'block';

    cart = {}; // Reset cart
    renderPosCategories();
    // Default to first cat
    if (localCategorias.length > 0) renderPosProducts(localCategorias[0].nombre);
    else renderPosProducts('all');
    updateCartUI();
  }

  showScreen('pos-screen');
};

document.getElementById('btn-back-tables').addEventListener('click', () => {
  showScreen('tables-screen');
});

// ----------------------------------------------------
// 3. POS & CART LOGIC
// ----------------------------------------------------
function renderPosCategories() {
  const container = document.getElementById('pos-cats');
  container.innerHTML = localCategorias.map((c, i) => `
    <div class="cat-chip ${i === 0 ? 'selected' : ''}" onclick="selectPosCat('${c.nombre}', this)">
      ${c.label}
    </div>
  `).join('');
}

window.selectPosCat = function (catName, el) {
  document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  renderPosProducts(catName);
}

function renderPosProducts(catName) {
  const container = document.getElementById('pos-products');
  const filtered = localProductos.filter(p => p.categoria === catName && p.disponible !== false);

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:20px; color:#888;">No hay productos</div>`;
    return;
  }

  container.innerHTML = filtered.map(p => {
    const qty = cart[p.id] || 0;
    return `
      <div class="prod-card">
        <div class="prod-info">
          <div class="prod-name">${p.nombre}</div>
          <div class="prod-price">$${Number(p.precio).toLocaleString('es-CO')}</div>
        </div>
        <div class="stepper">
          <button class="stepper-btn" onclick="updateItem(${p.id}, -1)">-</button>
          <div class="stepper-val" id="qty-${p.id}">${qty}</div>
          <button class="stepper-btn" onclick="updateItem(${p.id}, 1)">+</button>
        </div>
      </div>
    `;
  }).join('');
}

window.updateItem = function (prodId, delta) {
  let current = cart[prodId] || 0;
  let next = current + delta;
  if (next < 0) next = 0;

  if (next === 0) delete cart[prodId];
  else cart[prodId] = next;

  const label = document.getElementById(`qty-${prodId}`);
  if (label) label.textContent = next;

  updateCartUI();
};

function updateCartUI() {
  let totalItems = 0;
  let totalCost = 0;

  Object.keys(cart).forEach(id => {
    const qty = cart[id];
    const prod = localProductos.find(p => p.id == id);
    if (prod) {
      totalItems += qty;
      totalCost += (Number(prod.precio) * qty);
    }
  });

  document.getElementById('cart-qty').textContent = totalItems;
  document.getElementById('cart-total').textContent = '$' + totalCost.toLocaleString('es-CO');

  const footer = document.getElementById('pos-cart-footer');
  if (totalItems > 0) {
    footer.classList.add('visible');
  } else {
    footer.classList.remove('visible');
  }
}

// ----------------------------------------------------
// 4. FIREBASE ACTIONS (SEND TO KITCHEN)
// ----------------------------------------------------
document.getElementById('btn-send-order').addEventListener('click', async () => {
  const btn = document.getElementById('btn-send-order');
  btn.disabled = true;
  btn.innerHTML = "<span>Procesando...</span>";

  try {
    const items = [];
    let total = 0;

    Object.keys(cart).forEach(id => {
      const qty = cart[id];
      const prod = localProductos.find(p => p.id == id);
      if (prod) {
        items.push({
          id: prod.id,
          nombre: prod.nombre,
          precio: prod.precio,
          cantidad: qty,
          categoria: prod.categoria
        });
        total += (Number(prod.precio) * qty);
      }
    });

    if (items.length === 0) return;

    const pedidoRef = doc(collection(db, "pedidos"));
    const data = {
      cliente: {
        nombre: "Comensal Físico",
        metodoPago: "Por definir"
      },
      estado: "Pendiente",
      fecha: new Date(),
      items: items, // compatibilidad web antigua
      ítems: items, // la version en español
      total: total,
      origen: "mesa",
      mesa: selectedTable,
      mesero: currentMeseroName
    };

    await setDoc(pedidoRef, data);

    // Volver a mesas
    showScreen('tables-screen');
  } catch (err) {
    console.error(err);
    alert('Error al enviar pedido');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>Enviar a Cocina</span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
    document.getElementById('pos-cart-footer').classList.remove('visible');
  }
});

// ────────────────────────────────────────────────
// MODAL DE COBRO CON MÉTODO DE PAGO
// ────────────────────────────────────────────────
let selectedPayMethod = null;

window.openPayModal = function () {
  if (!selectedActivePedido) return;

  // Poblar resumen de mesa
  document.getElementById('pay-modal-table').textContent = selectedActivePedido.mesa || '';

  const items = selectedActivePedido.ítems || selectedActivePedido.items || [];
  document.getElementById('pay-modal-items').innerHTML = items.length
    ? items.map(it => `
        <div style="display:flex; justify-content:space-between; padding:8px 0;
             border-bottom:1px solid var(--border); font-size:14px;">
          <span><b>${it.cantidad}x</b> ${it.nombre}</span>
          <span style="color:var(--success); font-weight:700;">
            $${(Number(it.precio) * it.cantidad).toLocaleString('es-CO')}
          </span>
        </div>`).join('')
    : '<p style="color:var(--text-muted); font-size:13px;">Sin ítems registrados</p>';

  document.getElementById('pay-modal-total').textContent =
    '$' + Number(selectedActivePedido.total).toLocaleString('es-CO');

  // Resetear selección
  selectedPayMethod = null;
  document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('btn-confirm-pay').disabled = true;

  document.getElementById('pay-modal').classList.add('open');
};

window.closePayModal = function () {
  document.getElementById('pay-modal').classList.remove('open');
};

window.selectPayMethod = function (method, btn) {
  selectedPayMethod = method;
  document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('btn-confirm-pay').disabled = false;
};

window.confirmPayTable = async function () {
  if (!selectedActivePedido || !selectedPayMethod) return;
  const btn = document.getElementById('btn-confirm-pay');
  btn.disabled = true;
  btn.textContent = '⏳ Procesando...';

  try {
    await updateDoc(doc(db, "pedidos", selectedActivePedido.id), {
      estado: 'Entregado',
      'cliente.metodoPago': selectedPayMethod,
      fechaCobro: new Date()
    });
    closePayModal();
    showScreen('tables-screen');
  } catch (err) {
    console.error(err);
    alert('Error al cobrar la mesa. Inténtalo de nuevo.');
    btn.disabled = false;
    btn.textContent = '✅ Confirmar Cobro';
  }
};

// ──────────────────────────────────────────────────
// TRANSFERENCIA DE MESA
// ──────────────────────────────────────────────────
window.openTransferModal = function () {
  if (!selectedActivePedido) return;

  const currentMesa = selectedActivePedido.mesa;

  // Mesas que ya tienen un pedido activo (excluir la actual)
  const occupiedMesas = new Set(
    livePedidos
      .filter(p => p.estado !== 'Entregado' && p.id !== selectedActivePedido.id)
      .map(p => p.mesa)
  );

  let gridHtml = '';
  for (let i = 1; i <= numMesas; i++) {
    const name = `M${i}`;
    const legacyName = `Mesa ${i}`;
    const isCurrent  = currentMesa === name || currentMesa === legacyName;
    const isOccupied = occupiedMesas.has(name) || occupiedMesas.has(legacyName);

    if (isCurrent) {
      gridHtml += `
        <button class="transfer-btn transfer-current" disabled>
          <span class="transfer-num">${i}</span>
          <span class="transfer-lbl">Actual</span>
        </button>`;
    } else if (isOccupied) {
      gridHtml += `
        <button class="transfer-btn transfer-occupied" disabled>
          <span class="transfer-num">${i}</span>
          <span class="transfer-lbl">Ocupada</span>
        </button>`;
    } else {
      gridHtml += `
        <button class="transfer-btn transfer-free" onclick="transferMesa('${name}')">
          <span class="transfer-num">${i}</span>
          <span class="transfer-lbl">Libre</span>
        </button>`;
    }
  }

  document.getElementById('transfer-modal-grid').innerHTML = gridHtml;
  document.getElementById('transfer-current-label').textContent = `Desde: ${currentMesa}`;
  document.getElementById('transfer-modal').classList.add('open');
};

window.closeTransferModal = function () {
  document.getElementById('transfer-modal').classList.remove('open');
};

window.transferMesa = async function (newMesa) {
  if (!selectedActivePedido) return;
  const oldMesa = selectedActivePedido.mesa;
  closeTransferModal();

  try {
    await updateDoc(doc(db, "pedidos", selectedActivePedido.id), { mesa: newMesa });
    // Actualizar estado local para que el cobro registre la mesa correcta
    selectedActivePedido.mesa = newMesa;
    selectedTable = newMesa;
    document.getElementById('pos-table-number').textContent = newMesa;
    // Volver a mesas para ver el cambio reflejado en tiempo real
    showScreen('tables-screen');
  } catch (err) {
    console.error(err);
    alert(`Error al mover el pedido de ${oldMesa} a ${newMesa}. Inténtalo de nuevo.`);
  }
};

// --- PREVENT MOBILE ZOOM ---
document.addEventListener('touchstart', (e) => {
  if (e.touches.length > 1) {
    e.preventDefault();
  }
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, false);

document.addEventListener('gesturestart', (e) => {
  e.preventDefault();
});
