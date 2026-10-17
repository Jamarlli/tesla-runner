# 🚗💨 Tesla Runner

El juego del dinosaurio de Chrome, pero con un **Tesla Roadster** que se propulsa con gas frío. Un solo archivo HTML (`index.html`), sin dependencias, y un servidor opcional de 100 líneas para el leaderboard.

- Salta cochazos, camiones y minicohetes Starship.
- **Mantén el salto** y los propulsores te sostienen en el aire.
- Cada ~271 puntos aparece una **rampa gigante**: te lleva boca abajo por el techo y tienes que girar en el aire para caer sobre las ruedas.
- Flips, barrel rolls y combos suman puntos. Aterriza mal y explotas.
- Leaderboard TOP 100 guardado en un archivo (`scores.json`).

## Controles

| Tecla | Acción |
|---|---|
| `ESPACIO` | Saltar. **Mantenido en el aire = propulsión** (combustible limitado) |
| `↑` | Saltar desde el suelo · en el aire, barrel roll |
| `←` `→` | Flips en el aire (un toque = 1 vuelta; mantenido = vueltas seguidas; al soltar termina la vuelta) |
| `↓` | Barrel roll en sentido contrario |
| `INTRO` | Atajo de pruebas: salta a 10 puntos de la siguiente rampa |

En móvil: toca la pantalla para saltar y mantén para propulsarte.

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
Dockerfile   imagen lista para desplegar
fly.toml     plantilla para Fly.io
```

## Créditos y aviso legal

- Proyecto de fans. **No está afiliado ni respaldado por Tesla, SpaceX ni Google.** Tesla, Roadster, Model 3, Model Y, Cybertruck, Cybercab, Semi, SpaceX y Starship son marcas de sus respectivos propietarios; aquí solo se usan como referencia en dibujos propios hechos en pixel art. No se incluye ninguna imagen de terceros.
- Inspirado en el *T-Rex Runner* de Chromium. La física y los parámetros del juego (gravedad, velocidades, huecos entre obstáculos...) se basan en su código fuente, publicado bajo licencia BSD de 3 cláusulas. Ver [NOTICE.md](NOTICE.md).
- El resto del código es original y se publica bajo la [licencia MIT](LICENSE).

## Contribuir

Las ideas y los PRs son bienvenidos: nuevos vehículos, mejoras de sprites, un backend serverless para el leaderboard (Cloudflare Workers + KV, por ejemplo), modo móvil mejorado... Abre un issue y lo hablamos.
