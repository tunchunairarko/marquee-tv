import { Link2, Server } from "lucide-react";
import { useState } from "react";
import { uid, cx } from "../lib/util";
import type { Source } from "../providers";
import { normalizeServer, XtreamProvider } from "../providers/xtream";
import { Spinner } from "./Spinner";

export function SourceForm({ onAdd, compact }: { onAdd(src: Source): void; compact?: boolean }) {
  const [kind, setKind] = useState<"xtream" | "m3u">("xtream");
  const [name, setName] = useState("");
  const [server, setServer] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (kind === "m3u") {
      if (!url.trim()) return setError("Enter a playlist URL or file path");
      onAdd({ id: uid(), kind: "m3u", name: name.trim() || hostOf(url) || "My playlist", url: url.trim() });
      return;
    }
    if (!server.trim() || !username.trim()) return setError("Server and username are required");
    const src: Source = {
      id: uid(),
      kind: "xtream",
      name: name.trim() || hostOf(server) || "My IPTV",
      server: normalizeServer(server),
      username: username.trim(),
      password,
    };
    setBusy(true);
    try {
      await new XtreamProvider(src).authenticate();
      onAdd(src);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={cx("source-form", compact && "compact")} onSubmit={submit}>
      <div className="segmented wide">
        <button type="button" className={cx(kind === "xtream" && "is-active")} onClick={() => setKind("xtream")}>
          <Server size={15} /> Xtream Codes
        </button>
        <button type="button" className={cx(kind === "m3u" && "is-active")} onClick={() => setKind("m3u")}>
          <Link2 size={15} /> M3U playlist
        </button>
      </div>
      <Field label="Name (optional)" value={name} onChange={setName} placeholder="e.g. Living room" />
      {kind === "xtream" ? (
        <>
          <Field label="Server URL" value={server} onChange={setServer} placeholder="http://provider.example:8080" autoFocus />
          <div className="field-row">
            <Field label="Username" value={username} onChange={setUsername} autoComplete="username" />
            <Field label="Password" value={password} onChange={setPassword} type="password" autoComplete="current-password" />
          </div>
        </>
      ) : (
        <Field label="Playlist URL or file path" value={url} onChange={setUrl} placeholder="https://…/playlist.m3u" autoFocus />
      )}
      {error && <div className="form-error">{error}</div>}
      <button className="btn btn--primary btn--lg block" disabled={busy} type="submit">
        {busy ? <Spinner size={20} /> : kind === "xtream" ? "Sign in" : "Add playlist"}
      </button>
    </form>
  );
}

function hostOf(u: string) {
  try {
    return new URL(/^https?:/i.test(u) ? u : `http://${u}`).hostname;
  } catch {
    return "";
  }
}

function Field(props: {
  label: string;
  value: string;
  onChange(v: string): void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        value={props.value}
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        autoFocus={props.autoFocus}
        autoComplete={props.autoComplete ?? "off"}
        spellCheck={false}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}
