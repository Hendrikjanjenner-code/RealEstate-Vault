export default function SolutionSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body">
      <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to bottom, #EAE7DE 1px, transparent 1px), linear-gradient(to right, #EAE7DE 1px, transparent 1px)", backgroundSize: "5vw 5vh" }} />
      <div className="absolute top-[5vh] left-[5vw] w-[3vw] h-[3vw] bg-primary z-10" />
      <div className="absolute top-[5vh] right-[5vw] z-10 text-right">
        <div className="text-primary text-[0.9vw] font-semibold uppercase tracking-[0.1em] mb-[0.5vh]">CLOSA</div>
        <div className="text-[#999999] text-[0.8vw] uppercase tracking-[0.1em]">Confidential / 2026</div>
      </div>
      <div className="absolute top-[20vh] left-[10vw] z-10 w-[80vw]">
        <h2 className="font-display text-text text-[4vw] font-bold leading-[1.1] tracking-[-0.02em] m-0 mb-[3vh]">The solution: infrastructure, not a listing site</h2>
        <div className="flex items-center gap-[1.2vw] mb-[4vh]">
          <span className="text-primary text-[1.3vw] font-semibold uppercase tracking-[0.12em]">Discover</span>
          <span className="text-[#999999] text-[1.3vw]">→</span>
          <span className="text-accent text-[1.3vw] font-semibold uppercase tracking-[0.12em]">Close</span>
          <span className="text-[#999999] text-[1.3vw]">→</span>
          <span className="text-primary text-[1.3vw] font-semibold uppercase tracking-[0.12em]">Build</span>
          <span className="text-muted text-[1.1vw] ml-[1vw]">— the full lifecycle of a private transaction</span>
        </div>
        <div className="grid grid-cols-2 gap-[2.5vw]">
          <div className="bg-white border border-[#E2DFD5] p-[2.2vw] shadow-[0_1vh_2vh_rgba(0,0,0,0.02)]">
            <div className="w-[1.8vw] h-[1.8vw] bg-primary mb-[2vh]" />
            <p className="text-text text-[1.5vw] leading-[1.5] m-0">One private environment for the full deal lifecycle</p>
          </div>
          <div className="bg-white border border-[#E2DFD5] p-[2.2vw] shadow-[0_1vh_2vh_rgba(0,0,0,0.02)]">
            <div className="w-[1.8vw] h-[1.8vw] bg-accent mb-[2vh]" />
            <p className="text-text text-[1.5vw] leading-[1.5] m-0">Confidential listings stay blurred until access is granted</p>
          </div>
          <div className="bg-white border border-[#E2DFD5] p-[2.2vw] shadow-[0_1vh_2vh_rgba(0,0,0,0.02)]">
            <div className="w-[1.8vw] h-[1.8vw] bg-accent mb-[2vh]" />
            <p className="text-text text-[1.5vw] leading-[1.5] m-0">Every data room sits behind a structured NDA workflow</p>
          </div>
          <div className="bg-white border border-[#E2DFD5] p-[2.2vw] shadow-[0_1vh_2vh_rgba(0,0,0,0.02)]">
            <div className="w-[1.8vw] h-[1.8vw] bg-primary mb-[2vh]" />
            <p className="text-text text-[1.5vw] leading-[1.5] m-0">Built for brokers, family offices, and institutional investors</p>
          </div>
        </div>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] text-[#999999] text-[0.9vw] font-semibold z-10">03</div>
    </div>
  );
}
