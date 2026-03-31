// Variables de localStorage
const STORAGE_KEY = 'mauitop_productos';
const STORAGE_KEY_CATS = 'mauitop_categorias';
const ADMIN_PASSWORD = 'PedroMP.';
const defaultProductos = [];
const defaultCats = [
  { nombre: 'platano', label: 'Plátano', emoji: '🍌', color: 'linear-gradient(135deg,#FFD100,#FF6B00)' },
  { nombre: 'burgers', label: 'Hamburguesa', emoji: '🍔', color: 'linear-gradient(135deg,#CE1126,#FF6B00)' },
  { nombre: 'perros', label: 'Perro Caliente', emoji: '🌭', color: 'linear-gradient(135deg,#003087,#CE1126)' },
  { nombre: 'salchipapa', label: 'Salchipapa', emoji: '🍟', color: 'linear-gradient(135deg,#FF6B00,#FFD100)' },
  { nombre: 'bebidas', label: 'Bebida', emoji: '🥤', color: 'linear-gradient(135deg,#2E7D32,#00C853)' }
];

// Funciones de autenticación
function checkAuth() {
  const isAuth = sessionStorage.getItem('admin_auth') === 'true';
  if (isAuth) {
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('admin-content').style.display = 'block';
  }
}

window.handleLogin = function(event) {
  event.preventDefault();
  const password = document.getElementById('login-password').value;
  const errorMsg = document.getElementById('login-error');
  
  if (password === ADMIN_PASSWORD) {
    sessionStorage.setItem('admin_auth', 'true');
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('admin-content').style.display = 'block';
    document.getElementById('login-password').value = '';
    errorMsg.style.display = 'none';
    renderCats();
    renderProducts();
  } else {
    errorMsg.textContent = 'Contraseña incorrecta';
    errorMsg.style.display = 'block';
    document.getElementById('login-password').value = '';
  }
};

window.handleLogout = function() {
  sessionStorage.removeItem('admin_auth');
  document.getElementById('admin-content').style.display = 'none';
  document.getElementById('login-modal').style.display = 'flex';
  document.getElementById('login-password').value = '';
};


const prodForm = document.getElementById('prod-form');
const catForm = document.getElementById('cat-form');
const tableBody = document.querySelector('#products-table tbody');
const catsTableBody = document.querySelector('#cats-table tbody');
const submitBtn = document.getElementById('submit-btn');

let editingId = null;
let editingCatName = null;

function loadProductos() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(stored)) return stored;
  } catch (err) {
    console.warn('Error al leer localStorage', err);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultProductos));
  return [...defaultProductos];
}

function saveProductos(productos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(productos));
}

function loadCats() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_CATS));
    if (Array.isArray(stored)) return stored;
  } catch (err) {
    console.warn('Error al leer localStorage cats', err);
  }
  localStorage.setItem(STORAGE_KEY_CATS, JSON.stringify(defaultCats));
  return [...defaultCats];
}

function saveCats(cats) {
  localStorage.setItem(STORAGE_KEY_CATS, JSON.stringify(cats));
}

function renderCats() {
  const cats = loadCats();
  catsTableBody.innerHTML = cats.map(c => `
    <tr>
      <td>${c.nombre}</td>
      <td>${c.label}</td>
      <td class="admin-actions">
        <button onclick="editCat('${c.nombre}')">Editar</button>
        <button onclick="removeCat('${c.nombre}')">Eliminar</button>
      </td>
    </tr>
  `).join('');
  renderCatSelect();
}

window.editCat = function(nombre) {
  const cats = loadCats();
  const cat = cats.find(c => c.nombre === nombre);
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
  const cats = loadCats();
  const select = document.getElementById('p-categoria');
  select.innerHTML = cats.map(c => `<option value="${c.nombre}">${c.label}</option>`).join('');
}

function renderProducts() {
  const productos = loadProductos();
  tableBody.innerHTML = productos.map(p => {
    const cat = loadCats().find(c => c.nombre === p.categoria);
    return `
      <tr>
        <td>${p.id}</td>
        <td>${p.nombre}</td>
        <td>${cat ? cat.label : p.categoria}</td>
        <td>${p.precio}</td>
        <td>${p.disponible === false ? 'No' : 'Sí'}</td>
        <td class="admin-actions">
          <button onclick="editProduct(${p.id})">Editar</button>
          <button onclick="removeProduct(${p.id})">Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.openProdModal = function() {
  editingId = null;
  document.getElementById('prod-modal').style.display = 'flex';
  document.querySelector('#prod-modal h3').textContent = 'Agregar Producto';
  submitBtn.textContent = 'Agregar producto';
  resetProdForm();
};

window.closeProdModal = function() {
  document.getElementById('prod-modal').style.display = 'none';
  resetProdForm();
};

window.editProduct = function(id) {
  const productos = loadProductos();
  const prod = productos.find(p => p.id === id);
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

window.cancelConfirm = function() {
  closeConfirmDialog();
  showAdminMessage('Acción cancelada.', 'info');
};

window.executeConfirm = function() {
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

window.removeProduct = function(id) {
  const productos = loadProductos();
  const prod = productos.find(p => p.id === id);
  if (!prod) {
    showAdminMessage('No se encontró el producto para eliminar.', 'error');
    return;
  }

  openConfirmDialog(`¿Estás seguro de que quieres eliminar el producto '${prod.nombre}'?`, () => {
    const restantes = productos.filter(p => p.id !== id);
    saveProductos(restantes);
    renderProducts();
    showAdminMessage(`Producto '${prod.nombre}' eliminado. Refresca el sitio principal para ver el cambio.`, 'success');
  });
};

window.removeCat = function(nombre) {
  const productos = loadProductos();
  const usados = productos.filter(p => p.categoria === nombre);
  if (usados.length > 0) {
    const listaNombres = usados.map(p => `- ${p.nombre}`).join('\n');
    showAdminMessage(`No puedes eliminar la categoría '${nombre}' porque tiene productos asociados:\n${listaNombres}`, 'error');
    return;
  }
  openConfirmDialog(`¿Estás seguro de que quieres eliminar la categoría '${nombre}'? Esta acción también puede afectar productos existentes.`, () => {
    let cats = loadCats();
    cats = cats.filter(c => c.nombre !== nombre);
    saveCats(cats);
    renderCats();
    showAdminMessage(`Categoría '${nombre}' eliminada. Refresca el sitio principal para ver el cambio.`, 'success');
  });
};

function resetProdForm() {
  editingId = null;
  document.getElementById('p-id').value = '';
  document.getElementById('p-nombre').value = '';
  document.getElementById('p-categoria').value = '';
  document.getElementById('p-precio').value = '';
  document.getElementById('p-imagen').value = '';
  document.getElementById('img-preview').src = '';
  document.getElementById('img-preview-container').style.display = 'none';
  document.getElementById('p-desc').value = '';
  document.getElementById('p-disponible').value = 'true';
  submitBtn.textContent = 'Agregar producto';
}

function handleProdSubmit(event) {
  event.preventDefault();
  const productos = loadProductos();
  const nombre = document.getElementById('p-nombre').value.trim();
  const categoria = document.getElementById('p-categoria').value;
  const precio = Number(document.getElementById('p-precio').value);
  const imagen = document.getElementById('p-imagen').value.trim();
  const desc = document.getElementById('p-desc').value.trim();
  const disponible = document.getElementById('p-disponible').value === 'true';

  if (!nombre || Number.isNaN(precio) || !imagen || !desc) {
    alert('Por favor completa todos los campos.' );
    return;
  }

  if (editingId !== null) {
    const idx = productos.findIndex(p => p.id === editingId);
    if (idx >= 0) {
      productos[idx] = { id: editingId, nombre, categoria, precio, imagen, desc, disponible };
      saveProductos(productos);
      renderProducts();
      closeProdModal();
      alert('Producto actualizado. Refresca el sitio principal para verlo.');
      return;
    }
  }

  const nextId = productos.reduce((max, p) => Math.max(max, p.id), 0) + 1;
  productos.push({ id: nextId, nombre, categoria, precio, imagen, desc, disponible });
  saveProductos(productos);
  renderProducts();
  closeProdModal();
  alert('Producto agregado. Refresca el sitio principal para verlo.');
}

// Funciones para categorías
window.openCatModal = function() {
  editingCatName = null;
  document.querySelector('#cat-modal h3').textContent = 'Agregar Categoría';
  document.querySelector('#cat-form button[type="submit"]').textContent = 'Agregar';
  document.getElementById('cat-modal').style.display = 'flex';
};

window.closeCatModal = function() {
  editingCatName = null;
  document.getElementById('cat-modal').style.display = 'none';
  document.getElementById('c-nombre').value = '';
  document.getElementById('c-label').value = '';
  document.getElementById('c-emoji').value = '';
  document.getElementById('c-color').value = '';
};

function handleCatSubmit(event) {
  event.preventDefault();
  const cats = loadCats();
  const nombre = document.getElementById('c-nombre').value.trim();
  const label = document.getElementById('c-label').value.trim();
  const emoji = document.getElementById('c-emoji').value.trim();
  const color = document.getElementById('c-color').value.trim();

  if (!nombre || !label || !emoji || !color) {
    alert('Completa todos los campos.');
    return;
  }

  // Si estamos editando y mantenemos el mismo nombre, se guarda
  if (editingCatName) {
    const idx = cats.findIndex(c => c.nombre === editingCatName);
    if (idx < 0) {
      alert('Categoría no encontrada para editar.');
      return;
    }

    if (nombre !== editingCatName && cats.some(c => c.nombre === nombre)) {
      alert('Ya existe una categoría con ese nombre.');
      return;
    }

    cats[idx] = { nombre, label, emoji, color };
    saveCats(cats);

    // Actualizar referenciales de productos que usaban la categoría antigua
    const productos = loadProductos();
    const productosActualizados = productos.map(p => p.categoria === editingCatName ? { ...p, categoria: nombre } : p);
    saveProductos(productosActualizados);

    editingCatName = null;
    renderCats();
    renderProducts();
    closeCatModal();
    alert('Categoría actualizada. Refresca el sitio principal para ver el cambio.');
    return;
  }

  if (cats.find(c => c.nombre === nombre)) {
    alert('Nombre de categoría ya existe.');
    return;
  }

  cats.push({ nombre, label, emoji, color });
  saveCats(cats);
  renderCats();
  closeCatModal();
  alert('Categoría agregada.');
}

window.removeCat = function(nombre) {
  const productos = loadProductos();
  const usados = productos.filter(p => p.categoria === nombre);
  if (usados.length > 0) {
    const listaNombres = usados.map(p => `- ${p.nombre}`).join('\n');
    alert(`No puedes eliminar la categoría '${nombre}' porque tiene productos asociados:\n${listaNombres}`);
    return;
  }
  let cats = loadCats();
  cats = cats.filter(c => c.nombre !== nombre);
  saveCats(cats);
  renderCats();
  alert('Categoría eliminada.');
};

if (prodForm) prodForm.addEventListener('submit', handleProdSubmit);
if (catForm) catForm.addEventListener('submit', handleCatSubmit);

if (sessionStorage.getItem('admin_auth') === 'true') {
  if (tableBody && catsTableBody) {
    renderCats();
    renderProducts();
  }
}

checkAuth();