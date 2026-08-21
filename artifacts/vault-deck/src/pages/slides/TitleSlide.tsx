export default function TitleSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body">
      <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to bottom, #EFEEE7 1px, transparent 1px), linear-gradient(to right, #EFEEE7 1px, transparent 1px)", backgroundSize: "5vw 5vh" }} />
      <div className="absolute top-[5vh] left-[5vw] w-[3vw] h-[3vw] bg-primary z-10" />
      <div className="absolute top-[5vh] right-[5vw] z-10 text-right">
        <div className="text-primary text-[0.9vw] font-semibold uppercase tracking-[0.1em] mb-[0.5vh]">RealEstate Vault</div>
        <div className="text-[#999999] text-[0.8vw] uppercase tracking-[0.1em]">Confidential / 2026</div>
      </div>
      <div className="absolute bottom-[10vh] left-[10vw] z-10 max-w-[62vw]">
        <div className="text-accent text-[1.2vw] font-semibold tracking-[0.05em] uppercase mb-[2vh]">Private Deals. Trusted Access.</div>
        <h1 className="text-text text-[7vw] font-bold leading-[1.05] tracking-[-0.03em] m-0 mb-[2vh]">RealEstate Vault</h1>
        <p className="text-muted text-[1.8vw] font-normal leading-[1.4] max-w-[52vw] m-0" style={{ textWrap: "pretty" }}>A private B2B marketplace for confidential commercial real estate transactions.</p>
      </div>
    </div>
  );
}
