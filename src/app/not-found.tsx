import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <p className="text-sm font-semibold text-accent-text">404</p>
        <h1 className="mt-1 text-xl font-semibold">Not found</h1>
        <p className="mt-2 text-sm text-text-3">The station or page doesn&apos;t exist, or is no longer returned by its provider.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-accent-text hover:underline">Back to overview</Link>
      </div>
    </main>
  );
}
