export default function HowItWorksSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body">
      <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to bottom, #EAE7DE 1px, transparent 1px), linear-gradient(to right, #EAE7DE 1px, transparent 1px)", backgroundSize: "5vw 5vh" }} />
      <div className="absolute top-[5vh] left-[5vw] w-[3vw] h-[3vw] bg-primary z-10" />
      <div className="absolute top-[5vh] right-[5vw] z-10 text-right">
        <div className="text-primary text-[0.9vw] font-semibold uppercase tracking-[0.1em] mb-[0.5vh]">CLOSA</div>
        <div className="text-[#999999] text-[0.8vw] uppercase tracking-[0.1em]">Confidential / 2026</div>
      </div>
      <div className="absolute top-[22vh] left-[10vw] z-10 w-[80vw]">
        <h2 className="font-display text-text text-[4vw] font-bold leading-[1.1] tracking-[-0.02em] m-0 mb-[7vh]">How it works</h2>
        <div className="flex gap-[2vw]">
          <div className="flex-1 border-t-[0.5vh] border-primary pt-[3vh]">
            <div className="text-primary text-[3vw] font-bold mb-[1.5vh]">1</div>
            <p className="text-text text-[1.4vw] leading-[1.5] m-0">Broker lists a deal — public or strictly off-market</p>
          </div>
          <div className="flex-1 border-t-[0.5vh] border-primary pt-[3vh]">
            <div className="text-primary text-[3vw] font-bold mb-[1.5vh]">2</div>
            <p className="text-text text-[1.4vw] leading-[1.5] m-0">Investor requests access with name, firm, and motivation</p>
          </div>
          <div className="flex-1 border-t-[0.5vh] border-primary pt-[3vh]">
            <div className="text-primary text-[3vw] font-bold mb-[1.5vh]">3</div>
            <p className="text-text text-[1.4vw] leading-[1.5] m-0">Broker approves and sends the NDA</p>
          </div>
          <div className="flex-1 border-t-[0.5vh] border-accent pt-[3vh]">
            <div className="text-accent text-[3vw] font-bold mb-[1.5vh]">4</div>
            <p className="text-text text-[1.4vw] leading-[1.5] m-0">NDA signed — full details and data room unlock</p>
          </div>
        </div>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] text-[#999999] text-[0.9vw] font-semibold z-10">04</div>
    </div>
  );
}
