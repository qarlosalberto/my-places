# My Places

Mobile-first, English-language place journal hosted with GitHub Pages.

## Features
- Sign in with Google and access by invitation, using `invites/{email}` in Firestore.
- Private data for each authorized Google account.
- Map and list, GPS location, title, description, optional compressed photo.
- Rating: Perfect / Good / Bad; size: Large / Small / Doesn't matter; visibility: Perfect / Good / Bad / Not sure.
- Category → Group hierarchy and filters.
- CSV import/export. When importing, matching coordinates (6 decimal places) can be preserved or overwritten. CSV does not include photos.

## Configure
1. In Firebase Authentication enable Google. Register a web application.
2. Copy its **public web config** into `site/firebase-config.js`; never put service-account secrets in a public repository.
3. In Firestore Rules, manually publish `firestore.rules`. The GitHub workflow does **not** deploy Firestore rules.
4. In Firestore Data, create `invites` and a document whose ID is your exact lowercase Google email. Give it the Boolean field `active: true`. Repeat for invited people only.
5. Add `qarlosalberto.github.io` in Firebase Authentication → Settings → Authorized domains.
6. In GitHub Settings → Pages, select **GitHub Actions** as deployment source. The workflow deploys a reduced `_public/` artifact containing only the markers app; the electoral source and data remain in GitHub but are not deployed.
7. Once Pages completes, open https://qarlosalberto.github.io/my-places/ and check invited and uninvited Google accounts.

The Firebase Spark plan offers free quotas; monitor usage. The site needs HTTPS and location permission for GPS. Firebase Authentication may register a non-invited Google account, but Firestore rules must prohibit that person from accessing places. Before inviting others, provide a proper privacy notice. The CSV feature is not a full backup because photos are omitted.

## Sitio público: solo marcadores

La página https://qarlosalberto.github.io/my-places/ abre directamente la aplicación privada de **lugares y marcadores**. Se mantiene el acceso con Google, la comprobación de invitaciones de Firestore, los puntos, los mapas, las fotos y las exportaciones actuales. No hay portada de dos accesos ni enlaces al atlas electoral. Un enlace antiguo como `#atlas` tampoco activa la funcionalidad electoral.

### Atlas electoral conservado para el futuro

La implementación del atlas **no se ha borrado**: `site/atlas.js`, `site/trends.js`, `site/data/`, `ATLAS-DATOS.md`, scripts y tests históricos siguen versionados en este repositorio. Se podrá restaurar desde un futuro cambio explícito.

Para que el atlas **tampoco esté accesible como ficheros estáticos en GitHub Pages**, `scripts/build_public_site.py` construye un paquete temporal que contiene exclusivamente `index.html`, `app.js`, el CSS básico, el icono, el manifiesto y la configuración web de Firebase. El workflow `.github/workflows/deploy.yml` publica únicamente ese paquete. CI verifica su composición.

**Importante:** el repositorio GitHub es público. Por ello, los visitantes de GitHub sí pueden consultar el código electoral y los datos que conserva, aunque esos archivos ya no se sirvan desde la página web. Esta configuración **no** convierte el código del repositorio en privado.

No se alteran las colecciones de Firestore ni las reglas de seguridad. Para habilitar de nuevo el atlas habrá que reponer su pantalla, su integración en `app.js` y permitir que el workflow publique sus recursos, con CI y revisión previa.
