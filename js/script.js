// =================== MENÚ DATA ===================
const defaultProductos = [];

const STORAGE_KEY = 'mauitop_productos';
const STORAGE_KEY_CATS = 'mauitop_categorias';

function loadProductos() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return saved;
  } catch (error) {
    console.warn('No se pudo cargar productos desde localStorage:', error);
  }
  return defaultProductos;
}

function saveProductos(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadCats() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_CATS));
    if (Array.isArray(saved)) return saved;
  } catch (error) {
    console.warn('No se pudo cargar categorías:', error);
  }
  return [];
}

let productos = loadProductos();

let cart = [];
let currentFilter = 'todos';

function fmtPrice(p) {
  return '$' + p.toLocaleString('es-CO');
}

// ====== RENDER TABS ======
function renderTabs() {
  const tabsContainer = document.getElementById('menu-tabs');
  const cats = loadCats();
  const categorias = ['todos', ...cats.map(c => c.nombre)];
  tabsContainer.innerHTML = categorias.map(cat => {
    const catData = cats.find(c => c.nombre === cat);
    const emoji = cat === 'todos' ? '🍽️' : (catData ? catData.emoji : '🍽️');
    const label = cat === 'todos' ? 'Todos' : (catData ? catData.label : cat.charAt(0).toUpperCase() + cat.slice(1));
    const activeClass = cat === currentFilter ? 'active' : '';
    return `<button class="tab-btn ${activeClass}" onclick="filterMenu('${cat}', this)">${emoji} ${label}</button>`;
  }).join('');
}

// ====== RENDER MENU ======
function renderMenu(filter = 'todos') {
  renderTabs();
  const grid = document.getElementById('menu-grid');
  const filtered = filter === 'todos' ? productos : productos.filter(p => p.categoria === filter);
  grid.innerHTML = filtered.map(p => {
    const isAvailable = p.disponible !== false && p.precio > 0;
    const buttonLabel = isAvailable ? '+' : 'No disp.';
    const buttonDisabled = isAvailable ? '' : 'disabled';
    const buttonTitle = isAvailable ? 'Agregar al carrito' : 'Producto no disponible';

    const cats = loadCats();
    const cat = cats.find(c => c.nombre === p.categoria);
    const hasImage = p.imagen && p.imagen.trim().length > 0;
    const contentHtml = hasImage ?
      `<img src="${p.imagen}" style="width:100%;height:100%;object-fit:cover;" alt="${p.nombre}" />` :
      `<span class="card-emoji">${cat ? cat.emoji : '🍽️'}</span>`;

    return `
      <div class="menu-card">
        <div class="card-img" style="background:${catColor(p.categoria)}">
          ${contentHtml}
          <span class="card-category">${cat ? cat.label : catLabel(p.categoria)}</span>
        </div>
        <div class="card-body">
          <div class="card-name">${p.nombre}</div>
          <div class="card-desc">${p.desc}</div>
          <div class="card-footer">
            <span class="card-price">${fmtPrice(p.precio)}</span>
            <button class="add-btn" ${buttonDisabled} onclick="addToCart('${p.nombre}', ${p.precio}, '${p.imagen}', '${p.categoria}', ${p.disponible})" title="${buttonTitle}">${buttonLabel}</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function catColor(c) {
  const cats = loadCats();
  const cat = cats.find(cat => cat.nombre === c);
  return cat ? cat.color : 'linear-gradient(135deg,#FFD100,#FF6B00)';
}

function catLabel(c) {
  const cats = loadCats();
  const cat = cats.find(cat => cat.nombre === c);
  return cat ? cat.label : c.charAt(0).toUpperCase() + c.slice(1);
}

function filterMenu(cat, btn) {
  currentFilter = cat;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderMenu(cat);
}

// ====== CART ======
function addToCart(nombre, precio, imagen, categoria, disponible) {
  if (precio <= 0 || disponible === false) {
    showToast(`🚫 ${nombre} no está disponible actualmente`);
    return;
  }

  const idx = cart.findIndex(i => i.nombre === nombre);
  if (idx >= 0) cart[idx].qty++;
  else cart.push({ nombre, precio, imagen, qty: 1 });
  renderCart();
  showToast('🍌 ' + nombre + ' agregado!');
  // No abrir carrito automáticamente. Queda solo al clickar el botón.
}

function renderCart() {
  const container = document.getElementById('cart-items');
  const total = cart.reduce((s, i) => s + i.precio * i.qty, 0);
  const count = cart.reduce((s, i) => s + i.qty, 0);

  document.getElementById('cart-count').textContent = count;
  document.getElementById('cart-count-2').textContent = count;
  document.getElementById('floating-cart-count').textContent = count;
  document.getElementById('cart-total-val').textContent = fmtPrice(total);
  document.getElementById('pedido-btn').disabled = cart.length === 0;

  if (cart.length === 0) {
    container.innerHTML = `<div class="cart-empty"><span class="emoji">🍽️</span><p>Tu carrito está vacío</p><p style="font-size:13px;color:#ccc;margin-top:6px;">¡Agrega algo rico!</p></div>`;
    return;
  }

  container.innerHTML = cart.map((item, idx) => `
    <div class="cart-item">
      <div class="ci-emoji"><img src="${item.imagen}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;" alt="${item.nombre}" /></div>
      <div class="ci-info">
        <div class="ci-name">${item.nombre}</div>
        <div class="ci-price">${fmtPrice(item.precio * item.qty)}</div>
      </div>
      <div class="ci-controls">
        <button class="ci-btn" onclick="changeQty(${idx},-1)">−</button>
        <span class="ci-qty">${item.qty}</span>
        <button class="ci-btn" onclick="changeQty(${idx},1)">+</button>
      </div>
      <button class="ci-remove" onclick="removeItem(${idx})">🗑️</button>
    </div>
  `).join('');
}

function changeQty(idx, delta) {
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  renderCart();
}

function removeItem(idx) {
  cart.splice(idx, 1);
  renderCart();
}

function toggleCart() {
  const sidebar = document.getElementById('cart-sidebar');
  const overlay = document.getElementById('cart-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
}

// ====== MODAL ======
function openModal() {
  if (cart.length === 0) return;
  toggleCart();
  // Render summary in modal
  const total = cart.reduce((s, i) => s + i.precio * i.qty, 0);
  const list = document.getElementById('modal-items-list');
  list.innerHTML = cart.map(i => `
    <div class="resumen-item"><span>🍌 ${i.nombre} x${i.qty}</span><span>${fmtPrice(i.precio * i.qty)}</span></div>
  `).join('') + `<div class="resumen-item"><span>💵 TOTAL</span><span>${fmtPrice(total)}</span></div>`;
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function enviarPedido() {
  const nombre = document.getElementById('f-nombre').value.trim();
  const tel = document.getElementById('f-tel').value.trim();
  const dir = document.getElementById('f-dir').value.trim();
  const barrio = document.getElementById('f-barrio').value.trim();
  const notas = document.getElementById('f-notas').value.trim();

  if (!nombre || !tel || !dir) {
    alert('⚠️ Por favor completa los campos obligatorios (nombre, teléfono y dirección).');
    return;
  }

  const total = cart.reduce((s, i) => s + i.precio * i.qty, 0);

  let msg = `🍌 *NUEVO PEDIDO - MAUITOP* 🍌\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `👤 *Cliente:* ${nombre}\n`;
  msg += `📱 *Teléfono:* ${tel}\n`;
  msg += `📍 *Dirección:* ${dir}\n`;
  if (barrio) msg += `🏘️ *Barrio:* ${barrio}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🛒 *Pedido:*\n`;
  cart.forEach(i => {
    msg += `  🍌 ${i.nombre} x${i.qty} — ${fmtPrice(i.precio * i.qty)}\n`;
  });
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💵 *TOTAL: ${fmtPrice(total)}*\n`;
  if (notas) msg += `📝 *Notas:* ${notas}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `¡Gracias por pedir en Mauitop! 🇨🇴`;

  const waUrl = `https://wa.me/573182896219?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');

  // Reset
  cart = [];
  renderCart();
  closeModal();
  document.getElementById('f-nombre').value = '';
  document.getElementById('f-tel').value = '';
  document.getElementById('f-dir').value = '';
  document.getElementById('f-barrio').value = '';
  document.getElementById('f-notas').value = '';
  showToast('✅ ¡Pedido enviado por WhatsApp!');
}

// ====== TOAST ======
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ====== INIT ======
renderMenu();