import { useEffect, useState } from "react";
import { Check, KeyRound, Mail, Minus, Save, Send, Settings2, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, ErrorBox, FormError, Loading, PageBody, PageHeader, SpecRow, TextInput, useApi, toast } from "../../components/ui.jsx";
import { api } from "../../api.js";

const PERMS = [
  ["View products and files", true, true],
  ["Download files", true, true],
  ["Change own password", true, true],
  ["Read pitch and battlecard", true, true],
  ["Add and edit products", false, true],
  ["Upload files and new versions", false, true],
  ["Manage categories", false, true],
  ["Manage users", false, true],
  ["View dashboards and reports", false, true],
];
const FIELDS = [
  ["password_min_length", "Minimum password length", "Characters"],
  ["lockout_attempts", "Lock account after failed attempts", "Locked accounts unlock after 15 minutes, or when an admin sends a password reset"],
  ["reset_valid_minutes", "Reset link valid for", "Minutes"],
  ["session_timeout_minutes", "Session timeout", "Minutes of inactivity before signing out"],
];

const Mark = ({ on }) =>
  on ? (
    <span className="inline-flex w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 items-center justify-center">
      <Check className="w-3.5 h-3.5" />
    </span>
  ) : (
    <span className="inline-flex w-6 h-6 rounded-full bg-slate-100 text-slate-400 items-center justify-center">
      <Minus className="w-3.5 h-3.5" />
    </span>
  );

/** How email is sent (from the server's .env), the queue, recent failures, and a test send. */
function MailCard() {
  const { data, error, reload } = useApi("/admin/mail");
  const [busy, setBusy] = useState(false);
  const test = async () => {
    setBusy(true);
    try {
      const r = await api("/admin/mail/test", { method: "POST" });
      toast.success(r.transport !== "log" ? `Test email sent to ${r.to}` : "Test email printed in the server console (MAIL_TRANSPORT=log)");
      setTimeout(reload, 1500);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const smtp = data && data.transport !== "log";
  return (
    <Card
      title="Email"
      icon={Mail}
      className="self-start"
      action={
        <Button size="sm" variant="secondary" icon={Send} loading={busy} onClick={test} disabled={!data}>
          Send test email
        </Button>
      }
    >
      {error && <ErrorBox error={error} onRetry={reload} />}
      {!data && !error && <Loading rows={2} />}
      {data && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={smtp ? "success" : "warning"} dot>
              {smtp ? "Sending email" : "Not sending: log only"}
            </Badge>
            {data.redirectTo && <Badge variant="violet">All mail redirected to {data.redirectTo}</Badge>}
          </div>
          <SpecRow a="Mail server" b={data.host || "–"} />
          <SpecRow a="Sent from" b={data.from} />
          <SpecRow a="Sent / waiting / failed" b={`${data.counts.SENT || 0} / ${data.counts.PENDING || 0} / ${data.counts.FAILED || 0}`} />
          {data.problems.map((m, i) => (
            <p key={i} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              <b>{m.to_address}</b> · {m.subject}: {m.last_error} ({m.attempts} attempt{m.attempts === 1 ? "" : "s"})
            </p>
          ))}
          <p className="text-[11px] text-slate-400">
            {smtp
              ? "Password reset links and new-user invites are emailed. Failed emails are retried automatically."
              : "Emails are printed in the server console instead of being sent. Set MAIL_TRANSPORT to graph (Outlook) or smtp in server/.env, fill in its settings, then restart the server."}
          </p>
        </div>
      )}
    </Card>
  );
}

export default function Settings() {
  const { data, error, reload } = useApi("/admin/settings");
  const [f, setF] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setF(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])));
  }, [data]);

  const save = async () => {
    setErr("");
    setBusy(true);
    try {
      await api("/admin/settings", { method: "PUT", body: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Number(v)])) });
      toast.success("Settings saved");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader icon={Settings2} title="Settings" subtitle="Roles and the password policy" crumbs={[{ label: "Administration" }, { label: "Settings" }]}>
        <Button icon={Save} onClick={save} loading={busy} disabled={!f}>
          Save settings
        </Button>
      </PageHeader>
      <PageBody>
        <div className="grid gap-5 xl:grid-cols-2">
          <Card title="Roles and permissions" icon={ShieldCheck} bodyClass="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] text-slate-500">
                  <th className="text-left font-semibold px-4 py-2.5">Permission</th>
                  <th className="font-semibold px-4 py-2.5 w-20">Rep</th>
                  <th className="font-semibold px-4 py-2.5 w-20">Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {PERMS.map(([label, rep, admin]) => (
                  <tr key={label}>
                    <td className="px-4 py-2.5 text-slate-700">{label}</td>
                    <td className="px-4 py-2.5 text-center">
                      <Mark on={rep} />
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <Mark on={admin} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <MailCard />
          <Card title="Password policy" icon={KeyRound} className="self-start">
            {error && <ErrorBox error={error} onRetry={reload} />}
            {!f && !error && <Loading rows={2} />}
            {f && (
              <div className="grid gap-4 sm:grid-cols-2">
                {FIELDS.map(([k, label, hint]) => (
                  <TextInput key={k} label={label} hint={hint} inputMode="numeric" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
                ))}
              </div>
            )}
            <div className="mt-4">
              <FormError message={err} />
            </div>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
