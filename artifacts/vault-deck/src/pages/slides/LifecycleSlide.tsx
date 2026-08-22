export default function LifecycleSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body">
      <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to bottom, #EAE7DE 1px, transparent 1px), linear-gradient(to right, #EAE7DE 1px, transparent 1px)", backgroundSize: "5vw 5vh" }} />
      <div className="absolute top-[5vh] left-[5vw] w-[3vw] h-[3vw] bg-primary z-10" />
      <div className="absolute top-[5vh] right-[5vw] z-10 text-right">
        <div className="text-primary text-[0.9vw] font-semibold uppercase tracking-[0.1em] mb-[0.5vh]">CLOSA</div>
        <div className="text-[#999999] text-[0.8vw] uppercase tracking-[0.1em]">Confidential / 2026</div>
      </div>
      <div className="absolute top-[20vh] left-[10vw] z-10 w-[80vw]">
        <h2 className="font-display text-text text-[4vw] font-bold leading-[1.1] tracking-[-0.02em] m-0 mb-[3vh]">Access request lifecycle</h2>
        <p className="text-muted text-[1.4vw] leading-[1.5] m-0 mb-[6vh] max-w-[50vw]">Every request moves through a controlled pipeline</p>
        <div className="flex items-center gap-[1.2vw] mb-[6vh]">
          <div className="flex-1 bg-white border border-[#E2DFD5] py-[2.5vh] text-center">
            <span className="text-primary text-[1.4vw] font-semibold">Pending</span>
          </div>
          <div className="w-[1.5vw] h-[0.3vh] bg-[#CBC8BD]" />
          <div className="flex-1 bg-white border border-[#E2DFD5] py-[2.5vh] text-center">
            <span className="text-primary text-[1.4vw] font-semibold">Approved</span>
          </div>
          <div className="w-[1.5vw] h-[0.3vh] bg-[#CBC8BD]" />
          <div className="flex-1 bg-white border border-[#E2DFD5] py-[2.5vh] text-center">
            <span className="text-primary text-[1.4vw] font-semibold">NDA Sent</span>
          </div>
          <div className="w-[1.5vw] h-[0.3vh] bg-[#CBC8BD]" />
          <div className="flex-1 bg-primary py-[2.5vh] text-center">
            <span className="text-accent text-[1.4vw] font-semibold">NDA Signed</span>
          </div>
        </div>
        <div className="flex flex-col gap-[2.5vh] max-w-[58vw]">
          <div className="flex items-start gap-[1.2vw]">
            <div className="w-[1vw] h-[1vw] bg-primary mt-[0.7vh] shrink-0" />
            <p className="text-text text-[1.5vw] leading-[1.5] m-0">Brokers manage the queue from a single dashboard</p>
          </div>
          <div className="flex items-start gap-[1.2vw]">
            <div className="w-[1vw] h-[1vw] bg-accent mt-[0.7vh] shrink-0" />
            <p className="text-text text-[1.5vw] leading-[1.5] m-0">Full audit trail of who asked, when, and what happened</p>
          </div>
        </div>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] text-[#999999] text-[0.9vw] font-semibold z-10">07</div>
    </div>
  );
}
