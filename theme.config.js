/**
 * Paleta de Alimentos de Transición.
 *
 * Los colores se derivan del logotipo oficial: coral de la espiga como color de
 * marca y acción, marrón oscuro del monograma para el texto, y fondos crema que
 * remiten al papel de un recetario. El verde se conserva como color de estado
 * (confirmaciones, pasos completados) y no como identidad, para que la marca
 * quede unificada en un solo acento cálido.
 *
 * @type {const}
 */
const themeColors = {
  /** Coral del logotipo: acciones principales, elementos activos. */
  primary: { light: '#E5714A', dark: '#F58A62' },
  /** Terracota más profunda para acentos secundarios y detalles editoriales. */
  accent: { light: '#B4703C', dark: '#D99A63' },
  background: { light: '#FDF9F4', dark: '#17130F' },
  surface: { light: '#FFFFFF', dark: '#221C17' },
  surfaceAlt: { light: '#F6EEE4', dark: '#2C251E' },
  /** Marrón del monograma. */
  foreground: { light: '#2F2A26', dark: '#F1EAE2' },
  muted: { light: '#7A6E64', dark: '#A99A8D' },
  border: { light: '#EADFD1', dark: '#372F27' },
  success: { light: '#4F8A5B', dark: '#77B583' },
  warning: { light: '#D9902B', dark: '#E8B255' },
  error: { light: '#C4553F', dark: '#E28372' },
};

module.exports = { themeColors };
