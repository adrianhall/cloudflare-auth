import { useState } from "react";

interface Props {
  method: string;
  path: string;
  body?: unknown;
}

function buildCurl(origin: string, method: string, path: string, body?: unknown): string {
  const url = `${origin}${path}`;
  const parts: string[] = ["curl -v"];

  if (method !== "GET") {
    parts.push(`-X ${method}`);
  }

  parts.push(`'${url}'`);

  if (body) {
    parts.push("-H 'Content-Type: application/json'");
    parts.push(`-d '${JSON.stringify(body)}'`);
  }

  // Show how to add auth
  parts.push(`\n  # To authenticate, add:\n  # -H 'cf-access-jwt-assertion: <TOKEN>'`);
  parts.push(
    `  # Generate a token with:\n  # node -e "import('@adrianhall/cloudflare-auth').then(m=>m.signDevJwt('you@example.com')).then(console.log)"`
  );

  return parts.join(" \\\n  ");
}

export function CurlCommand({ method, path, body }: Props) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
  const curl = buildCurl(origin, method, path, body);

  // Only copy the actual command (first part before the comments)
  const copyText = curl.split("\n  #")[0];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may not work in some contexts
    }
  };

  return (
    <div className="curl-block" data-testid="curl-command">
      <button className="copy-btn" onClick={() => void handleCopy()}>
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre>{curl}</pre>
    </div>
  );
}
