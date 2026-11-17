import { Sparkles } from "lucide-react";
import { SourceForm } from "../components/SourceForm";
import { uid } from "../lib/util";
import { useApp } from "../store/app";

export function Onboarding() {
  const addSource = useApp((s) => s.addSource);
  return (
    <div className="onboarding">
      <div className="onboarding__bg">
        <i />
        <i />
        <i />
      </div>
      <div className="onboarding__card">
        <div className="onboarding__brand">
          <img src="/logo.svg" alt="" />
          <div>
            <h1>Simple IPTV</h1>
            <p className="muted">Fast, beautiful live TV, films and series.</p>
          </div>
        </div>
        <SourceForm onAdd={addSource} />
        <button className="btn btn--ghost block" onClick={() => addSource({ id: uid(), kind: "demo", name: "Demo" })}>
          <Sparkles size={16} /> Explore with demo content
        </button>
        <p className="fine-print">Your login details are stored only on this device.</p>
      </div>
    </div>
  );
}
