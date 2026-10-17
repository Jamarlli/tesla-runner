# 🚗💨 Tesla Runner

El juego del dinosaurio de Chrome, pero con un **Tesla Roadster** que se propulsa con gas frío. Un solo archivo HTML (`index.html`), sin dependencias, y un servidor opcional de 100 líneas para el leaderboard.

- Salta cochazos, camiones y minicohetes Starship.
- **Mantén el salto** y los propulsores te sostienen en el aire.
- Cada ~271 puntos aparece una **rampa gigante**: te lleva boca abajo por el techo y tienes que girar en el aire para caer sobre las ruedas.
- Flips, barrel rolls y combos suman puntos. Aterriza mal y explotas.
- Leaderboard TOP 100 guardado en un archivo (`scores.json`).
- Botón **Compartir en X**: tuit con tu puntuación en el idioma del navegador (es, en, fr, de, pt, it, ca) y el enlace del juego, que X muestra con una tarjeta de imagen (`og-image.png`).

## Controles

| Tecla | Acción |
|---|---|
| `ESPACIO` | Saltar. **Mantenido en el aire = propulsión** (combustible limitado) |
| `↑` | Saltar desde el suelo · en el aire, barrel roll |
| `←` `→` | Flips en el aire (un toque = 1 vuelta; mantenido = vueltas seguidas; al soltar termina la vuelta) |
| `↓` | Barrel roll en sentido contrario |
| `INTRO` | Atajo de pruebas: salta a 10 puntos de la siguiente rampa |
| `ESPACIO` en el game over | Vuelve a jugar al instante. Si ya has empezado a escribir tu nombre para el TOP 100, el espacio es un espacio del nombre; `INTRO` lo guarda |

**En móvil / táctil** (también en el navegador integrado de X): **toca** en cualquier parte para saltar, **mantén** el dedo para el turbo (propulsión) y **desliza** para las piruetas: izquierda/derecha = flips, arriba/abajo = barrel roll. Un deslizamiento rápido da una vuelta; si dejas el dedo desplazado sigue girando hasta que lo recoges. En pantallas estrechas el juego usa un ancho lógico menor (360-600 px) para verse a tamaño real y reduce la velocidad del scroll, como hace el T-Rex original.

## Jugar en local

Necesitas [Node.js](https://nodejs.org) 18 o superior (solo para el leaderboard; el juego en sí no necesita nada).

```bash
git clone https://github.com/<tu-usuario>/tesla-runner.git
cd tesla-runner
node server.js          # abre http://localhost:3000
```

Si abres `index.html` directamente (doble clic) el juego funciona igual, pero el leaderboard es **local de tu navegador**.

Parámetros útiles en la URL: `?ramp=30` (la rampa aparece a los 30 puntos en vez de a los 271) y `?debug`.

## Leaderboard y despliegue

El leaderboard son dos rutas de `server.js`: `GET /api/scores` y `POST /api/scores`. Se guarda **solo el TOP 100** en `scores.json`. El juego solo pide tu nombre si tu puntuación entra en el TOP 100.

> ⚠️ **Para que el leaderboard sea persistente el servidor necesita un disco que sobreviva a los reinicios.** Los planes gratuitos con disco efímero (p. ej. Render free) borran `scores.json` en cada reinicio.

### Opción A — Un solo servicio (juego + API) con Docker · recomendada

El `Dockerfile` ya está listo. Ejemplo con [Fly.io](https://fly.io) (volumen persistente):

```bash
fly launch --no-deploy          # acepta el fly.toml del repo; cambia el nombre de la app si hace falta
fly volumes create data --size 1
fly deploy
```

El juego quedará en `https://<tu-app>.fly.dev` y el leaderboard en el volumen `/data`. Sirve igual en Railway (añade un *Volume* montado en `/data`) o en cualquier VPS:

```bash
docker build -t tesla-runner .
docker run -d -p 3000:3000 -v tesla-data:/data tesla-runner
```

### Opción B — Juego en GitHub Pages + API en otro sitio

1. En GitHub: **Settings → Pages → Deploy from a branch → `main` / `(root)`**. El juego queda en `https://<tu-usuario>.github.io/tesla-runner/`.
2. Despliega `server.js` como en la opción A.
3. En `index.html`, pon la URL del servidor en `window.TESLA_RUNNER_API = 'https://<tu-app>.fly.dev';`.
4. (Opcional) Restringe el CORS del servidor con `ALLOWED_ORIGIN=https://<tu-usuario>.github.io`.

Sin API configurada, en GitHub Pages el leaderboard funciona en modo local.

### Opción C — Cloudflare Worker que guarda el TOP 100 en un archivo del repo (la que usa la versión de GitHub Pages)

Sin servidor propio y gratis. El Worker (`worker/index.js`) expone el mismo API (`GET/POST /api/scores`) y guarda el ranking en `scores.json` de la **rama `leaderboard`** del propio repo: cada puntuación que entra en el TOP 100 es un commit. Así el archivo está versionado y a la vista, y el historial de `main` no se llena de commits de puntuaciones.

1. Crea la rama de datos con un `scores.json` vacío (`[]`) en el repo: es una rama aparte, sin relación con `main`.
2. Crea un [token de GitHub de grano fino](https://github.com/settings/personal-access-tokens/new) con acceso **solo a este repo** y el permiso **Contents: Read and write**.
3. Despliega el Worker (necesitas una cuenta de Cloudflare):
   ```bash
   cd worker
   npx wrangler login
   npx wrangler secret put GITHUB_TOKEN     # pega el token del paso 2
   npx wrangler deploy
   ```
4. Pon la URL del Worker en `window.TESLA_RUNNER_API` (`index.html`) y su dominio de juego en `ALLOWED_ORIGIN` (`worker/wrangler.toml`).
5. Prueba el Worker en local con GitHub simulado: `node worker/test.mjs`.

El token es un secreto de Cloudflare: **nunca** va en el repo ni en `index.html`. La lista de puntuaciones se puede ver en `https://github.com/<tu-usuario>/tesla-runner/blob/leaderboard/scores.json`.

### Variables de entorno del servidor

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto |
| `DATA_DIR` | carpeta del proyecto | Dónde se guarda `scores.json` (monta aquí el volumen) |
| `SCORES_FILE` | `$DATA_DIR/scores.json` | Ruta completa del archivo |
| `ALLOWED_ORIGIN` | `*` | Origen permitido por CORS |

**Límites conocidos:** el servidor valida nombre y rango de puntuación y limita los envíos por IP, pero **no hay protección antitrampas** (cualquiera puede enviar una puntuación falsa a mano). Es un juego, no un banco.

## Estructura

```
index.html   el juego completo (canvas, sprites en pixel art, física, UI del leaderboard)
server.js    servidor sin dependencias: sirve el juego y guarda scores.json
worker/      Worker de Cloudflare: guarda el TOP 100 como scores.json en la rama `leaderboard`
og-image-2.png tarjeta de imagen del enlace (generada con el propio juego; el número cambia si cambia la imagen, porque X cachea las tarjetas)
Dockerfile   imagen lista para desplegar
fly.toml     plantilla para Fly.io
```

## Créditos y aviso legal

- Proyecto de fans. **No está afiliado ni respaldado por Tesla, SpaceX ni Google.** Tesla, Roadster, Model 3, Model Y, Cybertruck, Cybercab, Semi, SpaceX y Starship son marcas de sus respectivos propietarios; aquí solo se usan como referencia en dibujos propios hechos en pixel art. No se incluye ninguna imagen de terceros.
- Inspirado en el *T-Rex Runner* de Chromium. La física y los parámetros del juego (gravedad, velocidades, huecos entre obstáculos...) se basan en su código fuente, publicado bajo licencia BSD de 3 cláusulas. Ver [NOTICE.md](NOTICE.md).
- El resto del código es original y se publica bajo la [licencia MIT](LICENSE).

## Contribuir

Las ideas y los PRs son bienvenidos: nuevos vehículos, mejoras de sprites, un backend serverless para el leaderboard (Cloudflare Workers + KV, por ejemplo), modo móvil mejorado... Abre un issue y lo hablamos.
