# Translations and client settings

Every word on screen comes from a language file, and every client-specific value
(name, colour, languages, currency) comes from a settings file. Clients change
both **without rebuilding** the app, and their changes **survive upgrades**.

## Where the files are

| File | Who edits it | Purpose |
| --- | --- | --- |
| `lib/i18n/locales/<lang>.json` | Product team | Base text shipped with each release (en, fr, de, es, it, pt) |
| `client-config/i18n/overrides/<lang>.json` | Client / implementer | Change individual words for one installation |
| `client-config/i18n/<lang>.json` | Client / implementer | Add a whole new language |
| `client-config/settings.json` | Client / implementer | Name, logo, brand colour, languages, currency, demo mode, SSO |
| `client-config/brand/` | Client / implementer | Logo and other brand images, served at `/brand/<file>` |

The app reads `client-config/` from disk on every request, so edits and new files
appear on the next page load with no rebuild or restart. On a server, point the
`CLIENT_CONFIG_DIR` environment variable at a folder outside the app (a mounted
volume in Docker, for example `/srv/nexus/client-config`) so upgrades never touch it.

## Change a word for one client

Example: the client says "Indent" instead of "Sales request" in English, and
"Commande" instead of "Demande de vente" in French.

`client-config/i18n/overrides/en.json`
```json
{
  "login": { "slip": { "title": "Indent" } }
}
```

`client-config/i18n/overrides/fr.json`
```json
{
  "login": { "slip": { "title": "Commande" } }
}
```

Only the keys you list are replaced; everything else keeps the shipped text.
Reload the page to see the change. To find a key, search the English file
`lib/i18n/locales/en.json` for the text you see on screen.

## Add a new language (for example Telugu)

1. Copy `lib/i18n/locales/en.json` to `client-config/i18n/te.json` and translate the values (never the keys).
2. In `client-config/settings.json`, register and enable it:

```json
{
  "languages": ["en", "te"],
  "customLanguages": [{ "code": "te", "label": "తెలుగు", "dir": "ltr" }]
}
```

Use `"dir": "rtl"` for right-to-left languages such as Arabic. Any key the new
file doesn't have falls back to English, so a partial translation still works.

## Rules for translators

- Keep placeholders exactly as they are: `{name}`, `{count}`, `{erp}`, `{password}`.
- Plurals use `one` / `other` (some languages also use `few`, `many`):
  `"lines": { "one": "{count} line", "other": "{count} lines" }`.
- Don't translate product codes, order numbers or customer names; they come from the ERP.
- Error messages are keys too (`errors.auth.invalidCredentials`), so they translate like any other text.

## Check translations

```bash
npm run i18n:check            # missing keys, wrong placeholders, typos in overrides
npm run i18n:check -- --strict  # also fail when any language is incomplete
```

It also lists keys used in the code that are missing from English, so developers
catch untranslated text before release.

## For developers

- Never write user-facing text in a component. Add a key to `en.json` and use `t('area.key')`.
- Add the same key to every language file (or run the check to see what's missing).
- Numbers, money and dates: use `fmtMoney`, `fmtNumber`, `fmtDate`, `timeAgo` from `lib/format`.
  They follow the user's language and the client's region and currency automatically.
- Use logical CSS (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`) instead of left/right,
  so layouts mirror correctly in right-to-left languages.

## settings.json reference

| Setting | Example | Meaning |
| --- | --- | --- |
| `productName` | `"Nexus B2B"` | Name in the header, login page and browser tab |
| `companyName` | `"Lakshmi Industries"` | Shown in the footer |
| `logoUrl` | `"/brand/logo.svg"` | Optional logo placed in `client-config/brand/`; empty shows a monogram |
| `brandColor` | `"#0F5257"` | One hex colour; buttons, links, sidebar and focus rings derive from it. Pick a dark or mid-tone colour so white text stays readable |
| `erpName` | `"Sage X3"` | ERP name shown in the UI |
| `defaultLanguage` | `"en"` | Used when the browser language isn't enabled |
| `languages` | `["en","fr"]` | Languages offered, in menu order |
| `customLanguages` | see above | Extra languages provided as `client-config/i18n/<code>.json` |
| `region` | `"IN"` | Number and date style (IN gives 1,00,000) |
| `currency` | `"INR"` | ISO currency code |
| `demoMode` | `false` | Show one-click demo accounts on the login page. **Turn off in production** |
| `sso` | `{ "enabled": true, "provider": "Microsoft" }` | Show the single sign-on button |
| `privacyUrl`, `termsUrl` | `"https://…"` | Footer links; hidden when empty |

The installed app caches `settings.json` and override files for offline use, so
after an edit users see the change on their next page load.
