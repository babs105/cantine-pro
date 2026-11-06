import { InscriptionRestoForm } from "./inscription-form";

interface PageProps {
  searchParams: Promise<{ lien?: string }>;
}

export default async function InscriptionRestoPage({ searchParams }: PageProps) {
  const { lien } = await searchParams;
  return <InscriptionRestoForm lien={/^[a-f0-9]{8,64}$/i.test(lien || "") ? lien! : ""} />;
}
