import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Lock,
  Mail,
  MailCheck,
  MessageSquareQuote,
  PackageSearch,
  ShieldCheck,
  Swords,
  Users,
  Zap,
  Boxes,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "../auth.jsx";
import { api } from "../api.js";
import { Button, FormError, TextInput } from "../components/ui.jsx";
import bg from "../assets/login-bg.avif";
import logo from "../assets/logo.png";

const FEATURES = [
  { icon: PackageSearch, tone: "bg-emerald-500", title: "Product specs", text: "Every model's specifications in one place" },
  { icon: FileText, tone: "bg-blue-500", title: "Brochures & files", text: "Latest brochures, KLDs, sheets and videos" },
  { icon: MessageSquareQuote, tone: "bg-amber-500", title: "Sales pitch", text: "Openers, selling points and objection handling" },
  { icon: Swords, tone: "bg-violet-500", title: "Battlecards", text: "Side-by-side comparisons with competitors" },
];
const STRIP = [
  { icon: Boxes, top: "Full", bottom: "Catalogue" },
  { icon: Zap, top: "Instant", bottom: "Search" },
  { icon: Users, top: "Every", bottom: "Rep" },
  { icon: ShieldCheck, top: "Always", bottom: "Up to date" },
];

/** Sign-in frame from QMAS: product photo under a blue wash, story on the left, frosted card on the right. Always light. */
function AuthShell({ title, subtitle, children }) {
  useEffect(() => document.documentElement.classList.remove("dark"), []);
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-900 text-slate-800">
      <div className="absolute inset-0 scale-110 bg-cover bg-center blur-[2px]" style={{ backgroundImage: `url(${bg})` }} aria-hidden="true" />
      <div className="absolute inset-0 bg-linear-to-r from-blue-950/95 via-blue-900/80 to-sky-700/40" aria-hidden="true" />
      <div className="absolute inset-0 bg-linear-to-t from-blue-950/60 via-transparent to-blue-950/30" aria-hidden="true" />

      <div className="relative flex min-h-screen w-full items-center justify-between gap-16 px-4 py-8 sm:px-8 lg:px-12 xl:pl-16 xl:pr-24 2xl:pl-24 2xl:pr-32">
        <section className="hidden flex-1 flex-col text-white lg:flex">
          <img src={logo} alt="Western Refrigeration and Hoshizaki" className="h-16 w-auto self-start drop-shadow" />
          <p className="mt-6 text-sm font-medium uppercase tracking-[0.3em] text-blue-100/90">Western Refrigeration Pvt. Ltd.</p>
          <h1 className="mt-3 text-7xl font-bold tracking-tight">Sales Hub</h1>
          <p className="mt-3 text-3xl font-semibold leading-tight">
            Everything you need
            <br />
            to sell, in one place
          </p>
          <p className="mt-4 max-w-md text-lg leading-snug text-blue-50/90">Specs, files, pitches and battlecards for every product, for every rep.</p>
          <ul className="mt-8 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-center gap-4">
                <span className={`grid h-13 w-13 shrink-0 place-items-center rounded-xl ${f.tone} shadow-lg shadow-black/20`}>
                  <f.icon className="h-6 w-6 text-white" />
                </span>
                <span>
                  <span className="block text-lg font-semibold">{f.title}</span>
                  <span className="block text-sm text-blue-50/85">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-10 flex max-w-2xl items-center divide-x divide-white/25 rounded-2xl border border-white/15 bg-white/10 py-5 backdrop-blur-md">
            {STRIP.map((s) => (
              <div key={s.top} className="flex flex-1 items-center justify-center gap-2.5 px-3">
                <s.icon className="h-8 w-8 shrink-0 text-white" strokeWidth={1.75} />
                <span className="whitespace-nowrap text-sm leading-tight text-white/95">
                  {s.top}
                  <br />
                  {s.bottom}
                </span>
              </div>
            ))}
          </div>
        </section>

        <main className="mx-auto w-full max-w-lg lg:mx-0 lg:w-136 lg:max-w-none lg:shrink-0">
          <div className="rounded-3xl border border-white/70 bg-white/95 px-6 py-9 shadow-2xl shadow-blue-950/40 backdrop-blur-xl sm:px-12">
            <div className="mb-8 flex flex-col items-center text-center">
              <img src={logo} alt="Western Refrigeration and Hoshizaki" className="mb-4 h-16 w-auto" />
              <h2 className="text-3xl font-bold tracking-tight text-blue-950">{title}</h2>
              {subtitle && <p className="mt-1.5 text-base text-slate-500 text-balance">{subtitle}</p>}
            </div>
            {children}
            <div className="mt-8 flex items-center justify-center gap-3 text-left">
              <ShieldCheck className="h-9 w-9 shrink-0 text-slate-400" strokeWidth={1.5} />
              <span className="leading-tight">
                <span className="block text-sm text-slate-600">Your data is secure and protected</span>
                <span className="block text-xs text-slate-500">For Western Refrigeration staff only</span>
              </span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

const linkCls = "text-sm font-medium text-blue-700 hover:underline";
const bigBtn = "w-full py-4! text-base! rounded-xl! shadow-lg shadow-blue-600/25";

function PasswordInput({ label, value, onChange, autoComplete, hint, autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <TextInput
      label={label}
      size="lg"
      icon={Lock}
      type={show ? "text" : "password"}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      value={value}
      hint={hint}
      onChange={(e) => onChange(e.target.value)}
      trailing={
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer">
          {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      }
    />
  );
}

export function Login() {
  const { user, ready, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (ready && user) return <Navigate to={user.role === "Admin" ? "/admin" : "/home"} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!email.includes("@")) return setErr("Enter your work email.");
    if (!pw) return setErr("Enter your password.");
    setErr("");
    setBusy(true);
    try {
      const u = await login(email.trim(), pw);
      nav(loc.state?.from || (u.role === "Admin" ? "/admin" : "/home"), { replace: true });
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome to Sales Hub" subtitle="Sign in to continue to your account">
      <form onSubmit={submit} noValidate className="space-y-5">
        <FormError message={err} />
        <TextInput label="Work email" size="lg" icon={Mail} type="email" autoFocus autoComplete="username" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordInput label="Password" value={pw} onChange={setPw} autoComplete="current-password" />
        <div className="flex justify-end -mt-1">
          <Link to="/forgot" className={linkCls}>
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className={bigBtn} loading={busy}>
          Sign in {!busy && <ArrowRight className="w-5 h-5" />}
        </Button>
      </form>
    </AuthShell>
  );
}

export function Forgot() {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!email.includes("@")) return setErr("Enter your work email.");
    setBusy(true);
    try {
      await api("/auth/forgot", { method: "POST", body: { email: email.trim() } });
      setSent(true);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };
  if (sent)
    return (
      <AuthShell title="Check your email" subtitle={`If ${email} is registered, a reset link has been sent. The link is valid for a short time.`}>
        <div className="flex justify-center mb-6">
          <span className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <MailCheck className="w-8 h-8" />
          </span>
        </div>
        <Button to="/login" size="lg" className={bigBtn}>
          Back to sign in
        </Button>
      </AuthShell>
    );
  return (
    <AuthShell title="Reset password" subtitle="Enter your work email and we will send you a link to reset your password">
      <form onSubmit={submit} noValidate className="space-y-5">
        <FormError message={err} />
        <TextInput label="Work email" size="lg" icon={Mail} type="email" autoFocus placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" size="lg" className={bigBtn} loading={busy}>
          Send reset link
        </Button>
        <p className="text-center">
          <Link to="/login" className={linkCls}>
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const { policy } = useAuth();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (a.length < policy.passwordMinLength) return setErr(`Use at least ${policy.passwordMinLength} characters.`);
    if (a !== b) return setErr("The two passwords do not match.");
    setBusy(true);
    try {
      await api("/auth/reset", { method: "POST", body: { token: params.get("token"), password: a } });
      setDone(true);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };
  if (done)
    return (
      <AuthShell title="Password set" subtitle="You can now sign in with your new password">
        <div className="flex justify-center mb-6">
          <span className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </span>
        </div>
        <Button to="/login" size="lg" className={bigBtn}>
          Sign in <ArrowRight className="w-5 h-5" />
        </Button>
      </AuthShell>
    );
  return (
    <AuthShell title="Choose a password" subtitle="Set the password you will use to sign in">
      <form onSubmit={submit} noValidate className="space-y-5">
        <FormError message={err} />
        <PasswordInput label="New password" value={a} onChange={setA} autoComplete="new-password" autoFocus hint={`At least ${policy.passwordMinLength} characters`} />
        <PasswordInput label="Confirm new password" value={b} onChange={setB} autoComplete="new-password" />
        <Button type="submit" size="lg" className={bigBtn} loading={busy}>
          Set password
        </Button>
        <p className="text-center">
          <Link to="/login" className={linkCls}>
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function SessionExpired() {
  return (
    <AuthShell title="Session expired" subtitle="For your security you were signed out after a period of inactivity">
      <div className="flex justify-center mb-6">
        <span className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
          <Clock className="w-8 h-8" />
        </span>
      </div>
      <Button to="/login" size="lg" className={bigBtn}>
        Sign in again <ArrowRight className="w-5 h-5" />
      </Button>
    </AuthShell>
  );
}

export function ErrorPage() {
  const loc = useLocation();
  const nav = useNavigate();
  return (
    <AuthShell title="Something went wrong" subtitle="We could not complete that. Your information is safe. Please try again, and contact your admin if it keeps happening.">
      <div className="flex justify-center mb-4">
        <span className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8" />
        </span>
      </div>
      {loc.state?.ref && <p className="text-center text-sm text-slate-500 mb-4">Reference: {loc.state.ref}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Button size="lg" onClick={() => nav(-1)}>
          Try again
        </Button>
        <Button size="lg" variant="secondary" to="/home">
          Back to home
        </Button>
      </div>
    </AuthShell>
  );
}
