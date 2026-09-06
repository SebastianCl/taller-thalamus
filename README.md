# Taller 3D

Configurador web de prendas en 3D: camiseta, hoodie y camibuso de manga larga
y cuello redondo. Permite personalizar colores, textos, imágenes y capas, conservar el trabajo en el
navegador e importar o exportar proyectos completos.

## Funcionalidades

- Visor 3D interactivo basado en React Three Fiber y Three.js.
- Edición por zonas de la camiseta: frente, espalda, mangas, cuello y
  laterales.
- Herramientas para color, texto, imágenes y capas.
- Movimiento de capas con el ratón o teclado, además de deshacer y rehacer.
- Autoguardado local mediante IndexedDB.
- Importación y exportación de proyectos ZIP.
- Exportación de cuatro vistas PNG de 1600 × 1600 px.
- Máscara UV generada para aplicar materiales por zona.
- Fallback procedural si el modelo GLB no puede cargarse.
- Interfaz adaptable para escritorio y dispositivos móviles.
- Selector de prenda con transferencia del diseño y deshacer/rehacer.
- Capucha, puños y pretina editables cuando existen en el modelo.
- Zonas ausentes conservadas en el proyecto; sus capas reaparecen al volver
  a una prenda compatible y siguen contando dentro del límite de 20 elementos.
- Documentos versión 2 con migración automática desde las versiones 0 y 1.

## Requisitos

- Node.js `22.13` o superior.
- pnpm.
- Un navegador con WebGL 2 para utilizar el visor 3D.

## Instalación

```bash
pnpm install
```

## Desarrollo

Inicia el servidor local con:

```bash
pnpm dev
```

Después abre la URL que muestre Vite/Vinext en la terminal.

## Comandos disponibles

| Comando | Descripción |
| --- | --- |
| `pnpm dev` | Inicia el servidor de desarrollo. |
| `pnpm build` | Genera la build de producción. |
| `pnpm start` | Sirve la build mediante Wrangler. |
| `pnpm test` | Ejecuta la suite de Vitest. |
| `pnpm typecheck` | Comprueba los tipos de TypeScript. |
| `pnpm lint` | Ejecuta Oxlint. |
| `pnpm format` | Formatea el proyecto con Oxfmt. |
| `pnpm generate:uv-mask` | Regenera la máscara UV de la camiseta. |
| `pnpm validate:model` | Valida el modelo 3D y su manifiesto. |

Antes de enviar cambios, se recomienda ejecutar:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## Uso del editor

El selector **Prenda** permite cambiar entre Camiseta, Hoodie y Camibuso.
Colores y capas se transfieren mediante posiciones relativas. Las zonas nuevas
usan el color del frente; las que ya tienen un diseño conservado lo recuperan.
**Nuevo diseño** mantiene la prenda elegida y limpia todas las capas y zonas.
La exportación espera a que el visor esté listo e incluye los créditos del
modelo activo, además de las capas de zonas temporalmente ausentes.

1. Elige una herramienta en la barra lateral: color, texto, imagen o capas.
2. Selecciona una zona de la camiseta en el visor 3D.
3. Ajusta la capa desde el panel de contexto.
4. Usa `Ctrl/Cmd + Z` para deshacer y `Ctrl/Cmd + Y` para rehacer.
5. Pulsa **Guardar** para forzar el guardado local o **Exportar** para crear
   un ZIP con el diseño, los recursos originales y las vistas renderizadas.

En el visor, las flechas mueven la capa seleccionada. `Shift` aumenta el paso
de movimiento. `Delete` o `Backspace` elimina la capa y `Escape` cancela la
selección.

## Estructura del proyecto

```text
app/                 Entrada de la aplicación y estilos globales
components/editor/   Shell del editor, paneles y visor 3D
components/ui/       Componentes de interfaz reutilizables
hooks/               Autoguardado, WebMCP y comportamiento responsive
lib/                 Modelo de datos, validación, persistencia e import/export
store/               Estado global del editor con Zustand
public/models/       Modelo GLB y recursos de la camiseta
scripts/             Utilidades de validación y generación de assets
tests/               Pruebas de estado, persistencia, schema y proyectos
```

## Arquitectura resumida

- `components/editor/editor-shell.tsx` coordina la interfaz, las acciones del
  proyecto, el autoguardado y la exportación.
- `components/editor/shirt-stage.tsx` renderiza el modelo GLB, aplica la
  textura atlas y gestiona la interacción 3D.
- `store/editor-store.ts` mantiene el documento, las capas, la selección, el
  historial y los estados de guardado/exportación.
- `lib/schema.ts` valida los documentos importados.
- `lib/persistence.ts` guarda y restaura la sesión desde IndexedDB.
- `lib/project-io.ts` serializa proyectos y genera el ZIP de exportación.
- `lib/design.ts`, `lib/atlas.ts` y `lib/model-manifest.ts` definen las zonas,
  capas, materiales y metadatos del modelo.

## Modelo 3D y máscara UV

El modelo principal está en:

```text
public/models/taller-sport.glb
```

La máscara UV se genera en `public/models/uv-zone-mask.png` a partir del
manifiesto de zonas. Si cambia la geometría o la distribución UV, regénérala y
valida el modelo:

```bash
pnpm generate:uv-mask
pnpm validate:model
```

## Despliegue

Los recursos nuevos se encuentran en `public/models/garments/`. Para preparar
solo hoodie y camibuso, ejecuta `node scripts/prepare-garments.mjs`; el proceso
no modifica la camiseta. Las fuentes originales de Sketchfab, licencias y modificaciones
están documentadas en `scripts/model-sources/README.md`.

```bash
node scripts/validate-model.mjs public/models/garments/taller-hoodie-v1-sketchfab.glb
node scripts/validate-model.mjs public/models/garments/taller-camibuso-v1-sketchfab.glb
```

La configuración de Vite/Vinext integra el plugin de Cloudflare. La build se
puede probar localmente con:

```bash
pnpm build
pnpm start
```

Las vinculaciones D1/R2 se configuran mediante `.openai/hosting.json` y los
secretos o variables locales deben mantenerse en archivos `.env*` ignorados
por Git.

## Convenciones

- TypeScript estricto y módulos ES.
- Componentes en `PascalCase`; funciones y variables en `camelCase`.
- Alias de imports `@/*`.
- Mantener la lógica de persistencia, validación y serialización dentro de
  `lib/`.
- No versionar `dist/`, `.next/`, `.wrangler/` ni `graphify-out/`.
