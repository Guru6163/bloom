## Setup
1. `npm install`
2. `npm run build`
3. Open Figma Desktop
4. Plugins → Development → Import plugin from manifest → select `manifest.json`

## Get your Bloom API key
https://trybloom.ai/developers

## Analytics (optional)
The plugin can POST lightweight events to `ANALYTICS_API_URL` in `src/ui.html`. Update that constant if you use a different endpoint, and add the host under `networkAccess.allowedDomains` in `manifest.json`.
