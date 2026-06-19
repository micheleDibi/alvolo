import AskBox from "../components/AskBox";

export default function Ask() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-gradient">
          Chiedi ad AlVolo
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fai una domanda: cerco tra le tue catture e ti rispondo con le fonti.
        </p>
      </div>
      <AskBox
        suggestions={[
          "Riassumi le idee di questa settimana",
          "Cosa avevo salvato sull'AI?",
          "Quali to-do ho in sospeso?",
        ]}
      />
    </div>
  );
}
