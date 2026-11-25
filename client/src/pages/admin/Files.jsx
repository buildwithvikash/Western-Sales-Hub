import { useState } from "react";
import { FolderOpen, Upload } from "lucide-react";
import { Badge, Button, ErrorBox, Flash, FormError, Loading, Modal, ModalFooter, PageBody, PageHeader, Select, Table, useApi, toast } from "../../components/ui.jsx";
import { DeleteFileButton, VersionButtons, uploadFiles } from "../../components/FileControls.jsx";
import { FILE_TYPES, fmtDate } from "../../api.js";

export default function Files() {
  const { data, error, reload } = useApi("/files");
  const [fp, setFp] = useState("");
  const [ft, setFt] = useState("");
  const [up, setUp] = useState(false);
  const [flash, setFlash] = useState(null);

  const productNames = [...new Set((data || []).map((f) => f.productName))];
  const rows = (data || []).filter((f) => (!fp || f.productName === fp) && (!ft || f.type === ft));
  const changed = () => {
    setFlash(null);
    reload();
  };

  return (
    <>
      <PageHeader icon={FolderOpen} title="Files" subtitle="Upload a new version to update a file: reps always get the latest, earlier versions stay in History" crumbs={[{ label: "Content" }, { label: "Files" }]}>
        <Button icon={Upload} onClick={() => setUp(true)}>
          Upload content
        </Button>
      </PageHeader>
      <PageBody>
        <Flash message={flash} onDismiss={() => setFlash(null)} />
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Product" value={fp} onChange={setFp} options={[["", "All products"], ...productNames]} />
          <Select aria-label="Type" value={ft} onChange={setFt} options={[["", "All types"], ...Object.entries(FILE_TYPES)]} />
        </div>
        {error && <ErrorBox error={error} onRetry={reload} />}
        {!data && !error && <Loading />}
        {data && (
          <Table
            rows={rows}
            empty="No files yet. Use Upload content to add the first one."
            columns={[
              { key: "name", header: "File", render: (f) => <span className="font-semibold text-slate-900 break-all">{f.name}</span> },
              { key: "productName", header: "Product" },
              { key: "type", header: "Type", render: (f) => <Badge variant="info">{FILE_TYPES[f.type]}</Badge> },
              {
                key: "version",
                header: "Version",
                render: (f) => (
                  <span className="tabular">
                    v{f.version}
                    {f.versionCount > 1 && <span className="text-xs text-slate-400"> ({f.versionCount - 1} earlier)</span>}
                  </span>
                ),
              },
              { key: "uploadedAt", header: "Last updated", render: (f) => fmtDate(f.uploadedAt) },
              { key: "act", header: "", align: "right", render: (f) => (
                  <span className="inline-flex items-center gap-1">
                    <VersionButtons file={f} onChanged={changed} onError={setFlash} />
                    <DeleteFileButton file={f} onDeleted={changed} />
                  </span>
                ),
              },
            ]}
          />
        )}
      </PageBody>
      {up && (
        <UploadModal
          onClose={() => setUp(false)}
          onDone={() => {
            setUp(false);
            changed();
          }}
        />
      )}
    </>
  );
}

function UploadModal({ onClose, onDone }) {
  const products = useApi("/products");
  const [pid, setPid] = useState("");
  const [type, setType] = useState("brochure");
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const list = products.data || [];
  const productId = pid || (list[0] ? String(list[0].id) : "");

  const go = async () => {
    if (!productId) return setErr("Add a product first.");
    if (!files.length) return setErr("Choose at least one file.");
    setBusy(true);
    try {
      await uploadFiles(productId, type, files);
      toast.success("Uploaded");
      onDone();
    } catch (e) {
      setErr(`Upload failed: ${e.message} Nothing was changed.`);
      setBusy(false);
    }
  };

  return (
    <Modal title="Upload content" subtitle="New files start at version 1" onClose={onClose} footer={<ModalFooter onCancel={onClose} onSave={go} saving={busy} saveLabel="Upload" />}>
      <Select label="Product" value={productId} onChange={setPid} options={list.map((p) => [String(p.id), p.name || "(Untitled)"])} />
      <Select label="Type" value={type} onChange={setType} options={Object.entries(FILE_TYPES)} />
      <div>
        <p className="text-[11px] font-semibold text-slate-600 mb-1.5">Files</p>
        <input type="file" multiple onChange={(e) => setFiles([...e.target.files])} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
      </div>
      <FormError message={err} />
    </Modal>
  );
}
