import { Suspense } from "react";
import Image from "next/image";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Activity, ArrowUpRight, ShieldCheck, Waves } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { LoginForm } from "./login-form";
import { authMode, getUser } from "@/lib/auth/session";
import "./login.css";

export const metadata = { title: "Sign in" };

async function Gate() {
  await connection();
  const mode = authMode();
  if (mode === "open-dev" || (await getUser())) redirect("/");
  return mode === "misconfigured" ? (
    <p role="alert" className="ew-login-error">Authentication is not configured on this server. Set AUTH_SECRET, AUTH_USERNAME and AUTH_PASSWORD.</p>
  ) : (
    <LoginForm />
  );
}

export default function LoginPage() {
  return (
    <main className="ew-login-page">
      <section className="ew-login-landscape" aria-label="Environmental monitoring">
        <Image src="/login-bg.jpg" alt="" fill preload sizes="(min-width: 1000px) 60vw, 100vw" className="ew-login-background" aria-hidden />
        <div className="ew-login-shade" aria-hidden />
        <div className="ew-login-observation" aria-hidden>
          <span className="ew-login-ring" /><span className="ew-login-ring" /><span className="ew-login-ring" />
          <span className="ew-login-beacon"><Waves size={20} /></span>
        </div>
        <header className="ew-login-brand">
          <span className="ew-login-brandIcon"><Activity size={23} strokeWidth={1.7} /></span>
          <span>EnviroWatch</span>
        </header>
        <div className="ew-login-story">
          <p className="ew-login-storyIntro"><span /> A clearer view of our environment</p>
          <h1>Connected to<br />a changing world.</h1>
          <p className="ew-login-description">From the coastline to the atmosphere. Bring your environmental data into focus, all in one place.</p>
          <div className="ew-login-disciplines">
            <span>Coastal & marine</span><span>Weather & climate</span><span>Environmental insights</span>
          </div>
        </div>
        <footer className="ew-login-landscapeFooter">
          <span>Observe. Understand. Act.</span>
          <ArrowUpRight size={19} aria-hidden />
        </footer>
      </section>

      <section className="ew-login-panel" aria-labelledby="login-heading">
        <div className="ew-login-panelTop">
          <span>Environmental intelligence</span>
          <ShieldCheck size={18} aria-hidden />
        </div>
        <div className="ew-login-loginContent">
          <BrandLogo size="sm" priority className="ew-login-logo mx-auto flex" />
          <div className="ew-login-welcome">
            <h2 id="login-heading">Your environment.<br /> In perspective.</h2>
            <p>Welcome back. Sign in to your monitoring workspace.</p>
          </div>
          <Suspense fallback={<div className="ew-login-skeleton" role="status" aria-label="Loading sign-in form" />}>
            <Gate />
          </Suspense>
          <p className="ew-login-accessNote"><ShieldCheck size={15} aria-hidden /> Secure access to your environmental network</p>
        </div>
        <footer className="ew-login-panelFooter">
          <span>Powered by Smith Warner</span>
          <span>EnviroWatch</span>
        </footer>
      </section>
    </main>
  );
}
