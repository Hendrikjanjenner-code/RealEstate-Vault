export default function BrokerNetworkSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body">
      <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to bottom, #EAE7DE 1px, transparent 1px), linear-gradient(to right, #EAE7DE 1px, transparent 1px)", backgroundSize: "5vw 5vh" }} />
      <div className="absolute top-[5vh] left-[5vw] w-[3vw] h-[3vw] bg-primary z-10" />
      <div className="absolute top-[5vh] right-[5vw] z-10 text-right">
        <div className="text-primary text-[0.9vw] font-semibold uppercase tracking-[0.1em] mb-[0.5vh]">CLOSA</div>
        <div className="text-[#999999] text-[0.8vw] uppercase tracking-[0.1em]">Confidential / 2026</div>
      </div>
      <div className="absolute top-[20vh] left-[10vw] z-10 w-[80vw]">
        <h2 className="font-display text-text text-[4vw] font-bold leading-[1.1] tracking-[-0.02em] m-0 mb-[6vh]">A trusted broker network</h2>
        <div className="flex gap-[3vw]">
          <div className="flex-1 bg-white border border-[#E2DFD5] p-[2.5vw] shadow-[0_1vh_2vh_rgba(0,0,0,0.02)]">
            <div className="w-[2vw] h-[2vw] bg-primary mb-[2vh]" />
            <p className="text-text text-[1.4vw] leading-[1.6] m-0">Ranked broker directory with track record and specialisms</p>
          </div>
          <div className="flex-1 bg-white border border-[#E2DFD5] p-[2.5vw] shadow-[0_1vh_2vh_rgba(0,0,0,0.02)]">
            <div className="w-[2vw] h-[2vw] bg-accent mb-[2vh]" />
            <p className="text-text text-[1.4vw] leading-[1.6] m-0">Verified profiles build accountability into every introduction</p>
          </div>
          <div className="flex-1 bg-white border border-[#E2DFD5] p-[2.5vw] shadow-[0_1vh_2vh_rgba(0,0,0,0.02)]">
            <div className="w-[2vw] h-[2vw] bg-primary mb-[2vh]" />
            <p className="text-text text-[1.4vw] leading-[1.6] m-0">Reputation follows performance, not marketing</p>
          </div>
        </div>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] text-[#999999] text-[0.9vw] font-semibold z-10">09</div>
    </div>
  );
}
