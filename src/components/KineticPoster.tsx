import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

/* A pinned editorial poster that comes apart as you scroll. At rest it reads
   as one composed layout (portrait, two-line headline, header + "live" mark,
   a band of meta copy). Scrolling makes every layer rush the viewer at once
   while giant words flow through the cleared stage ("Every · Guest · Moment");
   past the last word the poster reassembles, so p=1 matches p=0.

   One normalised progress p∈[0,1] drives everything. A tall wrapper holds a
   position:sticky stage; one rAF loop reads the wrapper's scroll progress and
   writes each layer's transform straight to the DOM (no per-frame React
   render, no animation library). The stage fades ivory → ink → ivory so the
   journey words sit on a dark stage. Honours prefers-reduced-motion. */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

// power2.inOut
const ease = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// eased local progress of a segment that starts at `s` and runs for `d`.
const seg = (p: number, s: number, d: number) =>
  ease(clamp((p - s) / d, 0, 1));

type RGB = [number, number, number];
const IVORY: RGB = [247, 243, 236]; // #f7f3ec
const INK: RGB = [17, 17, 17]; //      #111111
const mix = (a: RGB, b: RGB, t: number) =>
  `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(
    lerp(a[1], b[1], t)
  )},${Math.round(lerp(a[2], b[2], t))})`;

// The mid-scroll journey — giant words that flow one into the next.
const MEGA_WORDS = ["Every", "Guest", "Moment"];
const MEGA_START = 0.34; // progress at which the first word surfaces
const MEGA_STRIDE = 0.165; // progress between each successive word

const BARS = [0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.5, 0.7, 0.4];

export default function KineticPoster() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const megaRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Valere — Every guest, every moment";
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.appendChild(robots);
    return () => {
      document.title = prevTitle;
      robots.remove();
    };
  }, []);

  useEffect(() => {
    const root = wrapRef.current;
    const meta = metaRef.current;
    const image = imageRef.current;
    const chrome = chromeRef.current;
    const headline = headlineRef.current;
    const megas = megaRefs.current.filter(Boolean) as HTMLDivElement[];
    if (!root || !meta || !image || !chrome || !headline || megas.length === 0)
      return;

    // Write every layer for a given normalised progress p∈[0,1].
    const render = (p: number) => {
      const ret = seg(p, 0.86, 0.14); // 0.86→1.0 reassembly phase

      // Ivory stage darkens as the layers blow apart, then returns to ivory.
      const dark = seg(p, 0, 0.3) * (1 - ret);
      root.style.setProperty("--bg", mix(IVORY, INK, dark));
      root.style.setProperty("--fg", mix(INK, IVORY, dark));

      // L0 — meta band blows up + fades early, then restores.
      let metaS = lerp(1, 3.5, seg(p, 0, 0.3));
      let metaO = lerp(1, 0, seg(p, 0, 0.3));
      metaS = lerp(metaS, 1, ret);
      metaO = lerp(metaO, 1, ret);
      meta.style.transform = `scale(${metaS.toFixed(3)})`;
      meta.style.opacity = metaO.toFixed(3);

      // L1 — portrait pushes toward bottom-left and dissolves.
      let imgS = lerp(1, 3.2, seg(p, 0, 0.4));
      let imgX = lerp(0, 30, seg(p, 0, 0.4));
      let imgY = lerp(0, 40, seg(p, 0, 0.4));
      let imgO = lerp(1, 0, seg(p, 0.3, 0.15));
      imgS = lerp(imgS, 1, ret);
      imgX = lerp(imgX, 0, ret);
      imgY = lerp(imgY, 0, ret);
      imgO = lerp(imgO, 1, ret);
      image.style.transform = `translate(${imgX.toFixed(2)}%, ${imgY.toFixed(
        2
      )}%) scale(${imgS.toFixed(3)})`;
      image.style.opacity = imgO.toFixed(3);

      // L1b — header + mark lift away to the top-left.
      let chS = lerp(1, 3.5, seg(p, 0, 0.35));
      let chX = lerp(0, -25, seg(p, 0, 0.35));
      let chY = lerp(0, -40, seg(p, 0, 0.35));
      let chO = lerp(1, 0, seg(p, 0, 0.35));
      chS = lerp(chS, 1, ret);
      chX = lerp(chX, 0, ret);
      chY = lerp(chY, 0, ret);
      chO = lerp(chO, 1, ret);
      chrome.style.transform = `translate(${chX.toFixed(2)}%, ${chY.toFixed(
        2
      )}%) scale(${chS.toFixed(3)})`;
      chrome.style.opacity = chO.toFixed(3);

      // L2 — giant headline scales into a wall of type, then fades.
      let hS = lerp(1, 4.2, seg(p, 0, 0.55));
      let hX = lerp(0, -5, seg(p, 0, 0.55));
      let hY = lerp(0, 8, seg(p, 0, 0.55));
      let hO = lerp(1, 0, seg(p, 0.5, 0.1));
      hS = lerp(hS, 1, ret);
      hX = lerp(hX, 0, ret);
      hY = lerp(hY, 0, ret);
      hO = lerp(hO, 1, ret);
      headline.style.transform = `translate(${hX.toFixed(2)}%, ${hY.toFixed(
        2
      )}%) scale(${hS.toFixed(3)})`;
      headline.style.opacity = hO.toFixed(3);

      // L3 — the word journey: each word surfaces from a speck → fills the
      // frame → recedes as the next surfaces (the recede of word i overlaps
      // the rise of word i+1, so the type flows continuously).
      megas.forEach((el, i) => {
        const s = MEGA_START + i * MEGA_STRIDE;
        let mS: number;
        let mO: number;
        if (p < s) {
          mS = 0.08;
          mO = 0;
        } else {
          const a = seg(p, s, 0.12); // rise: speck → full
          mS = lerp(0.08, 1.2, a);
          mO = lerp(0, 1, a);
          const b = seg(p, s + 0.1, 0.12); // recede: full → past the viewer
          mS = lerp(mS, 4.5, b);
          mO = lerp(mO, 0, b);
        }
        el.style.transform = `scale(${mS.toFixed(3)})`;
        el.style.opacity = mO.toFixed(3);
      });
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      render(0);
      return;
    }

    let raf = 0;
    const tick = () => {
      const top = root.getBoundingClientRect().top;
      const span = root.offsetHeight - window.innerHeight;
      render(clamp(span > 0 ? -top / span : 0, 0, 1));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={wrapRef} className="kp-wrap">
      <style>{CSS}</style>

      {/* fixed chrome — sits above the poster, never zooms */}
      <div className="kp-brand">
        <Link to="/" className="kp-mark">
          Valere
        </Link>
        <span className="kp-tagline">Scroll the moment</span>
      </div>

      <div className="kp-stage">
        {/* L1 — portrait, top-left */}
        <div ref={imageRef} className="kp-image">
          <div
            className="kp-photo"
            style={{ backgroundImage: "url(/qr-table-stand.jpg)" }}
          />
        </div>

        {/* L1b — header + live mark */}
        <div ref={chromeRef} className="kp-chrome">
          <div className="kp-header">
            <div className="kp-header-word">Weddings</div>
            <div className="kp-header-sub">
              One QR code.
              <br />
              Every guest's camera.
              <br />
              One shared gallery.
            </div>
          </div>

          <div className="kp-signal">
            <div className="kp-bars">
              {BARS.map((h, i) => (
                <span key={i} style={{ height: `${h * 100}%` }} />
              ))}
            </div>
            <div className="kp-signal-label">LIVE</div>
          </div>
        </div>

        {/* L2 — giant two-line headline */}
        <div ref={headlineRef} className="kp-headline">
          <div className="kp-headline-inner">
            <div>Capture</div>
            <div>Together</div>
          </div>
        </div>

        {/* L0 — meta band */}
        <div ref={metaRef} className="kp-meta">
          <div className="kp-volume">
            Volume 01
            <br />
            The Wedding Edition
          </div>

          <div className="kp-format">
            Disposable
            <br />
            Camera
          </div>

          <div className="kp-paragraph">
            Valere turns every phone at your wedding into a disposable camera.
            No app, no signup — guests scan, snap, and every photo lands in one
            gallery for you. Scroll, and the poster rushes apart into a single
            word, then settles back into place.
          </div>

          <div className="kp-credit">
            <div className="kp-credit-kicker">a gift from</div>
            <div className="kp-credit-name">Valere</div>
          </div>
        </div>

        {/* L3 — the giant word journey (mid-scroll) */}
        <div className="kp-mega-stage">
          {MEGA_WORDS.map((w, i) => (
            <div
              key={w}
              ref={(el) => {
                megaRefs.current[i] = el;
              }}
              className="kp-word"
            >
              <span>{w}</span>
            </div>
          ))}
        </div>

        <h1 className="kp-sr">
          Valere — Every guest, every moment. One QR code, one shared wedding
          gallery.
        </h1>

        <div className="kp-scroll">scroll</div>
      </div>
    </div>
  );
}

// Fonts (Cormorant Garamond + Inter) are already loaded in public/index.html.
const CSS = `
  .kp-wrap{position:relative;width:100%;height:500vh;
    --bg:#f7f3ec;--fg:#111111;--accent:#b8925a;
    background:var(--bg);color:var(--fg);
    font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .kp-wrap *{box-sizing:border-box;}

  .kp-brand{position:fixed;inset:0 0 auto 0;z-index:90;
    display:flex;align-items:center;justify-content:space-between;
    padding:1.4rem 1.7rem;pointer-events:none;mix-blend-mode:difference;
    color:#fff;font-size:.68rem;letter-spacing:.2em;text-transform:uppercase;}
  .kp-mark{pointer-events:auto;color:inherit;text-decoration:none;
    font-family:'Cormorant Garamond',serif;font-size:1.3rem;font-weight:600;
    letter-spacing:.12em;}

  .kp-stage{position:sticky;top:0;left:0;height:100svh;width:100%;
    overflow:hidden;background:var(--bg);}

  /* L1 — portrait */
  .kp-image{position:absolute;z-index:20;overflow:hidden;
    left:3vw;top:9vh;width:26vw;height:36vh;border-radius:999px 999px 0 0;
    transform-origin:20% 80%;will-change:transform,opacity;}
  .kp-photo{width:100%;height:100%;background-size:cover;
    background-position:center;filter:saturate(.92) contrast(1.02);}

  /* L1b — header chrome */
  .kp-chrome{position:absolute;inset:0;z-index:30;pointer-events:none;
    transform-origin:50% 50%;will-change:transform,opacity;}
  .kp-header{position:absolute;right:3vw;top:9vh;text-align:right;}
  .kp-header-word{font-family:'Cormorant Garamond',serif;font-style:italic;
    font-weight:500;font-size:8vw;letter-spacing:-.01em;line-height:.9;
    color:var(--fg);}
  .kp-header-sub{margin-top:.9vw;font-size:.9vw;line-height:1.45;
    letter-spacing:.02em;opacity:.75;}

  .kp-signal{position:absolute;right:4vw;top:33vh;text-align:center;}
  .kp-bars{display:flex;gap:2px;justify-content:center;align-items:flex-end;
    height:1.8vw;}
  .kp-bars span{display:block;width:.3vw;background:var(--accent);
    border-radius:.15vw;}
  .kp-signal-label{font-size:.72vw;letter-spacing:.28em;font-weight:700;
    margin-top:.45vw;opacity:.85;}

  /* L2 — headline */
  .kp-headline{position:absolute;inset:0;z-index:10;pointer-events:none;
    transform-origin:30% 60%;will-change:transform,opacity;}
  .kp-headline-inner{position:absolute;left:3vw;right:3vw;top:45vh;
    font-family:'Cormorant Garamond',serif;font-weight:500;
    font-size:min(20vh,17vw);line-height:.88;letter-spacing:-.015em;
    white-space:nowrap;color:var(--fg);}
  .kp-headline-inner div:last-child{font-style:italic;color:var(--accent);}

  /* L0 — meta */
  .kp-meta{position:absolute;inset:0;z-index:40;pointer-events:none;
    transform-origin:50% 50%;will-change:transform,opacity;}
  .kp-volume{position:absolute;left:3vw;bottom:5vh;font-size:1.2vw;
    line-height:1.25;letter-spacing:.02em;font-weight:600;}
  .kp-format{position:absolute;right:3vw;bottom:16vh;text-align:right;
    font-size:1.2vw;line-height:1.25;letter-spacing:.02em;font-weight:600;}
  .kp-paragraph{position:absolute;left:50%;transform:translateX(-50%);
    bottom:4vh;width:46vw;font-size:.92vw;line-height:1.55;text-align:center;
    opacity:.8;}
  .kp-credit{position:absolute;right:3vw;bottom:4vh;text-align:right;}
  .kp-credit-kicker{font-size:.7vw;letter-spacing:.24em;text-transform:uppercase;
    opacity:.6;}
  .kp-credit-name{font-family:'Cormorant Garamond',serif;font-style:italic;
    font-size:2.6vw;line-height:1;color:var(--accent);}

  /* L3 — the giant word journey */
  .kp-mega-stage{position:absolute;inset:0;z-index:50;pointer-events:none;}
  .kp-word{position:absolute;inset:0;display:flex;align-items:center;
    justify-content:center;opacity:0;transform-origin:50% 50%;
    will-change:transform,opacity;}
  .kp-word span{font-family:'Cormorant Garamond',serif;font-style:italic;
    font-weight:500;font-size:26vw;letter-spacing:-.02em;line-height:.8;
    white-space:nowrap;color:var(--accent);}

  .kp-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;
    overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}

  .kp-scroll{position:absolute;bottom:.8rem;left:50%;z-index:70;
    transform:translateX(-50%);font-size:10px;letter-spacing:.3em;
    text-transform:uppercase;color:var(--fg);opacity:.4;pointer-events:none;}

  @media (max-width:760px){
    .kp-image{width:44vw;height:30vh;top:10vh;}
    .kp-header{top:10vh;}
    .kp-header-word{font-size:15vw;}
    .kp-header-sub{font-size:2.6vw;}
    .kp-signal{top:26vh;right:5vw;}
    .kp-bars{height:6vw;} .kp-bars span{width:1vw;}
    .kp-signal-label{font-size:2.2vw;}
    .kp-headline-inner{font-size:min(16vh,21vw);top:50vh;}
    .kp-volume,.kp-format{font-size:3vw;}
    .kp-volume{bottom:13vh;}
    .kp-paragraph{width:88vw;font-size:2.6vw;bottom:5vh;}
    .kp-credit{display:none;}
    .kp-word span{font-size:34vw;}
  }
`;
