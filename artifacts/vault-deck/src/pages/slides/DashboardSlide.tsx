const base = import.meta.env.BASE_URL;

export default function DashboardSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body">
      <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to bottom, #EFEEE7 1px, transparent 1px), linear-gradient(to right, #EFEEE7 1px, transparent 1px)", backgroundSize: "5vw 5vh" }} />
      <div className="absolute top-[5vh] left-[5vw] w-[3vw] h-[3vw] bg-primary z-10" />
      <div className="absolute top-[5vh] right-[5vw] z-10 text-right">
        <div className="text-primary text-[0.9vw] font-semibold uppercase tracking-[0.1em] mb-[0.5vh]">RealEstate Vault</div>
        <div className="text-[#999999] text-[0.8vw] uppercase tracking-[0.1em]">Confidential / 2026</div>
      </div>
      <div className="absolute top-[22vh] left-[8vw] z-10 w-[38vw] h-[58vh] border border-[#E4E2DA] shadow-[0_2vh_4vh_rgba(11,45,38,0.08)]">
        <img src={`${base}dashboard.jpg`} crossOrigin="anonymous" alt="Portfolio dashboard" className="w-full h-full object-cover" />
      </div>
      <div className="absolute top-[22vh] right-[10vw] z-10 w-[38vw]">
        <h2 className="text-text text-[3.4vw] font-bold leading-[1.1] tracking-[-0.02em] m-0 mb-[5vh]">The dashboard</h2>
        <div className="flex flex-col gap-[3vh]">
          <div className="flex items-start gap-[1.2vw]">
            <div className="w-[1vw] h-[1vw] bg-primary mt-[0.8vh] shrink-0" />
            <p className="text-text text-[1.5vw] leading-[1.5] m-0">Portfolio-level view: active deals, pending requests, pipeline volume</p>
          </div>
          <div className="flex items-start gap-[1.2vw]">
            <div className="w-[1vw] h-[1vw] bg-primary mt-[0.8vh] shrink-0" />
            <p className="text-text text-[1.5vw] leading-[1.5] m-0">Activity feed of everything happening across your deals</p>
          </div>
          <div className="flex items-start gap-[1.2vw]">
            <div className="w-[1vw] h-[1vw] bg-accent mt-[0.8vh] shrink-0" />
            <p className="text-text text-[1.5vw] leading-[1.5] m-0">Charts for deal flow and volume trends</p>
          </div>
        </div>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] text-[#999999] text-[0.9vw] font-semibold z-10">12</div>
    </div>
  );
}
