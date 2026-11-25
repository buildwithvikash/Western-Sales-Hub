import { useState } from "react";
import { Download, History as HistoryIcon, Upload } from "lucide-react";
import { api, fmtDate, openFile } from "../api.js";
import { Badge, Button, ErrorBox, FileButton, Loading, Modal, useApi, toast } from "./ui.jsx";

/** "New version" + "History" buttons for one file. Calls onChanged after an upload. */
export function VersionButtons({ file, onChanged, onError }) {
  const [hist, setHist] = useState(false);
  const [busy, setBusy] = useState(false);

  const upload = async ([f]) => {
    const form = new FormData();
    form.append("file", f);
    setBusy(true);
    try {
      const r = await api(`/files/${file.id}/versions`, { method: "POST", form });
      toast.success("New version uploaded: v" + r.version);
      onChanged?.();
    } catch (ex) {
      onError?.(`Upload failed for ${f.name}: ${ex.message} The current version was not changed.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex gap-1.5">
      <FileButton icon={Upload} onFiles={upload} busy={busy}>
        New version
      </FileButton>
      <Button size="sm" variant="ghost" icon={HistoryIcon} onClick={() => setHist(true)}>
        History
      </Button>
      {hist && <History fileId={file.id} onClose={() => setHist(false)} />}
    </span>
  );
}

function History({ fileId, onClose }) {
  const { data, error } = useApi(`/files/${fileId}/versions`);
  return (
    <Modal title="Version history" subtitle="Reps see only the current version. Earlier versions are kept and never deleted." onClose={onClose}>
      {error && <ErrorBox error={error} />}
      {!data && !error && <Loading rows={2} />}
      {data?.map((v) => (
        <div key={v.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-800 truncate">{v.name}</span>
            <span className="block text-[11px] text-slate-500">
              {fmtDate(v.uploadedAt)}
              {v.uploadedBy ? ` · ${v.uploadedBy}` : ""}
            </span>
          </span>
          <Badge variant={v.current ? "success" : "neutral"}>
            v{v.version}
            {v.current ? " · current" : ""}
          </Badge>
          <Button size="sm" variant="secondary" icon={Download} onClick={() => openFile(v.id)}>
            Download
          </Button>
        </div>
      ))}
    </Modal>
  );
}

/** Upload one or more new files of a type to a product. Throws ApiError. */
export async function uploadFiles(productId, type, fileList) {
  const form = new FormData();
  form.append("type", type);
  [...fileList].forEach((f) => form.append("files", f));
  return api(`/files/product/${productId}`, { method: "POST", form });
}
