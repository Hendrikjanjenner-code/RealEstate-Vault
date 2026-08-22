export default function ProblemSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body">
      <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to bottom, #EAE7DE 1px, transparent 1px), linear-gradient(to right, #EAE7DE 1px, transparent 1px)", backgroundSize: "5vw 5vh" }} />
      <div className="absolute top-[5vh] left-[5vw] w-[3vw] h-[3vw] bg-primary z-10" />
      <div className="absolute top-[5vh] right-[5vw] z-10 text-right">
        <div className="text-primary text-[0.9vw] font-semibold uppercase tracking-[0.1em] mb-[0.5vh]">CLOSA</div>
        <div className="text-[#999999] text-[0.8vw] uppercase tracking-[0.1em]">Confidential / 2026</div>
      </div>
      <div className="absolute top-[20vh] left-[10vw] z-10 max-w-[80vw]">
        <h2 className="font-display text-text text-[4vw] font-bold leading-[1.1] tracking-[-0.02em] m-0 mb-[6vh]">The problem with off-market deals</h2>
        <div className="flex flex-col gap-[3.5vh] max-w-[62vw]">
          <div className="flex items-start gap-[1.5vw]">
            <div className="w-[1.2vw] h-[1.2vw] bg-primary mt-[0.8vh] shrink-0" />
            <p className="text-text text-[1.8vw] leading-[1.5] m-0">Confidential mandates circulate over email, PDFs, and phone calls</p>
          </div>
          <div className="flex items-start gap-[1.5vw]">
            <div className="w-[1.2vw] h-[1.2vw] bg-primary mt-[0.8vh] shrink-0" />
            <p className="text-text text-[1.8vw] leading-[1.5] m-0">No control over who sees sensitive deal information</p>
          </div>
          <div className="flex items-start gap-[1.5vw]">
            <div className="w-[1.2vw] h-[1.2vw] bg-primary mt-[0.8vh] shrink-0" />
            <p className="text-text text-[1.8vw] leading-[1.5] m-0">NDAs are signed late, tracked nowhere, and rarely enforced</p>
          </div>
          <div className="flex items-start gap-[1.5vw]">
            <div className="w-[1.2vw] h-[1.2vw] bg-accent mt-[0.8vh] shrink-0" />
            <p className="text-text text-[1.8vw] leading-[1.5] m-0">Brokers cannot prove discretion — their most valuable asset</p>
          </div>
        </div>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] text-[#999999] text-[0.9vw] font-semibold z-10">02</div>
    </div>
  );
}
