---
name: Mobile auth and e2e sessions
description: How the Expo mobile app authenticates and how e2e tests obtain a signed-in mobile session
---

- The mobile app authenticates with a bearer session token obtained via the Replit Auth mobile token-exchange flow; it is stored in SecureStore on native and localStorage (`auth_session_token`) on web, and attached to API calls through the API client's auth-token getter.
- **How to apply (e2e):** The interactive OIDC login cannot run headlessly, so tests create a real user + session row in the DB and seed the sid into the app's token storage (`page.addInitScript` setting localStorage) before loading `https://${REPLIT_EXPO_DEV_DOMAIN}/<route>`; skip when that env var is unset.
- React Native Web maps `testID` → `data-testid`, so `getByTestId` works against the Expo web build.
- A "blocked by CORS / no ACAO header" error from the Expo web app usually means the api-server workflow is down (502), not a CORS misconfiguration.
