# DonghuaLife para Kino

Plugin comunitario para consultar el catálogo público de [DonghuaLife](https://donghualife.com/) desde Kino.

## Funciones

- Buscar títulos por nombre.
- Mostrar varias filas de donghua en Inicio y abrir más resultados.
- Leer la ficha pública de una serie y sus episodios.
- Resolver enlaces directos que publique la página y probar el reproductor incrustado de OK.ru.
- No requiere cuenta, configuración ni clave personal.
- No declara descargas sin conexión.

## Instalación en Kino

1. Si tenés instalada la versión anterior, desinstalá `DonghuaLife` para evitar que Kino conserve su identidad o caché.
2. Abre **Ajustes → Plugins**.
3. Introduce `myne23/DonghuaLife`.
4. Revisa los hosts que se muestran y acepta solo si estás de acuerdo.

La versión 0.1.44 conserva el catálogo existente y mejora la selección de fuentes: comprueba que las URLs HLS capturadas respondan con un manifiesto válido antes de entregarlas a Kino, registra cuándo detecta una respuesta que no es HLS y evita ofrecer un MP4/WebM fijo del mismo host como alternativa al HLS adaptativo. Las copias alternativas de otros hosts siguen disponibles en el menú «Servidor».

## Estado del desarrollo

Este plugin está en desarrollo. Las páginas del sitio y los reproductores pueden cambiar. El catálogo y los episodios se extraen de HTML público, por lo que los selectores necesitan comprobación periódica. La detección de fuentes de OK.ru está implementada, pero aún requiere pruebas reales dentro de Kino: las pruebas automatizadas locales usan respuestas simuladas y no demuestran que cada episodio se pueda reproducir.

No intenta saltarse inicios de sesión, CAPTCHA, restricciones de acceso ni contenido de pago. Si un episodio no ofrece una fuente pública compatible, se informa como no disponible.

## Pruebas

Con Node.js 18 o posterior:

```sh
node test/smoke-test.mjs
```

La prueba de humo simula el catálogo, la ficha de una serie y las respuestas del reproductor. Para validar el manifiesto con el kit oficial de Kino, ejecuta:

```sh
node sdk/validate.mjs .
node sdk/run.mjs ./plugin.js home
node sdk/run.mjs ./plugin.js search "Against The Sky Supreme"
```

## Hosts declarados

El plugin consulta `donghualife.com` y los dominios habituales usados por el reproductor incrustado de OK.ru. Kino muestra esta lista antes de instalarlo. Si el sitio empieza a usar otro servidor, habrá que confirmar el dominio y actualizar el manifiesto.
