import Container from "../components/Container";
import Button from "../components/Button";
import { usePageMeta } from "../lib/usePageMeta";

export default function NotFound() {
  usePageMeta({ title: "Page not found", noindex: true });
  return (
    <section className="bg-wash text-on-dark">
      <Container className="py-24 text-center">
        <p className="font-display text-caption font-semibold uppercase tracking-[0.2em] text-on-dark-accent">Error 404</p>
        <h1 className="mt-3 text-h1 font-bold">We could not find that page.</h1>
        <p className="mx-auto mt-4 max-w-md text-on-dark-brand">The link may be old, or the product may have moved. Search the catalog or start from a body region.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button to="/shop">Browse products</Button>
          <Button to="/" variant="ghost-dark">
            Go to the home page
          </Button>
        </div>
      </Container>
    </section>
  );
}
