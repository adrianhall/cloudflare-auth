import { useState } from "react";
import { CurlCommand } from "./CurlCommand.js";

export interface TestResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  redirected: boolean;
  url: string;
  durationMs: number;
}

interface Props {
  method: string;
  path: string;
  requestBody?: unknown;
  response: TestResponse;
}

function statusClass(status: number): string {
  if (status >= 200 && status < 300) return "ok";
  if (status >= 300 && status < 400) return "redirect";
  return "error";
}

function tryFormatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function ResponseDisplay({ method, path, requestBody, response }: Props) {
  const [showHeaders, setShowHeaders] = useState(false);
  const [showCurl, setShowCurl] = useState(false);

  return (
    <div className="response-display" data-testid="response-display">
      {/* Summary line */}
      <div className="response-summary">
        <span className={`status-badge ${statusClass(response.status)}`}>
          {response.status} {response.statusText}
        </span>
        <span>{response.durationMs}ms</span>
        {response.redirected && (
          <span>
            (redirected to <code>{response.url}</code>)
          </span>
        )}
      </div>

      {/* Response body */}
      <div className="response-body">
        <pre data-testid="response-body">{tryFormatJson(response.body)}</pre>
      </div>

      {/* Collapsible: response headers */}
      <div className="collapsible-header" onClick={() => setShowHeaders(!showHeaders)}>
        <span>{showHeaders ? "v" : ">"}</span>
        <span>Response Headers ({Object.keys(response.headers).length})</span>
      </div>
      {showHeaders && (
        <pre
          style={{
            fontSize: "0.8rem",
            background: "#f1f3f5",
            padding: "0.5rem",
            borderRadius: "4px"
          }}
        >
          {Object.entries(response.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")}
        </pre>
      )}

      {/* Collapsible: curl command */}
      <div className="collapsible-header" onClick={() => setShowCurl(!showCurl)}>
        <span>{showCurl ? "v" : ">"}</span>
        <span>curl command</span>
      </div>
      {showCurl && <CurlCommand method={method} path={path} body={requestBody} />}
    </div>
  );
}
