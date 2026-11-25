import { useState } from "react";
import { FileDown, FileUp, KeyRound, MailCheck, ShieldCheck, UserCheck, UserPlus, Users as UsersIcon, UserX, Briefcase } from "lucide-react";
import { Badge, Button, ErrorBox, FormError, Kpi, KpiGrid, Loading, Modal, ModalFooter, PageBody, PageHeader, Select, Table, TextInput, initials, useApi, toast } from "../../components/ui.jsx";
import { api } from "../../api.js";
import { useAuth } from "../../auth.jsx";

/** After an invite or reset: says it was emailed, or (email not configured) shows the link to pass on. */
function LinkModal({ title, email, link, emailed, onClose }) {
  const copy = () => navigator.clipboard?.writeText(link).then(() => toast.success("Link copied"));
  return (
    <Modal title={title} size="sm" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      {emailed ? (
        <p className="flex gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
          <MailCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            An email with a link to set a password is on its way to <b>{email}</b>.
          </span>
        </p>
      ) : (
        <p className="text-sm text-slate-700">
          A link to set a password was created for <b>{email}</b>.
        </p>
      )}
      {emailed ? null : link ? (
        <>
          <p className="text-xs text-slate-500">Email sending is off (MAIL_TRANSPORT=log), so send this link to the user yourself.</p>
          <code className="block break-all rounded-lg bg-slate-100 p-3 text-xs text-slate-700">{link}</code>
          <Button size="sm" variant="secondary" onClick={copy}>
            Copy link
          </Button>
        </>
      ) : (
        <p className="text-xs text-slate-500">The link is printed in the server log.</p>
      )}
    </Modal>
  );
}

export default function Users() {
  const { data, error, reload } = useApi("/users");
  const { user: me } = useAuth();
  const [modal, setModal] = useState(null); // "add" | "import" | { title, email, link } | { confirm: user }
  const users = data || [];

  const resetPw = async (u) => {
    try {
      const r = await api(`/users/${u.id}/reset-password`, { method: "POST" });
      setModal({ title: "Password reset", email: r.email, link: r.link, emailed: r.emailed });
    } catch (e) {
      toast.error(e.message);
    }
  };
  const toggle = async (u) => {
    try {
      const r = await api(`/users/${u.id}/toggle-active`, { method: "POST" });
      toast.success(r.active ? "User activated" : "User deactivated");
      setModal(null);
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <PageHeader icon={UsersIcon} title="Users" subtitle="Deactivate leavers straight away; users can also be loaded in bulk from CSV" crumbs={[{ label: "Administration" }, { label: "Users" }]}>
        <Button variant="secondary" icon={FileUp} onClick={() => setModal("import")}>
          Import CSV
        </Button>
        <Button icon={UserPlus} onClick={() => setModal("add")}>
          Add user
        </Button>
      </PageHeader>
      <PageBody>
        {error && <ErrorBox error={error} onRetry={reload} />}
        {!data && !error && <Loading rows={4} />}
        {data && (
          <>
            <KpiGrid>
              <Kpi icon={UsersIcon} tone="blue" label="Total users" value={users.length} />
              <Kpi icon={UserCheck} tone="green" label="Active" value={users.filter((u) => u.active).length} />
              <Kpi icon={ShieldCheck} tone="violet" label="Admins" value={users.filter((u) => u.role === "Admin").length} />
              <Kpi icon={Briefcase} tone="sky" label="Reps" value={users.filter((u) => u.role === "Rep").length} />
            </KpiGrid>
            <Table
              rows={users}
              columns={[
                {
                  key: "name",
                  header: "Name",
                  render: (u) => (
                    <span className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white ${u.active ? "bg-blue-800" : "bg-slate-400"}`}>{initials(u.name)}</span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-slate-900">{u.name}</span>
                        <span className="block text-xs text-slate-500">{u.email}</span>
                      </span>
                    </span>
                  ),
                },
                { key: "role", header: "Role", render: (u) => <Badge variant={u.role === "Admin" ? "violet" : "info"}>{u.role}</Badge> },
                { key: "region", header: "Region", render: (u) => u.region || "–" },
                { key: "team", header: "Team", render: (u) => u.team || "–" },
                {
                  key: "active",
                  header: "Status",
                  render: (u) => (
                    <Badge variant={u.active ? "success" : "neutral"} dot>
                      {u.active ? "Active" : "Inactive"}
                    </Badge>
                  ),
                },
                {
                  key: "act",
                  header: "",
                  align: "right",
                  render: (u) => (
                    <span className="inline-flex gap-1.5">
                      <Button size="sm" variant="secondary" icon={KeyRound} onClick={() => resetPw(u)}>
                        Reset password
                      </Button>
                      {u.id !== me.id &&
                        (u.active ? (
                          <Button size="sm" variant="danger-soft" icon={UserX} onClick={() => setModal({ confirm: u })}>
                            Deactivate
                          </Button>
                        ) : (
                          <Button size="sm" variant="secondary" icon={UserCheck} onClick={() => toggle(u)}>
                            Activate
                          </Button>
                        ))}
                    </span>
                  ),
                },
              ]}
            />
          </>
        )}
      </PageBody>
      {modal === "add" && (
        <AddUser
          onClose={() => setModal(null)}
          onAdded={(r) => {
            reload();
            setModal({ title: "User added", email: r.user.email, link: r.link, emailed: r.emailed });
          }}
        />
      )}
      {modal === "import" && <ImportUsers onClose={() => setModal(null)} onDone={reload} />}
      {modal?.email && <LinkModal {...modal} onClose={() => setModal(null)} />}
      {modal?.confirm && (
        <Modal
          title="Deactivate user"
          size="sm"
          onClose={() => setModal(null)}
          footer={<ModalFooter onCancel={() => setModal(null)} onSave={() => toggle(modal.confirm)} saveLabel="Deactivate" saveVariant="danger" />}
        >
          <p className="text-sm text-slate-600">
            Deactivate <b>{modal.confirm.email}</b>? They will be signed out and cannot sign in until an admin activates them again.
          </p>
        </Modal>
      )}
    </>
  );
}

function AddUser({ onClose, onAdded }) {
  const [f, setF] = useState({ name: "", email: "", role: "Rep", region: "", team: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.name.trim() || !f.email.includes("@")) return setErr("Enter a name and a valid email.");
    setBusy(true);
    try {
      onAdded(await api("/users", { method: "POST", body: f }));
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Add user" subtitle="The user is emailed a link to set their password" onClose={onClose} footer={<ModalFooter onCancel={onClose} onSave={save} saving={busy} saveLabel="Add user" />}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Name" value={f.name} onChange={set("name")} />
        <TextInput label="Work email" type="email" value={f.email} onChange={set("email")} />
        <Select label="Role" value={f.role} onChange={(role) => setF({ ...f, role })} options={["Rep", "Admin"]} />
        <TextInput label="Region" value={f.region} onChange={set("region")} />
        <TextInput label="Team" value={f.team} onChange={set("team")} />
      </div>
      <FormError message={err} />
    </Modal>
  );
}

function ImportUsers({ onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const go = async () => {
    if (!file) return setErr("Choose a CSV file.");
    const form = new FormData();
    form.append("file", file);
    setBusy(true);
    try {
      setResult(await api("/users/import", { method: "POST", form }));
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
          <b>{result.imported}</b> user{result.imported === 1 ? "" : "s"} imported. <b>{result.skipped.length}</b> skipped.
        </p>
        {result.skipped.length > 0 && (
          <ul className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1 text-xs text-amber-900">
            {result.skipped.slice(0, 15).map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500">{result.emailed ? "Each new user has been emailed a link to set their password." : "Email sending is off (MAIL_TRANSPORT=log): the set-password links are printed in the server log."}</p>
      </Modal>
    );
  return (
    <Modal title="Import users from CSV" subtitle="Columns: name, email, role, region, team. The first row can be a header." onClose={onClose} footer={<ModalFooter onCancel={onClose} onSave={go} saving={busy} saveLabel="Import" />}>
      <a
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline"
        download="users_template.csv"
        href="data:text/csv;charset=utf-8,name,email,role,region,team%0ASample%20User,sample@company.com,rep,Region%20A,Team%20A"
      >
        <FileDown className="w-4 h-4" /> Download template
      </a>
      <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
      <FormError message={err} />
    </Modal>
  );
}
