import RevealCanvas from "./components/RevealCanvas";

export default function Home() {
  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <RevealCanvas src="/images/background.png" mobileSrc="/images/background-mobile.png" />
      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-start pt-[12vh]">
        <img src="/images/beamz-logo.svg" alt="Beamz" className="w-48" />
        <p
          className="mt-3 text-sm tracking-[0.3em] uppercase font-light"
          style={{ color: "#fffff1", fontFamily: "var(--font-chalet)" }}
        >
          Arriving Summer 2026
        </p>
      </div>
    </main>
  );
}
