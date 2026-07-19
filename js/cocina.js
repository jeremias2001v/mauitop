import { collection, doc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { db, auth } from "./firebase-config.js";

// ────────────────────────────────────────────────
// SCREENS
// ────────────────────────────────────────────────
const screens = document.querySelectorAll('.screen');
function showScreen(id) {
  screens.forEach(s => s.classList.remove('active-screen'));
  document.getElementById(id).classList.add('active-screen');
}

// ────────────────────────────────────────────────
// CLOCK
// ────────────────────────────────────────────────
function startClock() {
  const el = document.getElementById('kitchen-clock');
  function tick() {
    el.textContent = new Date().toLocaleTimeString('es-CO', { hour12: false });
  }
  tick();
  setInterval(tick, 1000);
}

// ────────────────────────────────────────────────
// AUTH
// ────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (user) {
    showScreen('kitchen-screen');
    startClock();
    setupLiveOrders();
  } else {
    showScreen('login-screen');
  }
});

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btn-login');
  const errEl = document.getElementById('login-error');
  btn.disabled = true;
  btn.textContent = 'Verificando...';
  errEl.style.display = 'none';
  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById('email').value.trim(),
      document.getElementById('password').value
    );
  } catch {
    errEl.textContent = 'Credenciales incorrectas.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar a Cocina';
  }
});

document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

// ────────────────────────────────────────────────
// LIVE ORDERS
// ────────────────────────────────────────────────
let knownOrderIds = new Set();
let isFirstLoad = true;

function setupLiveOrders() {
  onSnapshot(collection(db, "pedidos"), snapshot => {
    const activeOrders = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.estado !== 'Entregado')
      .sort((a, b) => {
        const ta = a.fecha?.toMillis ? a.fecha.toMillis() : 0;
        const tb = b.fecha?.toMillis ? b.fecha.toMillis() : 0;
        return ta - tb; // más antiguo primero
      });

    // Detectar pedidos nuevos (no en la primera carga)
    if (!isFirstLoad) {
      activeOrders.forEach(order => {
        if (!knownOrderIds.has(order.id)) notifyNewOrder();
      });
    }

    knownOrderIds = new Set(activeOrders.map(o => o.id));
    isFirstLoad = false;

    renderOrders(activeOrders);
    const n = activeOrders.length;
    document.getElementById('order-count').textContent =
      `${n} pedido${n !== 1 ? 's' : ''}`;
  });
}

// ────────────────────────────────────────────────
// NOTIFICACIÓN NUEVO PEDIDO
// ────────────────────────────────────────────────
function notifyNewOrder() {
  // Flash visual
  document.body.classList.add('new-order-flash');
  setTimeout(() => document.body.classList.remove('new-order-flash'), 900);

  // Pitido via Web Audio API
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1100].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.25, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  } catch (e) { /* sin audio si el navegador lo bloquea */ }
}

// ────────────────────────────────────────────────
// TIMER — actualiza cada 15 s
// ────────────────────────────────────────────────
setInterval(() => {
  document.querySelectorAll('.order-timer[data-ts]').forEach(el => {
    el.textContent = formatElapsed(parseInt(el.dataset.ts));
  });
}, 15_000);

function formatElapsed(tsMs) {
  const secs = Math.floor((Date.now() - tsMs) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ────────────────────────────────────────────────
// RENDER
// ────────────────────────────────────────────────
function stateClass(estado) {
  return estado === 'Pendiente' ? 'state-pendiente'
       : estado === 'En Preparación' ? 'state-preparando'
       : 'state-listo';
}

function stateLabel(estado) {
  return estado === 'Pendiente'     ? 'Pendiente'
       : estado === 'En Preparación' ? 'En Preparación'
       : 'Listo';
}

function nextActionLabel(estado) {
  return estado === 'Pendiente'     ? 'Empezar'
       : estado === 'En Preparación' ? 'Marcar Listo'
       : null;
}

function renderOrders(orders) {
  const container = document.getElementById('orders-container');

  if (orders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" style="display:flex; justify-content:center; align-items:center;"><svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.35;"><polyline points="20 6 9 17 4 12"/></svg></div>
        <h2>¡Todo al día!</h2>
        <p>No hay pedidos pendientes en este momento</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="orders-grid">
      ${orders.map(renderCard).join('')}
    </div>`;
}

function renderCard(order) {
  const cls       = stateClass(order.estado);
  const tableName = order.mesa || 'Domicilio';
  const waiter    = order.mesero || order.cliente?.nombre || 'Sin asignar';
  const items     = order.ítems || order.items || [];
  const ts        = order.fecha?.toMillis ? order.fecha.toMillis() : Date.now();
  const elapsed   = formatElapsed(ts);
  const nextLabel = nextActionLabel(order.estado);

  const itemsHtml = items.length
    ? items.map(it => `
        <div class="order-item-row">
          <div class="order-qty">${it.cantidad ?? it.qty ?? 1}</div>
          <div class="order-item-name">${it.nombre}</div>
        </div>`).join('')
    : `<p style="color:var(--text-muted); font-size:13px; padding:8px 0;">Sin ítems registrados</p>`;

  const actionBtn = nextLabel
    ? `<button class="advance-btn" onclick="avanzarEstado('${order.id}','${order.estado}')">${nextLabel}</button>`
    : `<button class="advance-btn" disabled>Esperando mesero</button>`;

  return `
    <div class="order-card ${cls}" id="card-${order.id}">
      <div class="order-card-header">
        <div class="order-table">${tableName}</div>
        <div class="order-meta">
          <div class="order-mesero" style="display:inline-flex; align-items:center; gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${waiter}</div>
          <div class="order-timer" data-ts="${ts}">${elapsed}</div>
        </div>
      </div>
      <div class="order-items">${itemsHtml}</div>
      <div class="order-card-footer">
        <span class="state-badge">${stateLabel(order.estado)}</span>
        ${actionBtn}
      </div>
    </div>`;
}

// ────────────────────────────────────────────────
// AVANZAR ESTADO
// ────────────────────────────────────────────────
window.avanzarEstado = async function (id, estadoActual) {
  const nextState = estadoActual === 'Pendiente' ? 'En Preparación' : 'Listo';
  const btn = document.querySelector(`#card-${id} .advance-btn`);
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  try {
    await updateDoc(doc(db, "pedidos", id), { estado: nextState });
  } catch (err) {
    console.error(err);
    if (btn) {
      btn.disabled = false;
      btn.textContent = nextActionLabel(estadoActual) || '?';
    }
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

