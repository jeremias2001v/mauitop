import { collection, getDocs, getDoc, doc, updateDoc, setDoc, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { db, auth } from "./firebase-config.js";

// DOM Elements
const screens = document.querySelectorAll('.screen');
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
      document.getElementById('waiter-name').textContent = `👨‍🍳 ${currentMeseroName}`;
      
      initRestaurantData();
    } catch(e) { 
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
  
  for (let i = 1; i <= numMesas; i++) {
    const tableName = `M${i}`;
    const legacyName = `Mesa ${i}`;
    
    // Check if table has an active order (Pendiente/Preparando)
    const activeOrder = livePedidos.find(p => (p.mesa === tableName || p.mesa === legacyName) && p.estado !== 'Entregado');
    
    if (activeOrder) {
      html += `
        <button class="table-btn table-occupied" onclick="openTable('${activeOrder.mesa}')">
          <span style="font-size:24px;">⏳</span>
          ${activeOrder.mesa.replace(/Mesa\s?/i, 'M')}
          <small style="font-size:12px;">$${Number(activeOrder.total).toLocaleString('es-CO')}</small>
        </button>
      `;
    } else {
      html += `
        <button class="table-btn table-free" onclick="openTable('${tableName}')">
          <span style="font-size:24px;">🍽️</span>
          ${tableName}
        </button>
      `;
    }
  }
  
  container.innerHTML = html;
}

window.openTable = function(tableName) {
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
      `<div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding:8px 0;">
        <span><b>${it.cantidad}x</b> ${it.nombre}</span>
        <span>$${(it.precio * it.cantidad).toLocaleString('es-CO')}</span>
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
    <div class="cat-chip ${i===0?'selected':''}" onclick="selectPosCat('${c.nombre}', this)">
      ${c.emoji} ${c.label}
    </div>
  `).join('');
}

window.selectPosCat = function(catName, el) {
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

window.updateItem = function(prodId, delta) {
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
    if(prod) {
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
  btn.textContent = "⚙️ Procesando...";
  
  try {
    const items = [];
    let total = 0;
    
    Object.keys(cart).forEach(id => {
      const qty = cart[id];
      const prod = localProductos.find(p => p.id == id);
      if(prod) {
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
    
    if(items.length === 0) return;

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
    btn.textContent = "Enviar a Cocina 🔔";
    document.getElementById('pos-cart-footer').classList.remove('visible');
  }
});

// Cobrar Mesa Activa
document.getElementById('btn-pay-table').addEventListener('click', async () => {
  if (!selectedActivePedido) return;
  const btn = document.getElementById('btn-pay-table');
  btn.disabled = true;
  btn.textContent = "⏳ Liberando...";
  
  try {
    await updateDoc(doc(db, "pedidos", selectedActivePedido.id), {
      estado: 'Entregado' // This closes the table natively
    });
    showScreen('tables-screen');
  } catch (err) {
    console.error(err);
    alert("Error al liberar mesa");
  } finally {
    btn.disabled = false;
    btn.textContent = "💵 Cobrar y Liberar Mesa";
  }
});
