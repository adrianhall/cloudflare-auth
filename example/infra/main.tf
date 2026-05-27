# ── Credentials ──────────────────────────────────────────────────────────────

data "dotenv" "env" {
  filename = "../.env"
}

locals {
  account_id  = data.dotenv.env.env.CLOUDFLARE_ACCOUNT_ID
  api_token   = data.dotenv.env.env.CLOUDFLARE_API_TOKEN
  team_domain = data.dotenv.env.env.CLOUDFLARE_TEAM_DOMAIN
}

# ── Provider ─────────────────────────────────────────────────────────────────

provider "cloudflare" {
  api_token = local.api_token
}

# ── Worker Registration ──────────────────────────────────────────────────────

resource "cloudflare_worker" "worker" {
  account_id = local.account_id
  name       = "cloudflare-auth-example"
}
