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
    .replace(/"/g, '&quot;');
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

function statusPill(status) {
  return '<span class="pill pill-' + status + '">' + (STATUS_LABELS[status] || status) + '</span>';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
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
    nutrition: null, tips: '', imageKey: '', thumbKey: '', featured: false, status: 'draft',
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
        '<button type="button" class="btn btn-ghost btn-sm" id="add-ingredient" style="margin-top:8px;align-self:flex-start">Agregar ingrediente</button></div>' +
      '<div class="field"><label>Pasos</label><div class="dyn-list" id="steps"></div>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="add-step" style="margin-top:8px;align-self:flex-start">Agregar paso</button></div>' +
      '<div class="field"><label>Consejos</label><textarea name="tips">' + escapeHtml(data.tips || '') + '</textarea></div>' +
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

  function addIngredient(value) {
    const row = document.createElement('div');
    row.className = 'dyn-row';
    row.innerHTML =
      '<input placeholder="Ingrediente" value="' + escapeHtml(value?.name || '') + '">' +
      '<input placeholder="Cant." type="number" step="0.01" value="' + (value?.quantity ?? '') + '">' +
      '<input placeholder="Unidad" value="' + escapeHtml(value?.unit || 'unidad') + '">' +
      '<button type="button" class="icon-btn">×</button>';
    row.querySelector('button').addEventListener('click', () => row.remove());
    ingredientsBox.appendChild(row);
  }

  function addStep(value) {
    const row = document.createElement('div');
    row.className = 'dyn-row-step';
    row.innerHTML =
      '<textarea rows="2" placeholder="Describí el paso">' + escapeHtml(value?.description || '') + '</textarea>' +
      '<button type="button" class="icon-btn">×</button>';
    row.querySelector('button').addEventListener('click', () => row.remove());
    stepsBox.appendChild(row);
  }

  (data.ingredients || []).forEach(addIngredient);
  (data.steps || []).forEach(addStep);

  document.getElementById('add-ingredient').addEventListener('click', () => addIngredient(null));
  document.getElementById('add-step').addEventListener('click', () => addStep(null));
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
      return {
        name: inputs[0].value.trim(),
        quantity: inputs[1].value === '' ? null : Number(inputs[1].value),
        unit: inputs[2].value.trim() || 'unidad',
      };
    }).filter((item) => item.name.length > 0);

    const steps = Array.from(stepsBox.children).map((row) => ({
      description: row.querySelector('textarea').value.trim(),
    })).filter((item) => item.description.length > 0);

    if (ingredients.length === 0) { toast('Cargá al menos un ingrediente.', true); return; }
    if (steps.length === 0) { toast('Cargá al menos un paso.', true); return; }

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
      '<div class="field"><label>Nombre</label><input name="name" value="' + escapeHtml(data.name) + '" required></div>' +
      '<div class="field"><label>Frase corta</label><input name="tagline" value="' + escapeHtml(data.tagline || '') + '"></div>' +
      '<div class="field"><label>Descripción</label><textarea name="description">' + escapeHtml(data.description || '') + '</textarea></div>' +
      '<div class="row-2">' +
        '<div class="field"><label>Imagen de portada (URL)</label><input name="imageKey" value="' + escapeHtml(data.imageKey || '') + '"></div>' +
        '<div class="field"><label>Orden</label><input name="sortOrder" type="number" value="' + (data.sortOrder ?? 0) + '"></div>' +
      '</div>' +
      '<div class="field"><label style="display:flex;align-items:center;gap:8px;font-weight:500">' +
        '<input type="checkbox" name="published"' + (data.published ? ' checked' : '') + '> Visible en la aplicación</label></div>' +
      '<div class="modal-foot"><button type="button" class="btn btn-ghost" id="cancel">Cancelar</button>' +
      '<button type="submit" class="btn">Guardar</button></div>' +
    '</form>');

  document.getElementById('cancel').addEventListener('click', closeModal);
  document.getElementById('collection-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      await api('/collections', {
        method: 'POST',
        body: JSON.stringify({
          id: item ? item.id : undefined,
          slug: item ? item.slug : undefined,
          name: form.name.value.trim(),
          tagline: form.tagline.value.trim() || null,
          description: form.description.value.trim() || null,
          imageKey: form.imageKey.value.trim() || null,
          sortOrder: Number(form.sortOrder.value) || 0,
          published: form.published.checked,
        }),
      });
      toast('Colección guardada');
      closeModal();
      viewCollections();
    } catch (error) { toast(error.message, true); }
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

async function viewUsers() {
  main.innerHTML = '<div class="empty">Cargando…</div>';
  const [users, codes] = await Promise.all([api('/users'), api('/codes')]);

  main.innerHTML =
    '<div class="page-head"><div><h1>Usuarios y accesos</h1><p>Quién puede entrar a la aplicación</p></div>' +
    '<div class="actions"><button class="btn" id="grant">Dar acceso</button></div></div>' +
    '<div class="toolbar"><input id="user-search" placeholder="Buscar por correo…"></div>' +
    '<div class="card" style="padding:0;margin-bottom:20px" id="users-table"></div>' +
    (codes.length > 0
      ? '<div class="card"><h2 style="font-size:16px;margin-bottom:6px">Códigos pendientes</h2>' +
        '<p style="margin:0 0 12px;color:#6B655F;font-size:13px">Códigos vigentes que todavía no se usaron. Sirven para ayudar a alguien que no recibe el correo.</p>' +
        '<table><thead><tr><th>Correo</th><th>Código</th><th>Vence</th></tr></thead><tbody>' +
        codes.map((item) =>
          '<tr><td>' + escapeHtml(item.email) + '</td><td><strong>' + escapeHtml(item.code || '—') + '</strong></td>' +
          '<td style="font-size:13px;color:#6B655F">' + new Date(item.expiresAt).toLocaleString('es-AR') + '</td></tr>').join('') +
        '</tbody></table></div>'
      : '');

  renderUsersTable(users);
  document.getElementById('grant').addEventListener('click', grantAccess);

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
    '<table><thead><tr><th>Correo</th><th>Estado</th><th>Origen</th><th>Alta</th><th>Último ingreso</th><th></th></tr></thead><tbody>' +
    users.map((user) =>
      '<tr><td><strong>' + escapeHtml(user.email) + '</strong></td>' +
      '<td><span class="pill pill-' + (user.status || 'active') + '">' + (LICENSE_LABELS[user.status] || user.status || '—') + '</span></td>' +
      '<td style="font-size:13px;color:#6B655F">' + escapeHtml(user.source || '—') + '</td>' +
      '<td style="font-size:13px;color:#6B655F">' + formatDate(user.grantedAt) + '</td>' +
      '<td style="font-size:13px;color:#6B655F">' + formatDate(user.lastSeenAt) + '</td>' +
      '<td style="text-align:right;white-space:nowrap">' +
        (user.status === 'active'
          ? '<button class="btn btn-danger btn-sm" data-revoke="' + escapeHtml(user.email) + '">Revocar</button>'
          : '<button class="btn btn-ghost btn-sm" data-activate="' + escapeHtml(user.email) + '">Reactivar</button>') +
      '</td></tr>').join('') +
    '</tbody></table>';

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

// --- Navegación ------------------------------------------------------------

const VIEWS = {
  dashboard: viewDashboard,
  recipes: viewRecipes,
  collections: viewCollections,
  taxonomy: viewTaxonomy,
  import: viewImport,
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
