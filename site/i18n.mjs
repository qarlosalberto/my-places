/**
 * UI-only localization for My Places.
 * Storage fields, map/group names, CSV headers and enum values stay in English.
 */
export function detectLocale(languages = [], fallback = 'en') {
 const preferred = (Array.isArray(languages) ? languages[0] : languages) || fallback || 'en';
 return /^es(?:-|$)/i.test(String(preferred)) ? 'es-ES' : 'en';
}
export const locale = detectLocale(
 typeof navigator === 'undefined' ? [] : navigator.languages,
 typeof navigator === 'undefined' ? 'en' : navigator.language
);

const es = {
 'My Places':'Mis lugares',
 'My places':'Mis lugares',
 'Sign in with Google using the button above to view and save your markers. Only authorized accounts can access their places.':'Inicia sesión con Google mediante el botón de arriba para ver y guardar tus marcadores. Solo las cuentas autorizadas pueden acceder a sus lugares.',
 'Firebase is not configured yet. Update':'Firebase todavía no está configurado. Actualiza',
 'with your Firebase web app settings.':'con los ajustes de tu aplicación web de Firebase.',
 'This Google account is not invited. Ask the project owner to add your email to Firestore':'Esta cuenta de Google no está invitada. Pide a la persona responsable que añada tu correo a Firestore',
 'with':'con',
 'Map':'Mapa','List':'Lista','Filters':'Filtros','+ Add':'+ Añadir','Add place':'Añadir lugar',
 'Select map':'Seleccionar mapa','Select a map':'Selecciona un mapa',
 'Sign in with Google':'Iniciar sesión con Google','Sign out':'Cerrar sesión',
 'Search places...':'Buscar lugares...','Search':'Buscar','Group filter':'Filtro por grupo',
 'Rating filter':'Filtro por valoración','Size filter':'Filtro por tamaño','Visibility filter':'Filtro por visibilidad',
 'All groups':'Todos los grupos','All ratings':'Todas las valoraciones','All sizes':'Todos los tamaños',
 'All visibility':'Todas las visibilidades',
 'Perfect':'Perfecta','Good':'Buena','Bad':'Mala','Large':'Grande','Medium':'Mediano',
 'Small':'Pequeño',"Doesn't matter":'Indiferente','Not sure':'No lo sé',
 'No places match your filters.':'Ningún lugar coincide con los filtros.',
 'Default map':'Mapa predeterminado','No group':'Sin grupo',
 'View / Edit':'Ver / Editar','Untitled place':'Lugar sin título','Place photo':'Foto del lugar',
 'place':'lugar','Photo of':'Foto de',
 'Rating':'Valoración','Size':'Tamaño','Visibility':'Visibilidad','Group':'Grupo',
 'Import & export':'Importación y exportación',
 'CSV contains place details and coordinates, but not photographs.':'El CSV contiene los datos y coordenadas de los lugares, pero no sus fotografías.',
 '⬇ Export PDF':'⬇ Exportar PDF','Export CSV':'Exportar CSV','Choose CSV':'Seleccionar CSV',
 'Overwrite saved places with matching coordinates (6 decimal places)':'Sobrescribir los lugares guardados con las mismas coordenadas (6 decimales)',
 'Import reviewed records':'Importar registros revisados','Cancel':'Cancelar',
 'New place':'Nuevo lugar','Edit place':'Editar lugar','Title':'Título',
 'Address is detected automatically':'La dirección se detecta automáticamente',
 'Clear title':'Borrar título','Latitude':'Latitud','Longitude':'Longitud',
 '⌖ Capture precise location':'⌖ Obtener ubicación precisa','Use best reading':'Usar la mejor lectura',
 'Drag the marker to adjust coordinates':'Arrastra el marcador para ajustar las coordenadas',
 'Drag the blue marker to fine-tune the saved position. Estimated GPS accuracy is not a guarantee.':'Arrastra el marcador azul para ajustar la posición guardada. La precisión GPS estimada no está garantizada.',
 'New map name':'Nombre del nuevo mapa','New group name':'Nombre del nuevo grupo',
 'e.g. Nature':'p. ej., Naturaleza','e.g. Beaches':'p. ej., Playas',
 'Photo (optional)':'Foto (opcional)','📷 Take photo':'📷 Hacer foto','Choose from gallery':'Elegir de la galería',
 'Take photo with camera':'Hacer foto con la cámara','Choose photo from gallery':'Elegir una foto de la galería',
 'Photos are compressed and EXIF/GPS metadata is removed before saving.':'Las fotos se comprimen y se eliminan sus metadatos EXIF/GPS antes de guardarlas.',
 'Remove existing photo':'Eliminar foto actual','Delete':'Eliminar','Save place':'Guardar lugar',
 'Center on my location':'Centrar en mi ubicación','You are here':'Estás aquí',
 'Existing categories have been mapped to Maps.':'Las categorías existentes se han convertido en mapas.',
 'No group':'Sin grupo','+ New group…':'+ Nuevo grupo…','+ New map…':'+ Nuevo mapa…',
 'Getting GPS position…':'Obteniendo posición GPS…',
 'Could not load all place options. Close and reopen to retry.':'No se han podido cargar todas las opciones. Cierra la ventana y vuelve a abrirla.',
 'Marker adjusted manually; GPS accuracy no longer applies.':'Marcador ajustado manualmente; la precisión GPS ya no es aplicable.',
 'Coordinates changed manually.':'Coordenadas modificadas manualmente.',
 'Waiting for a fresh tracking position…':'Esperando una nueva posición GPS…',
 'Tracking GPS fix: ±{accuracy} m · Ready to save.':'Ubicación GPS: ±{accuracy} m · Lista para guardar.',
 'Best GPS estimate: ±{accuracy} m. Drag marker to refine.':'Mejor estimación GPS: ±{accuracy} m. Arrastra el marcador para ajustarla.',
 'Location unavailable. Enable location services and use HTTPS.':'Ubicación no disponible. Activa la localización y utiliza HTTPS.',
 'Location unavailable. Enable GPS and open My Places over HTTPS.':'Ubicación no disponible. Activa el GPS y abre Mis lugares mediante HTTPS.',
 '⌖ Measuring…':'⌖ Midiendo…',
 'Looking for an accurate GPS fix (up to 30 seconds)…':'Buscando una posición GPS precisa (hasta 30 segundos)…',
 'Best accuracy: ±{accuracy} m ({grade}). Measuring… {seconds}/30 s':'Mejor precisión: ±{accuracy} m ({grade}). Midiendo… {seconds}/30 s',
 'Excellent':'Excelente','Low':'Baja',
 'Location permission denied. Enable site location permission.':'Permiso de ubicación denegado. Autoriza la ubicación para esta web.',
 'GPS timed out. Try again outdoors.':'Se ha agotado el tiempo de espera del GPS. Prueba al aire libre.',
 'GPS unavailable. Try again.':'GPS no disponible. Vuelve a intentarlo.',
 'Enter your own title or capture a new position.':'Escribe un título o captura una nueva posición.',
 'Address from GPS · © OpenStreetMap contributors.':'Dirección obtenida por GPS · © colaboradores de OpenStreetMap.',
 'Looking up address…':'Buscando dirección…',
 'Address unavailable; coordinates will be used as title.':'Dirección no disponible; se usarán las coordenadas como título.',
 'Address lookup unavailable; coordinates will be used as title.':'No se ha podido consultar la dirección; se usarán las coordenadas como título.',
 'Image processing unavailable':'No se pueden procesar imágenes',
 'Image too large after compression. Choose another image.':'La imagen es demasiado grande incluso comprimida. Elige otra.',
 'Selected place photo':'Foto seleccionada del lugar','Photo ready to save':'Foto lista para guardar',
 'Waiting for GPS position.':'Esperando la posición GPS.','Invalid coordinates':'Coordenadas no válidas',
 'Enter a new map name.':'Introduce un nombre para el nuevo mapa.',
 'Select a map.':'Selecciona un mapa.','Enter a new group name.':'Introduce un nombre para el nuevo grupo.',
 'Place saved':'Lugar guardado','Permanently delete this place?':'¿Eliminar este lugar definitivamente?',
 'Place deleted':'Lugar eliminado',
 'CSV has no records':'El CSV no contiene registros',
 'Missing required column: {column}':'Falta la columna obligatoria: {column}',
 'Invalid row {row}':'Fila {row} no válida','Text too long':'Texto demasiado largo',
 '{count} valid rows · {duplicates} matching existing coordinates · {newCount} new · {repeats} repeated CSV rows ignored.':'{count} filas válidas · {duplicates} con coordenadas existentes · {newCount} nuevas · {repeats} filas duplicadas ignoradas.',
 'Import {count} places? {details}':'¿Importar {count} lugares? {details}',
 'Matching existing entries will be overwritten (photos retained).':'Se sobrescribirán los registros coincidentes (conservando las fotos).',
 'Existing entries will stay unchanged.':'Los registros existentes no se modificarán.',
 'Imported {count} places':'Se han importado {count} lugares',
 'Imported {count} rows before error. Recheck before retrying.':'Se han importado {count} filas antes del error. Revísalas antes de reintentar.',
 'Finding your current position…':'Buscando tu ubicación actual…',
 'Unable to center map: {detail}':'No se ha podido centrar el mapa: {detail}',
 'Unable to center map. Check location permissions.':'No se ha podido centrar el mapa. Comprueba los permisos de ubicación.',
 'GPS active · ±{accuracy} m':'GPS activo · ±{accuracy} m',
 'GPS active · Finding your position…':'GPS activo · Buscando tu posición…',
 'Location permission denied. Allow location access in browser settings.':'Permiso de ubicación denegado. Actívalo en los ajustes del navegador.',
 'GPS unavailable: {detail}':'GPS no disponible: {detail}',
 'An unexpected error occurred. Please try again.':'Se ha producido un error. Inténtalo de nuevo.',
 'Map drawing not available':'No se puede generar el mapa',
 'Could not decode saved photograph':'No se ha podido abrir la fotografía guardada',
 'No places match the current filters.':'Ningún lugar coincide con los filtros actuales.',
 'No valid coordinates to map.':'No hay coordenadas válidas para el mapa.',
 'Preparing PDF…':'Preparando PDF…','Places':'Lugares',
 '{count} places':'{count} lugares',
 'Adding photos ({current}/{total})…':'Añadiendo fotos ({current}/{total})…',
 'Page {page} / {total}':'Página {page} / {total}',
 'PDF ready: {count} places, {photos} photos.':'PDF listo: {count} lugares, {photos} fotos.',
 ' {count} photos unavailable.':' {count} fotos no disponibles.',
 ' Map tiles unavailable.':' No se han podido cargar las teselas del mapa.',
 'PDF export failed: {detail}':'Error al exportar el PDF: {detail}'
};

export function t(message, values = {}) {
 const original = String(message);
 const translated = locale === 'es-ES' ? (es[original] ?? original) : original;
 return translated.replace(/\{(\w+)\}/g, (match,key) => Object.hasOwn(values,key) ? String(values[key]) : match);
}
export function displayEnum(value) { return t(value ?? ''); }
export function errorMessage(error) {
 const detail = error?.message || String(error);
 return locale === 'es-ES' && !Object.hasOwn(es, detail) ? t('An unexpected error occurred. Please try again.') : t(detail);
}
/** Translate only authored UI, never user-authored labels or values from Firestore. */
export function localizeStatic(root = document) {
 if (!root?.documentElement || !root.body) return;
 root.documentElement.lang = locale;
 root.title = t('My Places');
 if (locale !== 'es-ES') return;
 const walker = root.createTreeWalker(root.body, NodeFilter.SHOW_TEXT);
 let node;
 while ((node = walker.nextNode())) {
  if (node.parentElement?.closest('script,style,code')) continue;
  const original = node.nodeValue.trim();
  if (original && Object.hasOwn(es,original)) {
   const at = node.nodeValue.indexOf(original);
   node.nodeValue = node.nodeValue.slice(0,at) + es[original] + node.nodeValue.slice(at+original.length);
  }
 }
 for (const el of root.querySelectorAll('[placeholder],[title],[aria-label],[alt]')) {
  for (const attribute of ['placeholder','title','aria-label','alt']) {
   if (el.hasAttribute(attribute)) {
    const original = el.getAttribute(attribute);
    if (Object.hasOwn(es,original)) el.setAttribute(attribute,es[original]);
   }
  }
 }
}
if (typeof document !== 'undefined') localizeStatic(document);
