# Atlas electoral de la provincia de Zaragoza

## Situación actual — 31 de octubre de 2026

La web tiene mapa, comparador, series históricas, participación y capa optativa de lugares privados. El catálogo **sí contiene datos reales**: actualmente **37 capas**, que incluyen elecciones generales, municipales y europeas entre 2000 y 2024; el número representa combinaciones de convocatoria y escala geográfica, **no 37 convocatorias distintas**. Hay 293 polígonos municipales y 1208 polígonos de secciones de referencia, pero la cobertura efectiva varía por convocatoria.

**Pendiente:** elecciones autonómicas de Aragón (incluidas las de febrero de 2026), y cobertura histórica más homogénea en municipios y secciones. No se representan como disponibles hasta incorporar y validar los datos. El selector refleja únicamente las convocatorias presentes.

## Origen, atribución y descarga reproducible

Los resultados electorales de este primer lote proceden de los CSV abiertos publicados por **Mapa Electoral (Nacho G. del Álamo)**, que procesan datos del **Ministerio del Interior y del INE**, bajo **CC BY 4.0**.

- Página de descarga: https://mapaelectoral.es/generales-2026/descargas/
- Metodología de la fuente: https://mapaelectoral.es/generales-2026/metodologia.html
- Fuente primaria del Ministerio del Interior: https://infoelectoral.interior.gob.es/
- Cartografía de municipios: INE, servicio ArcGIS `DIRCE_restoservicios_2025/FeatureServer/2`, capa de municipios.
- Cartografía de secciones: INE, API OGC Features `WMS_INE_SECCIONES_G01:Secciones_2023`.
- Autonómicas de Aragón (pendientes): https://www.aragon.es/portal-de-elecciones/resultados/open-data y https://opendata.aragon.es/datos/catalogo/dataset/resultados-electorales-agrupados-a-escala-municipal-historico.

El objeto `provenance` de `site/data/catalog.json` incluye las URL de las descargas originales, hashes SHA-256 y tamaños, además del recuento de registros excluidos por no superar las comprobaciones de integridad. Las fuentes derivadas no sustituyen una auditoría electoral exhaustiva contra actas oficiales originales.

El script `scripts/build_elections.py` descarga y convierte los CSV, simplifica coordenadas cartográficas y escribe los ficheros JSON/GeoJSON; `scripts/validate_atlas.py` rechaza datos incoherentes. El workflow `data-build.yml` permite reproducir la carga y realizar commits separados de código y datos. CI usa `python3 -m unittest discover -s tests -v`, `node --test tests/*.test.mjs` y validación de archivos.

## Formato

`site/data/catalog.json` contiene grupos de candidaturas y convocatorias, cada una con `id`, `date`, `type`, `label`, `level`, `geometry`, `file`, `source`, `license` y denominador. Los ficheros de elección contienen `records` con `id`, `name`, `electorate`, `voters`, `valid` y `votes` por grupo. Los `feature.properties.id` del GeoJSON son cadenas que coinciden con `record.id`, sin quitar ceros iniciales.

**No se guardan datos de usuarios entre los JSON públicos.** Los puntos personales continúan en Firestore y están sujetos a la invitación y reglas de usuario existentes; la capa se activa manualmente y se borra al cerrar sesión.

## Precauciones que deben leerse antes de comparar resultados

1. **Cartografía temporal:** los polígonos municipales son una referencia de 2025; los de sección censal son los de **2023**. La aplicación compara códigos entre convocatorias; un código de sección coincidente **no garantiza límites físicos equivalentes**. Las secciones antiguas pueden no aparecer en la geometría actual y se muestran sin datos. Nunca atribuir una variación histórica a una misma población sin comprobar el seccionado.
2. **Cobertura incompleta:** faltan algunos municipios y bastantes secciones según la convocatoria. No convertir ausencia de datos en voto cero. Los 1208 polígonos incluyen secciones sin correspondencia para muchas elecciones.
3. **Censo y participación:** participación = votantes/censo × 100; abstención = censo − votantes. La abstención porcentual es 100 − participación (para el mismo censo).
4. **Votos válidos y listas abiertas:** cuando se conocen votos blancos y votos a candidaturas, válidos = suma de ambos. Algunas filas históricas municipales sin blancos emplean únicamente votos a candidaturas; quedan marcadas con `denominator: "candidaturas"`. Las municipales en régimen de listas abiertas no se pueden interpretar como si sus votos a candidatos fueran votos a listas cerradas.
5. **Agrupación de partidos:** los grupos del CSV son **categorías históricas normalizadas de la fuente**, no denominaciones oficiales idénticas entre años. Por ejemplo `SUMAR` engloba IU/Podemos/Sumar y confluencias en distintos periodos. `OTROS` no equivale a un bloque ideológico. El atlas **no** imputa automáticamente izquierda/derecha ni deduce trasvases individuales.
6. **Comparación territorial:** se requiere mismo nivel y referencia geométrica en el visor; aun cumpliéndolo, cambios en secciones y composición del censo pueden hacer que la comparabilidad sea imperfecta. Los resultados de municipio no deben asignarse artificialmente a cada barrio.
7. **Sesgo y procedencia:** derivados de una fuente secundaria con su propia normalización histórica; consultar la metodología original y cotejar con resultados oficiales al interpretar casos locales o convocatorias con incidencias.

## Publicación

GitHub Pages publica `site/` desde `main`, tras CI y comprobaciones del workflow de despliegue. Para una actualización: modificar el ETL, ejecutar el workflow de construcción, examinar hashes, cobertura, cruces y exclusiones, validar y fusionar los commits revisados.

La parte de capturar lugares conserva sus mapas, fotografías, importación/exportación y login originales.


## Pestaña «Tendencias del voto» (octubre 2026)

Muestra cambios **descriptivos**, no un algoritmo de oportunidad política ni recomendaciones de dónde dirigir una campaña. Se pueden seleccionar de manera independiente:

- PSOE, IU/Podemos/Sumar o su suma (categorías históricas normalizadas por la fuente). **No** se asigna automáticamente el grupo \`OTROS\` a la izquierda.
- Tipos de elecciones disponibles y municipios / secciones censales. Los tipos no se suman ni se comparan entre sí.
- Dos convocatorias, inicialmente los extremos disponibles de la década anterior a la última convocatoria del mismo tipo y detalle (p. ej., generales 2015–2023, no 2016–2026).
- Cambio de votos absolutos, diferencia porcentual en puntos, cambio de participación, abstención absoluta y variación del censo. **No se combinan en una puntuación de targeting**.
- Para un territorio seleccionado se ve la evolución en las convocatorias intermedias, los números y los porcentajes.

El cambio porcentual se omite cuando no son equivalentes los denominadores de ambas convocatorias; el cambio absoluto de los votos agrupados se mantiene visible. La cartografía por sección es una **aproximación histórica** (polígonos 2023); un código coincidente en dos fechas no demuestra límites idénticos ni identidad del electorado. **No es un mapa de barrios oficiales.** Los polígonos sin datos en ambos extremos se dejan gris claro, en lugar de asignarles un cero ficticio.

Esta pestaña utiliza el mismo control de autenticación y superposición voluntaria de puntos personales que los demás mapas del atlas. Los puntos privados nunca se incorporan a los datasets electorales publicados.
