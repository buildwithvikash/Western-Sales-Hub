import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BookOpen,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Film,
  FolderOpen,
  Images,
  ListChecks,
  MessageSquareQuote,
  Package,
  PenTool,
  ShieldAlert,
  Swords,
  Lightbulb,
} from "lucide-react";
import { api, ext, fileUrl, FILE_TYPES, openFile } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Badge, Button, Card, Empty, ErrorBox, Loading, Modal, PageBody, PageHeader, Ph, ProductImage, SpecRow, StatusBadge, Tabs, toast } from "../components/ui.jsx";

const TABS = [
  { key: "overview", label: "Overview", icon: BookOpen },
  { key: "pitch", label: "Sales pitch", icon: MessageSquareQuote },
  { key: "battlecard", label: "Battlecard", icon: Swords },
];
const RESOURCES = [
  ["kld", "KLD", PenTool],
  ["sheet", "Sales sheet", FileSpreadsheet],
  ["images", "Images", Images],
  ["videos", "Videos", Film],
  ["media", "Media files", FolderOpen],
];

export default function Product() {
  const { id, tab = "pitch" } = useParams();
  const { isAdmin } = useAuth();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  const [res, setRes] = useState(null);

  useEffect(() => {
    let live = true;
    setP(null);
    setError(null);
    api(`/products/${id}?track=1`)
      .then((d) => live && setP(d))
      .catch((e) => live && setError(e));
    return () => {
      live = false;
    };
  }, [id]);

  if (error)
    return (
      <>
        <PageHeader icon={Package} title="Product not available" crumbs={[{ label: "Catalogue" }, { label: "All products", to: "/search" }]} />
        <PageBody>
          {error.status === 404 ? (
            <div className="card">
              <Empty icon={Package} title="This product is not available" text="It may have been unpublished or removed.">
                <Button to="/home">Back to home</Button>
              </Empty>
            </div>
          ) : (
            <ErrorBox error={error} />
          )}
        </PageBody>
      </>
    );
  if (!p)
    return (
      <PageBody>
        <Loading rows={5} />
      </PageBody>
    );

  const brochure = () => {
    const l = p.files.brochure;
    if (!l.length) return toast.error("No brochure has been uploaded for this product yet");
    const latest = l.reduce((a, b) => (new Date(b.uploadedAt) >= new Date(a.uploadedAt) ? b : a));
    openFile(latest.versionId);
  };
  const specs = p.specs.filter((s) => s[0]);

  return (
    <>
      <PageHeader
        icon={Package}
        title={
          <>
            {p.name} {!p.published && <StatusBadge published={false} />}
          </>
        }
        subtitle={p.subtitle || p.category}
        crumbs={[{ label: "Catalogue" }, { label: p.category || "Products", to: p.category ? `/search?cat=${encodeURIComponent(p.category)}` : "/search" }]}
      >
        {isAdmin && (
          <Button variant="secondary" size="sm" icon={PenTool} to={`/admin/products/${p.id}/details`}>
            Edit product
          </Button>
        )}
        <Button icon={Download} onClick={brochure}>
          Download brochure
        </Button>
      </PageHeader>
      <PageBody>
        <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
          <div className="card p-4">
            <ProductImage src={p.imageUrl} alt={p.name} className="h-80" />
          </div>
          <div className="space-y-5 min-w-0">
            <Card title="Specifications" icon={ListChecks}>
              {specs.length ? specs.map((s, i) => <SpecRow key={i} a={s[0]} b={s[1]} />) : <p className="text-sm text-slate-400">No specifications yet.</p>}
            </Card>
            <Card title="Resources" icon={FolderOpen}>
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
                {RESOURCES.map(([key, label, Icon]) => {
                  const n = p.files[key].length + (key === "images" && p.imageUrl && !p.files.images.length ? 1 : 0);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRes(key)}
                      className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-left hover:border-blue-300 hover:bg-blue-50/40 transition-colors cursor-pointer"
                    >
                      <span className="w-8 h-8 shrink-0 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-800 truncate">{label}</span>
                        <span className="block text-[11px] text-slate-500">
                          {n} file{n === 1 ? "" : "s"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>

        <Tabs tabs={TABS.map((t) => ({ ...t, to: `/product/${p.id}/${t.key}` }))} active={tab} />
        <Panel p={p} tab={tab} />
      </PageBody>
      {res && <ResourceModal type={res} p={p} onClose={() => setRes(null)} />}
    </>
  );
}

const Line = ({ children }) => <p className="text-sm text-slate-700 leading-relaxed">{children}</p>;

function Objections({ p }) {
  const list = p.objections.filter((o) => o[0] || o[1]);
  return (
    <Card title="Handling objections" icon={ShieldAlert}>
      {list.length ? (
        <div className="space-y-3">
          {list.map((o, i) => (
            <div key={i} className="rounded-lg bg-slate-50 border border-slate-100 p-3">
              <p className="text-sm font-semibold text-slate-800">“{o[0]}”</p>
              <p className="text-sm text-slate-600 mt-1">{o[1]}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">No objections added yet.</p>
      )}
    </Card>
  );
}

function Panel({ p, tab }) {
  if (tab === "overview")
    return (
      <Card title="Overview" icon={BookOpen}>
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
          <Ph v={p.description} fb="No description added yet." />
        </p>
      </Card>
    );

  if (tab === "battlecard") {
    const bc = p.battlecard;
    const rows = bc.rows.filter((r) => r[0]);
    return (
      <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <Card title={`${p.name} vs ${bc.competitor || "competitor"}`} icon={Swords} bodyClass="p-0">
            {rows.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] text-slate-500">
                    <th className="text-left font-semibold px-4 py-2.5">Feature</th>
                    <th className="text-left font-semibold px-4 py-2.5 text-blue-700">Western {p.name}</th>
                    <th className="text-left font-semibold px-4 py-2.5">{bc.competitor || "Competitor"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 text-slate-500">{r[0]}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800 bg-blue-50/30">{r[1] || "–"}</td>
                      <td className="px-4 py-2.5 text-slate-700">{r[2] || "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-4 text-sm text-slate-400">No comparison added yet.</p>
            )}
          </Card>
          <div className="space-y-5">
            <Card title="Where it wins" icon={CheckCircle2}>
              {bc.wins.length ? (
                <ul className="space-y-2">
                  {bc.wins.map((w, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" />
                      {w}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">Not added yet.</p>
              )}
            </Card>
            <Card title="Watch out for" icon={ShieldAlert} tone="amber">
              {bc.watch.length ? (
                <ul className="space-y-2">
                  {bc.watch.map((w, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-700">
                      <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                      {w}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">Not added yet.</p>
              )}
            </Card>
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="How to use this battlecard" icon={Lightbulb}>
            <ol className="space-y-2 text-sm text-slate-700 list-decimal pl-5">
              <li>Ask what matters most to the customer: capacity, display, running cost or service.</li>
              <li>Show the 2 or 3 differences that match their answer.</li>
              <li>Close with a next step: site visit or demo.</li>
            </ol>
          </Card>
          <Objections p={p} />
        </div>
      </div>
    );
  }

  const pitch = p.pitch;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Sales pitch" icon={MessageSquareQuote}>
        <div className="space-y-4">
          <div>
            <p className="eyebrow mb-1">30-second opener</p>
            <Line>
              <Ph v={pitch.opener} fb="Not added yet." />
            </Line>
          </div>
          {pitch.points.map((x, i) => (
            <div key={i}>
              <p className="eyebrow mb-1">Key selling point {i + 1}</p>
              <Line>
                <Ph v={x} fb="Not added yet." />
              </Line>
            </div>
          ))}
          <div>
            <p className="eyebrow mb-1">Questions to ask the customer</p>
            <Line>
              <Ph v={pitch.ask} fb="Not added yet." />
            </Line>
          </div>
        </div>
      </Card>
      <Objections p={p} />
    </div>
  );
}

const FileRow = ({ f }) => (
  <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
    <span className="w-9 h-9 shrink-0 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
      <FileText className="w-4 h-4" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold text-slate-800 truncate">{f.name}</span>
      <span className="flex items-center gap-1.5 mt-0.5">
        <Badge>{ext(f.name)}</Badge>
        <span className="text-[11px] text-slate-500">Version {f.version}</span>
      </span>
    </span>
    <Button size="sm" variant="secondary" icon={Download} onClick={() => openFile(f.versionId)}>
      Download
    </Button>
  </div>
);

function ResourceModal({ type, p, onClose }) {
  const files = p.files[type] || [];
  const title = `${FILE_TYPES[type]} · ${p.name}`;
  if (type === "images") {
    const cover = p.imageUrl && !files.some((f) => p.imageUrl.startsWith(`/api/files/${f.id}/current`));
    return (
      <Modal title={title} onClose={onClose} size="lg">
        {cover || files.length ? (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
            {cover && <ProductImage src={p.imageUrl} alt={p.name} className="h-44 border border-slate-200" />}
            {files.map((f) => (
              <button key={f.id} type="button" onClick={() => openFile(f.versionId)} title="Download" className="group relative cursor-pointer">
                {f.mimeType?.startsWith("image/") ? (
                  <ProductImage src={fileUrl(f.versionId, true)} alt={f.name} className="h-44 border border-slate-200 group-hover:border-blue-300" />
                ) : (
                  <div className="h-44 rounded-lg border border-slate-200 flex items-center justify-center text-sm text-slate-500 p-2">{f.name}</div>
                )}
                <span className="absolute bottom-2 right-2 rounded-md bg-white/90 p-1 text-slate-600 shadow-sm opacity-0 group-hover:opacity-100">
                  <Download className="w-3.5 h-3.5" />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <Empty icon={Images} title="No images uploaded yet" />
        )}
      </Modal>
    );
  }
  if (type === "videos")
    return (
      <Modal title={title} onClose={onClose} size="lg">
        {files.length ? (
          files.map((f) => (
            <div key={f.id} className="space-y-2">
              {f.mimeType?.startsWith("video/") && !f.external && <video src={fileUrl(f.versionId, true)} controls preload="metadata" className="w-full rounded-lg bg-black" />}
              <FileRow f={f} />
            </div>
          ))
        ) : (
          <Empty icon={Film} title="No videos uploaded yet" />
        )}
      </Modal>
    );
  return (
    <Modal title={title} onClose={onClose}>
      {files.length ? files.map((f) => <FileRow key={f.id} f={f} />) : <Empty icon={FolderOpen} title="No files uploaded yet" />}
    </Modal>
  );
}

