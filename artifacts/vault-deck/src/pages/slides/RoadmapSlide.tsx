export default function RoadmapSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body">
      <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to bottom, #EAE7DE 1px, transparent 1px), linear-gradient(to right, #EAE7DE 1px, transparent 1px)", backgroundSize: "5vw 5vh" }} />
      <div className="absolute top-[5vh] left-[5vw] w-[3vw] h-[3vw] bg-primary z-10" />
      <div className="absolute top-[5vh] right-[5vw] z-10 text-right">
        <div className="text-primary text-[0.9vw] font-semibold uppercase tracking-[0.1em] mb-[0.5vh]">CLOSA</div>
        <div className="text-[#999999] text-[0.8vw] uppercase tracking-[0.1em]">Confidential / 2026</div>
      </div>
      <div className="absolute top-[22vh] left-[10vw] z-10 w-[80vw]">
        <h2 className="font-display text-text text-[4vw] font-bold leading-[1.1] tracking-[-0.02em] m-0 mb-[7vh]">Roadmap</h2>
        <div className="flex gap-[3vw]">
          <div className="flex-1 border-t-[0.5vh] border-primary pt-[3vh]">
            <div className="text-primary text-[2.5vw] font-bold mb-[1.5vh]">01</div>
            <p className="text-text text-[1.5vw] leading-[1.5] m-0">Real user accounts with server-enforced confidentiality per investor</p>
          </div>
          <div className="flex-1 border-t-[0.5vh] border-primary pt-[3vh]">
            <div className="text-primary text-[2.5vw] font-bold mb-[1.5vh]">02</div>
            <p className="text-text text-[1.5vw] leading-[1.5] m-0">Document upload and secure file delivery in the data room</p>
          </div>
          <div className="flex-1 border-t-[0.5vh] border-accent pt-[3vh]">
            <div className="text-accent text-[2.5vw] font-bold mb-[1.5vh]">03</div>
            <p className="text-text text-[1.5vw] leading-[1.5] m-0">New verticals beyond commercial real estate — M&amp;A, private debt, infrastructure</p>
          </div>
        </div>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] text-[#999999] text-[0.9vw] font-semibold z-10">15</div>
    </div>
  );
}
