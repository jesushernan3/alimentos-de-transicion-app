# Navegación Atrás contextual en Compras

## Diagnóstico

En `app/receta/[id].tsx`, la acción **Ver lista** posterior a agregar ingredientes hacía `router.push("/(tabs)/compras")`. Compras está dentro del navegador anidado de tabs; no es una pantalla hermana de Receta en el stack raíz. Al entrar al grupo de tabs con Compras seleccionada, el botón Atrás puede ser consumido primero por `TabRouter`, cuyo comportamiento vigente por defecto es `firstRoute`: muestra Inicio antes de volver al stack de la receta.

La prueba de regresión reproduce ese comportamiento con el **TabRouter real**: Compras → GO_BACK → Inicio. No se cambió globalmente la configuración de tabs ni se agregó un interceptor de Android Back.

## Corrección

- El contenido completo de Compras se extrajo a `components/screens/shopping-list-screen.tsx`. La lógica de agrupación, agregar/marcar/eliminar productos, vaciar, compartir, cálculos, analítica y estilos permanece idéntica; sólo se agrega un botón Volver opcional y Safe Area inferior cuando se abre en stack.
- El tab `app/(tabs)/compras.tsx` renderiza ese mismo componente **sin botón Volver nuevo**. La barra inferior y su comportamiento permanecen iguales.
- La nueva ruta `app/lista-compras.tsx` renderiza el componente compartido y usa `router.back()` para su botón visual.
- **Ver lista desde receta** ahora usa `router.push("/lista-compras")`. La receta queda debajo con la misma clave de ruta, instancia y parámetros.
- La ruta nueva está registrada dentro de `Stack.Protected` en `components/access-navigator.tsx`, con la misma protección de sesión/revocación que el resto del contenido.

Flujo resultante: **origen → receta → lista-compras → Atrás → misma receta → Atrás → origen**. No se hardcodea Home, no se reemplaza la receta y no se duplican datos ni lógica de compras.

## Otros flujos auditados

| Flujo | Hallazgo | Cambio |
|---|---|---|
| Receta → agregar ingredientes → Ver lista | Entrada a tab desde stack rompe retorno inmediato | Usa `/lista-compras` |
| Receta → plan semanal → seleccionar día/comida | Modal stack existente, cierra/asigna con `router.back()` | Ninguno |
| Planificador tab → seleccionar receta → guardar | Modal vuelve al planificador existente | Ninguno |
| Planificador tab → generar lista → Ver lista | Cambio directo entre tabs | Ninguno |
| Home/Perfil → Mi semana | Acceso directo entre tabs | Ninguno |
| Pantallas vacías → enlaces de regreso a catálogo/Home | Salidas deliberadas, no acciones contextuales desde receta | Ninguno |

Se revisaron las llamadas a `push`, `replace`, rutas `/(tabs)/…` y las acciones de selección/retorno. No se agregó ruta stack de planificador: el flujo de asignación semanal solicitado ya conservaba la receta.

## Pruebas

**40 suites / 374 pruebas aprobadas**, incluidas **17 pruebas nuevas** en `tests/navigation-shopping-context.test.ts`.

| Escenario | Resultado |
|---|---|
| Home → receta → compras → Atrás | Pasa |
| Colección → receta → compras → Atrás | Pasa |
| Buscar → receta → compras → Atrás | Pasa |
| Los tres orígenes con GO_BACK Android, gesto y botón visual | Mismo destino de stack |
| Entrada a Compras desde tab | Conserva tab y navegación anterior |
| Receta → selección semanal → GO_BACK/Cerrar/Confirmar | Vuelve a la receta, guarda cuando corresponde |
| Instancia/clave de receta tras regresar | Conservadas |
| Porciones e ingredientes seleccionados | Conservados; cantidades siguen escaladas |
| Galería al regresar | No se recarga por remontaje de receta |
| Contenido y acciones compartidas de Compras | Agregar, marcar, eliminar, compartir y vaciar siguen funcionando |
| Revocación de acceso | Retira ruta lista-compras y receta de la zona protegida |
| Reproducción de bug anterior con TabRouter | Back desde Compras devuelve Inicio, como antes |

Se montaron los componentes reales de Receta, Compras, selección y guarda, con dobles para plataforma/providers. Las acciones de historial usan **reducers reales `StackRouter` y `TabRouter` de React Navigation**, no un arreglo que simule push/pop. Los escenarios de botón/gesto prueban el `GO_BACK` que procesan esos navegadores; **no se probó un botón físico ni un gesto en un Android/iPhone instalado**, y no se presenta como prueba en dispositivo real. La instancia de receta se conserva; el contenedor ScrollView no se altera ni se añade un reset de scroll.

Validación adicional: **`pnpm check`, `pnpm build` y `pnpm verificar:proyecto` correctos**, y exportación JavaScript Android completada sin APK/AAB.

## Alcance final

Archivos funcionales: `app/receta/[id].tsx`, `app/(tabs)/compras.tsx`, `app/lista-compras.tsx` (nuevo), `components/screens/shopping-list-screen.tsx` (nuevo), `components/access-navigator.tsx`. Pruebas: `tests/navigation-shopping-context.test.ts` (nuevo). Registro: `plan.md`, `todo.md` y este informe.

Por diff se confirmó que no cambiaron backend, base/esquema, OTP, dispositivos, metadatos/logout/enforcement, Shopify, colecciones/portadas, Home/filtros, estado/caché local, configuración Expo/EAS ni dependencias. `app/(tabs)/_layout.tsx`, `app/_layout.tsx`, `app/seleccionar-receta.tsx` y `app/(tabs)/planificador.tsx` permanecen intactos.

**No se generó APK ni AAB.** La APK previa no incorpora automáticamente esta corrección móvil; la prueba en teléfono corresponde al próximo build autorizado.
