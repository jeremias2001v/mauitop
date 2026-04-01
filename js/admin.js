import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { db, auth } from "./firebase-config.js";

let localProductos = [];
let localCategorias = [];
let localPedidos = [];

window.switchAdminTab = function (tabName, btnElement) {
  // Manejo de UI
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => el.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');

  // Mostrar/Ocultar Tabs
  document.getElementById('tab-inventario').style.display = tabName === 'inventario' ? 'block' : 'none';
  document.getElementById('tab-pedidos').style.display = tabName === 'pedidos' ? 'block' : 'none';
  document.getElementById('tab-finanzas').style.display = tabName === 'finanzas' ? 'block' : 'none';
  document.getElementById('tab-estadisticas').style.display = tabName === 'estadisticas' ? 'block' : 'none';

  if (tabName === 'pedidos') {
    window.loadPedidos();
  }
  if (tabName === 'finanzas') {
    window.loadDashboard();
  }
  if (tabName === 'estadisticas') {
    window.loadEstadisticas();
  }
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

function renderEstadisticas() {
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

window.loadPedidos = async function () {
  showAdminMessage('Cargando historial de pedidos...', 'info');
  try {
    const snap = await getDocs(collection(db, "pedidos"));
    localPedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Ordenar descendente por fecha (los más nuevos en Firebase FireStore van primero si comparamos)
    localPedidos.sort((a, b) => {
      const ta = a.fecha?.toMillis ? a.fecha.toMillis() : 0;
      const tb = b.fecha?.toMillis ? b.fecha.toMillis() : 0;
      return tb - ta;
    });
    renderPedidos();
    showAdminMessage('Pedidos cargados', 'success');
  } catch (e) {
    console.error(e);
    showAdminMessage('Error cargando pedidos', 'error');
  }
};

function renderPedidos() {
  const filterVal = document.getElementById('pedidos-date-filter')?.value || 'week';
  const now = new Date();

  const filtered = localPedidos.filter(p => {
    if (filterVal === 'all') return true;
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

  const tbody = document.querySelector('#pedidos-table tbody');
  if (localPedidos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;">No hay pedidos registrados en la nube.</td></tr>';
    return;
  }
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;">No hay pedidos en la fecha seleccionada.</td></tr>';
    return;
  }

  const displayPedidos = filtered.slice(0, 200); // Límite por rendimiento

  tbody.innerHTML = displayPedidos.map(p => {
    let dateStr = 'Fecha desconocida';
    if (p.fecha && p.fecha.toDate) {
      dateStr = p.fecha.toDate().toLocaleString('es-CO', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    }

    const itemsStr = (p.ítems || []).map(i => `${i.cantidad}x ${i.nombre}`).join('<br>');
    const badge = p.estado === 'Entregado'
      ? '<span class="status-badge yes">Entregado ✅</span>'
      : '<span class="status-badge no" style="background:#FFA000;color:white;">Pendiente ⏳</span>';

    const actionBtn = p.estado === 'Pendiente'
      ? `<button class="action-btn edit" onclick="marcarEntregado('${p.id}')">Marcar Entregado</button>`
      : `<button class="action-btn" style="background:#eee;color:#aaa;cursor:not-allowed;" disabled>Entregado</button>`;

    const deleteBtn = `<button class="action-btn delete" onclick="eliminarPedido('${p.id}')" style="margin-top:4px;">Eliminar</button>`;

    return `
      <tr>
        <td style="color:#777;font-size:13px;">${dateStr}</td>
        <td>
          <strong style="color:var(--text-main);">${Number(p.cliente?.telefono || 0)}</strong><br>
          <span style="font-size:13px;color:#888;">${p.cliente?.nombre || 'Anónimo'}</span><br>
          <small style="color:var(--azul);">💳 ${p.cliente?.metodoPago || 'No definido'}</small>
        </td>
        <td style="font-size:13px;color:#555;">${p.cliente?.direccion || 'N/A'}<br><small>${p.cliente?.barrio || ''}</small></td>
        <td style="font-size:13px;line-height:1.4;">${itemsStr}</td>
        <td style="font-weight:700;color:var(--success);">$${Number(p.total).toLocaleString('es-CO')}</td>
        <td>${badge}</td>
        <td>${actionBtn}${deleteBtn}</td>
      </tr>
    `;
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
        document.getElementById('estrella-preview').src = estSnap.data().imagen;
        document.getElementById('estrella-preview-container').style.display = 'block';
        document.getElementById('estrella-imagen').value = estSnap.data().imagen;
      }
    } catch(e) { console.error(e); }

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
          await setDoc(doc(db, "productos", p.id.toString()), p);
          localProductos.push(p);
        }
      }
    } else {
      localProductos = prodsSnap.docs.map(d => d.data());
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
      <td><span class="cat-badge" style="background:${c.color}; color:white; border:none; text-shadow:0 1px 2px rgba(0,0,0,0.2);">${c.emoji} ${c.label}</span></td>
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
}

function renderProducts() {
  tableBody.innerHTML = localProductos.map(p => {
    const cat = localCategorias.find(c => c.nombre === p.categoria);
    const badgeHtml = p.disponible !== false
      ? '<span class="status-badge yes">Disponible</span>'
      : '<span class="status-badge no">Agotado</span>';
    const imgHtml = p.imagen ? `<img src="${p.imagen}" class="img-cell" alt="${p.nombre}" />` : `<div style="width:40px;height:40px;border-radius:6px;background:#eee;display:flex;align-items:center;justify-content:center;font-size:11px;color:#aaa;">N/A</div>`;

    return `
      <tr>
        <td style="color:var(--text-muted);">#${p.id}</td>
        <td>${imgHtml}</td>
        <td style="font-weight:500; color:var(--text-main);">${p.nombre}</td>
        <td><span class="cat-badge">${cat ? cat.emoji + ' ' + cat.label : p.categoria}</span></td>
        <td style="font-weight:500;">$${Number(p.precio).toLocaleString('es-CO')}</td>
        <td>${badgeHtml}</td>
        <td>
          <button class="action-btn edit" onclick="editProduct(${p.id})">Editar</button>
          <button class="action-btn delete" onclick="removeProduct(${p.id})">Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');
}

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
  const imagen = document.getElementById('p-imagen').value.trim();
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
    const pNew = { id: nextId, nombre, categoria, precio, imagen, desc, disponible };
    await setDoc(doc(db, "productos", nextId.toString()), pNew);
    localProductos.push(pNew);
    renderProducts();
    closeProdModal();
    showAdminMessage('Producto agregado a Firebase.', 'success');
  } catch (err) {
    console.error(err);
    alert('Error al guardar producto');
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
    alert("Error al guardar categoría");
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
    reader.onload = function(event) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const MAXSize = 800;
        let w = img.width, h = img.height;
        if (w > h && w > MAXSize) { h = Math.round(h * MAXSize / w); w = MAXSize; }
        else if (h > MAXSize) { w = Math.round(w * MAXSize / h); h = MAXSize; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0,0,w,h);
        ctx.drawImage(img,0,0,w,h);
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

window.guardarEstrella = async function() {
  const imgStr = document.getElementById('estrella-imagen').value;
  if (!imgStr) {
    alert('Sube una imagen primero');
    return;
  }
  showAdminMessage('Guardando imagen...', 'info');
  try {
    await setDoc(doc(db, "configuracion", "estrella"), { imagen: imgStr });
    showAdminMessage('Imagen actualizada exitosamente 🌟', 'success');
  } catch(e) {
    showAdminMessage('Error al guardar', 'error');
    console.error(e);
  }
};

// ESTADO DE LA TIENDA
let isStoreOpen = false;

async function checkStoreStatus() {
  const toggle = document.getElementById('store-toggle');
  const text = document.getElementById('store-status-text');
  try {
    const docRef = doc(db, "configuracion", "estado");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      isStoreOpen = docSnap.data().abierta !== false; // por defecto true si no está seteado el bool "abierta: false" pero existe doc
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

window.toggleStoreStatus = async function() {
  const toggle = document.getElementById('store-toggle');
  const text = document.getElementById('store-status-text');
  
  toggle.disabled = true;
  const nuevoEstado = toggle.checked;
  text.textContent = "Guardando...";

  try {
    await setDoc(doc(db, "configuracion", "estado"), {
      abierta: nuevoEstado
    });
    showAdminMessage(nuevoEstado ? 'Tienda Abierta' : 'Tienda Cerrada', 'success');
  } catch(error) {
    console.error(error);
    showAdminMessage('Error cambiando el estado', 'error');
    toggle.checked = !nuevoEstado; // revert
  }
  checkStoreStatus();
};

initAuthObserver();