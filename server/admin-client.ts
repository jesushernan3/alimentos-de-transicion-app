import { MAX_ACTIVE_LICENSE_DEVICES } from "../shared/device-policy";

/**
 * JavaScript del panel administrativo.
 *
 * Se entrega como un archivo estático desde el servidor. Está escrito en
 * JavaScript plano dentro de un string para no requerir un segundo proceso de
 * compilación: el panel es una herramienta interna y esta decisión mantiene el
 * despliegue en un solo artefacto.
 */

export const ADMIN_CLIENT_JS = String.raw`
// --- Utilidades ------------------------------------------------------------

const main = document.getElementById('main');
const backdrop = document.getElementById('modal-backdrop');
const modal = document.getElementById('modal');
const toastEl = document.getElementById('toast');

let toastTimer = null;
function toast(message, isError) {
  toastEl.textContent = message;
  toastEl.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, 3600);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function api(path, options) {
  const response = await fetch('/admin/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (response.status === 401) { window.location.href = '/admin/login'; throw new Error('Sesión vencida'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Ocurrió un error.');
  return data;
}

function openModal(html) { modal.innerHTML = html; backdrop.classList.add('open'); }
function closeModal() { backdrop.classList.remove('open'); modal.innerHTML = ''; }
backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });

const STATUS_LABELS = { published: 'Publicada', draft: 'Borrador', archived: 'Archivada' };
const LICENSE_LABELS = { active: 'Activa', revoked: 'Revocada', refunded: 'Reembolsada', expired: 'Vencida' };
const ACCESS_LABELS = { pending: 'Pendiente', used: 'Acceso utilizado', unknown: 'Sin datos' };
const ACCESS_PILLS = { pending: 'draft', used: 'published', unknown: 'archived' };

function statusPill(status) {
  return '<span class="pill pill-' + status + '">' + (STATUS_LABELS[status] || status) + '</span>';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '—';
  // Las fechas llegan en UTC; Intl las muestra en la zona horaria del navegador.
  return date.toLocaleString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// --- Estado compartido -----------------------------------------------------

let taxonomyCache = null;
let collectionsCache = null;

async function getTaxonomy() {
  if (!taxonomyCache) taxonomyCache = await api('/taxonomy');
  return taxonomyCache;
}

async function getCollections() {
  if (!collectionsCache) collectionsCache = await api('/collections');
  return collectionsCache;
}

// --- Vista: resumen --------------------------------------------------------

async function viewDashboard() {
  main.innerHTML = '<div class="empty">Cargando…</div>';
  const data = await api('/dashboard');
  const c = data.catalog || {};
  const l = data.licenses || {};

  main.innerHTML =
    '<div class="page-head"><div><h1>Resumen</h1><p>Estado general del recetario y los accesos</p></div></div>' +
    (data.emailProvider
      ? ''
      : '<div class="notice">El envío automático de correos no está configurado. Los códigos de acceso quedan visibles en «Usuarios y accesos» para entregarlos manualmente.</div>') +
    '<div class="stats">' +
      stat(c.published, 'Recetas publicadas') +
      stat(c.drafts, 'Borradores') +
      stat(c.archived, 'Archivadas') +
      stat(c.collections, 'Colecciones') +
      stat(c.ingredients, 'Ingredientes') +
    '</div>' +
    '<div class="stats">' +
      stat(l.active, 'Accesos activos') +
      stat(l.revoked, 'Accesos revocados') +
      stat(l.total, 'Usuarios registrados') +
    '</div>' +
    '<div class="card"><h2 style="font-size:16px;margin-bottom:8px">Versión del catálogo</h2>' +
    '<p style="margin:0;color:#6B655F;font-size:14px">Versión ' + (c.catalogVersion ?? 1) +
    '. Cada cambio publicado incrementa este número y hace que las aplicaciones descarguen lo nuevo la próxima vez que se abran con conexión.</p></div>';
}

function stat(value, label) {
  return '<div class="stat"><div class="value">' + (value ?? 0) + '</div><div class="label">' + label + '</div></div>';
}

// --- Vista: recetas --------------------------------------------------------

let recipeFilters = { search: '', status: '', collection: '' };

async function viewRecipes() {
  main.innerHTML = '<div class="empty">Cargando…</div>';
  const collections = await getCollections();

  main.innerHTML =
    '<div class="page-head"><div><h1>Recetas</h1><p>Crear, editar y publicar el contenido del recetario</p></div>' +
    '<div class="actions"><button class="btn" id="new-recipe">Nueva receta</button></div></div>' +
    '<div class="toolbar">' +
      '<input id="search" placeholder="Buscar por título…" value="' + escapeHtml(recipeFilters.search) + '">' +
      '<select id="status"><option value="">Todos los estados</option>' +
        '<option value="published">Publicadas</option><option value="draft">Borradores</option>' +
        '<option value="archived">Archivadas</option></select>' +
      '<select id="collection"><option value="">Todas las colecciones</option>' +
        collections.map((item) => '<option value="' + item.slug + '">' + escapeHtml(item.name) + '</option>').join('') +
      '</select>' +
    '</div>' +
    '<div class="card" style="padding:0" id="recipe-table"></div>';

  document.getElementById('status').value = recipeFilters.status;
  document.getElementById('collection').value = recipeFilters.collection;
  document.getElementById('new-recipe').addEventListener('click', () => editRecipe(null));

  let debounce;
  document.getElementById('search').addEventListener('input', (event) => {
    recipeFilters.search = event.target.value;
    clearTimeout(debounce);
    debounce = setTimeout(loadRecipeTable, 280);
  });
  document.getElementById('status').addEventListener('change', (event) => {
    recipeFilters.status = event.target.value; loadRecipeTable();
  });
  document.getElementById('collection').addEventListener('change', (event) => {
    recipeFilters.collection = event.target.value; loadRecipeTable();
  });

  await loadRecipeTable();
}

async function loadRecipeTable() {
  const container = document.getElementById('recipe-table');
  if (!container) return;
  container.innerHTML = '<div class="empty">Cargando…</div>';

  const params = new URLSearchParams();
  if (recipeFilters.search) params.set('search', recipeFilters.search);
  if (recipeFilters.status) params.set('status', recipeFilters.status);
  if (recipeFilters.collection) params.set('collection', recipeFilters.collection);
  params.set('limit', '200');

  const data = await api('/recipes?' + params.toString());
  const rows = data.rows || [];

  if (rows.length === 0) {
    container.innerHTML = '<div class="empty">No hay recetas que coincidan con la búsqueda.</div>';
    return;
  }

  container.innerHTML =
    '<table><thead><tr><th>Título</th><th>Estado</th><th>Tiempo</th><th>Porciones</th><th>Actualizada</th><th></th></tr></thead><tbody>' +
    rows.map((row) =>
      '<tr>' +
        '<td><strong>' + escapeHtml(row.title) + '</strong><br><span style="font-size:12px;color:#6B655F">' + escapeHtml(row.slug) + '</span></td>' +
        '<td>' + statusPill(row.status) + '</td>' +
        '<td>' + (row.totalTime || 0) + ' min</td>' +
        '<td>' + (row.portions || 0) + '</td>' +
        '<td style="font-size:13px;color:#6B655F">' + formatDate(row.updatedAt) + '</td>' +
        '<td style="text-align:right;white-space:nowrap">' +
          '<button class="btn btn-ghost btn-sm" data-edit="' + row.id + '">Editar</button> ' +
          '<button class="btn btn-ghost btn-sm" data-status="' + row.id + '" data-current="' + row.status + '">' +
            (row.status === 'published' ? 'Despublicar' : 'Publicar') + '</button> ' +
          '<button class="btn btn-ghost btn-sm" data-duplicate="' + row.id + '">Duplicar</button> ' +
          '<button class="btn btn-danger btn-sm" data-delete="' + row.id + '">Eliminar</button>' +
        '</td>' +
      '</tr>').join('') +
    '</tbody></table>';

  container.querySelectorAll('[data-edit]').forEach((button) => {
    button.addEventListener('click', () => editRecipe(Number(button.dataset.edit)));
  });

  container.querySelectorAll('[data-status]').forEach((button) => {
    button.addEventListener('click', async () => {
      const next = button.dataset.current === 'published' ? 'draft' : 'published';
      try {
        await api('/recipes/' + button.dataset.status + '/status', {
          method: 'POST', body: JSON.stringify({ status: next }),
        });
        toast(next === 'published' ? 'Receta publicada' : 'Receta pasada a borrador');
        loadRecipeTable();
      } catch (error) { toast(error.message, true); }
    });
  });

  container.querySelectorAll('[data-duplicate]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await api('/recipes/' + button.dataset.duplicate + '/duplicate', { method: 'POST' });
        toast('Se creó una copia en borrador');
        loadRecipeTable();
      } catch (error) { toast(error.message, true); }
    });
  });

  container.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta receta? Va a desaparecer de las aplicaciones en la próxima actualización.')) return;
      try {
        await api('/recipes/' + button.dataset.delete, { method: 'DELETE' });
        toast('Receta eliminada');
        loadRecipeTable();
      } catch (error) { toast(error.message, true); }
    });
  });
}

// --- Editor de receta ------------------------------------------------------

async function editRecipe(id) {
  const [taxonomy, collections] = await Promise.all([getTaxonomy(), getCollections()]);
  const recipe = id ? await api('/recipes/' + id) : null;

  const data = recipe || {
    title: '', slug: '', shortDescription: '', description: '',
    categorySlug: '', dietTagSlugs: [], collectionSlugs: [],
    prepTime: 10, cookingTime: 10, portions: 2, difficulty: 'facil',
    nutrition: null, tips: '', extraTips: '', imageKey: '', thumbKey: '', featured: false, status: 'draft',
    ingredients: [{ name: '', quantity: null, unit: 'unidad' }],
    steps: [{ description: '' }],
  };

  openModal(
    '<h2>' + (id ? 'Editar receta' : 'Nueva receta') + '</h2>' +
    '<form id="recipe-form">' +
      '<div class="field"><label>Título</label><input name="title" value="' + escapeHtml(data.title) + '" required></div>' +
      '<div class="field"><label>Descripción breve</label><textarea name="shortDescription">' + escapeHtml(data.shortDescription || '') + '</textarea>' +
        '<span class="hint">Es el texto que se ve debajo del título en la aplicación.</span></div>' +
      '<div class="row-3">' +
        '<div class="field"><label>Categoría</label><select name="categorySlug">' +
          (taxonomy.categories || []).map((item) =>
            '<option value="' + item.slug + '"' + (item.slug === data.categorySlug ? ' selected' : '') + '>' + escapeHtml(item.name) + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>Dificultad</label><select name="difficulty">' +
          ['facil', 'intermedia', 'avanzada'].map((value) =>
            '<option value="' + value + '"' + (value === data.difficulty ? ' selected' : '') + '>' + value + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>Estado</label><select name="status">' +
          ['draft', 'published', 'archived'].map((value) =>
            '<option value="' + value + '"' + (value === data.status ? ' selected' : '') + '>' + STATUS_LABELS[value] + '</option>').join('') +
        '</select></div>' +
      '</div>' +
      '<div class="row-3">' +
        '<div class="field"><label>Preparación (min)</label><input name="prepTime" type="number" min="0" value="' + (data.prepTime || 0) + '"></div>' +
        '<div class="field"><label>Cocción (min)</label><input name="cookingTime" type="number" min="0" value="' + (data.cookingTime || 0) + '"></div>' +
        '<div class="field"><label>Porciones</label><input name="portions" type="number" min="1" value="' + (data.portions || 1) + '"></div>' +
      '</div>' +
      '<div class="field"><label>Colecciones</label><div class="checks">' +
        collections.map((item) =>
          '<label><input type="checkbox" name="collection" value="' + item.slug + '"' +
          ((data.collectionSlugs || []).includes(item.slug) ? ' checked' : '') + '>' + escapeHtml(item.name) + '</label>').join('') +
      '</div><span class="hint">Una receta sin colección no aparece en ningún recetario.</span></div>' +
      '<div class="field"><label>Atributos dietarios</label><div class="checks">' +
        (taxonomy.dietTags || []).map((item) =>
          '<label><input type="checkbox" name="diet" value="' + item.slug + '"' +
          ((data.dietTagSlugs || []).includes(item.slug) ? ' checked' : '') + '>' + escapeHtml(item.name) + '</label>').join('') +
      '</div></div>' +
      '<div class="field"><label>Ingredientes</label><div class="dyn-list" id="ingredients"></div>' +
        '<div class="actions" style="margin-top:8px">' +
          '<button type="button" class="btn btn-ghost btn-sm" id="add-ingredient">Agregar ingrediente</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="add-ingredient-group">Agregar grupo/encabezado</button>' +
        '</div></div>' +
      '<div class="field"><label>Pasos</label><div class="dyn-list" id="steps"></div>' +
        '<div class="actions" style="margin-top:8px">' +
          '<button type="button" class="btn btn-ghost btn-sm" id="add-step">Agregar paso</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="add-step-group">Agregar grupo/encabezado</button>' +
        '</div></div>' +
      '<div class="field"><label>Consejos</label><textarea name="tips">' + escapeHtml(data.tips || '') + '</textarea></div>' +
      '<div class="field"><label>Tips</label><textarea name="extraTips">' + escapeHtml(data.extraTips || '') + '</textarea>' +
        '<span class="hint">Opcional. Podés escribir varios tips, uno por línea.</span></div>' +
      '<div class="field"><label>Foto de la receta</label>' +
        '<div id="photo-box" style="display:flex;gap:12px;align-items:flex-start">' +
          '<div id="photo-preview" style="width:120px;height:90px;border-radius:8px;background:#f1ece7;' +
            'background-size:cover;background-position:center;flex-shrink:0;border:1px solid #e4dcd4"></div>' +
          '<div style="flex:1;display:flex;flex-direction:column;gap:8px">' +
            '<input type="file" id="photo-file" accept="image/jpeg,image/png,image/webp">' +
            '<span class="hint" id="photo-hint">Elegí una foto horizontal. Se genera sola la versión ' +
              'para los listados y la de la ficha.</span>' +
            '<input name="imageKey" placeholder="O pegá una URL o clave existente" value="' +
              escapeHtml(data.imageKey || '') + '">' +
            '<input name="thumbKey" type="hidden" value="' + escapeHtml(data.thumbKey || '') + '">' +
          '</div>' +
        '</div>' +
      '</div>' +
      /*
       * Galería adicional.
       *
       * Sólo se ofrece al editar una receta existente: cada operación se guarda
       * al instante contra el servidor y para eso hace falta un identificador. En
       * una receta nueva se muestra el aviso, más honesto que ofrecer una función
       * destinada a fallar.
       */
      (id
        ? '<div class="field"><label>Más fotos de la receta</label>' +
            '<span class="hint">Hasta 8 en total. La portada es la que se ve en los listados; ' +
              'las demás aparecen en la ficha y se descargan cuando alguien la abre.</span>' +
            '<div id="gallery-box" style="margin-top:10px">Cargando fotos…</div>' +
            '<div style="display:flex;gap:8px;align-items:center;margin-top:10px">' +
              '<input type="file" id="gallery-file" accept="image/jpeg,image/png,image/webp">' +
              '<span class="hint" id="gallery-hint"></span>' +
            '</div>' +
          '</div>'
        : '<div class="field"><label>Más fotos de la receta</label>' +
            '<span class="hint">Guardá la receta y volvé a abrirla para agregar hasta 8 fotos.</span>' +
          '</div>') +
      '<div class="field"><label style="display:flex;align-items:center;gap:8px;font-weight:500">' +
        '<input type="checkbox" name="featured"' + (data.featured ? ' checked' : '') + '> Destacar en la portada</label></div>' +
      '<div class="modal-foot">' +
        '<button type="button" class="btn btn-ghost" id="cancel">Cancelar</button>' +
        '<button type="submit" class="btn">Guardar</button>' +
      '</div>' +
    '</form>');

  const ingredientsBox = document.getElementById('ingredients');
  const stepsBox = document.getElementById('steps');

  function moveRow(row, box, direction) {
    const rows = Array.from(box.children);
    const index = rows.indexOf(row);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= rows.length) return;
    if (direction < 0) box.insertBefore(row, rows[target]);
    else if (rows[target].nextElementSibling) box.insertBefore(row, rows[target].nextElementSibling);
    else box.appendChild(row);
    if (box === stepsBox) updateStepNumbers();
  }

  function wireRow(row, box) {
    row.querySelector('[data-move="up"]').addEventListener('click', () => moveRow(row, box, -1));
    row.querySelector('[data-move="down"]').addEventListener('click', () => moveRow(row, box, 1));
    row.querySelector('[data-remove-row]').addEventListener('click', () => {
      row.remove();
      if (box === stepsBox) updateStepNumbers();
    });
  }

  function rowActions() {
    return '<div class="dyn-row-actions" style="display:flex;gap:4px;align-items:center">' +
      '<button type="button" class="icon-btn" data-move="up" title="Mover arriba" aria-label="Mover arriba">↑</button>' +
      '<button type="button" class="icon-btn" data-move="down" title="Mover abajo" aria-label="Mover abajo">↓</button>' +
      '<button type="button" class="icon-btn" data-remove-row title="Eliminar elemento" aria-label="Eliminar elemento">×</button>' +
      '</div>';
  }

  function addIngredient(value) {
    const row = document.createElement('div');
    const isGroup = value?.type === 'group';
    row.className = isGroup ? 'dyn-row dyn-group recipe-group-entry' : 'dyn-row recipe-ingredient-entry';
    row.dataset.kind = isGroup ? 'group' : 'ingredient';
    row.innerHTML = isGroup
      ? '<input placeholder="Título del grupo" aria-label="Título del grupo" value="' + escapeHtml(value?.title || '') + '">' + rowActions()
      : '<input placeholder="Ingrediente" aria-label="Ingrediente" value="' + escapeHtml(value?.name || '') + '">' +
        '<input placeholder="Cant." aria-label="Cantidad" type="number" step="0.01" value="' + escapeHtml(value?.quantity ?? '') + '">' +
        '<input placeholder="Unidad" aria-label="Unidad" value="' + escapeHtml(value?.unit || 'unidad') + '">' +
        '<input placeholder="Nota (opcional)" aria-label="Nota del ingrediente (opcional)" value="' + escapeHtml(value?.note || '') + '">' +
        '<input placeholder="Categoría despensa (opcional)" aria-label="Categoría de despensa (opcional)" value="' + escapeHtml(value?.pantryCategory || '') + '">' +
        rowActions();
    wireRow(row, ingredientsBox);
    ingredientsBox.appendChild(row);
  }

  function addStep(value) {
    const row = document.createElement('div');
    const isGroup = value?.type === 'group';
    row.className = isGroup ? 'dyn-row-step dyn-group recipe-group-entry' : 'dyn-row-step recipe-step-entry';
    row.dataset.kind = isGroup ? 'group' : 'step';
    row.innerHTML = isGroup
      ? '<input placeholder="Título del grupo" aria-label="Título del grupo" value="' + escapeHtml(value?.title || '') + '">' + rowActions()
      : '<span class="step-number" aria-label="Número del paso"></span>' +
        '<textarea rows="2" placeholder="Describí el paso" aria-label="Descripción del paso">' + escapeHtml(value?.description || '') + '</textarea>' +
        '<input placeholder="Duración (min, opcional)" aria-label="Duración del paso en minutos (opcional)" type="number" min="0" step="1" value="' + escapeHtml(value?.durationMinutes ?? '') + '">' +
        rowActions();
    wireRow(row, stepsBox);
    stepsBox.appendChild(row);
    updateStepNumbers();
  }

  function updateStepNumbers() {
    let number = 1;
    Array.from(stepsBox.children).forEach((row) => {
      if (row.dataset.kind === 'group') return;
      const label = row.querySelector('.step-number');
      if (label) label.textContent = 'Paso ' + number;
      number += 1;
    });
  }

  (data.ingredients || []).forEach(addIngredient);
  (data.steps || []).forEach(addStep);

  document.getElementById('add-ingredient').addEventListener('click', () => addIngredient(null));
  document.getElementById('add-ingredient-group').addEventListener('click', () => addIngredient({ type: 'group', title: '' }));
  document.getElementById('add-step').addEventListener('click', () => addStep(null));
  document.getElementById('add-step-group').addEventListener('click', () => addStep({ type: 'group', title: '' }));
  document.getElementById('cancel').addEventListener('click', closeModal);

  // --- Subida de la foto ---------------------------------------------------
  // Se procesa en el servidor, que genera las dos versiones necesarias. Así el
  // resultado es el mismo sin importar desde qué equipo se cargue.

  const photoPreview = document.getElementById('photo-preview');
  const photoHint = document.getElementById('photo-hint');
  const photoFile = document.getElementById('photo-file');
  const recipeForm = document.getElementById('recipe-form');

  function showPreview(key) {
    if (!key) { photoPreview.style.backgroundImage = ''; return; }
    const url = /^https?:\/\//i.test(key) ? key : '/manus-storage/' + key.replace(/^\/+/, '');
    photoPreview.style.backgroundImage = 'url("' + url + '")';
  }

  showPreview(data.thumbKey || data.imageKey || '');

  recipeForm.imageKey.addEventListener('change', () => {
    // Si se pega una clave a mano, la miniatura anterior deja de corresponder.
    recipeForm.thumbKey.value = '';
    showPreview(recipeForm.imageKey.value.trim());
  });

  photoFile.addEventListener('change', async () => {
    const file = photoFile.files && photoFile.files[0];
    if (!file) return;

    photoHint.textContent = 'Procesando la foto…';
    photoFile.disabled = true;

    try {
      const content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        reader.readAsDataURL(file);
      });

      const result = await api('/images', {
        method: 'POST',
        body: JSON.stringify({ content: content, fileName: file.name }),
      });

      recipeForm.imageKey.value = result.imageKey;
      recipeForm.thumbKey.value = result.thumbKey;
      showPreview(result.thumbKey);

      const kb = Math.round(result.imageBytes / 1024);
      photoHint.textContent = 'Foto lista (' + kb + ' KB). Acordate de guardar la receta.';
    } catch (error) {
      photoHint.textContent = error.message;
    } finally {
      photoFile.disabled = false;
    }
  });

  // --- Galería de hasta ocho fotos -----------------------------------------
  //
  // A diferencia del resto del formulario, estas operaciones se guardan al
  // momento y no al pulsar «Guardar». Es lo que corresponde: subir un archivo ya
  // escribió en el almacenamiento, y dejar esa foto sin registrar hasta el envío
  // abriría la puerta a archivos huérfanos si se cierra el modal.
  if (id) {
    const galleryBox = document.getElementById('gallery-box');
    const galleryFile = document.getElementById('gallery-file');
    const galleryHint = document.getElementById('gallery-hint');
    let photos = [];

    const photoUrl = (key) =>
      !key ? '' : /^https?:\/\//i.test(key) ? key : '/manus-storage/' + String(key).replace(/^\/+/, '');

    /** Copia la portada al recuadro de arriba, para que ambos coincidan. */
    function syncCoverPreview() {
      const portada = photos.find((p) => p.isCover);
      recipeForm.imageKey.value = portada ? portada.imageKey : '';
      recipeForm.thumbKey.value = portada ? portada.thumbKey || '' : '';
      showPreview(portada ? portada.thumbKey || portada.imageKey : '');
    }

    function renderGallery() {
      if (photos.length === 0) {
        galleryBox.innerHTML = '<span class="hint">Todavía no hay fotos cargadas.</span>';
      } else {
        galleryBox.innerHTML = photos
          .map((photo, index) => {
            const url = photoUrl(photo.thumbKey || photo.imageKey);
            return (
              '<div class="gallery-item" data-id="' + photo.id + '" style="display:inline-block;' +
                'margin:0 10px 10px 0;text-align:center;vertical-align:top;width:110px">' +
                '<div style="width:110px;height:82px;border-radius:8px;background:#f1ece7 ' +
                  'url(&quot;' + url + '&quot;) center/cover;border:2px solid ' +
                  (photo.isCover ? '#d98a6a' : '#e4dcd4') + '"></div>' +
                '<div style="font-size:11px;color:#8a7f76;margin-top:4px">' +
                  (photo.isCover ? 'Portada' : 'Foto ' + (index + 1)) + '</div>' +
                '<div style="display:flex;gap:2px;justify-content:center;margin-top:4px">' +
                  (photo.isCover ? '' :
                    '<button type="button" class="icon-btn" data-act="cover" title="Usar como portada">*</button>') +
                  (index > 0 ?
                    '<button type="button" class="icon-btn" data-act="up" title="Mover antes">&lt;</button>' : '') +
                  (index < photos.length - 1 ?
                    '<button type="button" class="icon-btn" data-act="down" title="Mover después">&gt;</button>' : '') +
                  '<button type="button" class="icon-btn" data-act="del" title="Borrar">×</button>' +
                '</div>' +
              '</div>'
            );
          })
          .join('');
      }
      galleryFile.disabled = photos.length >= 8;
      galleryHint.textContent =
        photos.length >= 8 ? 'Llegaste al máximo de 8 fotos.' : photos.length + ' de 8 fotos.';
    }

    galleryBox.addEventListener('click', async (event) => {
      const boton = event.target.closest('button[data-act]');
      if (!boton) return;
      const item = boton.closest('.gallery-item');
      const photoId = Number(item.getAttribute('data-id'));
      const accion = boton.getAttribute('data-act');
      const indice = photos.findIndex((p) => p.id === photoId);

      galleryHint.textContent = 'Guardando…';
      try {
        if (accion === 'cover') {
          photos = (await api('/recipes/' + id + '/photos/' + photoId + '/cover', { method: 'POST' })).photos;
          syncCoverPreview();
        } else if (accion === 'del') {
          if (!window.confirm('¿Borrar esta foto de la receta?')) { renderGallery(); return; }
          photos = (await api('/recipes/' + id + '/photos/' + photoId, { method: 'DELETE' })).photos;
          syncCoverPreview();
        } else if (accion === 'up' || accion === 'down') {
          const destino = accion === 'up' ? indice - 1 : indice + 1;
          const orden = photos.map((p) => p.id);
          const movido = orden.splice(indice, 1)[0];
          orden.splice(destino, 0, movido);
          photos = (await api('/recipes/' + id + '/photos/order', {
            method: 'POST',
            body: JSON.stringify({ order: orden }),
          })).photos;
        }
        renderGallery();
      } catch (error) {
        galleryHint.textContent = error.message;
      }
    });

    galleryFile.addEventListener('change', async () => {
      const file = galleryFile.files && galleryFile.files[0];
      if (!file) return;
      galleryHint.textContent = 'Procesando la foto…';
      galleryFile.disabled = true;
      try {
        const content = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
          reader.readAsDataURL(file);
        });
        const subida = await api('/images', {
          method: 'POST',
          body: JSON.stringify({ content: content, fileName: file.name }),
        });
        photos = (await api('/recipes/' + id + '/photos', {
          method: 'POST',
          body: JSON.stringify({ imageKey: subida.imageKey, thumbKey: subida.thumbKey }),
        })).photos;
        galleryFile.value = '';
        syncCoverPreview();
        renderGallery();
      } catch (error) {
        galleryHint.textContent = error.message;
      } finally {
        galleryFile.disabled = photos.length >= 8;
      }
    });

    api('/recipes/' + id + '/photos')
      .then((result) => { photos = result.photos; renderGallery(); })
      .catch((error) => { galleryBox.innerHTML = '<span class="hint">' + error.message + '</span>'; });
  }

  document.getElementById('recipe-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;

    const ingredients = Array.from(ingredientsBox.children).map((row) => {
      const inputs = row.querySelectorAll('input');
      if (row.dataset.kind === 'group') {
        const title = inputs[0].value.trim();
        return title ? { type: 'group', title: title } : null;
      }
      const item = {
        name: inputs[0].value.trim(),
        quantity: inputs[1].value === '' ? null : Number(inputs[1].value),
        unit: inputs[2].value.trim() || 'unidad',
      };
      if (inputs[3].value.trim()) item.note = inputs[3].value.trim();
      if (inputs[4].value.trim()) item.pantryCategory = inputs[4].value.trim();
      return item.name.length > 0 ? item : null;
    }).filter(Boolean);

    const steps = Array.from(stepsBox.children).map((row) => {
      if (row.dataset.kind === 'group') {
        const title = row.querySelector('input').value.trim();
        return title ? { type: 'group', title: title } : null;
      }
      const description = row.querySelector('textarea').value.trim();
      if (!description) return null;
      const durationInput = row.querySelector('input[type="number"]');
      const item = { description: description };
      if (durationInput.value !== '') item.durationMinutes = Number(durationInput.value);
      return item;
    }).filter(Boolean);

    if (!ingredients.some((item) => item.type !== 'group')) {
      toast('Cargá al menos un ingrediente.', true); return;
    }
    if (!steps.some((item) => item.type !== 'group')) {
      toast('Cargá al menos un paso.', true); return;
    }

    const payload = {
      title: form.title.value.trim(),
      shortDescription: form.shortDescription.value.trim() || null,
      description: form.shortDescription.value.trim() || null,
      categorySlug: form.categorySlug.value || null,
      difficulty: form.difficulty.value,
      status: form.status.value,
      prepTime: Number(form.prepTime.value) || 0,
      cookingTime: Number(form.cookingTime.value) || 0,
      portions: Number(form.portions.value) || 1,
      collectionSlugs: Array.from(form.querySelectorAll('input[name="collection"]:checked')).map((input) => input.value),
      dietTagSlugs: Array.from(form.querySelectorAll('input[name="diet"]:checked')).map((input) => input.value),
      tips: form.tips.value.trim() || null,
      extraTips: form.extraTips.value.trim() || null,
      imageKey: form.imageKey.value.trim() || null,
      thumbKey: form.thumbKey.value.trim() || null,
      featured: form.featured.checked,
      ingredients: ingredients,
      steps: steps,
    };

    try {
      if (id) await api('/recipes/' + id, { method: 'PUT', body: JSON.stringify(payload) });
      else await api('/recipes', { method: 'POST', body: JSON.stringify(payload) });
      toast('Receta guardada');
      closeModal();
      loadRecipeTable();
    } catch (error) { toast(error.message, true); }
  });
}

// --- Vista: colecciones ----------------------------------------------------

async function viewCollections() {
  main.innerHTML = '<div class="empty">Cargando…</div>';
  collectionsCache = null;
  const collections = await getCollections();

  main.innerHTML =
    '<div class="page-head"><div><h1>Colecciones</h1><p>Cada colección es un recetario que se vende por separado</p></div>' +
    '<div class="actions"><button class="btn" id="new-collection">Nueva colección</button></div></div>' +
    '<div class="card" style="padding:0">' +
    (collections.length === 0
      ? '<div class="empty">Todavía no hay colecciones.</div>'
      : '<table><thead><tr><th>Nombre</th><th>Recetas</th><th>Orden</th><th>Estado</th><th></th></tr></thead><tbody>' +
        collections.map((item) =>
          '<tr><td><strong>' + escapeHtml(item.name) + '</strong><br><span style="font-size:12px;color:#6B655F">' + escapeHtml(item.slug) + '</span></td>' +
          '<td>' + (item.recipeCount ?? 0) + '</td><td>' + (item.sortOrder ?? 0) + '</td>' +
          '<td>' + (item.published ? '<span class="pill pill-published">Publicada</span>' : '<span class="pill pill-draft">Oculta</span>') + '</td>' +
          '<td style="text-align:right;white-space:nowrap">' +
            '<button class="btn btn-ghost btn-sm" data-edit=\'' + JSON.stringify(item).replace(/'/g, '&#39;') + '\'>Editar</button> ' +
            '<button class="btn btn-danger btn-sm" data-delete="' + item.id + '">Eliminar</button></td></tr>').join('') +
        '</tbody></table>') +
    '</div>';

  document.getElementById('new-collection').addEventListener('click', () => editCollection(null));

  main.querySelectorAll('[data-edit]').forEach((button) => {
    button.addEventListener('click', () => editCollection(JSON.parse(button.dataset.edit)));
  });

  main.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta colección? Las recetas no se borran, solo dejan de estar agrupadas acá.')) return;
      try {
        await api('/collections/' + button.dataset.delete, { method: 'DELETE' });
        toast('Colección eliminada');
        viewCollections();
      } catch (error) { toast(error.message, true); }
    });
  });
}

function editCollection(item) {
  const data = item || { name: '', slug: '', tagline: '', description: '', imageKey: '', sortOrder: 0, published: true };
  openModal(
    '<h2>' + (item ? 'Editar colección' : 'Nueva colección') + '</h2>' +
    '<form id="collection-form">' +
      '<div class="field"><label>Nombre</label><input name="name" value="' + escapeHtml(data.name) + '" maxlength="180" required></div>' +
      '<div class="field"><label>Frase corta</label><input name="tagline" value="' + escapeHtml(data.tagline || '') + '" maxlength="240"></div>' +
      '<div class="field"><label>Descripción</label><textarea name="description">' + escapeHtml(data.description || '') + '</textarea></div>' +
      '<section class="field" aria-labelledby="collection-cover-heading">' +
        '<label id="collection-cover-heading">Portada de la colección</label>' +
        '<img id="collection-cover-preview" alt="Portada de la colección" style="display:none;width:100%;max-width:300px;height:170px;object-fit:contain;border-radius:8px;background:#f1ece7;margin-bottom:10px">' +
        '<div class="actions"><button type="button" class="btn btn-ghost btn-sm" id="select-collection-cover">' + (data.imageKey ? 'Reemplazar imagen' : 'Subir imagen') + '</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="cancel-collection-cover" hidden>Cancelar selección</button></div>' +
        '<input type="file" id="collection-cover-file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden>' +
        '<p id="collection-cover-status" class="hint" role="status" aria-live="polite">JPG, PNG o WebP · hasta 15 MB. Se sube al guardar la colección.</p>' +
        '<details><summary class="hint">URL o clave existente (opcional)</summary>' +
          '<input name="imageKey" aria-label="URL o clave de portada existente" value="' + escapeHtml(data.imageKey || '') + '"></details>' +
      '</section>' +
      '<div class="field"><label>Orden</label><input name="sortOrder" type="number" value="' + (data.sortOrder ?? 0) + '"></div>' +
      '<div class="field"><label style="display:flex;align-items:center;gap:8px;font-weight:500">' +
        '<input type="checkbox" name="published"' + (data.published ? ' checked' : '') + '> Visible en la aplicación</label></div>' +
      '<div class="modal-foot"><button type="button" class="btn btn-ghost" id="cancel">Cancelar</button>' +
      '<button type="submit" class="btn" id="save-collection">Guardar</button></div>' +
    '</form>');
  const form = document.getElementById('collection-form');
  const fileInput = document.getElementById('collection-cover-file');
  const preview = document.getElementById('collection-cover-preview');
  const hint = document.getElementById('collection-cover-status');
  const selectButton = document.getElementById('select-collection-cover');
  const resetButton = document.getElementById('cancel-collection-cover');
  const saveButton = document.getElementById('save-collection');
  let chosenFile = null, objectUrl = null, saving = false, reading = false;
  let operationId = null, lastPayload = null;
  function showCover(key) {
    if (!key) { preview.removeAttribute('src'); preview.style.display = 'none'; return; }
    const url = /^https?:\/\//i.test(key) || key.startsWith('/manus-storage/') ? key : '/manus-storage/' + key.replace(/^\/+/, '');
    preview.src = url; preview.style.display = 'block';
  }
  function clearObjectUrl() { if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; } }
  showCover(data.imageKey || '');
  const observer = new MutationObserver(() => {
    if (!form.isConnected) { clearObjectUrl(); observer.disconnect(); document.removeEventListener('keydown', guardClose, true); backdrop.removeEventListener('click', guardClose, true); }
  });
  observer.observe(modal, { childList: true });
  function guardClose(event) {
    if ((saving || reading) && ((event.type === 'keydown' && event.key === 'Escape') || event.target === backdrop)) { event.stopImmediatePropagation(); event.preventDefault(); }
  }
  document.addEventListener('keydown', guardClose, true); backdrop.addEventListener('click', guardClose, true);
  preview.addEventListener('error', () => { preview.style.display = 'none'; hint.textContent = 'No se pudo mostrar la portada. La imagen guardada se conserva; podés reemplazarla.'; });
  selectButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    const ext = file.name.split('.').pop().toLowerCase();
    if (!file.size || file.size > 15 * 1024 * 1024 || !types[ext] || types[ext] !== file.type) {
      hint.textContent = 'Elegí una imagen JPG, JPEG, PNG o WebP válida de hasta 15 MB. La portada anterior se conserva.';
      fileInput.value = ''; return;
    }
    clearObjectUrl(); chosenFile = file; operationId = null; lastPayload = null;
    objectUrl = URL.createObjectURL(file); preview.src = objectUrl; preview.style.display = 'block';
    selectButton.textContent = 'Reemplazar imagen'; resetButton.hidden = false;
    hint.textContent = 'Nueva portada seleccionada: ' + file.name + '. Se subirá al guardar; la anterior todavía no cambió.';
  });
  resetButton.addEventListener('click', () => {
    clearObjectUrl(); chosenFile = null; fileInput.value = ''; operationId = null; lastPayload = null; resetButton.hidden = true;
    showCover(form.elements.namedItem('imageKey').value.trim());
    selectButton.textContent = data.imageKey ? 'Reemplazar imagen' : 'Subir imagen'; hint.textContent = 'Selección cancelada. La portada actual se conserva.';
  });
  form.elements.namedItem('imageKey').addEventListener('change', () => { if (!chosenFile) showCover(form.elements.namedItem('imageKey').value.trim()); });
  document.getElementById('cancel').addEventListener('click', () => { if (!saving && !reading) closeModal(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); if (saving || reading) return;
    const payload = {
      id: item ? item.id : undefined, slug: item ? item.slug : undefined,
      name: form.elements.namedItem('name').value.trim(),
      tagline: form.elements.namedItem('tagline').value.trim() || null,
      description: form.elements.namedItem('description').value.trim() || null,
      imageKey: form.elements.namedItem('imageKey').value.trim() || null,
      sortOrder: Number(form.elements.namedItem('sortOrder').value) || 0,
      published: form.elements.namedItem('published').checked,
    };
    const payloadKey = JSON.stringify(payload);
    if (chosenFile && (!operationId || payloadKey !== lastPayload)) {
      operationId = crypto.randomUUID(); lastPayload = payloadKey;
    }
    saving = true; saveButton.disabled = true; fileInput.disabled = true;
    selectButton.disabled = true; resetButton.disabled = true; document.getElementById('cancel').disabled = true;
    const fields = Array.from(form.querySelectorAll('input,textarea')); fields.forEach((field) => { field.disabled = true; });
    try {
      if (chosenFile) {
        hint.textContent = 'Procesando y guardando la portada…';
        const content = await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('No se pudo leer el archivo. La portada anterior se conserva.'));
          reader.readAsDataURL(chosenFile);
        });
        payload.cover = { content, fileName: chosenFile.name, mimeType: chosenFile.type, operationId };
      }
      const saved = await api('/collections', { method: 'POST', body: JSON.stringify(payload) });
      toast('Colección guardada'); closeModal(); await viewCollections();
    } catch (error) {
      hint.textContent = error.message + ' La portada anterior no se cambia si el guardado falló.'; toast(error.message, true);
    } finally {
      saving = false; fields.forEach((field) => { field.disabled = false; });
      saveButton.disabled = false; fileInput.disabled = false; selectButton.disabled = false; resetButton.disabled = false;
      const cancel = document.getElementById('cancel'); if (form.isConnected && cancel) cancel.disabled = false;
    }
  });
}
// --- Vista: taxonomía ------------------------------------------------------

async function viewTaxonomy() {
  main.innerHTML = '<div class="empty">Cargando…</div>';
  taxonomyCache = null;
  const taxonomy = await getTaxonomy();

  main.innerHTML =
    '<div class="page-head"><div><h1>Categorías y dietas</h1><p>Cómo se agrupan y filtran las recetas en la aplicación</p></div></div>' +
    '<div class="row-2">' +
      block('Categorías', taxonomy.categories || [], 'category') +
      block('Atributos dietarios', taxonomy.dietTags || [], 'diet') +
    '</div>';

  main.querySelectorAll('[data-add]').forEach((button) => {
    button.addEventListener('click', () => editTaxonomyItem(button.dataset.add, null));
  });
  main.querySelectorAll('[data-item]').forEach((button) => {
    button.addEventListener('click', () =>
      editTaxonomyItem(button.dataset.kind, JSON.parse(button.dataset.item)));
  });

  function block(title, items, kind) {
    return '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
      '<h2 style="font-size:16px">' + title + '</h2>' +
      '<button class="btn btn-sm" data-add="' + kind + '">Agregar</button></div>' +
      (items.length === 0 ? '<p style="color:#6B655F;margin:0">Todavía no hay elementos.</p>' :
      '<table><tbody>' + items.map((item) =>
        '<tr><td><strong>' + escapeHtml(item.name) + '</strong><br><span style="font-size:12px;color:#6B655F">' + escapeHtml(item.slug) + '</span></td>' +
        '<td style="text-align:right"><button class="btn btn-ghost btn-sm" data-kind="' + kind + '" data-item=\'' +
        JSON.stringify(item).replace(/'/g, '&#39;') + '\'>Editar</button></td></tr>').join('') + '</tbody></table>') +
      '</div>';
  }
}

function editTaxonomyItem(kind, item) {
  const isCategory = kind === 'category';
  const data = item || { name: '', slug: '', icon: '', sortOrder: 0 };

  openModal(
    '<h2>' + (item ? 'Editar' : 'Agregar') + (isCategory ? ' categoría' : ' atributo dietario') + '</h2>' +
    '<form id="tax-form">' +
      '<div class="field"><label>Nombre</label><input name="name" value="' + escapeHtml(data.name) + '" required></div>' +
      '<div class="row-2">' +
        '<div class="field"><label>Icono</label><input name="icon" value="' + escapeHtml(data.icon || '') + '">' +
        '<span class="hint">Nombre del icono en la aplicación (por ejemplo: sunrise, leaf).</span></div>' +
        '<div class="field"><label>Orden</label><input name="sortOrder" type="number" value="' + (data.sortOrder ?? 0) + '"></div>' +
      '</div>' +
      '<div class="modal-foot"><button type="button" class="btn btn-ghost" id="cancel">Cancelar</button>' +
      '<button type="submit" class="btn">Guardar</button></div>' +
    '</form>');

  document.getElementById('cancel').addEventListener('click', closeModal);
  document.getElementById('tax-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      await api(isCategory ? '/categories' : '/diet-tags', {
        method: 'POST',
        body: JSON.stringify({
          id: item ? item.id : undefined,
          slug: item ? item.slug : undefined,
          name: form.name.value.trim(),
          icon: form.icon.value.trim() || null,
          sortOrder: Number(form.sortOrder.value) || 0,
        }),
      });
      toast('Guardado');
      closeModal();
      viewTaxonomy();
    } catch (error) { toast(error.message, true); }
  });
}

// --- Vista: importar y exportar --------------------------------------------

let pendingCsv = null;

function viewImport() {
  main.innerHTML =
    '<div class="page-head"><div><h1>Importar y exportar</h1>' +
    '<p>Cargá muchas recetas de una vez desde una planilla</p></div></div>' +
    '<div class="card" style="margin-bottom:16px">' +
      '<h2 style="font-size:16px;margin-bottom:8px">Cómo funciona</h2>' +
      '<p style="margin:0 0 12px;color:#6B655F;font-size:14px">Descargá la plantilla, completala en tu planilla de cálculo y subila acá. ' +
      'Antes de guardar nada te mostramos un informe con lo que se va a crear, lo que se va a actualizar y los errores a corregir. ' +
      'Si una receta ya existe (misma dirección), se actualiza en lugar de duplicarse.</p>' +
      '<div class="actions">' +
        '<a class="btn btn-ghost" href="/admin/api/csv/template" download>Descargar plantilla</a>' +
        '<a class="btn btn-ghost" href="/admin/api/csv/export" download>Exportar recetas actuales</a>' +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<h2 style="font-size:16px;margin-bottom:12px">Subir archivo</h2>' +
      '<input type="file" id="csv-file" accept=".csv,text/csv">' +
      '<div id="csv-report" class="report"></div>' +
    '</div>';

  document.getElementById('csv-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const content = await file.text();
    pendingCsv = content;

    const report = document.getElementById('csv-report');
    report.innerHTML = '<p style="color:#6B655F">Revisando el archivo…</p>';

    try {
      const result = await api('/csv/validate', { method: 'POST', body: JSON.stringify({ content: content }) });
      renderCsvReport(result);
    } catch (error) {
      report.innerHTML = '<div class="report-line report-error">' + escapeHtml(error.message) + '</div>';
    }
  });
}

function renderCsvReport(result) {
  const report = document.getElementById('csv-report');
  const canImport = result.errors.length === 0 && result.validCount > 0;

  report.innerHTML =
    '<div class="report-line report-ok">Se leyeron ' + result.total + ' filas: ' +
      result.createCount + ' recetas nuevas y ' + result.updateCount + ' actualizaciones.</div>' +
    result.errors.map((issue) =>
      '<div class="report-line report-error">Fila ' + issue.row + ' · ' + escapeHtml(issue.field) + ': ' + escapeHtml(issue.message) + '</div>').join('') +
    result.warnings.map((issue) =>
      '<div class="report-line report-warning">Fila ' + issue.row + ' · ' + escapeHtml(issue.message) + '</div>').join('') +
    (result.preview.length > 0
      ? '<table style="margin-top:12px"><thead><tr><th>Fila</th><th>Receta</th><th>Acción</th></tr></thead><tbody>' +
        result.preview.map((item) =>
          '<tr><td>' + item.row + '</td><td>' + escapeHtml(item.title) + '</td><td>' + item.action + '</td></tr>').join('') +
        '</tbody></table>'
      : '') +
    (canImport
      ? '<button class="btn" id="confirm-import" style="margin-top:16px">Importar ' + result.validCount + ' recetas</button>'
      : '<p style="margin-top:14px;color:#6B655F;font-size:14px">Corregí los errores en la planilla y volvé a subirla.</p>');

  const confirmButton = document.getElementById('confirm-import');
  if (confirmButton) {
    confirmButton.addEventListener('click', async () => {
      confirmButton.disabled = true;
      confirmButton.textContent = 'Importando…';
      try {
        const outcome = await api('/csv/import', { method: 'POST', body: JSON.stringify({ content: pendingCsv }) });
        report.innerHTML =
          '<div class="report-line report-ok">Listo: ' + outcome.created + ' recetas creadas y ' +
          outcome.updated + ' actualizadas.</div>' +
          outcome.failed.map((item) =>
            '<div class="report-line report-error">Fila ' + item.row + ' (' + escapeHtml(item.title) + '): ' + escapeHtml(item.message) + '</div>').join('');
        toast('Importación completada');
      } catch (error) {
        toast(error.message, true);
        confirmButton.disabled = false;
        confirmButton.textContent = 'Reintentar importación';
      }
    });
  }
}

// --- Vista: usuarios -------------------------------------------------------

const MAX_ACTIVE_DEVICES = ${MAX_ACTIVE_LICENSE_DEVICES};
const DEVICE_STATUS_LABELS = {
  active: 'Activo',
  released: 'Liberado',
  revoked: 'Revocado administrativo',
};

function deviceState(device) {
  if (device && device.revokedAt) return 'revoked';
  if (device && device.releasedAt) return 'released';
  return 'active';
}

function deviceStatusLabel(device) {
  return DEVICE_STATUS_LABELS[deviceState(device)];
}

function deviceDisplayName(device) {
  const manufacturer = String(device?.manufacturer ?? '').trim();
  const modelName = String(device?.modelName ?? '').trim();
  const manufacturerLower = manufacturer.toLocaleLowerCase();
  const modelLower = modelName.toLocaleLowerCase();

  if (manufacturer && modelName) {
    // Algunos fabricantes ya incluyen la marca en modelName (p. ej. "Samsung Galaxy …").
    return modelLower.includes(manufacturerLower) ? modelName : manufacturer + ' ' + modelName;
  }
  return manufacturer || modelName || String(device?.deviceLabel ?? '').trim() ||
    String(device?.modelId ?? '').trim() || 'Dispositivo sin modelo';
}

function compactDeviceId(value) {
  const id = String(value ?? '');
  if (!id) return '—';
  return id.length > 8 ? id.slice(0, 4) + '…' + id.slice(-4) : id;
}

function displayDeviceValue(value) {
  const text = String(value ?? '').trim();
  return text || '—';
}

function deviceCardHtml(device) {
  const state = deviceState(device);
  const reactivatable = state === 'revoked' || state === 'released';
  const modelId = String(device?.modelId ?? '').trim();
  const platform = [device?.platform, device?.osVersion]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' · ') || '—';
  const details = state === 'revoked'
    ? '<div style="font-size:12px;color:#C0483A;margin-top:6px">Revocado: ' +
        escapeHtml(formatDateTime(device.revokedAt)) + '</div>' +
      (device.revokedBy
        ? '<div style="font-size:12px;color:#C0483A">Por: ' + escapeHtml(String(device.revokedBy)) + '</div>'
        : '') +
      (device.revokeReason
        ? '<div style="font-size:12px;color:#C0483A">Motivo: ' + escapeHtml(String(device.revokeReason)) + '</div>'
        : '')
    : state === 'released'
      ? '<div style="font-size:12px;color:#6B655F;margin-top:6px">Liberado: ' +
          escapeHtml(formatDateTime(device.releasedAt)) + '</div>'
      : '';

  return '<div style="border:1px solid #E8DFD5;border-radius:10px;padding:12px">' +
    '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">' +
      '<div><strong>' + escapeHtml(deviceDisplayName(device)) + '</strong>' +
        '<div style="font-size:12px;color:#6B655F;word-break:break-all;margin-top:3px"><code>' +
          escapeHtml(compactDeviceId(device?.deviceId)) + '</code></div>' +
      '</div>' +
      '<span class="pill pill-' + (state === 'revoked' ? 'revoked' : state === 'released' ? 'released' : 'active') + '">' +
        escapeHtml(deviceStatusLabel(device)) + '</span>' +
    '</div>' +
    '<div style="font-size:12px;color:#6B655F;margin-top:8px">' +
      'Plataforma: ' + escapeHtml(platform) + '<br>' +
      'App version: ' + escapeHtml(displayDeviceValue(device?.appVersion)) +
      (modelId ? '<br>Modelo Android: ' + escapeHtml(modelId) : '') + '<br>' +
      'Alta: ' + escapeHtml(formatDateTime(device?.registeredAt)) + ' · Último uso: ' +
        escapeHtml(formatDateTime(device?.lastActivityAt)) +
    '</div>' + details +
    '<div style="text-align:right;margin-top:10px;display:flex;justify-content:flex-end;gap:8px">' +
      (state === 'active' || state === 'released'
        ? '<button class="btn btn-danger btn-sm" data-revoke-device="' + escapeHtml(device?.id) + '">Revocar/remover</button>'
        : '') +
      (reactivatable
        ? '<button class="btn btn-ghost btn-sm" data-reactivate-device="' + escapeHtml(device?.id) + '">Reactivar dispositivo</button>'
        : '') +
    '</div>' +
  '</div>';
}

async function viewUsers() {
  main.innerHTML = '<div class="empty">Cargando…</div>';
  const [users, codes] = await Promise.all([api('/users'), api('/codes')]);

  main.innerHTML =
    '<div class="page-head"><div><h1>Usuarios y accesos</h1><p>Quién puede entrar a la aplicación</p></div>' +
    '<div class="actions"><button class="btn btn-ghost" id="bulk">Alta masiva</button>' +
    '<button class="btn" id="grant">Dar acceso</button></div></div>' +
    '<div class="toolbar"><input id="user-search" placeholder="Buscar por correo…"></div>' +
    '<div class="card" style="padding:0;margin-bottom:20px" id="users-table"></div>' +
    (codes.length > 0
      ? '<div class="card"><h2 style="font-size:16px;margin-bottom:6px">Códigos pendientes</h2>' +
        '<p style="margin:0 0 12px;color:#6B655F;font-size:13px">Códigos vigentes que todavía no se usaron. Sirven para ayudar a alguien que no recibe el correo.</p>' +
        '<table><thead><tr><th>Correo</th><th>Código</th><th>Vence</th></tr></thead><tbody>' +
        codes.map((item) =>
          '<tr><td>' + escapeHtml(item.email) + '</td><td><strong>' + escapeHtml(item.code || '—') + '</strong></td>' +
          '<td style="font-size:13px;color:#6B655F">' + escapeHtml(new Date(item.expiresAt).toLocaleString('es-AR')) + '</td></tr>').join('') +
        '</tbody></table></div>'
      : '');

  renderUsersTable(users);
  document.getElementById('grant').addEventListener('click', grantAccess);
  document.getElementById('bulk').addEventListener('click', bulkGrantAccess);

  let debounce;
  document.getElementById('user-search').addEventListener('input', (event) => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const filtered = await api('/users?search=' + encodeURIComponent(event.target.value));
      renderUsersTable(filtered);
    }, 280);
  });
}

function renderUsersTable(users) {
  const container = document.getElementById('users-table');
  if (!container) return;

  if (users.length === 0) {
    container.innerHTML = '<div class="empty">No hay usuarios que coincidan.</div>';
    return;
  }

  container.innerHTML =
    '<div class="users-table-scroll"><table><thead><tr><th>Correo</th><th>Estado</th><th>Acceso</th><th>Origen</th><th>Alta</th><th>Último ingreso</th><th>Dispositivos</th><th></th></tr></thead><tbody>' +
    users.map((user) => {
      const status = String(user.status || 'active');
      const safeStatus = Object.prototype.hasOwnProperty.call(LICENSE_LABELS, status) ? status : 'unknown';
      const accessStatus = String(user.accessStatus || 'unknown');
      const safeAccessPill = ACCESS_PILLS[accessStatus] || 'archived';
      const accessLabel = ACCESS_LABELS[accessStatus] || 'Sin datos';
      const activeDeviceCount = user.activeDeviceCount ?? 0;
      return '<tr><td><strong>' + escapeHtml(user.email) + '</strong></td>' +
      '<td><span class="pill pill-' + safeStatus + '">' + escapeHtml(LICENSE_LABELS[status] || 'Sin datos') + '</span></td>' +
      '<td><span class="pill pill-' + safeAccessPill + '">' + escapeHtml(accessLabel) + '</span></td>' +
      '<td style="font-size:13px;color:#6B655F">' + escapeHtml(user.source || '—') + '</td>' +
      '<td style="font-size:13px;color:#6B655F">' + escapeHtml(formatDate(user.grantedAt)) + '</td>' +
      '<td style="font-size:13px;color:#6B655F;white-space:nowrap">' + escapeHtml(formatDateTime(user.lastLoginAt)) + '</td>' +
      '<td><button class="btn btn-ghost btn-sm" data-devices="' + escapeHtml(user.licenseId) + '" data-email="' + escapeHtml(user.email) + '">' +
        escapeHtml(activeDeviceCount) + '/' + MAX_ACTIVE_DEVICES + ' · Ver</button></td>' +
      '<td style="text-align:right;white-space:nowrap">' +
        (status === 'active'
          ? '<button class="btn btn-danger btn-sm" data-revoke="' + escapeHtml(user.email) + '">Revocar</button>'
          : '<button class="btn btn-ghost btn-sm" data-activate="' + escapeHtml(user.email) + '">Reactivar</button>') +
      '</td></tr>';
    }).join('') +
    '</tbody></table></div>';

  container.querySelectorAll('[data-devices]').forEach((button) => {
    button.addEventListener('click', () => showDevices(Number(button.dataset.devices), button.dataset.email));
  });
  container.querySelectorAll('[data-revoke]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('¿Revocar el acceso de ' + button.dataset.revoke + '? No va a poder entrar en su próximo ingreso.')) return;
      await changeLicense(button.dataset.revoke, 'revoked');
    });
  });

  container.querySelectorAll('[data-activate]').forEach((button) => {
    button.addEventListener('click', () => changeLicense(button.dataset.activate, 'active'));
  });
}

async function showDevices(licenseId, email) {
  try {
    const result = await api('/licenses/' + licenseId + '/devices');
    const devices = result.devices || [];
    const maxActiveDevices = result.maxActiveDevices ?? MAX_ACTIVE_DEVICES;
    const activeCount = result.activeCount ?? 0;

    openModal(
      '<h2>Dispositivos de ' + escapeHtml(email) + '</h2>' +
      '<p style="margin:-8px 0 16px;color:#6B655F;font-size:13px">' +
        escapeHtml(activeCount) + '/' + escapeHtml(maxActiveDevices) +
        ' dispositivos activos. Revocar/remover libera el cupo e impide futuros ingresos en ese dispositivo.</p>' +
      (devices.length === 0
        ? '<div class="empty">Todavía no hay dispositivos registrados. Se agregará uno en el próximo ingreso.</div>'
        : '<div style="display:flex;flex-direction:column;gap:10px">' + devices.map(deviceCardHtml).join('') + '</div>') +
      '<div class="modal-foot"><button type="button" class="btn btn-ghost" id="close-devices">Cerrar</button></div>',
    );
    document.getElementById('close-devices').addEventListener('click', closeModal);
    document.querySelectorAll('[data-revoke-device]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('¿Revocar/remover este dispositivo? Su sesión queda inválida de inmediato y no podrá volver a iniciar sesión.')) return;
        button.disabled = true;
        try {
          await api('/licenses/' + licenseId + '/devices/' + button.dataset.revokeDevice + '/revoke', {
            method: 'POST',
            body: JSON.stringify({ reason: 'Revocado manualmente desde /admin' }),
          });
          toast('Dispositivo revocado y sesión invalidada');
          await showDevices(licenseId, email);
        } catch (error) {
          button.disabled = false;
          toast(error.message, true);
        }
      });
    });
    document.querySelectorAll('[data-reactivate-device]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('¿Reactivar este dispositivo? Solo se puede si la licencia tiene menos de ' + maxActiveDevices +
          ' activos. La persona deberá iniciar sesión de nuevo; no se restaura ninguna sesión anterior.')) return;
        button.disabled = true;
        try {
          await api('/licenses/' + licenseId + '/devices/' + button.dataset.reactivateDevice + '/reactivate', {
            method: 'POST',
          });
          toast('Dispositivo reactivado. Requiere un nuevo inicio de sesión; no se restauró la sesión anterior.');
          await showDevices(licenseId, email);
        } catch (error) {
          button.disabled = false;
          toast(error.message, true);
        }
      });
    });
  } catch (error) {
    toast(error.message, true);
  }
}

async function changeLicense(email, status) {
  try {
    await api('/licenses/status', { method: 'POST', body: JSON.stringify({ email: email, status: status }) });
    toast(status === 'active' ? 'Acceso reactivado' : 'Acceso revocado');
    viewUsers();
  } catch (error) { toast(error.message, true); }
}

function grantAccess() {
  openModal(
    '<h2>Dar acceso</h2>' +
    '<form id="grant-form">' +
      '<div class="field"><label>Correo</label><input name="email" type="email" required autofocus>' +
      '<span class="hint">La persona va a poder entrar con este correo pidiendo un código.</span></div>' +
      '<div class="field"><label>Nota interna</label><input name="notes" placeholder="Por ejemplo: compra manual, regalo, prueba"></div>' +
      '<div class="modal-foot"><button type="button" class="btn btn-ghost" id="cancel">Cancelar</button>' +
      '<button type="submit" class="btn">Dar acceso</button></div>' +
    '</form>');

  document.getElementById('cancel').addEventListener('click', closeModal);
  document.getElementById('grant-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/licenses', {
        method: 'POST',
        body: JSON.stringify({
          email: event.target.email.value.trim(),
          notes: event.target.notes.value.trim() || null,
        }),
      });
      toast('Acceso otorgado');
      closeModal();
      viewUsers();
    } catch (error) { toast(error.message, true); }
  });
}

/**
 * Alta masiva: se pega una lista de correos y se otorga acceso a todos.
 *
 * El resultado se muestra en la misma ventana en lugar de un aviso pasajero,
 * porque con decenas de correos importa poder revisar qué pasó con cada uno.
 */
function bulkGrantAccess() {
  openModal(
    '<h2>Alta masiva de accesos</h2>' +
    '<form id="bulk-form">' +
      '<div class="field"><label>Correos</label>' +
      '<textarea name="emails" rows="9" required autofocus placeholder="uno@ejemplo.com&#10;dos@ejemplo.com&#10;tres@ejemplo.com"></textarea>' +
      '<span class="hint">Uno por línea. También acepta separados por comas. Se ignoran las líneas vacías, ' +
      'se pasan a minúsculas y se quitan los espacios. Máximo 500 por operación.</span></div>' +
      '<div class="field"><label>Etiqueta de origen</label>' +
      '<input name="label" list="bulk-labels" placeholder="closed-test-google-play">' +
      '<datalist id="bulk-labels">' +
        '<option value="closed-test-google-play">' +
        '<option value="prueba-interna">' +
        '<option value="regalo">' +
        '<option value="campaña">' +
      '</datalist>' +
      '<span class="hint">Queda guardada en la nota de cada licencia, para poder identificarlas después.</span></div>' +
      '<div id="bulk-result"></div>' +
      '<div class="modal-foot"><button type="button" class="btn btn-ghost" id="cancel">Cerrar</button>' +
      '<button type="submit" class="btn" id="bulk-submit">Dar acceso a todos</button></div>' +
    '</form>');

  document.getElementById('cancel').addEventListener('click', () => { closeModal(); viewUsers(); });
  document.getElementById('bulk-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.getElementById('bulk-submit');
    button.disabled = true;
    button.textContent = 'Procesando…';

    try {
      const result = await api('/licenses/bulk', {
        method: 'POST',
        body: JSON.stringify({
          emails: event.target.emails.value,
          label: event.target.label.value.trim() || null,
        }),
      });
      renderBulkResult(result);
      toast('Alta masiva completada');
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = 'Dar acceso a todos';
    }
  });
}

function renderBulkResult(result) {
  const container = document.getElementById('bulk-result');
  if (!container) return;

  const problems = (result.entries || []).filter((entry) =>
    entry.outcome === 'invalid' || entry.outcome === 'duplicate');

  container.innerHTML =
    '<div class="card" style="margin:16px 0 4px;background:#FAF8F5">' +
      '<h2 style="font-size:15px;margin:0 0 10px">Resultado</h2>' +
      '<table style="margin:0"><tbody>' +
        bulkRow('Accesos creados', result.created) +
        (result.reactivated > 0 ? bulkRow('Accesos restablecidos', result.reactivated) : '') +
        bulkRow('Ya tenían acceso', result.existing) +
        bulkRow('Repetidos en la lista', result.duplicates) +
        bulkRow('Correos inválidos', result.invalid) +
      '</tbody></table>' +
      (problems.length > 0
        ? '<p style="margin:12px 0 4px;font-size:13px;color:#6B655F">Sin procesar:</p>' +
          '<ul style="margin:0;padding-left:18px;font-size:13px;color:#6B655F">' +
          problems.slice(0, 25).map((entry) =>
            '<li>' + escapeHtml(entry.email) + ' — ' + escapeHtml(entry.reason || '') + '</li>').join('') +
          (problems.length > 25 ? '<li>… y ' + (problems.length - 25) + ' más</li>' : '') +
          '</ul>'
        : '') +
    '</div>';
}

function bulkRow(label, value) {
  return '<tr><td style="border:0;padding:4px 0">' + label + '</td>' +
    '<td style="border:0;padding:4px 0;text-align:right"><strong>' + (value || 0) + '</strong></td></tr>';
}

// --- Vista: reconciliación Shopify -----------------------------------------

const SHOPIFY_RESULT_LABELS = {
  license_created: 'Licencia creada',
  license_reactivated: 'Licencia reactivada',
  license_existing: 'Licencia ya activa',
  already_processed: 'Pedido ya procesado',
  not_paid: 'Pedido no pagado',
  product_not_authorized: 'Producto no válido',
  order_not_found: 'Pedido no encontrado',
  email_unavailable: 'Email no disponible',
  processing: 'Procesamiento en curso',
  error: 'Error',
};

function shopifyEmailLabel(item) {
  if (item.deliveryEmailStatus === 'sent') return 'Email enviado';
  if (item.deliveryEmailStatus === 'failed') {
    return 'Error de envío' + (item.deliveryEmailError ? ': ' + item.deliveryEmailError : '');
  }
  if (item.deliveryEmailStatus === 'sending') return 'Email en curso';
  if (item.deliveryEmailStatus === 'pending') return 'Email pendiente';
  if (item.result === 'license_existing' || item.result === 'already_processed') {
    return 'Sin nuevo email';
  }
  return '—';
}

function renderShopifyReconciliationResult(result) {
  const container = document.getElementById('shopify-result');
  if (!container) return;
  const items = result.items || [];
  container.innerHTML =
    '<div class="card" style="margin-top:20px">' +
      '<h2 style="font-size:16px;margin:0 0 10px">Resultado</h2>' +
      '<p style="margin:0 0 14px;color:#6B655F;font-size:13px">' +
        'Revisados: <strong>' + (result.scanned || 0) + '</strong> · ' +
        'Procesados: <strong>' + (result.processed || 0) + '</strong> · ' +
        'Ya procesados: <strong>' + (result.duplicates || 0) + '</strong> · ' +
        'Errores: <strong>' + (result.errors || 0) + '</strong>' +
      '</p>' +
      (items.length === 0
        ? '<div class="empty">No se encontraron pedidos para reconciliar.</div>'
        : '<div style="overflow-x:auto"><table style="min-width:780px"><thead><tr>' +
          '<th>Pedido</th><th>Email</th><th>Producto</th><th>Resultado</th><th>Email de entrega</th>' +
          '</tr></thead><tbody>' +
          items.map((item) =>
            '<tr><td><strong>' + escapeHtml(item.orderName || item.orderId || '—') + '</strong>' +
              (item.orderId ? '<br><span class="muted">' + escapeHtml(item.orderId) + '</span>' : '') +
            '</td><td>' + escapeHtml(item.email || '—') + '</td>' +
            '<td>' + escapeHtml(item.productId || '—') + '</td>' +
            '<td>' + escapeHtml(SHOPIFY_RESULT_LABELS[item.result] || item.result) + '</td>' +
            '<td>' + escapeHtml(shopifyEmailLabel(item)) + '</td></tr>'
          ).join('') +
          '</tbody></table></div>') +
    '</div>';
}

function shopifyMonitorAlertLabel(run) {
  if (!run) return '—';
  const labels = {
    not_required: 'No requerida',
    pending: 'Enviando',
    sent: 'Enviada',
    suppressed: 'Suprimida por cooldown',
    failed: 'Falló el email',
    not_configured: 'Email no configurado',
  };
  return labels[run.alertStatus] || run.alertStatus || '—';
}

function renderShopifyMonitoringRuns(runs) {
  if (!runs || runs.length === 0) {
    return '<div class="empty">Todavía no hay corridas automáticas monitoreadas.</div>';
  }
  return '<div style="overflow-x:auto"><table style="min-width:760px"><thead><tr>' +
    '<th>Inicio</th><th>Resultado</th><th>Consultados</th><th>Nuevos</th><th>Ya procesados</th><th>Errores</th><th>Duración</th><th>Alerta</th>' +
    '</tr></thead><tbody>' +
    runs.slice(0, 10).map((run) =>
      '<tr><td>' + escapeHtml(formatDateTime(run.startedAt)) + '</td>' +
      '<td><strong>' + escapeHtml(run.status === 'success' ? 'OK' : run.status === 'error' ? 'ERROR' : run.status === 'skipped' ? 'OMITIDA' : 'EN CURSO') + '</strong>' +
        (run.trigger === 'simulation' ? '<br><span class="muted">Simulación segura</span>' : '') + '</td>' +
      '<td>' + (run.scanned || 0) + '</td><td>' + (run.processed || 0) + '</td>' +
      '<td>' + (run.duplicates || 0) + '</td><td>' + (run.errors || 0) + '</td>' +
      '<td>' + (run.durationMs == null ? '—' : escapeHtml(String(run.durationMs) + ' ms')) + '</td>' +
      '<td>' + escapeHtml(shopifyMonitorAlertLabel(run)) + '</td></tr>'
    ).join('') +
    '</tbody></table></div>';
}

async function viewShopifyReconciliation() {
  main.innerHTML = '<div class="empty">Cargando…</div>';
  const status = await api('/shopify/reconciliation/status');
  const monitoring = status.monitoring || {};
  const latest = monitoring.latest || null;
  const lastSuccess = monitoring.lastSuccess || null;
  const lastError = monitoring.lastError || null;
  const health = monitoring.health || 'PENDING';
  const lastRun = status.lastCompletedAt
    ? formatDateTime(status.lastCompletedAt) + ' · ' + escapeHtml(status.lastStatus || '—')
    : 'Todavía no se ejecutó';

  main.innerHTML =
    '<div class="page-head"><div><h1>Reconciliar Shopify</h1>' +
      '<p>Recuperá pedidos pagados que no hayan llegado por webhook</p></div></div>' +
    (!status.configured
      ? '<div class="notice">La Shopify Admin API todavía no está configurada.</div>'
      : '') +
    '<div class="stats">' +
      stat(status.intervalMinutes || 5, 'Intervalo automático (min)') +
      stat(status.lastProcessed || 0, 'Procesados en la última corrida') +
      stat(status.lastErrors || 0, 'Errores en la última corrida') +
    '</div>' +
    '<div class="card" style="margin-bottom:20px">' +
      '<h2 style="font-size:16px;margin:0 0 8px">Estado automático</h2>' +
      '<p style="margin:0;color:#6B655F;font-size:14px">Última ejecución: ' + lastRun + '</p>' +
      '<p style="margin:6px 0 0;color:#6B655F;font-size:14px">Cron: ' +
        (status.scheduleCronTaskUid ? 'activo' : 'pendiente de programar') + '</p>' +
    '</div>' +
    '<div class="card" style="margin-bottom:20px">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
        '<div><h2 style="font-size:16px;margin:0 0 8px">Estado de reconciliación Shopify</h2>' +
          '<p style="margin:0;color:#6B655F;font-size:14px">Monitoreo exclusivo de las ejecuciones automáticas cada cinco minutos.</p></div>' +
        '<strong style="padding:6px 10px;border-radius:999px;background:' +
          (health === 'OK' ? '#E8F5E9;color:#1B5E20' : health === 'ERROR' ? '#FDECEC;color:#9B1C1C' : '#F2EFEA;color:#6B655F') + '">' +
          escapeHtml(health) + '</strong>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-top:16px">' +
        '<div><span class="muted">Última ejecución</span><br><strong>' + escapeHtml(latest ? formatDateTime(latest.completedAt || latest.startedAt) : '—') + '</strong></div>' +
        '<div><span class="muted">Última ejecución exitosa</span><br><strong>' + escapeHtml(lastSuccess ? formatDateTime(lastSuccess.completedAt) : '—') + '</strong></div>' +
        '<div><span class="muted">Pedidos procesados</span><br><strong>' + (latest ? latest.processed || 0 : 0) + '</strong></div>' +
        '<div><span class="muted">Próxima ejecución aproximada</span><br><strong>' + escapeHtml(formatDateTime(monitoring.nextExecutionAt)) + '</strong></div>' +
      '</div>' +
      '<div style="margin-top:14px;padding-top:14px;border-top:1px solid #E7E1DA">' +
        '<span class="muted">Último error</span><br>' +
        (lastError
          ? '<strong>' + escapeHtml(formatDateTime(lastError.completedAt)) + '</strong><div style="margin-top:4px;color:#9B1C1C">' + escapeHtml(lastError.technicalMessage || 'Error sin detalle') + '</div>'
          : '<strong>—</strong>') +
      '</div>' +
      '<div style="margin-top:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
        '<button class="btn secondary" id="simulate-shopify-alert">Probar alerta sin tocar pedidos</button>' +
        '<span class="muted">Email de alertas: ' + (monitoring.alertConfigured ? 'configurado' : 'pendiente de configurar') +
          ' · cooldown ' + Math.round((monitoring.alertCooldownMinutes || 360) / 60) + ' h</span>' +
      '</div>' +
      '<h3 style="font-size:14px;margin:20px 0 10px">Últimas corridas monitoreadas</h3>' +
      renderShopifyMonitoringRuns(monitoring.recentRuns || []) +
    '</div>' +
    '<div class="card" style="margin-bottom:20px">' +
      '<h2 style="font-size:16px;margin:0 0 8px">Pedidos pagados recientes</h2>' +
      '<p style="margin:0 0 14px;color:#6B655F;font-size:14px">Busca los últimos siete días y procesa únicamente lo que todavía no esté auditado.</p>' +
      '<button class="btn" id="reconcile-recent">Buscar y reconciliar</button>' +
    '</div>' +
    '<div class="card">' +
      '<h2 style="font-size:16px;margin:0 0 8px">Pedido específico</h2>' +
      '<form id="reconcile-order-form" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">' +
        '<div class="field" style="flex:1;min-width:220px;margin:0"><label>Order ID o número visible</label>' +
        '<input name="identifier" required placeholder="7719707640106 o #31002"></div>' +
        '<button class="btn" type="submit">Reconciliar pedido</button>' +
      '</form>' +
    '</div>' +
    '<div id="shopify-result"></div>';

  document.getElementById('simulate-shopify-alert').addEventListener('click', async (event) => {
    if (!confirm('Esta prueba registra un error simulado y envía una alerta administrativa. No consulta Shopify ni modifica pedidos, licencias o emails de entrega. ¿Continuar?')) return;
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Probando alerta…';
    try {
      const result = await api('/shopify/reconciliation/monitoring/simulate-error', { method: 'POST', body: '{}' });
      toast(result.run && result.run.alertStatus === 'sent' ? 'Alerta de prueba enviada' : 'Simulación registrada: ' + shopifyMonitorAlertLabel(result.run));
      await viewShopifyReconciliation();
    } catch (error) {
      toast(error.message, true);
      button.disabled = false;
      button.textContent = 'Probar alerta sin tocar pedidos';
    }
  });

  document.getElementById('reconcile-recent').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Reconciliando…';
    try {
      const result = await api('/shopify/reconciliation/recent', { method: 'POST', body: '{}' });
      renderShopifyReconciliationResult(result);
      toast('Reconciliación completada');
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = 'Buscar y reconciliar';
    }
  });

  document.getElementById('reconcile-order-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    const identifier = new FormData(form).get('identifier');
    button.disabled = true;
    button.textContent = 'Reconciliando…';
    try {
      const result = await api('/shopify/reconciliation/order', {
        method: 'POST',
        body: JSON.stringify({ identifier }),
      });
      renderShopifyReconciliationResult(result);
      toast('Pedido revisado');
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = 'Reconciliar pedido';
    }
  });
}

// --- Navegación ------------------------------------------------------------

const VIEWS = {
  dashboard: viewDashboard,
  recipes: viewRecipes,
  collections: viewCollections,
  taxonomy: viewTaxonomy,
  import: viewImport,
  shopify: viewShopifyReconciliation,
  users: viewUsers,
};

document.querySelectorAll('.nav-item[data-view]').forEach((button) => {
  button.addEventListener('click', async () => {
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    try {
      await VIEWS[button.dataset.view]();
    } catch (error) {
      main.innerHTML = '<div class="empty">' + escapeHtml(error.message) + '</div>';
    }
  });
});

document.getElementById('logout').addEventListener('click', async () => {
  await fetch('/admin/api/logout', { method: 'POST' });
  window.location.href = '/admin/login';
});

viewDashboard().catch((error) => {
  main.innerHTML = '<div class="empty">' + escapeHtml(error.message) + '</div>';
});
`;
