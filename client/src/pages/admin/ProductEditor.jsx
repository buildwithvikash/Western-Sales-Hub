import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, FileText, FolderOpen, ListChecks, MessageSquareQuote, Package, Plus, Save, Send, Swords, Trash2, Upload } from "lucide-react";
import { Badge, Button, Card, Empty, ErrorBox, FileButton, Flash, Loading, Modal, ModalFooter, PageBody, PageHeader, Select, StatusBadge, Tabs, TextArea, TextInput, inputCls, toast, useApi } from "../../components/ui.jsx";
import { DeleteFileButton, VersionButtons, uploadFiles } from "../../components/FileControls.jsx";
import { api, ext, fmtDate, FILE_TYPES } from "../../api.js";

const TABS = [
  { key: "details", label: "Details & specs", icon: ListChecks },
  { key: "files", label: "Files", icon: FolderOpen },
  { key: "pitch", label: "Sales pitch", icon: MessageSquareQuote },
  { key: "battlecard", label: "Battlecard", icon: Swords },
];

/** A product that exists only in the editor until its first Save. */
const blankProduct = () => ({
  id: null,
  name: "",
  categoryId: null,
  category: "",
  subtitle: "",
  description: "",
  imageUrl: null,
  published: false,
  specs: [["", ""]],
  pitch: { opener: "", points: ["", ""], ask: "" },
  objections: [["", ""]],
  battlecard: { competitor: "", rows: [["", "", ""]], wins: [], watch: [] },
  files: Object.fromEntries(Object.keys(FILE_TYPES).map((t) => [t, []])),
});

export default function ProductEditor() {
  const { id, tab = "details" } = useParams();
  const isNew = id === "new";
  const nav = useNavigate();
  const cats = useApi("/categories");
  const [p, setP] = useState(null); // editable draft
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (id === "new") setP((cur) => (cur && !cur.id ? cur : blankProduct()));
    else api(`/products/${id}`).then(setP).catch(setError);
  }, [id]);

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const h = (e) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Re-fetch only the files after an upload so unsaved text edits are kept.
  const reloadFiles = () => api(`/products/${id}`).then((fresh) => setP((cur) => ({ ...cur, files: fresh.files, imageUrl: fresh.imageUrl })));

  if (error)
    return (
      <>
        <PageHeader icon={Package} title="Product not found" crumbs={[{ label: "Content" }, { label: "Products", to: "/admin/products" }]} />
        <PageBody>
          <ErrorBox error={error} />
          <Button to="/admin/products" variant="secondary" icon={ArrowLeft}>
            Back to products
          </Button>
        </PageBody>
      </>
    );
  if (!p)
    return (
      <PageBody>
        <Loading rows={5} />
      </PageBody>
    );

  const edit = (fn) => {
    setP((cur) => {
      const next = structuredClone(cur);
      fn(next);
      return next;
    });
    setDirty(true);
  };

  /** Returns the saved product, or null if saving failed. */
  const save = async (publish) => {
    setSaving(true);
    try {
      const saved = isNew
        ? await api("/products", { method: "POST", body: { ...p, publish } })
        : await api(`/products/${id}`, { method: "PUT", body: { ...p, publish } });
      setP(saved);
      setDirty(false);
      toast.success(publish && !p.published ? "Published. Reps can now see this product" : isNew ? "Product created" : "Saved");
      if (isNew) nav(`/admin/products/${saved.id}/${tab}`, { replace: true });
      return saved;
    } catch (e) {
      toast.error(e.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api(`/products/${p.id}`, { method: "DELETE" });
      setDirty(false);
      toast.success("Product deleted");
      nav("/admin/products", { replace: true });
    } catch (e) {
      toast.error(e.message);
    }
  };

  const guard = (e) => {
    if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) e.preventDefault();
  };

  let body;
  if (tab === "details") body = <Details p={p} edit={edit} cats={cats.data || []} />;
  else if (tab === "files")
    body = isNew ? (
      <div className="card">
        <Empty icon={FolderOpen} title="Save the product first" text="Files can be uploaded once the product has been saved. Give it a name on the Details tab and click Save draft." />
      </div>
    ) : (
      <FilesTab p={p} onChanged={reloadFiles} setFlash={setFlash} />
    );
  else if (tab === "pitch") body = <Pitch p={p} edit={edit} />;
  else body = <Battlecard p={p} edit={edit} />;

  const fileCount = Object.values(p.files).reduce((a, l) => a + l.length, 0);

  return (
    <>
      <PageHeader
        icon={Package}
        title={
          <>
            {p.name || "New product"} <StatusBadge published={p.published} />
            {dirty && <Badge variant="info">Unsaved changes</Badge>}
          </>
        }
        subtitle={p.subtitle || p.category || "Fill in the details, then publish"}
        crumbs={[{ label: "Content" }, { label: "Products", to: "/admin/products" }]}
      >
        <Link to="/admin/products" onClick={guard} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <Button
          variant="secondary"
          icon={Eye}
          disabled={saving}
          onClick={async () => {
            const target = dirty || isNew ? await save(false) : p;
            if (target) nav(`/product/${target.id}/pitch`);
          }}
        >
          Preview
        </Button>
        <Button variant="secondary" icon={Save} loading={saving} onClick={() => save(false)}>
          {p.published ? "Save" : "Save draft"}
        </Button>
        {!p.published && (
          <Button variant="success" icon={Send} disabled={saving} onClick={() => save(true)}>
            Publish
          </Button>
        )}
        {!isNew && <Button variant="danger-soft" icon={Trash2} aria-label="Delete product" title="Delete product" onClick={() => setConfirmDelete(true)} />}
      </PageHeader>
      {confirmDelete && (
        <Modal
          title="Delete product"
          size="sm"
          onClose={() => setConfirmDelete(false)}
          footer={<ModalFooter onCancel={() => setConfirmDelete(false)} onSave={remove} saveLabel="Delete product" saveVariant="danger" />}
        >
          <p className="text-sm text-slate-600">
            Delete <b>{p.name || "this product"}</b>
            {fileCount ? <> and its <b>{fileCount}</b> file{fileCount === 1 ? "" : "s"} (all versions)</> : null}? Reps will no longer see it.
          </p>
          <p className="text-sm font-semibold text-rose-700">This cannot be undone.</p>
        </Modal>
      )}
      <PageBody>
        <Flash message={flash} onDismiss={() => setFlash(null)} />
        <Tabs tabs={TABS.map((t) => ({ ...t, to: `/admin/products/${p.id ?? "new"}/${t.key}`, count: t.key === "files" ? fileCount : undefined }))} active={tab} />
        {body}
      </PageBody>
    </>
  );
}

/* ---------- reusable row editor ---------- */
function Rows({ rows, placeholders, onChange, onRemove, onAdd, addLabel }) {
  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="hidden sm:flex gap-2 pr-10">
          {placeholders.map((ph) => (
            <span key={ph} className="flex-1 text-[11px] font-semibold text-slate-500">
              {ph}
            </span>
          ))}
        </div>
      )}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          {placeholders.map((ph, j) => (
            <input key={j} className={inputCls} placeholder={ph} aria-label={ph} value={r[j]} onChange={(e) => onChange(i, j, e.target.value)} />
          ))}
          <button type="button" onClick={() => onRemove(i)} aria-label="Remove row" className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <Button size="sm" variant="ghost" icon={Plus} onClick={onAdd}>
        {addLabel}
      </Button>
    </div>
  );
}

function Details({ p, edit, cats }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="Details" icon={FileText}>
        <div className="space-y-4">
          <TextInput label="Product name" value={p.name} placeholder="e.g. SRC1800-GL" onChange={(e) => edit((d) => (d.name = e.target.value))} />
          <Select
            label="Category"
            value={p.categoryId ? String(p.categoryId) : ""}
            onChange={(v) => edit((d) => (d.categoryId = v ? Number(v) : null))}
            options={[["", "Select category"], ...cats.map((c) => [String(c.id), c.name])]}
          />
          <TextInput label="Subtitle" value={p.subtitle} placeholder="e.g. Visi Cooler · Triple Door" onChange={(e) => edit((d) => (d.subtitle = e.target.value))} />
          <TextArea label="Description" rows={4} placeholder="Product description, ideal customers and where it is used" value={p.description} onChange={(e) => edit((d) => (d.description = e.target.value))} />
          <p className="text-xs text-slate-500">The product image is the first picture uploaded under Files → Images.</p>
        </div>
      </Card>
      <Card title="Specifications" icon={ListChecks}>
        <Rows
          rows={p.specs}
          placeholders={["Label", "Value"]}
          onChange={(i, j, v) => edit((d) => (d.specs[i][j] = v))}
          onRemove={(i) => edit((d) => d.specs.splice(i, 1))}
          onAdd={() => edit((d) => d.specs.push(["", ""]))}
          addLabel="Add specification"
        />
      </Card>
    </div>
  );
}

function FilesTab({ p, onChanged, setFlash }) {
  const [busy, setBusy] = useState("");
  const upload = async (type, files) => {
    setBusy(type);
    try {
      await uploadFiles(p.id, type, files);
      setFlash(null);
      toast.success("Uploaded");
      await onChanged();
    } catch (ex) {
      setFlash(`Upload failed for ${files.map((f) => f.name).join(", ")}: ${ex.message} Nothing was changed.`);
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {Object.entries(FILE_TYPES).map(([t, label]) => (
        <Card
          key={t}
          title={label}
          icon={FolderOpen}
          action={
            <FileButton variant="primary" icon={Upload} multiple busy={busy === t} disabled={!!busy && busy !== t} onFiles={(fs) => upload(t, fs)}>
              Upload
            </FileButton>
          }
          bodyClass="p-3 space-y-2"
        >
          {t === "brochure" && <p className="text-xs text-slate-500 px-1">Reps download the latest brochure uploaded here.</p>}
          {p.files[t].length ? (
            p.files[t].map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{f.name}</span>
                  <span className="flex items-center gap-1.5 mt-0.5">
                    <Badge>{ext(f.name)}</Badge>
                    <span className="text-[11px] text-slate-500">
                      v{f.version} · {fmtDate(f.uploadedAt)}
                    </span>
                  </span>
                </span>
                <VersionButtons file={f} onChanged={onChanged} onError={setFlash} />
                <DeleteFileButton file={f} onDeleted={onChanged} />
              </div>
            ))
          ) : (
            <Empty icon={FolderOpen} title="No files uploaded yet" />
          )}
        </Card>
      ))}
    </div>
  );
}

function Pitch({ p, edit }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="Sales pitch" icon={MessageSquareQuote}>
        <div className="space-y-4">
          <TextArea label="30-second opener" rows={2} value={p.pitch.opener} onChange={(e) => edit((d) => (d.pitch.opener = e.target.value))} />
          {p.pitch.points.map((x, i) => (
            <div key={i} className="flex items-end gap-2">
              <TextInput className="flex-1" label={`Key selling point ${i + 1}`} value={x} onChange={(e) => edit((d) => (d.pitch.points[i] = e.target.value))} />
              <button type="button" aria-label="Remove point" onClick={() => edit((d) => d.pitch.points.splice(i, 1))} className="p-2.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => edit((d) => d.pitch.points.push(""))}>
            Add selling point
          </Button>
          <TextArea label="Questions to ask the customer" rows={2} value={p.pitch.ask} onChange={(e) => edit((d) => (d.pitch.ask = e.target.value))} />
        </div>
      </Card>
      <Card title="Objections and responses" icon={Swords}>
        <Rows
          rows={p.objections}
          placeholders={["Objection", "Response"]}
          onChange={(i, j, v) => edit((d) => (d.objections[i][j] = v))}
          onRemove={(i) => edit((d) => d.objections.splice(i, 1))}
          onAdd={() => edit((d) => d.objections.push(["", ""]))}
          addLabel="Add objection"
        />
      </Card>
    </div>
  );
}

function Battlecard({ p, edit }) {
  const bc = p.battlecard;
  // Keep the raw textarea text so blank lines can be typed; split into lines on change.
  const [wins, setWins] = useState(bc.wins.join("\n"));
  const [watch, setWatch] = useState(bc.watch.join("\n"));
  return (
    <div className="space-y-5">
      <Card title="Comparison" icon={Swords}>
        <div className="space-y-4">
          <TextInput label="Competitor model" className="max-w-md" value={bc.competitor} placeholder="Competitor model" onChange={(e) => edit((d) => (d.battlecard.competitor = e.target.value))} />
          <Rows
            rows={bc.rows}
            placeholders={["Feature", "Western value", "Competitor value"]}
            onChange={(i, j, v) => edit((d) => (d.battlecard.rows[i][j] = v))}
            onRemove={(i) => edit((d) => d.battlecard.rows.splice(i, 1))}
            onAdd={() => edit((d) => d.battlecard.rows.push(["", "", ""]))}
            addLabel="Add row"
          />
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Where it wins" icon={Swords}>
          <TextArea
            hint="One point per line"
            rows={5}
            value={wins}
            onChange={(e) => {
              setWins(e.target.value);
              edit((d) => (d.battlecard.wins = e.target.value.split("\n").filter((x) => x.trim())));
            }}
          />
        </Card>
        <Card title="Watch out for" icon={Swords} tone="amber">
          <TextArea
            hint="One point per line"
            rows={5}
            value={watch}
            onChange={(e) => {
              setWatch(e.target.value);
              edit((d) => (d.battlecard.watch = e.target.value.split("\n").filter((x) => x.trim())));
            }}
          />
        </Card>
      </div>
    </div>
  );
}
