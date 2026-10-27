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
