export default function MandatesSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body">
      <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to bottom, #EFEEE7 1px, transparent 1px), linear-gradient(to right, #EFEEE7 1px, transparent 1px)", backgroundSize: "5vw 5vh" }} />
      <div className="absolute top-[5vh] left-[5vw] w-[3vw] h-[3vw] bg-primary z-10" />
      <div className="absolute top-[5vh] right-[5vw] z-10 text-right">
        <div className="text-primary text-[0.9vw] font-semibold uppercase tracking-[0.1em] mb-[0.5vh]">RealEstate Vault</div>
        <div className="text-[#999999] text-[0.8vw] uppercase tracking-[0.1em]">Confidential / 2026</div>
      </div>
      <div className="absolute top-[24vh] left-[10vw] z-10 max-w-[64vw]">
        <h2 className="text-text text-[4vw] font-bold leading-[1.1] tracking-[-0.02em] m-0 mb-[6vh]">Investor mandates</h2>
        <div className="flex flex-col gap-[4vh]">
          <div className="flex items-start gap-[1.5vw]">
            <div className="w-[1.2vw] h-[1.2vw] bg-primary mt-[0.9vh] shrink-0" />
            <p className="text-text text-[1.9vw] leading-[1.5] m-0">Investors publish acquisition profiles: asset class, geography, ticket size</p>
          </div>
          <div className="flex items-start gap-[1.5vw]">
            <div className="w-[1.2vw] h-[1.2vw] bg-primary mt-[0.9vh] shrink-0" />
            <p className="text-text text-[1.9vw] leading-[1.5] m-0">Brokers match confidential supply to verified demand</p>
          </div>
          <div className="flex items-start gap-[1.5vw]">
            <div className="w-[1.2vw] h-[1.2vw] bg-accent mt-[0.9vh] shrink-0" />
            <p className="text-text text-[1.9vw] leading-[1.5] m-0">Reverse discovery without exposing either side too early</p>
          </div>
        </div>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] text-[#999999] text-[0.9vw] font-semibold z-10">08</div>
    </div>
  );
}
