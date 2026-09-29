import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Control, Group } from "./StudioControls";
import {
  bundledLuts,
  importedLuts,
  importLutFile,
  prepareLut,
  type LutEntry,
} from "./lutLibrary";
import type { useStudio } from "./useStudio";
import type { Finish } from "./finish";

export function LutPanel({ d }: { d: ReturnType<typeof useStudio> }) {
  const f = d.state.finish;
  const [custom, setCustom] = useState<LutEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    revision = useRef(0);
  useEffect(() => {
    let active = true;
    importedLuts()
      .then((v) => {
        if (active) setCustom(v);
      })
      .catch((e) => {
        if (active) d.setError(String(e));
      });
    return () => {
      active = false;
      revision.current++;
    };
  }, []);
  const entries = [
    ...bundledLuts,
    ...custom.filter((v) => !bundledLuts.some((b) => b.id === v.id)),
  ];
  const selected = entries.find((v) => v.id === f.lutId);
  const patch = (value: Partial<Finish>) =>
    d.setState((s) => ({ ...s, finish: { ...s.finish, ...value } }));
  async function choose(id: string, space = f.lutSpace) {
    const ticket = ++revision.current;
    setLoading(true);
    try {
      const next = { ...f, lutId: id, lutEnabled: !!id, lutSpace: space };
      await prepareLut(next);
      if (ticket === revision.current)
        patch({ lutId: id, lutEnabled: !!id, lutSpace: space });
    } catch (e) {
      if (ticket === revision.current) d.setError(String(e));
    } finally {
      if (ticket === revision.current) setLoading(false);
    }
  }
  return (
    <Group
      name="LUTs"
      onReset={() => {
        revision.current++;
        setLoading(false);
        patch({
          lutId: "",
          lutEnabled: false,
          lutStrength: 100,
          lutSpace: "srgb",
          lutOutside: "preserve",
        });
      }}
    >
      <div className="lut-heading">
        <label>
          <input
            type="checkbox"
            aria-label="Enable LUT"
            disabled={!f.lutId}
            checked={f.lutEnabled}
            onChange={(e) => {
              revision.current++;
              setLoading(false);
              patch({ lutEnabled: e.target.checked });
            }}
          />
          Enable LUT
        </label>
        <span>50 included</span>
      </div>
      <select
        className="lut-library"
        aria-label="LUT preset"
        value={f.lutId}
        onChange={(e) =>
          void choose(
            e.target.value,
            entries.find((v) => v.id === e.target.value)?.space || "srgb",
          )
        }
      >
        <option value="">None</option>
        {f.lutId && !selected && <option value={f.lutId}>Saved LUT</option>}
        {[...new Set(entries.map((v) => v.category))].map((category) => (
          <optgroup key={category} label={category}>
            {entries
              .filter((v) => v.category === category)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <div className="lut-import">
        <button onClick={() => file.current?.click()}>
          <Upload size={15} />
          Import .cube
        </button>
        {loading && <span role="status">Loading LUT…</span>}
      </div>
      <input
        ref={file}
        aria-label="Import CUBE LUT"
        type="file"
        accept=".cube"
        hidden
        onChange={async (e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (!picked) return;
          const ticket = ++revision.current;
          setLoading(true);
          try {
            const asset = await importLutFile(picked);
            if (ticket !== revision.current) return;
            setCustom(await importedLuts());
            await choose(asset.id, asset.space);
          } catch (error) {
            if (ticket === revision.current) {
              d.setError(String(error));
              setLoading(false);
            }
          }
        }}
      />
      <Control
        label="LUT strength"
        value={f.lutStrength}
        min={0}
        max={100}
        reset={100}
        disabled={!f.lutId || !f.lutEnabled}
        onChange={(lutStrength) => patch({ lutStrength })}
        tip="Blend the LUT grade with the original color, from 0% to 100%."
      />
      <details>
        <summary>Color space & range</summary>
        <label className="lut-option">
          LUT input / output
          <select
            aria-label="LUT color space"
            value={f.lutSpace}
            onChange={(e) =>
              patch({ lutSpace: e.target.value as Finish["lutSpace"] })
            }
          >
            <option value="srgb">sRGB</option>
            <option value="rec709">Rec.709</option>
            <option value="linear">Linear sRGB</option>
          </select>
        </label>
        <label className="lut-option">
          Outside LUT range
          <select
            aria-label="LUT range handling"
            value={f.lutOutside}
            onChange={(e) =>
              patch({ lutOutside: e.target.value as Finish["lutOutside"] })
            }
          >
            <option value="preserve">Preserve (bypass)</option>
            <option value="clamp">Clamp to LUT</option>
          </select>
        </label>
        <p className="muted">
          Creative LUTs in the selected color space. Log-to-display transforms
          need external conversion. Preserve bypasses pixels outside the LUT
          domain to retain HDR values.
        </p>
      </details>
      {selected && (
        <small className="lut-credit" title={selected.url}>
          {selected.author} · {selected.license}
        </small>
      )}
    </Group>
  );
}
