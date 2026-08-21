export default function TechSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body">
      <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to bottom, #EFEEE7 1px, transparent 1px), linear-gradient(to right, #EFEEE7 1px, transparent 1px)", backgroundSize: "5vw 5vh" }} />
      <div className="absolute top-[5vh] left-[5vw] w-[3vw] h-[3vw] bg-primary z-10" />
      <div className="absolute top-[5vh] right-[5vw] z-10 text-right">
        <div className="text-primary text-[0.9vw] font-semibold uppercase tracking-[0.1em] mb-[0.5vh]">RealEstate Vault</div>
        <div className="text-[#999999] text-[0.8vw] uppercase tracking-[0.1em]">Confidential / 2026</div>
      </div>
      <div className="absolute top-[20vh] left-[10vw] z-10 w-[80vw]">
        <h2 className="text-text text-[4vw] font-bold leading-[1.1] tracking-[-0.02em] m-0 mb-[6vh]">Under the hood</h2>
        <div className="flex gap-[3vw]">
          <div className="flex-1 bg-white border border-[#E4E2DA] p-[2.5vw] shadow-[0_1vh_2vh_rgba(0,0,0,0.02)]">
            <div className="w-[2vw] h-[2vw] bg-primary mb-[2vh]" />
            <h3 className="text-text text-[1.5vw] font-semibold m-0 mb-[1.5vh]">Modern web stack</h3>
            <p className="text-muted text-[1.2vw] leading-[1.6] m-0">React frontend, Express API, PostgreSQL</p>
          </div>
          <div className="flex-1 bg-white border border-[#E4E2DA] p-[2.5vw] shadow-[0_1vh_2vh_rgba(0,0,0,0.02)]">
            <div className="w-[2vw] h-[2vw] bg-accent mb-[2vh]" />
            <h3 className="text-text text-[1.5vw] font-semibold m-0 mb-[1.5vh]">Contract-first API</h3>
            <p className="text-muted text-[1.2vw] leading-[1.6] m-0">Generated, validated clients from a single OpenAPI source of truth</p>
          </div>
          <div className="flex-1 bg-white border border-[#E4E2DA] p-[2.5vw] shadow-[0_1vh_2vh_rgba(0,0,0,0.02)]">
            <div className="w-[2vw] h-[2vw] bg-primary mb-[2vh]" />
            <h3 className="text-text text-[1.5vw] font-semibold m-0 mb-[1.5vh]">Live demo</h3>
            <p className="text-muted text-[1.2vw] leading-[1.6] m-0">Seeded with 8 European deals and a full broker network</p>
          </div>
        </div>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] text-[#999999] text-[0.9vw] font-semibold z-10">14</div>
    </div>
  );
}
