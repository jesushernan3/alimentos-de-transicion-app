/**
 * Interfaz HTML del panel administrativo.
 *
 * Se sirve como una única página con JavaScript propio, sin framework ni paso
 * de compilación: el panel es una herramienta interna acotada, y mantenerla
 * como HTML plano evita sumar un segundo build al proyecto y hace que el
 * despliegue sea idéntico al del servidor.
 */

import { createHash } from "node:crypto";

import { ADMIN_CLIENT_JS } from "./admin-client";

/**
 * Marca de versión del script del panel, derivada de su propio contenido.
 *
 * Se calcula una sola vez al arrancar: si el panel cambia, la marca cambia con
 * él y el navegador pide el archivo nuevo; si no cambia, la dirección se
 * mantiene y la copia guardada sigue sirviendo.
 */
const ADMIN_ASSET_VERSION = createHash("sha1")
  .update(ADMIN_CLIENT_JS)
  .digest("hex")
  .slice(0, 10);

const BRAND = {
  coral: "#E5714A",
  coralSoft: "#F58A62",
  ink: "#2F2A26",
  muted: "#6B655F",
  cream: "#FBF7F2",
  surface: "#FFFFFF",
  border: "#E8DFD5",
  green: "#4F7A4A",
  red: "#C0483A",
  amber: "#C98A18",
};

const BASE_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: ${BRAND.cream};
    color: ${BRAND.ink};
    font-size: 15px;
    line-height: 1.55;
  }
  h1, h2, h3 { margin: 0; line-height: 1.3; }
  button { font: inherit; cursor: pointer; }
  input, select, textarea { font: inherit; color: inherit; }
  a { color: ${BRAND.coral}; }
  .btn {
    border: none;
    border-radius: 10px;
    padding: 9px 16px;
    background: ${BRAND.coral};
    color: #fff;
    font-weight: 600;
    transition: opacity .15s;
  }
  .btn:hover { opacity: .88; }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .btn-ghost {
    background: transparent;
    color: ${BRAND.ink};
    border: 1px solid ${BRAND.border};
  }
  .btn-danger { background: ${BRAND.red}; }
  .btn-sm { padding: 5px 11px; font-size: 13px; border-radius: 8px; }
  .field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
  .field label { font-size: 13px; font-weight: 600; color: ${BRAND.muted}; }
  .field input, .field select, .field textarea {
    padding: 9px 12px;
    border: 1px solid ${BRAND.border};
    border-radius: 9px;
    background: #fff;
  }
  .field textarea { min-height: 90px; resize: vertical; }
  .field .hint { font-size: 12px; color: ${BRAND.muted}; }
  .card {
    background: ${BRAND.surface};
    border: 1px solid ${BRAND.border};
    border-radius: 14px;
    padding: 20px;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid ${BRAND.border}; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: .5px; color: ${BRAND.muted}; }
  tbody tr:hover { background: ${BRAND.cream}; }
  .pill {
    display: inline-block;
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  }
  .pill-published { background: #E7F1E6; color: ${BRAND.green}; }
  .pill-draft { background: #FDF2DC; color: ${BRAND.amber}; }
  .pill-archived { background: #EFEAE4; color: ${BRAND.muted}; }
  .pill-active { background: #E7F1E6; color: ${BRAND.green}; }
  .pill-revoked, .pill-refunded { background: #FBE9E6; color: ${BRAND.red}; }
  .empty { padding: 40px 20px; text-align: center; color: ${BRAND.muted}; }
  .toast {
    position: fixed;
    right: 20px;
    bottom: 20px;
    padding: 12px 18px;
    border-radius: 10px;
    background: ${BRAND.ink};
    color: #fff;
    font-size: 14px;
    opacity: 0;
    transform: translateY(8px);
    transition: all .2s;
    pointer-events: none;
    z-index: 100;
    max-width: 380px;
  }
  .toast.show { opacity: 1; transform: translateY(0); }
  .toast.error { background: ${BRAND.red}; }
`;

/** Página de ingreso al panel. */
function loginPage(configured: boolean): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Panel · Alimentos de Transición</title>
<style>
${BASE_STYLES}
  .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
  .box { width: 100%; max-width: 360px; }
  .logo {
    width: 66px; height: 66px; border-radius: 50%;
    background: ${BRAND.coral}; color: #fff;
    display: grid; place-items: center;
    font-size: 22px; font-weight: 800; letter-spacing: -.5px;
    margin: 0 auto 18px;
  }
  .title { text-align: center; margin-bottom: 4px; font-size: 21px; }
  .sub { text-align: center; color: ${BRAND.muted}; font-size: 14px; margin-bottom: 22px; }
  .error { color: ${BRAND.red}; font-size: 13px; min-height: 19px; margin-top: 8px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="box">
    <div class="logo">AdT</div>
    <h1 class="title">Panel de contenido</h1>
    <p class="sub">Alimentos de Transición</p>
    <div class="card">
      ${
        configured
          ? `<form id="form">
        <div class="field">
          <label for="password">Contraseña</label>
          <input id="password" type="password" autocomplete="current-password" autofocus>
        </div>
        <button class="btn" type="submit" style="width:100%">Entrar</button>
        <div class="error" id="error"></div>
      </form>`
          : `<p style="margin:0;color:${BRAND.muted}">El panel todavía no tiene contraseña configurada. Definí la variable <code>ADMIN_PASSWORD</code> en el servidor para poder ingresar.</p>`
      }
    </div>
  </div>
</div>
<script>
  const form = document.getElementById('form');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = document.getElementById('error');
      error.textContent = '';
      const response = await fetch('/admin/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: document.getElementById('password').value }),
      });
      if (response.ok) { window.location.href = '/admin'; return; }
      const data = await response.json().catch(() => ({}));
      error.textContent = data.error || 'No pudimos verificar la contraseña.';
    });
  }
</script>
</body>
</html>`;
}

/** Aplicación del panel: navegación lateral y vistas. */
function appPage(): string {
  // Marca de versión en la dirección del script: cuando el panel cambia, la
  // dirección cambia con él y el navegador descarga la versión nueva en lugar
  // de reutilizar la que tenía guardada.
  const assetVersion = ADMIN_ASSET_VERSION;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Panel · Alimentos de Transición</title>
<style>
${BASE_STYLES}
  .layout { display: grid; grid-template-columns: 232px 1fr; min-height: 100vh; }
  .sidebar {
    background: ${BRAND.surface};
    border-right: 1px solid ${BRAND.border};
    padding: 20px 14px;
    display: flex; flex-direction: column; gap: 4px;
    position: sticky; top: 0; height: 100vh;
  }
  .brand { display: flex; align-items: center; gap: 10px; padding: 0 8px 18px; }
  .brand .mark {
    width: 34px; height: 34px; border-radius: 50%;
    background: ${BRAND.coral}; color: #fff;
    display: grid; place-items: center; font-weight: 800; font-size: 13px;
  }
  .brand .name { font-weight: 700; font-size: 14px; line-height: 1.25; }
  .nav-item {
    display: block; width: 100%; text-align: left;
    padding: 9px 12px; border-radius: 9px;
    background: transparent; border: none; color: ${BRAND.ink};
    font-size: 14px;
  }
  .nav-item:hover { background: ${BRAND.cream}; }
  .nav-item.active { background: ${BRAND.coral}; color: #fff; font-weight: 600; }
  .nav-spacer { flex: 1; }
  .main { padding: 26px 30px 60px; overflow-x: hidden; }
  .page-head {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px; margin-bottom: 20px;
  }
  .page-head h1 { font-size: 24px; }
  .page-head p { margin: 3px 0 0; color: ${BRAND.muted}; font-size: 14px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 22px; }
  .stat { background: ${BRAND.surface}; border: 1px solid ${BRAND.border}; border-radius: 12px; padding: 15px; }
  .stat .value { font-size: 26px; font-weight: 700; }
  .stat .label { font-size: 13px; color: ${BRAND.muted}; }
  .toolbar { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
  .toolbar input, .toolbar select {
    padding: 8px 12px; border: 1px solid ${BRAND.border}; border-radius: 9px; background: #fff;
  }
  .toolbar input { flex: 1; min-width: 200px; }
  .bulk-bar {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 12px 14px; margin-bottom: 10px;
    background: #FFF8F3; border: 1px solid ${BRAND.border}; border-radius: 10px;
  }
  .bulk-bar .bulk-scope { color: ${BRAND.muted}; font-size: 12px; margin-right: auto; }
  .bulk-bar .actions { margin-left: auto; }
  .bulk-bar[hidden] { display: none; }
  .modal-backdrop {
    position: fixed; inset: 0; background: rgba(47,42,38,.45);
    display: none; align-items: flex-start; justify-content: center;
    padding: 32px 20px; overflow-y: auto; z-index: 50;
  }
  .modal-backdrop.open { display: flex; }
  .modal {
    background: #fff; border-radius: 16px; width: 100%; max-width: 720px;
    padding: 24px; margin: auto 0;
  }
  .modal h2 { font-size: 19px; margin-bottom: 16px; }
  .modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
  .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .row-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .report { margin-top: 16px; }
  .report-line { padding: 7px 10px; border-radius: 8px; font-size: 13px; margin-bottom: 5px; }
  .report-error { background: #FBE9E6; color: ${BRAND.red}; }
  .report-warning { background: #FDF2DC; color: ${BRAND.amber}; }
  .report-ok { background: #E7F1E6; color: ${BRAND.green}; }
  .notice {
    background: #FDF2DC; color: ${BRAND.amber};
    padding: 11px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 16px;
  }
  .dyn-list { display: flex; flex-direction: column; gap: 8px; }
  .dyn-row { display: grid; grid-template-columns: 1fr 90px 100px 32px; gap: 8px; align-items: center; }
  .dyn-row-step { display: grid; grid-template-columns: 1fr 32px; gap: 8px; align-items: start; }
  .dyn-row input, .dyn-row textarea, .dyn-row-step textarea {
    padding: 8px 10px; border: 1px solid ${BRAND.border}; border-radius: 8px; width: 100%;
  }
  .recipe-ingredient-entry { grid-template-columns: minmax(0, 1fr) 90px 100px auto; }
  .recipe-ingredient-entry > input { min-width: 0; }
  .recipe-ingredient-entry > input:nth-of-type(4) { grid-column: 1 / 3; grid-row: 2; }
  .recipe-ingredient-entry > input:nth-of-type(5) { grid-column: 3; grid-row: 2; }
  .recipe-ingredient-entry > .dyn-row-actions { grid-column: 4; grid-row: 1 / span 2; }
  .recipe-step-entry { grid-template-columns: minmax(0, 1fr) 120px auto; }
  .recipe-step-entry > .step-number { grid-column: 1 / -1; }
  .recipe-step-entry > textarea { grid-column: 1; min-width: 0; }
  .recipe-step-entry > input { grid-column: 2; min-width: 0; }
  .recipe-step-entry > .dyn-row-actions { grid-column: 3; }
  .recipe-group-entry { grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
  .recipe-group-entry > input { min-width: 0; font-weight: 600; }
  .icon-btn {
    width: 32px; height: 32px; border-radius: 8px;
    border: 1px solid ${BRAND.border}; background: #fff; color: ${BRAND.red};
    display: grid; place-items: center; font-size: 16px; line-height: 1;
  }
  .checks { display: flex; flex-wrap: wrap; gap: 8px; }
  .checks label {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 11px; border: 1px solid ${BRAND.border}; border-radius: 999px;
    font-size: 13px; font-weight: 500; color: ${BRAND.ink}; cursor: pointer;
  }
  @media (max-width: 860px) {
    .layout { grid-template-columns: 1fr; }
    .sidebar { position: static; height: auto; flex-direction: row; overflow-x: auto; }
    .nav-spacer { display: none; }
    .users-table-scroll {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-inline: contain;
    }
    .users-table-scroll table { min-width: 900px; }
  }
  @media (max-width: 640px) {
    .bulk-bar .bulk-scope { flex-basis: 100%; order: 3; }
    .bulk-bar .actions { margin-left: 0; width: 100%; }
    .recipe-ingredient-entry, .recipe-step-entry { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .recipe-ingredient-entry > input:nth-of-type(1) { grid-column: 1 / -1; }
    .recipe-ingredient-entry > input:nth-of-type(4) { grid-column: 1 / -1; grid-row: auto; }
    .recipe-ingredient-entry > input:nth-of-type(5) { grid-column: 1 / -1; grid-row: auto; }
    .recipe-ingredient-entry > .dyn-row-actions { grid-column: 1 / -1; grid-row: auto; justify-content: flex-end; }
    .recipe-step-entry > textarea { grid-column: 1 / -1; }
    .recipe-step-entry > input { grid-column: 1; }
    .recipe-step-entry > .dyn-row-actions { grid-column: 2; justify-content: flex-end; }
  }
</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="brand">
      <div class="mark">AdT</div>
      <div class="name">Alimentos<br>de Transición</div>
    </div>
    <button class="nav-item active" data-view="dashboard">Resumen</button>
    <button class="nav-item" data-view="recipes">Recetas</button>
    <button class="nav-item" data-view="collections">Colecciones</button>
    <button class="nav-item" data-view="taxonomy">Categorías y dietas</button>
    <button class="nav-item" data-view="import">Importar y exportar</button>
    <button class="nav-item" data-view="shopify">Reconciliar Shopify</button>
    <button class="nav-item" data-view="users">Usuarios y accesos</button>
    <div class="nav-spacer"></div>
    <button class="nav-item" id="logout">Cerrar sesión</button>
  </aside>
  <main class="main" id="main"></main>
</div>

<div class="modal-backdrop" id="modal-backdrop">
  <div class="modal" id="modal"></div>
</div>
<div class="toast" id="toast"></div>

<script src="/admin/app.js?v=${assetVersion}"></script>
</body>
</html>`;
}

export function renderAdminPage(
  page: "login" | "app",
  options: { configured?: boolean },
): string {
  return page === "login" ? loginPage(options.configured ?? false) : appPage();
}
