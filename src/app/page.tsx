import EntityGrid from "@/components/EntityGrid";

export default function Home() {
  return (
    <main className="px-4 py-6 sm:px-6">
      <h1 className="font-serif text-3xl font-bold">API Mapping Catalogue</h1>
      <EntityGrid />
    </main>
  );
}
