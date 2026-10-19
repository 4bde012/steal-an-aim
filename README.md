# STEAL AN AIM — starter 3D online

Starter jugable en navegador: mundo 3D con Three.js, movimiento WASD, bases, aims coleccionables, tienda y sincronización online usando Supabase.

> Nota honesta: esto es un prototipo inicial. Los jugadores se ven online mediante Presence; los aims, compras, robos y monedas se comparten en Supabase. Aún no tiene animaciones avanzadas, chat, matchmaking, anticheat completo ni controles táctiles pulidos.

## 1. Crear el backend online gratis

1. Crea un proyecto en [Supabase](https://supabase.com/).
2. Abre **SQL Editor → New query**.
3. Copia todo `supabase.sql`, pégalo y pulsa **Run**.
4. En **Authentication → Sign In / Providers**, activa **Anonymous Sign-Ins**.
5. Ve a **Project Settings → API** y copia el Project URL y la publishable key (o la anon key heredada).

## 2. Conectar el juego

Abre `src/main.js` y cambia estas dos líneas al principio:

```js
const SUPABASE_URL = "PEGA_AQUI_TU_PROJECT_URL";
const SUPABASE_ANON_KEY = "PEGA_AQUI_TU_PUBLISHABLE_OR_ANON_KEY";
```

La clave publicable/anon está diseñada para estar en el navegador; **nunca pongas una service_role key** en el código del cliente.

## 3. Probarlo en tu ordenador

No abras `index.html` con doble clic: los módulos JavaScript necesitan un servidor web.

Si tienes Python instalado, desde la carpeta del proyecto ejecuta:

```bash
python -m http.server 8000
```

Abre `http://localhost:8000`.

También puedes usar la extensión **Live Server** de VS Code.

## 4. Publicarlo en GitHub Pages

1. Crea un repositorio en GitHub llamado `steal-an-aim`.
2. Sube todos los archivos y carpetas manteniendo la estructura.
3. En el repositorio, entra en **Settings → Pages**.
4. En **Build and deployment**, elige **Deploy from a branch**.
5. Elige `main` y `/ (root)`, guarda y espera a que GitHub publique el sitio.
6. Abre la URL que te dé GitHub Pages.

No necesitas compilar: Three.js y Supabase se cargan desde CDN.

## Cómo se juega

- Muévete con **WASD** o las flechas.
- Compra aims desde AIM SHOP.
- Pulsa **Recoger ganancias** para recibir 5 segundos de ingresos por cada aim.
- Haz clic en un aim de otro jugador para intentar robarlo. El prototipo comprueba la cercanía aproximada a su base.
- Abre el juego en dos navegadores o dispositivos para probar el modo online.

## Importante sobre el prototipo

- La sincronización de posición usa Supabase Presence.
- La compra, recogida y transferencia de aims se valida en funciones SQL, no solo en el navegador.
- La distancia de robo es una comprobación de prototipo en el cliente; antes de abrirlo al público, mueve esa validación al backend y añade límites de frecuencia/antiabuso.
- Los nombres de base y el reparto visual de bases son demostrativos; la asignación persistente de bases y la economía por tiempo real son mejoras siguientes.
- Si un cambio de esquema no aparece al instante, revisa **Database → Publications → supabase_realtime** y confirma que `players` y `aims` estén añadidas.
