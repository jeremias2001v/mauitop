import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, getAuth as getSecondaryAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { db, auth, firebaseConfig } from "./firebase-config.js";

let localProductos = [];
let localCategorias = [];
let localPedidos = [];
let localMeseros = [];
let hideUnavailableProducts = false;

// --- THEME LOGIC ---
const savedTheme = localStorage.getItem('theme-admin');
if (savedTheme === 'dark') document.body.classList.add('dark-theme');

const darkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px;"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const lightIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px;"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.innerHTML = document.body.classList.contains('dark-theme') ? darkIcon + ' Modo Oscuro' : lightIcon + ' Modo Claro';
    btn.addEventListener('click', () => {
      const isDark = document.body.classList.toggle('dark-theme');
      localStorage.setItem('theme-admin', isDark ? 'dark' : 'light');
      document.querySelectorAll('.theme-toggle').forEach(b => b.innerHTML = isDark ? darkIcon + ' Modo Oscuro' : lightIcon + ' Modo Claro');
    });
  });
});

window.switchAdminTab = function (tabName) {
  // Sync TODOS los nav items (sidebar desktop + mobile bottom)
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tabName);
  });

  // Mostrar/Ocultar Tabs
  ['inventario', 'pedidos', 'finanzas', 'estadisticas', 'operacion'].forEach(tab => {
    const el = document.getElementById(`tab-${tab}`);
    if (el) el.style.display = tab === tabName ? 'block' : 'none';
  });

  if (tabName === 'pedidos') window.loadPedidos();
  if (tabName === 'finanzas') window.loadDashboard();
  if (tabName === 'estadisticas') window.loadEstadisticas();
};

window.loadEstadisticas = async function () {
  showAdminMessage('Calculando estadísticas...', 'info');
  try {
    const snap = await getDocs(collection(db, "pedidos"));
    localPedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderEstadisticas();
    showAdminMessage('Estadísticas listas', 'success');
  } catch (e) {
    console.error(e);
    showAdminMessage('Error cargando estadísticas', 'error');
  }
};

// NOTA: expuesta en window para que el onchange="renderEstadisticas()" del HTML funcione
window.renderEstadisticas = function renderEstadisticas() {
  const filterVal = document.getElementById('stats-date-filter')?.value || 'all';
  const now = new Date();

  const entregados = localPedidos.filter(p => {
    if (p.estado !== 'Entregado') return false;
    if (filterVal === 'all') return true;

    // Si no tiene fecha y hay un filtro activo, no lo incluimos
    if (!p.fecha || !p.fecha.toDate) return false;

    const pDate = p.fecha.toDate();

    if (filterVal === 'today') {
      return pDate.getDate() === now.getDate() &&
        pDate.getMonth() === now.getMonth() &&
        pDate.getFullYear() === now.getFullYear();
    }
    if (filterVal === 'week') {
      const msInWeek = 7 * 24 * 60 * 60 * 1000;
      return (now - pDate) <= msInWeek;
    }
    if (filterVal === 'month') {
      return pDate.getMonth() === now.getMonth() &&
        pDate.getFullYear() === now.getFullYear();
    }
    return true;
  });

  const totalPedidos = entregados.length;
  let ingresosTotal = 0;
  let conteoProductos = {};
  let conteoPagos = {};

  entregados.forEach(p => {
    let t = Number(p.total) || 0;
    ingresosTotal += t;

    const mp = p.cliente?.metodoPago || 'Efectivo';
    conteoPagos[mp] = (conteoPagos[mp] || 0) + 1;

    if (p.ítems) {
      p.ítems.forEach(item => {
        const nombre = item.nombre;
        const qty = item.cantidad || item.qty || 1;
        conteoProductos[nombre] = (conteoProductos[nombre] || 0) + Number(qty);
      });
    }
  });

  const ticketPromedio = totalPedidos > 0 ? (ingresosTotal / totalPedidos) : 0;
  document.getElementById('stat-ticket-promedio').textContent = '$' + Math.round(ticketPromedio).toLocaleString('es-CO');
  document.getElementById('stat-total-pedidos').textContent = totalPedidos.toString();

  function generarBarras(conteoObjeto, containerId, colors, prefijoValor = '') {
    const ordenado = Object.entries(conteoObjeto).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxVal = ordenado.length > 0 ? ordenado[0][1] : 1;

    const html = ordenado.map(([nombre, cant], index) => {
      const porcentaje = Math.max(5, (cant / maxVal) * 100);
      const color = colors[index % colors.length];
      return `
        <div class="bar-row">
          <div class="bar-header">
            <span>${nombre}</span>
            <span class="bar-value">${prefijoValor}${cant}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${porcentaje}%; background: ${color};"></div>
          </div>
        </div>
      `;
    }).join('');

    document.getElementById(containerId).innerHTML = html || '<p style="color:#888; font-size:13px;">No hay datos suficientes</p>';
  }

  const prodColors = ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe'];
  const pagoColors = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5'];

  generarBarras(conteoProductos, 'top-productos-container', prodColors);
  generarBarras(conteoPagos, 'metodos-pago-container', pagoColors);
}

window.loadDashboard = async function () {
  showAdminMessage('Calculando finanzas...', 'info');
  try {
    const snap = await getDocs(collection(db, "pedidos"));
    localPedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderDashboard();
    showAdminMessage('Datos financieros actualizados', 'success');
  } catch (e) {
    console.error(e);
    showAdminMessage('Error cargando datos financieros', 'error');
  }
};

function renderDashboard() {
  let ingresosHoy = 0;
  let ingresosMes = 0;
  let ingresosTotal = 0;
  let conteoProductos = {};

  const hoy = new Date();
  const mesActual = hoy.getMonth();
  const anioActual = hoy.getFullYear();
  const diaActual = hoy.getDate();

  const entregados = localPedidos.filter(p => p.estado === 'Entregado');

  entregados.forEach(p => {
    let t = Number(p.total) || 0;
    ingresosTotal += t;

    if (p.fecha && p.fecha.toDate) {
      const fechaP = p.fecha.toDate();
      if (fechaP.getFullYear() === anioActual && fechaP.getMonth() === mesActual) {
        ingresosMes += t;
        if (fechaP.getDate() === diaActual) {
          ingresosHoy += t;
        }
      }
    }

    if (p.ítems) {
      p.ítems.forEach(item => {
        const nombre = item.nombre;
        const qty = item.cantidad || item.qty || 1;
        conteoProductos[nombre] = (conteoProductos[nombre] || 0) + Number(qty);
      });
    }
  });

  let productoEstrella = 'N/A';
  let maxVentas = 0;
  for (const [nombre, cantidad] of Object.entries(conteoProductos)) {
    if (cantidad > maxVentas) {
      maxVentas = cantidad;
      productoEstrella = nombre;
    }
  }

  document.getElementById('stat-hoy').textContent = '$' + ingresosHoy.toLocaleString('es-CO');
  document.getElementById('stat-mes').textContent = '$' + ingresosMes.toLocaleString('es-CO');
  document.getElementById('stat-total').textContent = '$' + ingresosTotal.toLocaleString('es-CO');
  document.getElementById('stat-estrella').textContent = productoEstrella !== 'N/A' ? `${productoEstrella} (${maxVentas})` : 'N/A';
}

let pedidosUnsubscribe = null;

window.loadPedidos = function () {
  if (pedidosUnsubscribe) {
    // Ya suscrito: solo re-renderizar con los datos actuales
    renderPedidos();
    return;
  }
  showAdminMessage('Conectando a historial de pedidos en vivo...', 'info');
  try {
    pedidosUnsubscribe = onSnapshot(collection(db, "pedidos"), (snap) => {
      localPedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      localPedidos.sort((a, b) => {
        const ta = a.fecha?.toMillis ? a.fecha.toMillis() : 0;
        const tb = b.fecha?.toMillis ? b.fecha.toMillis() : 0;
        return tb - ta;
      });
      renderPedidos();
      // Refrescar stats si el tab está abierto
      if (document.getElementById('tab-estadisticas').style.display === 'block') renderEstadisticas();
      if (document.getElementById('tab-finanzas').style.display === 'block') renderDashboard();
    }, (error) => {
      console.error(error);
      showAdminMessage('Error cargando pedidos en vivo', 'error');
    });
    showAdminMessage('Pedidos Live activados', 'success');
  } catch (e) {
    console.error(e);
  }
};

// ── Badge de pedidos activos — actualiza sidebar y mobile nav ────────────────
function updateOrdersBadge() {
  const count = localPedidos.filter(p => p.estado !== 'Entregado').length;
  ['nav-pedidos-badge', 'mob-pedidos-badge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = count || '';
    el.style.display = count > 0 ? 'inline-flex' : 'none';
  });
}

window.renderPedidos = function renderPedidos() {
  const filterVal = document.getElementById('pedidos-date-filter')?.value || 'week';
  const now = new Date();

  function isMesa(p) { return !!(p.mesa || p.origen === 'mesa'); }

  function matchesFilter(p) {
    if (filterVal === 'all') return true;
    if (!p.fecha || !p.fecha.toDate) return false;
    const d = p.fecha.toDate();
    if (filterVal === 'today') {
      return d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();
    }
    if (filterVal === 'week') return (now - d) <= 7 * 24 * 60 * 60 * 1000;
    if (filterVal === 'month') return d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    return true;
  }

  const enProceso = localPedidos.filter(p => p.estado !== 'Entregado');
  const mesasCobradas = localPedidos.filter(p => p.estado === 'Entregado' && isMesa(p) && matchesFilter(p)).slice(0, 200);
  const domiciliosEntregados = localPedidos.filter(p => p.estado === 'Entregado' && !isMesa(p) && matchesFilter(p)).slice(0, 200);

  renderProcesoTable(enProceso);
  renderMesasTable(mesasCobradas);
  renderDomiciliosTable(domiciliosEntregados);
  updateOrdersBadge();
};

// ── Helpers compartidos ──────────────────────────────────────────────────────
function fmtDate(p, opts) {
  if (!p.fecha || !p.fecha.toDate) return 'Fecha desconocida';
  return p.fecha.toDate().toLocaleString('es-CO', opts);
}

function itemsStr(p) {
  return (p.ítems || p.items || [])
    .map(i => `${i.cantidad ?? i.qty ?? 1}× ${i.nombre}`)
    .join('<br>');
}

function deleteBtn(id) {
  return `<button class="action-btn delete" onclick="eliminarPedido('${id}')">Eliminar</button>`;
}

// Extrae el número de mesa y genera un badge limpio
function mesaBadge(mesaVal) {
  const raw = (mesaVal || '').trim();
  const num = raw.replace(/[^\d]/g, ''); // solo dígitos
  return `<span class="mesa-num-badge">
    <span class="mesa-num">${num || '?'}</span>
    <span class="mesa-lbl">Mesa</span>
  </span>`;
}

function emptyRow(cols, msg) {
  return `<tr><td colspan="${cols}" style="text-align:center;color:#888;padding:24px;">${msg}</td></tr>`;
}

// ── 1. En Proceso ────────────────────────────────────────────────────────────
function renderProcesoTable(pedidos) {
  const tbody = document.querySelector('#pedidos-proceso-table tbody');
  if (!tbody) return;

  if (!pedidos.length) {
    tbody.innerHTML = emptyRow(6, '✅ Sin pedidos activos ahora mismo');
    return;
  }

  const estadoBadge = estado => {
    const cls = estado === 'Pendiente' ? 'estado-pendiente'
              : estado === 'En Preparación' ? 'estado-preparando'
              : 'estado-listo';
    const dotColor = estado === 'Pendiente' ? '#d97706'
                   : estado === 'En Preparación' ? '#ea580c'
                   : '#16a34a';
    const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};margin-right:6px;vertical-align:middle;"></span>`;
    return `<span class="estado-badge ${cls}">${dot}${estado}</span>`;
  };

  tbody.innerHTML = pedidos.map(p => {
    const hora = p.fecha?.toDate
      ? p.fecha.toDate().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
      : '—';

    const esMesa = !!(p.mesa || p.origen === 'mesa');
    const origen = esMesa
      ? `<div style="display:flex;align-items:center;gap:10px;">
           ${mesaBadge(p.mesa)}
           <span style="font-size:12px;color:var(--text-muted);display:inline-flex;align-items:center;gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${p.mesero || 'N/A'}</span>
         </div>`
      : `<span style="font-weight:700;color:var(--text-main);">${p.cliente?.nombre || 'Domicilio'}</span>
         <div style="font-size:12px;color:var(--text-muted);">🛵 Delivery</div>`;

    const accion = p.estado !== 'Entregado'
      ? `<button class="action-btn edit" onclick="marcarEntregado('${p.id}')" style="display:block;margin-bottom:4px;">Marcar Entregado</button>`
      : '';

    return `<tr>
      <td style="color:var(--text-muted);font-size:13px;white-space:nowrap;">${hora}</td>
      <td>${origen}</td>
      <td style="font-size:13px;line-height:1.7;">${itemsStr(p)}</td>
      <td style="font-weight:700;color:var(--success);">$${Number(p.total).toLocaleString('es-CO')}</td>
      <td>${estadoBadge(p.estado)}</td>
      <td>${accion}${deleteBtn(p.id)}</td>
    </tr>`;
  }).join('');
}

// ── 2. Mesas Cobradas ────────────────────────────────────────────────────────
function renderMesasTable(pedidos) {
  const tbody = document.querySelector('#pedidos-mesas-table tbody');
  if (!tbody) return;

  if (!pedidos.length) {
    tbody.innerHTML = emptyRow(7, 'No hay mesas cobradas en el período seleccionado');
    return;
  }

  tbody.innerHTML = pedidos.map(p => {
    const pago = p.cliente?.metodoPago;
    const pagoHtml = pago && pago !== 'Por definir'
      ? `<span style="font-weight:600;">${pago}</span>`
      : `<span style="color:#f59e0b;font-size:12px;font-weight:600;">Sin registrar</span>`;

    return `<tr>
      <td style="color:var(--text-muted);font-size:13px;">${fmtDate(p, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
      <td>${mesaBadge(p.mesa)}</td>
      <td style="font-weight:600;color:var(--text-main);display:inline-flex;align-items:center;gap:4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${p.mesero || 'N/A'}</td>
      <td style="font-size:13px;line-height:1.7;">${itemsStr(p)}</td>
      <td style="font-weight:700;color:var(--success);">$${Number(p.total).toLocaleString('es-CO')}</td>
      <td>${pagoHtml}</td>
      <td>${deleteBtn(p.id)}</td>
    </tr>`;
  }).join('');
}

// ── 3. Domicilios Entregados ─────────────────────────────────────────────────
function renderDomiciliosTable(pedidos) {
  const tbody = document.querySelector('#pedidos-domicilios-table tbody');
  if (!tbody) return;

  if (!pedidos.length) {
    tbody.innerHTML = emptyRow(7, 'No hay domicilios entregados en el período seleccionado');
    return;
  }

  tbody.innerHTML = pedidos.map(p => {
    const pago = p.cliente?.metodoPago || 'Efectivo';
    return `<tr>
      <td style="color:var(--text-muted);font-size:13px;">${fmtDate(p, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
      <td>
        <strong style="color:var(--text-main);">${p.cliente?.nombre || 'Sin nombre'}</strong><br>
        <small style="color:var(--text-muted);display:inline-flex;align-items:center;gap:4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg> ${p.cliente?.telefono || 'N/A'}</small>
      </td>
      <td style="font-size:13px;color:var(--text-muted);">
        ${p.cliente?.direccion || 'Sin dirección'}
        ${p.cliente?.barrio ? `<br><small>${p.cliente.barrio}</small>` : ''}
      </td>
      <td style="font-size:13px;line-height:1.7;">${itemsStr(p)}</td>
      <td style="font-weight:700;color:var(--success);">$${Number(p.total).toLocaleString('es-CO')}</td>
      <td style="font-weight:600;">${pago}</td>
      <td>${deleteBtn(p.id)}</td>
    </tr>`;
  }).join('');
}

window.marcarEntregado = async function (id) {
  openConfirmDialog('¿Estás seguro de que deseas marcar este pedido como ENTREGADO?', async () => {
    try {
      showAdminMessage('Actualizando estado...', 'info');
      await updateDoc(doc(db, "pedidos", id), {
        estado: 'Entregado'
      });
      // Actualizar copia local
      const pd = localPedidos.find(p => p.id === id);
      if (pd) pd.estado = 'Entregado';
      renderPedidos();
      showAdminMessage('Pedido marcado como entregado 🎉', 'success');
    } catch (e) {
      console.error(e);
      showAdminMessage('Error al actualizar pedido', 'error');
    }
  });
};

window.eliminarPedido = async function (id) {
  openConfirmDialog('¿Estás completamente seguro de que quieres BORRAR este pedido del historial? (No se puede deshacer)', async () => {
    try {
      showAdminMessage('Eliminando pedido...', 'info');
      await deleteDoc(doc(db, "pedidos", id));
      localPedidos = localPedidos.filter(p => p.id !== id);
      renderPedidos();
      showAdminMessage('Pedido eliminado permanentemente', 'success');
    } catch (e) {
      console.error(e);
      showAdminMessage('Error al eliminar pedido', 'error');
    }
  });
};

// Funciones de autenticación Firebase
function initAuthObserver() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      document.getElementById('login-modal').style.display = 'none';
      document.getElementById('admin-content').style.display = 'block';
      initData();
    } else {
      document.getElementById('admin-content').style.display = 'none';
      document.getElementById('login-modal').style.display = 'flex';
      document.getElementById('login-password').value = '';
    }
  });
}

window.handleLogin = async function (event) {
  event.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorMsg = document.getElementById('login-error');
  const btn = document.querySelector('#login-form button');

  try {
    errorMsg.style.display = 'none';
    btn.textContent = 'Autenticando...';
    btn.disabled = true;

    await signInWithEmailAndPassword(auth, email, password);
    // El onAuthStateChanged se encargará de mostrar el panel
  } catch (error) {
    console.error("Auth error:", error);
    errorMsg.textContent = 'Correo o contraseña incorrectos';
    errorMsg.style.display = 'block';
  } finally {
    btn.textContent = 'Ingresar al Panel';
    btn.disabled = false;
  }
};

window.handleLogout = function () {
  signOut(auth).catch(err => console.error(err));
};

const prodForm = document.getElementById('prod-form');
const catForm = document.getElementById('cat-form');
const tableBody = document.querySelector('#products-table tbody');
const catsTableBody = document.querySelector('#cats-table tbody');
const submitBtn = document.getElementById('submit-btn');

let editingId = null;
let editingCatName = null;

function isDataImage(value = '') {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function loadImageFromSource(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = source;
  });
}

async function compressImageSource(source, maxSize = 900, quality = 0.82) {
  const img = await loadImageFromSource(source);
  const canvas = document.createElement('canvas');
  let width = img.width;
  let height = img.height;

  if (width > height && width > maxSize) {
    height = Math.round(height * maxSize / width);
    width = maxSize;
  } else if (height > maxSize) {
    width = Math.round(width * maxSize / height);
    height = maxSize;
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
  });
}

async function optimizeDataImage(dataUrl, maxSize = 900, quality = 0.82) {
  if (!isDataImage(dataUrl)) return dataUrl;
  const blob = await compressImageSource(dataUrl, maxSize, quality);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(event.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// FIREBASE FETCH Y MIGRACIÓN AUTÓMATICA
async function initData() {
  try {
    showAdminMessage('Cargando datos de Firebase...', 'info');

    // Fetch Estado Tienda
    checkStoreStatus();

    // Fetch Estrella Img
    try {
      const estSnap = await getDoc(doc(db, "configuracion", "estrella"));
      if (estSnap.exists() && estSnap.data().imagen) {
        let estrellaImagen = estSnap.data().imagen;
        if (isDataImage(estrellaImagen)) {
          showAdminMessage('Optimizando imagen estrella...', 'info');
          estrellaImagen = await optimizeDataImage(estrellaImagen, 1000, 0.86);
          await setDoc(doc(db, "configuracion", "estrella"), { imagen: estrellaImagen }, { merge: true });
        }
        document.getElementById('estrella-preview').src = estrellaImagen;
        document.getElementById('estrella-preview-container').style.display = 'block';
        document.getElementById('estrella-imagen').value = estrellaImagen;
      }
    } catch (e) { console.error(e); }

    // Fetch Operacion
    try {
      const opSnap = await getDoc(doc(db, "configuracion", "operacion"));
      if (opSnap.exists() && opSnap.data().mesasActivas) {
        document.getElementById('op-mesas').value = opSnap.data().mesasActivas;
      }
    } catch (e) { }

    fetchMeseros();

    // Fetch categories
    const catsSnap = await getDocs(collection(db, "categorias"));
    if (catsSnap.empty) {
      // Migrar desde localStorage
      const stored = JSON.parse(localStorage.getItem('mauitop_categorias'));
      if (Array.isArray(stored) && stored.length > 0) {
        showAdminMessage('Migrando categorías locales...', 'info');
        for (let c of stored) {
          await setDoc(doc(db, "categorias", c.nombre), c);
          localCategorias.push(c);
        }
      }
    } else {
      localCategorias = catsSnap.docs.map(d => d.data());
    }

    // Fetch products
    const prodsSnap = await getDocs(collection(db, "productos"));
    if (prodsSnap.empty) {
      // Migrar desde localStorage
      const stored = JSON.parse(localStorage.getItem('mauitop_productos'));
      if (Array.isArray(stored) && stored.length > 0) {
        showAdminMessage('Migrando productos locales...', 'info');
        for (let p of stored) {
          if (isDataImage(p.imagen)) {
            p.imagen = await optimizeDataImage(p.imagen, 800, 0.8);
          }
          await setDoc(doc(db, "productos", p.id.toString()), p);
          localProductos.push(p);
        }
      }
    } else {
      localProductos = prodsSnap.docs.map(d => d.data());
      const productosMigrados = [];
      for (let p of localProductos) {
        if (isDataImage(p.imagen)) {
          showAdminMessage(`Optimizando imagen de ${p.nombre}...`, 'info');
          const migrated = {
            ...p,
            imagen: await optimizeDataImage(p.imagen, 800, 0.8)
          };
          await setDoc(doc(db, "productos", migrated.id.toString()), migrated, { merge: true });
          productosMigrados.push(migrated);
        } else {
          productosMigrados.push(p);
        }
      }
      localProductos = productosMigrados;
    }

    renderCats();
    renderProducts();
    showAdminMessage('Datos actualizados', 'success');
  } catch (err) {
    console.error("Error fetching data:", err);
    showAdminMessage('Error al cargar datos revisa la consola', 'error');
  }
}

function renderCats() {
  catsTableBody.innerHTML = localCategorias.map(c => `
    <tr>
      <td style="font-weight:500; font-family:monospace; color:var(--text-muted);">${c.nombre}</td>
      <td><span class="cat-badge" style="background:${c.color}; color:white; border:none; text-shadow:0 1px 2px rgba(0,0,0,0.2);">${c.label}</span></td>
      <td>
        <button class="action-btn edit" onclick="editCat('${c.nombre}')">Editar</button>
        <button class="action-btn delete" onclick="removeCat('${c.nombre}')">Eliminar</button>
      </td>
    </tr>
  `).join('');
  renderCatSelect();
}

window.editCat = function (nombre) {
  const cat = localCategorias.find(c => c.nombre === nombre);
  if (!cat) return;
  editingCatName = nombre;
  document.getElementById('c-nombre').value = cat.nombre;
  document.getElementById('c-label').value = cat.label;
  document.getElementById('c-emoji').value = cat.emoji;
  document.getElementById('c-color').value = cat.color;
  document.getElementById('cat-modal').style.display = 'flex';
  document.querySelector('#cat-modal h3').textContent = 'Editar Categoría';
  document.querySelector('#cat-form button[type="submit"]').textContent = 'Guardar cambios';
};

function renderCatSelect() {
  const select = document.getElementById('p-categoria');
  select.innerHTML = localCategorias.map(c => `<option value="${c.nombre}">${c.label}</option>`).join('');

  const filterSelect = document.getElementById('product-category-filter');
  if (filterSelect) {
    const selected = filterSelect.value || 'all';
    filterSelect.innerHTML = [
      '<option value="all">Todas las categorías</option>',
      ...localCategorias.map(c => `<option value="${c.nombre}">${c.label}</option>`)
    ].join('');
    filterSelect.value = localCategorias.some(c => c.nombre === selected) ? selected : 'all';
  }
}

window.renderProducts = function renderProducts() {
  const categoryFilter = document.getElementById('product-category-filter')?.value || 'all';
  const availabilityToggle = document.getElementById('product-availability-toggle');
  if (availabilityToggle) {
    availabilityToggle.textContent = hideUnavailableProducts ? 'Mostrar agotados' : 'Ocultar agotados';
    availabilityToggle.classList.toggle('active', hideUnavailableProducts);
  }

  const visibleProducts = localProductos.filter(p => {
    const matchesCategory = categoryFilter === 'all' || p.categoria === categoryFilter;
    const isAvailable = p.disponible !== false;
    const matchesStatus = !hideUnavailableProducts || isAvailable;

    return matchesCategory && matchesStatus;
  });

  if (visibleProducts.length === 0) {
    tableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">No hay productos que coincidan con los filtros.</td>
      </tr>
    `;
    return;
  }

  const categoriesToRender = localCategorias
    .filter(c => visibleProducts.some(p => p.categoria === c.nombre))
    .concat(
      visibleProducts
        .filter(p => !localCategorias.some(c => c.nombre === p.categoria))
        .map(p => ({ nombre: p.categoria, label: p.categoria || 'Sin categoría' }))
        .filter((cat, index, arr) => arr.findIndex(c => c.nombre === cat.nombre) === index)
    );

  tableBody.innerHTML = categoriesToRender.map(c => {
    const productsHtml = visibleProducts
      .filter(p => p.categoria === c.nombre)
      .map(p => {
    const cat = localCategorias.find(c => c.nombre === p.categoria);
    const badgeHtml = p.disponible !== false
      ? '<span class="status-badge yes">Disponible</span>'
      : '<span class="status-badge no">Agotado</span>';
    const toggleLabel = p.disponible !== false ? 'Desactivar' : 'Activar';
    const toggleClass = p.disponible !== false ? 'delete' : 'edit';
    const imgHtml = p.imagen ? `<img src="${p.imagen}" class="img-cell" alt="${p.nombre}" />` : `<div style="width:40px;height:40px;border-radius:6px;background:#eee;display:flex;align-items:center;justify-content:center;font-size:11px;color:#aaa;">N/A</div>`;

    return `
      <tr>
        <td style="color:var(--text-muted);">#${p.id}</td>
        <td>${imgHtml}</td>
        <td style="font-weight:500; color:var(--text-main);">${p.nombre}</td>
        <td><span class="cat-badge">${cat ? cat.label : p.categoria}</span></td>
        <td style="font-weight:500;">$${Number(p.precio).toLocaleString('es-CO')}</td>
        <td>${badgeHtml}</td>
        <td>
          <button class="action-btn edit" onclick="editProduct(${p.id})">Editar</button>
          <button class="action-btn ${toggleClass}" onclick="toggleProductAvailability(${p.id})">${toggleLabel}</button>
          <button class="action-btn delete" onclick="removeProduct(${p.id})">Eliminar</button>
        </td>
      </tr>
    `;
      }).join('');

    return `
      <tr class="category-row">
        <td colspan="7">${c.label}</td>
      </tr>
      ${productsHtml}
    `;
  }).join('');
};

window.toggleUnavailableProducts = function () {
  hideUnavailableProducts = !hideUnavailableProducts;
  renderProducts();
};

window.openProdModal = function () {
  editingId = null;
  document.getElementById('prod-modal').style.display = 'flex';
  document.querySelector('#prod-modal h3').textContent = 'Agregar Producto';
  submitBtn.textContent = 'Agregar producto';
  resetProdForm();
};

window.closeProdModal = function () {
  document.getElementById('prod-modal').style.display = 'none';
  resetProdForm();
};

window.editProduct = function (id) {
  const prod = localProductos.find(p => p.id === id);
  if (!prod) return;

  document.getElementById('p-id').value = prod.id;
  document.getElementById('p-nombre').value = prod.nombre;
  document.getElementById('p-categoria').value = prod.categoria;
  document.getElementById('p-precio').value = prod.precio;
  document.getElementById('p-imagen').value = prod.imagen;
  document.getElementById('img-preview').src = prod.imagen || '';
  document.getElementById('img-preview-container').style.display = prod.imagen ? 'block' : 'none';
  document.getElementById('p-desc').value = prod.desc;
  document.getElementById('p-disponible').value = prod.disponible === false ? 'false' : 'true';

  document.getElementById('prod-modal').style.display = 'flex';
  document.querySelector('#prod-modal h3').textContent = 'Editar Producto';
  submitBtn.textContent = 'Actualizar producto';
  editingId = id;
};

window.toggleProductAvailability = async function (id) {
  const prod = localProductos.find(p => p.id === id);
  if (!prod) {
    showAdminMessage('No se encontró el producto.', 'error');
    return;
  }

  const disponible = prod.disponible === false;
  try {
    await setDoc(doc(db, "productos", id.toString()), { disponible }, { merge: true });
    prod.disponible = disponible;
    renderProducts();
    showAdminMessage(
      disponible ? `${prod.nombre} activado.` : `${prod.nombre} desactivado.`,
      'success'
    );
  } catch (err) {
    console.error(err);
    showAdminMessage('Error cambiando el estado del producto', 'error');
  }
};

// Modales Confirm
let pendingConfirmAction = null;

function openConfirmDialog(text, action) {
  const modal = document.getElementById('confirm-modal');
  if (!modal) return;
  document.getElementById('confirm-text').textContent = text;
  pendingConfirmAction = action;
  modal.style.display = 'flex';
}

function closeConfirmDialog() {
  const modal = document.getElementById('confirm-modal');
  if (!modal) return;
  modal.style.display = 'none';
  pendingConfirmAction = null;
}

window.cancelConfirm = function () {
  closeConfirmDialog();
  showAdminMessage('Acción cancelada.', 'info');
};

window.executeConfirm = function () {
  if (typeof pendingConfirmAction === 'function') {
    pendingConfirmAction();
  }
  closeConfirmDialog();
};

function showAdminMessage(msg, type = 'info') {
  const area = document.getElementById('admin-msg');
  if (!area) return;
  area.textContent = msg;
  area.className = '';
  area.classList.add(type);
  area.style.display = 'block';
  setTimeout(() => {
    area.style.display = 'none';
  }, 4200);
}

window.removeProduct = async function (id) {
  const prod = localProductos.find(p => p.id === id);
  if (!prod) {
    showAdminMessage('No se encontró el producto para eliminar.', 'error');
    return;
  }

  openConfirmDialog(`¿Estás seguro de que quieres eliminar el producto '${prod.nombre}'?`, async () => {
    try {
      await deleteDoc(doc(db, "productos", id.toString()));
      localProductos = localProductos.filter(p => p.id !== id);
      renderProducts();
      showAdminMessage(`Producto '${prod.nombre}' eliminado.`, 'success');
    } catch (err) {
      console.error(err);
      showAdminMessage('Error al eliminar producto', 'error');
    }
  });
};

window.removeCat = async function (nombre) {
  const usados = localProductos.filter(p => p.categoria === nombre);
  if (usados.length > 0) {
    const listaNombres = usados.map(p => `- ${p.nombre}`).join('\n');
    showAdminMessage(`No puedes eliminar la categoría '${nombre}' porque tiene productos asociados:\n${listaNombres}`, 'error');
    return;
  }
  openConfirmDialog(`¿Estás seguro de que quieres eliminar la categoría '${nombre}'?`, async () => {
    try {
      await deleteDoc(doc(db, "categorias", nombre));
      localCategorias = localCategorias.filter(c => c.nombre !== nombre);
      renderCats();
      showAdminMessage(`Categoría '${nombre}' eliminada.`, 'success');
    } catch (err) {
      console.error(err);
      showAdminMessage('Error al eliminar categoría', 'error');
    }
  });
};

function resetProdForm() {
  editingId = null;
  document.getElementById('p-id').value = '';
  document.getElementById('p-nombre').value = '';
  document.getElementById('p-categoria').value = '';
  document.getElementById('p-precio').value = '';
  document.getElementById('p-imagen').value = '';
  const fileInp = document.getElementById('p-file');
  if (fileInp) fileInp.value = '';
  document.getElementById('img-preview').src = '';
  document.getElementById('img-preview-container').style.display = 'none';
  document.getElementById('p-desc').value = '';
  document.getElementById('p-disponible').value = 'true';
  submitBtn.textContent = 'Agregar producto';
}

window.handleProdSubmit = async function (event) {
  event.preventDefault();
  const nombre = document.getElementById('p-nombre').value.trim();
  const categoria = document.getElementById('p-categoria').value;
  const precio = Number(document.getElementById('p-precio').value);
  let imagen = document.getElementById('p-imagen').value.trim();
  const desc = document.getElementById('p-desc').value.trim();
  const disponible = document.getElementById('p-disponible').value === 'true';

  if (!nombre || Number.isNaN(precio) || !imagen || !desc) {
    alert('Por favor completa todos los campos.');
    return;
  }

  showAdminMessage('Guardando...', 'info');

  try {
    if (editingId !== null) {
      const idx = localProductos.findIndex(p => p.id === editingId);
      if (idx >= 0) {
        if (isDataImage(imagen)) {
          showAdminMessage('Optimizando imagen...', 'info');
          imagen = await optimizeDataImage(imagen, 800, 0.8);
        }
        const pMod = { id: editingId, nombre, categoria, precio, imagen, desc, disponible };
        await setDoc(doc(db, "productos", editingId.toString()), pMod);
        localProductos[idx] = pMod;
        renderProducts();
        closeProdModal();
        showAdminMessage('Producto actualizado en Firebase.', 'success');
        return;
      }
    }

    const nextId = localProductos.reduce((max, p) => Math.max(max, p.id || 0), 0) + 1;
    if (isDataImage(imagen)) {
      showAdminMessage('Optimizando imagen...', 'info');
      imagen = await optimizeDataImage(imagen, 800, 0.8);
    }
    const pNew = { id: nextId, nombre, categoria, precio, imagen, desc, disponible };
    await setDoc(doc(db, "productos", nextId.toString()), pNew);
    localProductos.push(pNew);
    renderProducts();
    closeProdModal();
    showAdminMessage('Producto agregado a Firebase.', 'success');
  } catch (err) {
    console.error(err);
    showAdminMessage(`Error al guardar producto: ${err.message || 'revisa la consola'}`, 'error');
    alert(`Error al guardar producto: ${err.message || 'revisa la consola'}`);
  }
}

// Funciones para categorías
window.openCatModal = function () {
  editingCatName = null;
  document.querySelector('#cat-modal h3').textContent = 'Agregar Categoría';
  document.querySelector('#cat-form button[type="submit"]').textContent = 'Agregar';
  document.getElementById('cat-modal').style.display = 'flex';
};

window.closeCatModal = function () {
  editingCatName = null;
  document.getElementById('cat-modal').style.display = 'none';
  document.getElementById('c-nombre').value = '';
  document.getElementById('c-label').value = '';
  document.getElementById('c-emoji').value = '';
  document.getElementById('c-color').value = '';
};

window.handleCatSubmit = async function (event) {
  event.preventDefault();
  const nombre = document.getElementById('c-nombre').value.trim();
  const label = document.getElementById('c-label').value.trim();
  const emoji = document.getElementById('c-emoji').value.trim();
  const color = document.getElementById('c-color').value.trim();

  if (!nombre || !label || !emoji || !color) {
    alert('Completa todos los campos.');
    return;
  }

  showAdminMessage('Guardando...', 'info');

  try {
    if (editingCatName) {
      const idx = localCategorias.findIndex(c => c.nombre === editingCatName);
      if (idx < 0) {
        alert('Categoría no encontrada para editar.');
        return;
      }

      if (nombre !== editingCatName && localCategorias.some(c => c.nombre === nombre)) {
        alert('Ya existe una categoría con ese nombre.');
        return;
      }

      const newCat = { nombre, label, emoji, color };

      if (nombre !== editingCatName) {
        // Create new and delete old
        await setDoc(doc(db, "categorias", nombre), newCat);
        await deleteDoc(doc(db, "categorias", editingCatName));

        // Update references in products
        const afectados = localProductos.filter(p => p.categoria === editingCatName);
        for (let p of afectados) {
          p.categoria = nombre;
          await setDoc(doc(db, "productos", p.id.toString()), p);
        }
      } else {
        await setDoc(doc(db, "categorias", nombre), newCat);
      }

      localCategorias[idx] = newCat;
      editingCatName = null;
      renderCats();
      renderProducts();
      closeCatModal();
      showAdminMessage('Categoría actualizada en Firebase.', 'success');
      return;
    }

    if (localCategorias.find(c => c.nombre === nombre)) {
      alert('Nombre de categoría ya existe.');
      return;
    }

    const newCat = { nombre, label, emoji, color };
    await setDoc(doc(db, "categorias", nombre), newCat);
    localCategorias.push(newCat);
    renderCats();
    closeCatModal();
    showAdminMessage('Categoría agregada a Firebase.', 'success');

  } catch (err) {
    console.error(err);
    showAdminMessage(`Error al guardar categoría: ${err.message || 'revisa la consola'}`, 'error');
    alert(`Error al guardar categoría: ${err.message || 'revisa la consola'}`);
  }
}

// Modales vinculados directamente en el HTML con onsubmit="..."

// Compresor automático de imagen a Base64
const fileInput = document.getElementById('p-file');
if (fileInput) {
  fileInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.match('image.*')) {
      showAdminMessage('Por favor selecciona una imagen válida (JPG, PNG, WebP).', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round(height * MAX_WIDTH / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round(width * MAX_HEIGHT / height);
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        // Fondo blanco para jpegs si la original era PNG transparente
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Comprimir a 75% calidad de JPEG (Súper ligero y rápido de cargar)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);

        document.getElementById('p-imagen').value = dataUrl;
        document.getElementById('img-preview').src = dataUrl;
        document.getElementById('img-preview-container').style.display = 'block';
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Compresor automático Plato Estrella
const starFileInput = document.getElementById('estrella-file');
if (starFileInput) {
  starFileInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.match('image.*')) {
      showAdminMessage('Elige una imagen válida (JPG, PNG, WebP).', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = function (event) {
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement('canvas');
        const MAXSize = 800;
        let w = img.width, h = img.height;
        if (w > h && w > MAXSize) { h = Math.round(h * MAXSize / w); w = MAXSize; }
        else if (h > MAXSize) { w = Math.round(w * MAXSize / h); h = MAXSize; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        document.getElementById('estrella-imagen').value = dataUrl;
        document.getElementById('estrella-preview').src = dataUrl;
        document.getElementById('estrella-preview-container').style.display = 'block';
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const bannerFileInput = document.getElementById('op-banner-file');
if (bannerFileInput) {
  bannerFileInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.match('image.*')) {
      showAdminMessage('Elige una imagen válida para el banner (JPG, PNG, WebP).', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = function (event) {
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1000;
        const MAX_HEIGHT = 570;
        let w = img.width, h = img.height;
        if (w / h > MAX_WIDTH / MAX_HEIGHT) {
          if (w > MAX_WIDTH) {
            h = Math.round(h * MAX_WIDTH / w);
            w = MAX_WIDTH;
          }
        } else if (h > MAX_HEIGHT) {
          w = Math.round(w * MAX_HEIGHT / h);
          h = MAX_HEIGHT;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.76);
        document.getElementById('op-banner-imagen').value = dataUrl;
        document.getElementById('op-banner-preview').src = dataUrl;
        document.getElementById('op-banner-preview-container').style.display = 'block';
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

window.guardarEstrella = async function () {
  let imgStr = document.getElementById('estrella-imagen').value;
  if (!imgStr) {
    alert('Sube una imagen primero');
    return;
  }
  showAdminMessage('Guardando imagen...', 'info');
  try {
    if (isDataImage(imgStr)) {
      imgStr = await optimizeDataImage(imgStr, 1000, 0.86);
      document.getElementById('estrella-imagen').value = imgStr;
    }
    await setDoc(doc(db, "configuracion", "estrella"), { imagen: imgStr });
    showAdminMessage('Imagen actualizada exitosamente', 'success');
  } catch (e) {
    showAdminMessage(`Error al guardar: ${e.message || 'revisa la consola'}`, 'error');
    console.error(e);
  }
};

// ESTADO DE LA TIENDA
let isStoreOpen = false;

window.saveOperacion = async function () {
  const mesas = parseInt(document.getElementById('op-mesas').value) || 0;
  const horario = document.getElementById('op-horario')?.value.trim() || '';
  const direccion = document.getElementById('op-direccion')?.value.trim() || '';
  let bannerImagen = document.getElementById('op-banner-imagen')?.value.trim() || '';
  try {
    if (isDataImage(bannerImagen)) {
      showAdminMessage('Guardando fondo del banner...', 'info');
      bannerImagen = await optimizeDataImage(bannerImagen, 1000, 0.76);
      document.getElementById('op-banner-imagen').value = bannerImagen;
    }
    await setDoc(doc(db, "configuracion", "operacion"), { mesasActivas: mesas }, { merge: true });
    await setDoc(doc(db, "configuracion", "estado"), { horario, direccion, bannerImagen }, { merge: true });
    showAdminMessage('Configuración del restaurante guardada', 'success');
  } catch (e) {
    console.error(e);
    showAdminMessage(`Error guardando la configuración: ${e.message || 'revisa la consola'}`, 'error');
  }
};

window.handleCreateWaiter = async function (e) {
  e.preventDefault();
  const name = document.getElementById('w-name').value;
  const email = document.getElementById('w-email').value;
  const pass = document.getElementById('w-pass').value;
  const btn = document.querySelector('#waiter-form button');
  btn.disabled = true;
  btn.textContent = "Creando...";
  try {
    const app2 = initializeApp(firebaseConfig, "WaiterCreatorApp" + Date.now());
    const auth2 = getSecondaryAuth(app2);
    await createUserWithEmailAndPassword(auth2, email, pass);
    await signOut(auth2); // Asegurar que cierra sesión en app secundaria

    const id = Date.now().toString();
    await setDoc(doc(db, "meseros", id), { nombre: name, correo: email, createdAt: new Date() });

    showAdminMessage('Mesero creado con acceso oficial', 'success');
    document.getElementById('waiter-form').reset();
    fetchMeseros();
  } catch (err) {
    console.error(err);
    alert('Error al crear mesero. Quizás el correo ya exista o clave sea muy corta.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Crear Usuario`;
  }
};

async function fetchMeseros() {
  try {
    const snap = await getDocs(collection(db, "meseros"));
    localMeseros = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderMeseros();
  } catch (e) { }
}

function renderMeseros() {
  const tbody = document.querySelector('#waiters-table tbody');
  if (!tbody) return;
  tbody.innerHTML = localMeseros.map(m => `
    <tr>
      <td style="font-weight:600;display:inline-flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${m.nombre}</td>
      <td style="color:var(--text-muted);">${m.correo}</td>
      <td><button class="action-btn delete" onclick="deleteMesero('${m.id}')">Revocar</button></td>
    </tr>
  `).join('');
}

window.deleteMesero = async function (id) {
  if (!confirm("¿Revocar el acceso a este perfil?")) return;
  try {
    await deleteDoc(doc(db, "meseros", id));
    fetchMeseros();
    showAdminMessage('Acceso revocado', 'success');
  } catch (e) { console.error(e); }
};

async function checkStoreStatus() {
  const toggle = document.getElementById('store-toggle');
  const text = document.getElementById('store-status-text');
  try {
    const docRef = doc(db, "configuracion", "estado");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const estado = docSnap.data();
      isStoreOpen = estado.abierta !== false; // por defecto true si no está seteado el bool "abierta: false" pero existe doc
      const horarioInput = document.getElementById('op-horario');
      const direccionInput = document.getElementById('op-direccion');
      const bannerInput = document.getElementById('op-banner-imagen');
      const bannerPreview = document.getElementById('op-banner-preview');
      const bannerPreviewContainer = document.getElementById('op-banner-preview-container');
      if (horarioInput) horarioInput.value = estado.horario || '';
      if (direccionInput) direccionInput.value = estado.direccion || '';
      if (bannerInput) bannerInput.value = estado.bannerImagen || '';
      if (bannerPreview && bannerPreviewContainer && estado.bannerImagen) {
        bannerPreview.src = estado.bannerImagen;
        bannerPreviewContainer.style.display = 'block';
      }
    } else {
      isStoreOpen = true; // Por defecto abierto si nunca se configuró
    }
  } catch (error) {
    console.error("Error fetching config:", error);
    isStoreOpen = true;
  }

  toggle.checked = isStoreOpen;
  toggle.disabled = false;
  text.textContent = isStoreOpen ? "Tienda: ABIERTA" : "Tienda: CERRADA";
  text.style.color = isStoreOpen ? "var(--verde)" : "var(--danger)";
}

window.toggleStoreStatus = async function () {
  const toggle = document.getElementById('store-toggle');
  const text = document.getElementById('store-status-text');

  toggle.disabled = true;
  const nuevoEstado = toggle.checked;
  text.textContent = "Guardando...";

  try {
    await setDoc(doc(db, "configuracion", "estado"), {
      abierta: nuevoEstado
    }, { merge: true });
    showAdminMessage(nuevoEstado ? 'Tienda Abierta' : 'Tienda Cerrada', 'success');
  } catch (error) {
    console.error(error);
    showAdminMessage('Error cambiando el estado', 'error');
    toggle.checked = !nuevoEstado; // revert
  }
  checkStoreStatus();
};

initAuthObserver();

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
