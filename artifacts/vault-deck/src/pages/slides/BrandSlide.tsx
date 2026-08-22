export default function BrandSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body">
      <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to bottom, #EAE7DE 1px, transparent 1px), linear-gradient(to right, #EAE7DE 1px, transparent 1px)", backgroundSize: "5vw 5vh" }} />
      <div className="absolute top-[5vh] left-[5vw] w-[3vw] h-[3vw] bg-primary z-10" />
      <div className="absolute top-[5vh] right-[5vw] z-10 text-right">
        <div className="text-primary text-[0.9vw] font-semibold uppercase tracking-[0.1em] mb-[0.5vh]">CLOSA</div>
        <div className="text-[#999999] text-[0.8vw] uppercase tracking-[0.1em]">Confidential / 2026</div>
      </div>
      <div className="absolute top-[20vh] left-[10vw] z-10 w-[80vw]">
        <h2 className="font-display text-text text-[4vw] font-bold leading-[1.1] tracking-[-0.02em] m-0 mb-[5vh]" style={{ textWrap: "balance" }}>Built like infrastructure, not a portal</h2>
        <div className="flex gap-[1.5vw] mb-[6vh]">
          <div className="w-[16vw] h-[14vh] bg-[#0C0D0E] flex items-end p-[1vw]">
            <span className="text-[#F6F4EF] text-[1vw] font-semibold">Ink</span>
          </div>
          <div className="w-[16vw] h-[14vh] bg-[#14A87D] flex items-end p-[1vw]">
            <span className="text-[#0C0D0E] text-[1vw] font-semibold">Jade</span>
          </div>
          <div className="w-[16vw] h-[14vh] bg-[#F6F4EF] border border-[#E2DFD5] flex items-end p-[1vw]">
            <span className="text-[#0C0D0E] text-[1vw] font-semibold">Warm Off-White</span>
          </div>
        </div>
        <div className="flex flex-col gap-[2.5vh] max-w-[60vw]">
          <div className="flex items-start gap-[1.2vw]">
            <div className="w-[1vw] h-[1vw] bg-primary mt-[0.7vh] shrink-0" />
            <p className="text-text text-[1.5vw] leading-[1.5] m-0">Near-black ink, warm off-white, one jade accent — colour used sparingly, no gradients</p>
          </div>
          <div className="flex items-start gap-[1.2vw]">
            <div className="w-[1vw] h-[1vw] bg-primary mt-[0.7vh] shrink-0" />
            <p className="text-text text-[1.5vw] leading-[1.5] m-0">Restrained typography: Sora headlines, Inter body, tabular numerals for financial data</p>
          </div>
          <div className="flex items-start gap-[1.2vw]">
            <div className="w-[1vw] h-[1vw] bg-accent mt-[0.7vh] shrink-0" />
            <p className="text-text text-[1.5vw] leading-[1.5] m-0">Confident, institutional, minimal — no noise, no ads, no public exposure</p>
          </div>
        </div>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] text-[#999999] text-[0.9vw] font-semibold z-10">13</div>
    </div>
  );
}
