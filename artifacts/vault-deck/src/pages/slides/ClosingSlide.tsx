export default function ClosingSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-primary font-body">
      <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to bottom, rgba(243,240,230,0.05) 1px, transparent 1px), linear-gradient(to right, rgba(243,240,230,0.05) 1px, transparent 1px)", backgroundSize: "5vw 5vh" }} />
      <div className="absolute top-[5vh] left-[5vw] w-[3vw] h-[3vw] bg-accent z-10" />
      <div className="absolute top-[5vh] right-[5vw] z-10 text-right">
        <div className="text-accent text-[0.9vw] font-semibold uppercase tracking-[0.1em] mb-[0.5vh]">RealEstate Vault</div>
        <div className="text-[#F3F0E6]/50 text-[0.8vw] uppercase tracking-[0.1em]">Confidential / 2026</div>
      </div>
      <div className="absolute top-[36vh] left-[10vw] z-10 max-w-[70vw]">
        <h2 className="text-[#F3F0E6] text-[5.5vw] font-bold leading-[1.05] tracking-[-0.03em] m-0 mb-[3vh]" style={{ textWrap: "balance" }}>Private Deals. Trusted Access.</h2>
        <p className="text-[#F3F0E6]/70 text-[1.8vw] font-normal leading-[1.4] m-0">Enter the vault — explore the live demo environment today.</p>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] text-[#F3F0E6]/40 text-[0.9vw] font-semibold z-10">16</div>
    </div>
  );
}
