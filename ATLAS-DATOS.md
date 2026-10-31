# Atlas electoral Zaragoza — contrato de datos

## Estado real de la primera integración
La navegación, los mapas Leaflet, el visor de fichas, la comparación, la evolución histórica y la capa privada de lugares están implementados. **El catálogo electoral está vacío** deliberadamente: todavía no se han descargado, reconciliado ni verificado los resultados históricos oficiales. La interfaz no presenta valores de demostración como si fueran reales.

## Fuentes primarias previstas
- Ministerio del Interior, Infoelectoral: https://infoelectoral.interior.gob.es/
- Ministerio del Interior, catálogo de datos: https://datos.gob.es/es/catalogo/e00003801-resultados-electorales
- Gobierno de Aragón, resultados autonómicos: https://www.aragon.es/portal-de-elecciones/resultados/open-data
- Cartografía estadística y seccionado censal del INE: https://www.ine.es/
- Límites administrativos del Gobierno de Aragón: https://opendata.aragon.es/datos/catalogo/dataset/limites

Registrar URL de archivo original, versión, fecha de descarga, método de agregación, licencia y controles de calidad **por elección**.

## Estructura de los ficheros
`site/data/catalog.json` es el índice público de conjuntos reales y verificados. Ejemplo de formato (SOLO documental: no representa cifras reales):
```json
{
  "version": 1,
  "groups": [
    {"id": "P1", "label": "Candidatura P1", "color": "#2563eb"}
  ],
  "elections": [
    {
      "id": "congreso_2023_07",
      "type": "generales",
      "date": "2023-07-23",
      "label": "Generales · 23 julio 2023",
      "level": "municipio",
      "geometry": "./data/municipios_2023.geojson",
      "file": "./data/congreso_2023_07.json",
      "source": "Ministerio del Interior / archivo y versión exactos",
      "license": "CC BY 4.0"
    }
  ]
}
```
Cada fichero de elección contiene:
```json
{
  "records": [
    {
      "id": "50001",
      "name": "NOMBRE DEL MUNICIPIO",
      "electorate": 1000,
      "voters": 700,
      "valid": 680,
      "votes": {"P1": 300}
    }
  ]
}
```
**Las cifras del ejemplo anterior son ficticias y NO deben publicarse como datos de elecciones.** Para cada geometría GeoJSON, cada `feature.properties.id` debe coincidir exactamente con `record.id` (incluidos ceros iniciales). El código admite `code` o `territory_id` como alternativas. Los datos sin equivalencia geográfica se mantienen como ausentes.

## Tratamiento metodológico
- Los votos válidos incluyen candidaturas y votos en blanco; los nulos quedan fuera. El total de votos por candidaturas no debería superar los votos válidos.
- Participación = votantes / censo * 100. Abstención = censo − votantes. No inferir cambios individuales a partir de territorios agregados.
- **Municipales de listas abiertas**, Senado y otros sistemas no equivalentes necesitan modelos específicos; no mezclar automáticamente con la fórmula de votos por candidatura.
- Secciones censales: utilizar geometrías de la misma época o una correspondencia verificada; el visor solo compara en el mapa cuando `level` y `geometry` coinciden. Un mismo ID no garantiza límites estables.
- Agrupaciones ideológicas y coaliciones: elaborar un diccionario por convocatoria, fuente y justificación; las candidaturas mixtas se mantienen explícitamente separadas. No asignar automáticamente un bloque a "Otros" para suplir falta de clasificación.
- Los resultados del municipio de Zaragoza **no pueden sustituir** resultados de distritos o barrios. Mostrar nivel municipal y aviso cuando no haya precisión mayor.
- Ficheros públicos: exclusivamente agregados electorales y cartografía; los puntos, fotos y comentarios de usuarios siguen en Firestore.

## Publicación
1. Descargar originales de fuentes oficiales y conservar un registro de procedencia, licencia y comprobaciones.
2. Normalizar la codificación de candidaturas, municipios y secciones; cuadrar totales por municipio y elección.
3. Simplificar los límites para servir GeoJSON desde GitHub Pages sin cargar imágenes ni datos pesados innecesariamente.
4. Crear los ficheros en `site/data/` e incorporar las elecciones al catálogo.
5. Ejecutar `python3 scripts/validate_atlas.py`. Nunca añadir archivos de ejemplo ficticios al catálogo.

La aplicación anterior continúa funcionando sin necesidad de datos electorales. La parte de carteles usa las mismas colecciones `users/{uid}/places` de Firestore y la misma validación de invitaciones.
