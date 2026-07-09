import { collection, getDocs, getDoc, doc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

let productos = [];
let categorias = [];
let cart = [];
let currentFilter = 'todos';
let isStoreOpen = true;

const iconSvg = {
  trash: `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m19 6-1 14H6L5 6" /><path d="M10 11v5" /><path d="M14 11v5" /></svg>`
};

function fmtPrice(p) {
  return '$' + p.toLocaleString('es-CO');
}

// ====== RENDER TABS ======
function renderTabs() {
  const tabsContainer = document.getElementById('menu-tabs');
  const catNames = ['todos', ...categorias.map(c => c.nombre)];
  tabsContainer.innerHTML = catNames.map(cat => {
    const catData = categorias.find(c => c.nombre === cat);
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

  if (filtered.length === 0) {
    grid.innerHTML = '<p style="text-align:center;width:100%;grid-column:1/-1;color:#666;">No hay productos en esta categoría.</p>';
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const isAvailable = p.disponible !== false && p.precio > 0;
    const isReady = isAvailable && isStoreOpen;
    const buttonLabel = isReady ? '+' : (isAvailable && !isStoreOpen ? 'Cerrado' : 'No disp.');
    const buttonDisabled = isReady ? '' : 'disabled';
    const buttonTitle = isReady ? 'Agregar al carrito' : 'Tienda cerrada o producto no disponible';

    const cat = categorias.find(c => c.nombre === p.categoria);
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
  const cat = categorias.find(cat => cat.nombre === c);
  return cat ? cat.color : 'linear-gradient(135deg,#FFD100,#FF6B00)';
}

function catLabel(c) {
  const cat = categorias.find(cat => cat.nombre === c);
  return cat ? cat.label : c.charAt(0).toUpperCase() + c.slice(1);
}

window.filterMenu = function (cat, btn) {
  currentFilter = cat;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderMenu(cat);
};

// ====== CART ======
window.addToCart = function (nombre, precio, imagen, categoria, disponible) {
  if (!isStoreOpen) {
    showToast(`🏪 La tienda está cerrada por hoy`);
    return;
  }
  if (precio <= 0 || disponible === false) {
    showToast(`🚫 ${nombre} no está disponible actualmente`);
    return;
  }

  const idx = cart.findIndex(i => i.nombre === nombre);
  if (idx >= 0) cart[idx].qty++;
  else cart.push({ nombre, precio, imagen, qty: 1 });
  renderCart();
  showToast('🍌 ' + nombre + ' agregado!');
};

function renderCart() {
  const container = document.getElementById('cart-items');
  const total = cart.reduce((s, i) => s + i.precio * i.qty, 0);
  const count = cart.reduce((s, i) => s + i.qty, 0);

  const cartCount = document.getElementById('cart-count');
  const cartCount2 = document.getElementById('cart-count-2');
  const floatingCartCount = document.getElementById('floating-cart-count');
  if (cartCount) cartCount.textContent = count;
  if (cartCount2) cartCount2.textContent = count;
  if (floatingCartCount) floatingCartCount.textContent = count;
  document.getElementById('cart-total-val').textContent = fmtPrice(total);
  document.getElementById('pedido-btn').disabled = cart.length === 0;

  if (cart.length === 0) {
    container.innerHTML = `<div class="cart-empty"><span class="emoji">🍽️</span><p>Tu carrito está vacío</p><p style="font-size:13px;color:#9b8d78;margin-top:6px;">¡Agrega algo rico!</p></div>`;
    return;
  }

  container.innerHTML = cart.map((item, idx) => `
    <div class="cart-item">
      <div class="ci-emoji"><img src="${item.imagen}" alt="${item.nombre}" /></div>
      <div class="ci-info">
        <div class="ci-name">${item.nombre}</div>
        <div class="ci-unit">${fmtPrice(item.precio)} c/u</div>
        <div class="ci-price">${fmtPrice(item.precio * item.qty)}</div>
      </div>
      <div class="ci-controls">
        <button class="ci-btn" onclick="changeQty(${idx},-1)" aria-label="Disminuir cantidad">−</button>
        <span class="ci-qty">${item.qty}</span>
        <button class="ci-btn" onclick="changeQty(${idx},1)" aria-label="Aumentar cantidad">+</button>
      </div>
      <button class="ci-remove" onclick="removeItem(${idx})" aria-label="Eliminar ${item.nombre}">${iconSvg.trash}</button>
    </div>
  `).join('');
}

window.changeQty = function (idx, delta) {
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  renderCart();
};

window.removeItem = function (idx) {
  cart.splice(idx, 1);
  renderCart();
};

window.toggleCart = function () {
  const sidebar = document.getElementById('cart-sidebar');
  const overlay = document.getElementById('cart-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
};

// ====== MODAL ======
window.openModal = function () {
  if (cart.length === 0) return;
  window.toggleCart();
  // Render summary in modal
  const total = cart.reduce((s, i) => s + i.precio * i.qty, 0);
  const list = document.getElementById('modal-items-list');
  list.innerHTML = cart.map(i => `
    <div class="resumen-item"><span>🍌 ${i.nombre} x${i.qty}</span><span>${fmtPrice(i.precio * i.qty)}</span></div>
  `).join('') + `<div class="resumen-item"><span>💵 TOTAL</span><span>${fmtPrice(total)}</span></div>`;
  document.getElementById('modal-overlay').classList.add('open');
};

window.closeModal = function () {
  document.getElementById('modal-overlay').classList.remove('open');
};

window.enviarPedido = async function () {
  const nombre = document.getElementById('f-nombre').value.trim();
  const tel = document.getElementById('f-tel').value.trim();
  const dir = document.getElementById('f-dir').value.trim();
  const barrio = document.getElementById('f-barrio').value.trim();
  const pago = document.getElementById('f-pago').value;
  const notas = document.getElementById('f-notas').value.trim();

  if (!nombre || !tel || !dir) {
    alert('⚠️ Por favor completa los campos obligatorios (nombre, teléfono y dirección).');
    return;
  }

  const total = cart.reduce((s, i) => s + i.precio * i.qty, 0);

  let msg = `🍌 *NUEVO PEDIDO - MAUITOP* 🍌\n\n`;
  msg += `👤 *Cliente:* ${nombre}\n`;
  msg += `📱 *Teléfono:* ${tel}\n`;
  msg += `📍 *Dirección:* ${dir}\n`;
  if (barrio) msg += `🏘️ *Barrio:* ${barrio}\n`;
  msg += `💳 *Pago:* ${pago}\n\n`;
  msg += `🛒 *Pedido:*\n`;
  cart.forEach(i => {
    msg += `  🍌 ${i.nombre} x${i.qty} — ${fmtPrice(i.precio * i.qty)}\n`;
  });
  msg += `\n💵 *TOTAL: ${fmtPrice(total)}*\n`;
  if (notas) msg += `📝 *Notas:* ${notas}\n`;
  msg += `\n¡Gracias por pedir en Mauitop! 🇨🇴`;

  const waUrl = `https://wa.me/573182896219?text=${encodeURIComponent(msg)}`;

  // --- NUEVO: GUARDAR EN LA NUBE (En segundo plano para evitar bloqueos) ---
  addDoc(collection(db, "pedidos"), {
    cliente: { nombre, telefono: tel, direccion: dir, barrio, metodoPago: pago },
    ítems: cart.map(i => ({ nombre: i.nombre, precio: i.precio, cantidad: i.qty })),
    total: total,
    notas: notas,
    estado: 'Pendiente',
    fecha: serverTimestamp()
  }).catch(error => {
    console.error("Error guardando orden en la nube:", error);
  });
  // ---------------------------------

  // Abrir WhatsApp directamente (¡Ahora Safari no molesta porque se abre instantáneamente al dar click!)
  window.open(waUrl, '_blank');

  // Reset
  cart = [];
  renderCart();
  window.closeModal();
  document.getElementById('f-nombre').value = '';
  document.getElementById('f-tel').value = '';
  document.getElementById('f-dir').value = '';
  document.getElementById('f-barrio').value = '';
  document.getElementById('f-notas').value = '';
  showToast('¡Pedido enviado por WhatsApp!');
};

// ====== TOAST ======
function showToast(msg) {
  const t = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  if (msgEl) msgEl.textContent = msg.replace('🍌 ', '');
  else t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ====== INIT CON FIREBASE ======
async function initMenu() {
  const skeletonCards = Array(6).fill(`
    <div class="menu-card skeleton-card">
      <div class="skeleton-img shimmer"></div>
      <div class="card-body">
        <div class="skeleton-title shimmer"></div>
        <div class="skeleton-text shimmer"></div>
        <div class="skeleton-text shimmer" style="width:70%;"></div>
        <div class="card-footer" style="margin-top: 15px;">
          <div class="skeleton-price shimmer"></div>
          <div class="skeleton-btn shimmer"></div>
        </div>
      </div>
    </div>
  `).join('');
  document.getElementById('menu-grid').innerHTML = skeletonCards;

  try {
    const catsSnap = await getDocs(collection(db, "categorias"));
    categorias = catsSnap.docs.map(d => d.data());

    // Sort o algo si se quiere. Por ahora como viene.

    const prodsSnap = await getDocs(collection(db, "productos"));
    productos = prodsSnap.docs.map(d => d.data());

    // Fetch Configs Adicionales (Estado)
    try {
      // Estado Tienda
      const confSnap = await getDoc(doc(db, "configuracion", "estado"));
      if (confSnap.exists()) {
        const estado = confSnap.data();
        if (estado.abierta === false) {
          isStoreOpen = false;
        }

        const addressEl = document.getElementById('restaurant-address');
        const hoursEl = document.getElementById('restaurant-hours');
        if (addressEl && estado.direccion) {
          addressEl.textContent = `📍 ${estado.direccion}`;
        }
        if (hoursEl && estado.horario) {
          hoursEl.textContent = `🕒 ${estado.horario}`;
        }
        if (estado.bannerImagen) {
          const banner = document.querySelector('.restaurant-banner');
          if (banner) {
            banner.style.backgroundImage = `linear-gradient(135deg, rgba(26,14,5,0.78), rgba(42,22,10,0.72)), url("${estado.bannerImagen}")`;
            banner.style.backgroundSize = 'cover';
            banner.style.backgroundPosition = 'center';
          }
        }
      }
    } catch (e) {
      console.error("No se pudo obtener el estado de la tienda", e);
    }

    if (!isStoreOpen) {
      document.getElementById('closed-banner').style.display = 'block';
      const floatingButton = document.querySelector('.floating-cart-btn');
      if (floatingButton) floatingButton.style.display = 'none';
    }

    // Si llegara a estar 100% vacío (porque aún no han abierto el admin-panel para migrar)
    if (productos.length === 0 && categorias.length === 0) {
      document.getElementById('menu-grid').innerHTML = '<p style="text-align:center;width:100%;grid-column:1/-1;color:#666;">No hay productos disponibles por ahora. Ingresa al panel de administración para agregarlos.</p>';
      return;
    }

    renderMenu();
  } catch (err) {
    console.error("Error cargando desde Firebase:", err);
    document.getElementById('menu-grid').innerHTML = '<p style="text-align:center;width:100%;grid-column:1/-1;color:red;">Error al cargar el menú. Asegúrate de tener conexión a Internet.</p>';
  }
}

initMenu();
