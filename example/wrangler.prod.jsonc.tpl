{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "{{worker_name}}",
  "main": "dist/cloudflare_auth_example/index.js",
  "account_id": "{{account_id}}",
  "compatibility_date": "2025-04-01",
  "no_bundle": true,
  "vars": {
    "CLOUDFLARE_TEAM_DOMAIN": "{{team_domain}}"
  },
  "assets": {
    "directory": "dist/client",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": true
  }
}
