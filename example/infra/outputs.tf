output "account_id" {
  value       = local.account_id
  description = "Cloudflare account ID"
}

output "worker_name" {
  value       = cloudflare_worker.worker.name
  description = "Worker name"
}

output "team_domain" {
  value       = local.team_domain
  description = "Cloudflare Access team domain"
}
