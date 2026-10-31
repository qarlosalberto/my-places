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
6. In GitHub Settings → Pages, select **GitHub Actions** as deployment source. The workflow deploys the `site/` folder.
7. Once Pages completes, open https://qarlosalberto.github.io/my-places/ and check invited and uninvited Google accounts.

The Firebase Spark plan offers free quotas; monitor usage. The site needs HTTPS and location permission for GPS. Firebase Authentication may register a non-invited Google account, but Firestore rules must prohibit that person from accessing places. Before inviting others, provide a proper privacy notice. The CSV feature is not a full backup because photos are omitted.

## Nueva portada y atlas electoral de Zaragoza
- Entrada inicial con **Capturar lugares** y **Atlas electoral**.
- Enlaces internos `#home`, `#carteles` y `#atlas` aptos para GitHub Pages, sin backend adicional.
- El atlas público tiene vistas de mapa, comparación, evolución, participación y metodología. Comparte Firebase Authentication y puede mostrar **solo con consentimiento (capa desactivada por defecto)** los puntos guardados de la cuenta autorizada.
- El atlas solo presenta resultados reales incluidos en `site/data/catalog.json`. **Estado actual: 37 capas de generales, municipales y europeas (2000–2024); autonómicas pendientes.** No se utilizan datos simulados ni se extrapolan cifras municipales a secciones censales. Atención: el seccionado cartográfico de 2023 no coincide necesariamente con el histórico.
- Contrato de datos, fuentes y controles de calidad en [ATLAS-DATOS.md](ATLAS-DATOS.md). Validador: `python3 scripts/validate_atlas.py`.
- El sitio sigue sin requerir proceso de compilación. El workflow publica `site/` en GitHub Pages.
