import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Boxes, CheckCircle2, FileDown, FileUp, Package, PencilLine, Plus, Search, EyeOff, Send } from "lucide-react";
import { Button, Empty, ErrorBox, FormError, Kpi, KpiGrid, Loading, Modal, ModalFooter, PageBody, PageHeader, Select, StatusBadge, Table, useApi, toast } from "../../components/ui.jsx";
import { api, fmtDate } from "../../api.js";

const TEMPLATE =
  "name,category,subtitle,description,specs\n" +
  'Sample Cooler,Visi Cooler,Visi Cooler · Double Door,"Short description, with a comma","Gross volume=1200 Litres|Temperature range=0°C to 10°C"\n' +
  'Sample Freezer,Deep Freezer,Deep Freezer · Glass Top,Short description,"Gross volume=500 Litres|No. of baskets=4"';

export default function Products() {
  const { data, error, reload } = useApi("/products");
  const cats = useApi("/categories");
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [st, setSt] = useState("");
  const [ct, setCt] = useState("");
  const [imp, setImp] = useState(false);

  const add = async () => {
    try {
      const { id } = await api("/products", { method: "POST" });
      nav(`/admin/products/${id}/details`);
    } catch (e) {
      toast.error(e.message);
    }
  };
  const toggle = async (p) => {
    try {
      await api(`/products/${p.id}/${p.published ? "unpublish" : "publish"}`, { method: "POST" });
      toast.success(p.published ? "Unpublished. Reps no longer see it" : "Published");
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const all = data || [];
  const rows = all.filter(
    (p) => (!q || (p.name || "untitled").toLowerCase().includes(q.toLowerCase())) && (!st || (st === "Published") === p.published) && (!ct || p.category === ct),
  );

  return (
    <>
      <PageHeader icon={Package} title="Products" subtitle="Add, edit and publish what reps see" crumbs={[{ label: "Content" }, { label: "Products" }]}>
        <Button variant="secondary" icon={FileUp} onClick={() => setImp(true)}>
          Import CSV
        </Button>
        <Button icon={Plus} onClick={add}>
          Add product
        </Button>
      </PageHeader>
      <PageBody>
        {error && <ErrorBox error={error} onRetry={reload} />}
        {!data && !error && <Loading rows={4} />}
        {data && (
          <>
            <KpiGrid>
              <Kpi icon={Boxes} tone="blue" label="Total products" value={all.length} />
              <Kpi icon={CheckCircle2} tone="green" label="Published" value={all.filter((p) => p.published).length} />
              <Kpi icon={PencilLine} tone="amber" label="Drafts" value={all.filter((p) => !p.published).length} />
              <Kpi icon={FileDown} tone="violet" label="Files" value={all.reduce((a, p) => a + p.fileCount, 0)} />
            </KpiGrid>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="search"
                  placeholder="Search products"
                  aria-label="Search products"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="h-9 pl-8 pr-3 text-sm rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 w-64"
                />
              </div>
              <Select aria-label="Status" value={st} onChange={setSt} options={[["", "All statuses"], "Published", "Draft"]} />
              <Select aria-label="Category" value={ct} onChange={setCt} options={[["", "All categories"], ...(cats.data || []).map((c) => c.name)]} />
            </div>
            {all.length ? (
              <Table
                rows={rows}
                empty="No products match these filters."
                columns={[
                  {
                    key: "name",
                    header: "Product",
                    render: (p) => (
                      <Link to={`/admin/products/${p.id}/details`} className="font-semibold text-slate-900 hover:text-blue-700">
                        {p.name || "(Untitled product)"}
                      </Link>
                    ),
                  },
                  { key: "category", header: "Category", render: (p) => p.category || "–" },
                  { key: "status", header: "Status", render: (p) => <StatusBadge published={p.published} /> },
                  { key: "fileCount", header: "Files", className: "tabular" },
                  { key: "updatedAt", header: "Updated", render: (p) => fmtDate(p.updatedAt) },
                  {
                    key: "act",
                    header: "",
                    align: "right",
                    render: (p) => (
                      <span className="inline-flex gap-1.5">
                        <Button size="sm" variant="secondary" icon={PencilLine} to={`/admin/products/${p.id}/details`}>
                          Edit
                        </Button>
                        <Button size="sm" variant={p.published ? "ghost" : "success"} icon={p.published ? EyeOff : Send} onClick={() => toggle(p)}>
                          {p.published ? "Unpublish" : "Publish"}
                        </Button>
                      </span>
                    ),
                  },
                ]}
              />
            ) : (
              <div className="card">
                <Empty icon={Package} title="No products yet" text="Add a product, or import many at once from a CSV file.">
                  <Button icon={Plus} onClick={add}>
                    Add product
                  </Button>
                  <Button variant="secondary" icon={FileUp} onClick={() => setImp(true)}>
                    Import CSV
                  </Button>
                </Empty>
              </div>
            )}
          </>
        )}
      </PageBody>
      {imp && (
        <ImportModal
          onClose={() => setImp(false)}
          onDone={() => {
            reload();
            cats.reload();
          }}
        />
      )}
    </>
  );
}

function ImportModal({ onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [mk, setMk] = useState(true);
  const [pb, setPb] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (!file) return setErr("Choose a CSV file.");
    if (!/\.csv$/i.test(file.name)) return setErr("Please choose a .csv file.");
    const form = new FormData();
    form.append("file", file);
    form.append("createCategories", String(mk));
    form.append("publish", String(pb));
    setBusy(true);
    try {
      setResult(await api("/products/import", { method: "POST", form }));
      onDone();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (result)
    return (
      <Modal title="Import result" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
        <p className="text-sm text-slate-700">
          <b>{result.imported}</b> product{result.imported === 1 ? "" : "s"} imported{result.published ? " and published" : " as drafts"}. <b>{result.skipped.length}</b> row
          {result.skipped.length === 1 ? "" : "s"} skipped.
        </p>
        {result.skipped.length > 0 && (
          <ul className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1 text-xs text-amber-900">
            {result.skipped.slice(0, 15).map((x, i) => (
              <li key={i}>{x}</li>
            ))}
            {result.skipped.length > 15 && <li>…and {result.skipped.length - 15} more</li>}
          </ul>
        )}
      </Modal>
    );

  return (
    <Modal title="Import products from CSV" subtitle="One row per product" onClose={onClose} footer={<ModalFooter onCancel={onClose} onSave={go} saveLabel="Import" saving={busy} />}>
      <p className="text-sm text-slate-600">
        Columns: <b>name, category, subtitle, description, specs</b>. Write each specification as Label=Value and separate them with |
      </p>
      <a className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline" download="products_template.csv" href={"data:text/csv;charset=utf-8," + encodeURIComponent(TEMPLATE)}>
        <FileDown className="w-4 h-4" /> Download template
      </a>
      <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
      <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
        <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={mk} onChange={(e) => setMk(e.target.checked)} /> Create categories that do not exist yet
      </label>
      <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
        <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={pb} onChange={(e) => setPb(e.target.checked)} /> Publish imported products (otherwise they are saved as drafts)
      </label>
      <p className="text-xs text-slate-500">Files, images, pitch and battlecard are added afterwards in each product.</p>
      <FormError message={err} />
    </Modal>
  );
}
